import {
  Color,
  Group,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { isBoosting, type SimEvent, type World } from '../sim/runner';
import { createChase } from './chase';
import { SUN_DIR } from './look/haze';
import { highMaterials, highToon } from './look/materials-high';
import { lowMaterials, lowToon } from './look/materials-low';
import { createPost } from './look/post';
import { createSky } from './look/sky';
import { tune } from './look/tune';
import { palette } from './palette';
import { probeCaps, resolveTier, type GpuCaps, type Tier, type TierChoice } from './quality';
import { roadsterPose } from './pose';
import { chaseCamera, createHighway, HIGHWAY_SPEED } from './world/highway';

const MAX_PIXEL_RATIO = 2;
const POWER = 'high-performance';
const VERTICAL_FOV = 50;
// Portrait phones widen the view instead of cropping the lanes at the sides.
const MIN_HORIZONTAL_FOV = 38;
/** Camera offset and roll at full shake; shake grows with the square of the trauma. */
const SHAKE_METERS = 0.45;
const SHAKE_ROLL = 0.045;
/** Trauma lost per second, so a full-strength shake settles in well under a second. */
const TRAUMA_DECAY = 1.8;
const BOOST_FOV = 5;

/** A cheap, smooth jitter in [-1, 1]; each `seed` gives an independent axis. */
const jitter = (t: number, seed: number): number =>
  Math.sin(t * 41 + seed * 12.9) * 0.6 + Math.sin(t * 67.3 + seed * 7.1) * 0.4;

/** Exponential easing toward a target that holds at any frame rate. */
const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

export interface FrameStats {
  /** Draw calls and triangles of the last frame, shadow pass and post pass included. */
  readonly calls: number;
  readonly triangles: number;
}

export interface View {
  readonly tier: TierChoice;
  /** Draws the world after the latest fixed step; `simSeconds` drives the sky and camera sway. */
  render(world: World, simSeconds: number): void;
  /** Feeds the events of each sim step, for camera kicks and shakes. */
  onEvents(events: readonly SimEvent[]): void;
  stats(): FrameStats;
}

/** Ask a throwaway WebGL2 context on the same GPU what it can do, before the real renderer picks its MSAA. */
function probe(): GpuCaps {
  const gl = document.createElement('canvas').getContext('webgl2', { powerPreference: POWER });
  if (!gl) return { halfFloatTarget: false, halfFloatSamples: 0 };
  const caps = probeCaps(gl);
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return caps;
}

/** One shadow-casting sun with a small map that follows the car. */
function createSun(): DirectionalLight {
  const sun = new DirectionalLight(new Color(palette.sun), tune.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -28,
    right: 28,
    top: 28,
    bottom: -28,
    near: 1,
    far: 260,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.14;
  sun.shadow.radius = 2.5;
  return sun;
}

export function createView(
  canvas: HTMLCanvasElement,
  fixedPixelRatio: number | undefined,
  requestedTier: Tier | undefined,
): View {
  const caps = probe();
  const tier = resolveTier(requestedTier, caps);
  const high = tier.tier === 'high';
  // The high tier draws only the post triangle to the canvas, so the canvas needs no depth buffer.
  const renderer = new WebGLRenderer({
    canvas,
    antialias: !high,
    depth: !high,
    powerPreference: POWER,
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.info.autoReset = false;

  const scene = new Scene();
  const highway = createHighway();
  const material = high ? highMaterials() : lowMaterials();
  for (const part of highway.parts) part.mesh.material = material(part);
  scene.add(highway.root);
  // The sim drives the Roadster, the cops, and the traffic, so the look-dev cars stay hidden.
  for (const car of highway.attract) car.visible = false;
  const chaseRoot = new Group();
  scene.add(chaseRoot);
  const chase = createChase(chaseRoot, highway.roadster);

  const sky = createSky(
    high
      ? highToon({ hero: true, cloud: true, hazeScale: tune.cloudFog })
      : lowToon({ role: 'cloud', hazeScale: tune.cloudFog }),
    high ? 1 : 0,
  );
  scene.add(sky.dome, sky.clouds);

  const sun = createSun();
  scene.add(sun, sun.target);
  if (high) scene.add(new HemisphereLight(tune.hemiSky, tune.hemiGround, tune.hemiIntensity));

  const camera = new PerspectiveCamera(VERTICAL_FOV, 1, 0.5, 5000);
  const rig = { position: new Vector3(), target: new Vector3() };
  let portrait = 0;
  let boostPull = 0;
  let baseFov = VERTICAL_FOV;
  // Camera juice: shake from crashes and smashes, FOV kicks from boosts and ramps.
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let trauma = 0;
  let fovKick = 0;
  let boostFov = 0;
  let lastSeconds: number | undefined;
  const addTrauma = (amount: number): void => {
    trauma = Math.min(1, trauma + (calm ? amount * 0.3 : amount));
  };
  const kick = (degrees: number): void => {
    const scaled = calm ? degrees / 2 : degrees;
    fovKick = scaled > 0 ? Math.max(fovKick, scaled) : Math.min(fovKick, scaled);
  };
  const post = high ? createPost(renderer, Math.min(4, caps.halfFloatSamples)) : undefined;

  // Checking every frame catches window resizes, rotation, and pixel-ratio changes alike.
  const fitToCanvas = (): void => {
    const pixelRatio = fixedPixelRatio ?? Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (
      renderer.getPixelRatio() === pixelRatio &&
      canvas.width === Math.floor(width * pixelRatio) &&
      canvas.height === Math.floor(height * pixelRatio)
    ) {
      return;
    }
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    post?.resize(width, height, pixelRatio);
    camera.aspect = width / height;
    const halfWidth = Math.tan(MathUtils.degToRad(MIN_HORIZONTAL_FOV / 2));
    baseFov = Math.max(VERTICAL_FOV, MathUtils.radToDeg(2 * Math.atan(halfWidth / camera.aspect)));
    camera.fov = baseFov + fovKick + boostFov;
    camera.updateProjectionMatrix();
    portrait = 1 - MathUtils.smoothstep(camera.aspect, 0.5, 1.3);
  };

  return {
    tier,
    render(world, simSeconds) {
      fitToCanvas();
      highway.update(world.distance / HIGHWAY_SPEED);
      const pose = roadsterPose(world);
      highway.hero.set(pose.x, pose.y, -world.distance);
      highway.roadster.rotation.set(pose.pitch, 0, pose.roll);
      highway.focus.set(pose.x * 0.5, 0, -world.distance - 14);
      chaseRoot.position.z = -world.distance;
      chase.update(world);
      chaseCamera(highway.hero, simSeconds, portrait, rig);
      const dt = lastSeconds === undefined ? 0 : MathUtils.clamp(simSeconds - lastSeconds, 0, 0.1);
      lastSeconds = simSeconds;
      const boosting = isBoosting(world);
      // The camera trails further back and widens during a boost, so the speed reads.
      boostPull += ((boosting ? 3 : 0) - boostPull) * ease(5, dt);
      boostFov += ((boosting ? BOOST_FOV : 0) - boostFov) * ease(3, dt);
      fovKick *= Math.exp(-4 * dt);
      trauma = Math.max(0, trauma - TRAUMA_DECAY * dt);
      rig.position.z += boostPull;
      camera.position.copy(rig.position);
      const shake = trauma * trauma + (boosting && !calm ? 0.05 : 0);
      if (shake > 0) {
        camera.position.x += shake * SHAKE_METERS * jitter(simSeconds, 0);
        camera.position.y += shake * SHAKE_METERS * 0.6 * jitter(simSeconds, 1);
      }
      camera.lookAt(rig.target);
      if (shake > 0) camera.rotateZ(shake * SHAKE_ROLL * jitter(simSeconds, 2));
      const fov = baseFov + fovKick + boostFov;
      if (Math.abs(fov - camera.fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      sun.target.position.copy(highway.focus);
      sun.position.copy(highway.focus).addScaledVector(SUN_DIR, 120);
      sky.follow(camera.position.x, camera.position.y, camera.position.z, simSeconds);

      renderer.info.reset();
      if (post) post.render(scene, camera);
      else renderer.render(scene, camera);
    },
    onEvents(events) {
      for (const event of events) {
        switch (event.kind) {
          case 'crash':
            addTrauma(0.75);
            kick(-4);
            break;
          case 'busted':
            addTrauma(1);
            break;
          case 'smash':
            addTrauma(event.thing === 'semi' ? 0.5 : event.thing === 'cone' ? 0.15 : 0.3);
            break;
          case 'boost':
            addTrauma(0.25);
            kick(9);
            break;
          case 'ramp':
            kick(6);
            break;
          case 'land':
            addTrauma(0.2);
            break;
          default:
            break;
        }
      }
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  };
}

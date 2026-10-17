import {
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createPuffs } from './fx/puffs';
import { SUN_DIR } from './look/haze';
import { highMaterials, highToon } from './look/materials-high';
import { lowMaterials, lowToon } from './look/materials-low';
import { createPost } from './look/post';
import { createSky } from './look/sky';
import { tune } from './look/tune';
import { palette } from './palette';
import { probeCaps, resolveTier, type GpuCaps, type Tier, type TierChoice } from './quality';
import { chaseCamera, createHighway } from './world/highway';

const MAX_PIXEL_RATIO = 2;
const POWER = 'high-performance';
const VERTICAL_FOV = 50;
// Portrait phones widen the view instead of cropping the lanes at the sides.
const MIN_HORIZONTAL_FOV = 38;

export interface FrameStats {
  /** Draw calls and triangles of the last frame, shadow pass and post pass included. */
  readonly calls: number;
  readonly triangles: number;
}

export interface View {
  readonly tier: TierChoice;
  /** Draws one frame; `simSeconds` is the interpolated simulation time. */
  render(simSeconds: number): void;
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

  const sky = createSky(
    high
      ? highToon({ hero: true, cloud: true, hazeScale: tune.cloudFog })
      : lowToon({ role: 'cloud', hazeScale: tune.cloudFog }),
    high ? 1 : 0,
  );
  scene.add(sky.dome, sky.clouds);

  const puffs = createPuffs();
  scene.add(puffs.mesh);

  const sun = createSun();
  scene.add(sun, sun.target);
  if (high) scene.add(new HemisphereLight(tune.hemiSky, tune.hemiGround, tune.hemiIntensity));

  const camera = new PerspectiveCamera(VERTICAL_FOV, 1, 0.5, 5000);
  const rig = { position: new Vector3(), target: new Vector3() };
  let portrait = 0;
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
    camera.fov = Math.max(
      VERTICAL_FOV,
      MathUtils.radToDeg(2 * Math.atan(halfWidth / camera.aspect)),
    );
    camera.updateProjectionMatrix();
    portrait = 1 - MathUtils.smoothstep(camera.aspect, 0.5, 1.3);
  };

  return {
    tier,
    render(simSeconds) {
      fitToCanvas();
      highway.update(simSeconds);
      chaseCamera(highway.hero, simSeconds, portrait, rig);
      camera.position.copy(rig.position);
      camera.lookAt(rig.target);
      sun.target.position.copy(highway.focus);
      sun.position.copy(highway.focus).addScaledVector(SUN_DIR, 120);
      sky.follow(camera.position.x, camera.position.y, camera.position.z, simSeconds);
      puffs.update(simSeconds, highway.gasBursts(simSeconds));

      renderer.info.reset();
      if (post) post.render(scene, camera);
      else renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  };
}

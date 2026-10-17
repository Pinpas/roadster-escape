import {
  BoxGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

const MAX_PIXEL_RATIO = 2;
const BOX_TURNS_PER_SECOND = 0.25;
const VERTICAL_FOV = 60;
// Portrait phones widen the view instead of cropping its sides.
const MIN_HORIZONTAL_FOV = 50;

export interface View {
  /** Draws one frame; `simSeconds` is the interpolated simulation time. */
  render(simSeconds: number): void;
}

export function createView(canvas: HTMLCanvasElement, fixedPixelRatio: number | undefined): View {
  const renderer = new WebGLRenderer({ canvas, antialias: true });

  const scene = new Scene();
  scene.background = new Color('#5b8fd9');

  scene.add(new HemisphereLight('#5b8fd9', '#e8a565', 1.2));
  const sun = new DirectionalLight('#ffe3b0', 2);
  sun.position.set(-4, 6, 3);
  scene.add(sun);

  const ground = new Mesh(
    new PlaneGeometry(400, 400),
    new MeshLambertMaterial({ color: '#e8a565' }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const box = new Mesh(new BoxGeometry(1.8, 0.8, 4), new MeshLambertMaterial({ color: '#e8322e' }));
  box.position.y = 0.4;
  scene.add(box);

  const camera = new PerspectiveCamera(VERTICAL_FOV, 1, 0.1, 500);
  camera.position.set(0, 3, 8);
  camera.lookAt(0, 0.5, 0);

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
    camera.aspect = width / height;
    const halfWidth = Math.tan(MathUtils.degToRad(MIN_HORIZONTAL_FOV / 2));
    camera.fov = Math.max(
      VERTICAL_FOV,
      MathUtils.radToDeg(2 * Math.atan(halfWidth / camera.aspect)),
    );
    camera.updateProjectionMatrix();
  };

  return {
    render(simSeconds) {
      fitToCanvas();
      box.rotation.y = simSeconds * BOX_TURNS_PER_SECOND * Math.PI * 2;
      renderer.render(scene, camera);
    },
  };
}

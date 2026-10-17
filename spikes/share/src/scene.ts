import * as THREE from 'three';

export type FrameSize = { width: number; height: number };

export const SIZES = {
  portrait: { width: 720, height: 1280 },
  landscape: { width: 1280, height: 720 },
} as const satisfies Record<string, FrameSize>;

export type SizeName = keyof typeof SIZES;

// Stand-in for the engine's "render the replay at time t" call: every pixel is a
// pure function of t, so frames can be rendered faster or slower than real time.
export type ReplayRenderer = {
  canvas: HTMLCanvasElement;
  setSize(size: FrameSize): void;
  renderAt(t: number): void;
};

export function createReplayRenderer(canvas: HTMLCanvasElement): ReplayRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffc89a');
  scene.fog = new THREE.Fog('#ffc89a', 30, 140);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight('#5b8fd9', '#6a5acd', 1.2));
  const sun = new THREE.DirectionalLight('#ffe3b0', 2.2);
  sun.position.set(-20, 30, 10);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#e8a565' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 400), new THREE.MeshLambertMaterial({ color: '#4a4458' }));
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.01;
  scene.add(road);

  const dashGeo = new THREE.PlaneGeometry(0.25, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#fff4d6' });
  const dashes: THREE.Mesh[] = [];
  for (let lane = -1; lane <= 1; lane += 2) {
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Mesh(dashGeo, dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(lane * 2, 0.02, -i * 8);
      scene.add(d);
      dashes.push(d);
    }
  }

  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4), new THREE.MeshLambertMaterial({ color: '#e8322e' }));
  body.position.y = 0;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.6), new THREE.MeshLambertMaterial({ color: '#2a2433' }));
  cabin.position.set(0, 0.5, 0.2);
  car.add(body, cabin);
  scene.add(car);

  const traffic: THREE.Mesh[] = [];
  const trafficMat = new THREE.MeshLambertMaterial({ color: '#c8664a' });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 4), trafficMat);
    traffic.push(m);
    scene.add(m);
  }

  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: '#2f6bff' }));
  const cop = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 4.2), new THREE.MeshLambertMaterial({ color: '#f2f2f2' }));
  lightBar.position.y = 0.55;
  cop.add(lightBar);
  scene.add(cop);

  const mesas: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 10, 7), new THREE.MeshLambertMaterial({ color: '#c8664a' }));
    m.position.set((i % 2 ? 1 : -1) * (40 + i * 7), 5, -100 - i * 12);
    mesas.push(m);
    scene.add(m);
  }

  const speed = 30;

  return {
    canvas,
    setSize({ width, height }) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = width < height ? 70 : 50;
      camera.updateProjectionMatrix();
    },
    renderAt(t) {
      const z = -t * speed;
      for (const d of dashes) {
        const base = d.userData.base ?? (d.userData.base = d.position.z);
        d.position.z = (((base - z) % 320) + 320) % 320 - 300 + z;
      }

      const lanes = [-4, 0, 4];
      const lane = lanes[Math.floor(t / 1.25) % 3]!;
      const hop = Math.max(0, Math.sin(((t % 2.5) / 2.5) * Math.PI * 2)) * 2.2;
      car.position.set(lane, hop + 0.6, z);
      car.rotation.z = t > 2 && t < 3 ? (t - 2) * Math.PI * 2 : 0;

      traffic.forEach((m, i) => {
        m.position.set(lanes[i % 3]!, 0.7, z - 12 - ((i * 17 + t * 9) % 90));
      });

      cop.position.set(lane - 3 + Math.sin(t * 3) * 0.8, 0.45, z + 1.5 - Math.sin(t) * 1.5);
      (lightBar.material as THREE.MeshBasicMaterial).color.set(Math.floor(t * 6) % 2 ? '#2f6bff' : '#ff3048');

      for (const m of mesas) m.position.z = (m.userData.base ?? (m.userData.base = m.position.z)) + z;

      camera.position.set(lane * 0.6 + Math.sin(t * 0.7) * 1.5, 4.5, z + 11);
      camera.lookAt(lane * 0.8, 1.2, z - 8);
      renderer.render(scene, camera);
    },
  };
}

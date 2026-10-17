import {
  BufferAttribute,
  DynamicDrawUsage,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { palette } from '../palette';

/** How long a puff lives, in seconds. A burst older than this draws nothing. */
export const PUFF_SECONDS = 0.9;
const CAPACITY = 160;
const DRAG = 2.2;

/** One burst of cold gas from one nozzle: where, when, which way (m/s, world space), how many puffs. */
export interface GasBurst {
  readonly time: number;
  readonly origin: Vector3;
  readonly velocity: Vector3;
  readonly count: number;
}

export interface Puffs {
  readonly mesh: InstancedMesh;
  /**
   * Pose every live puff of `bursts` at `now`. Stateless: a puff is a pure function of its
   * burst, so the same bursts at the same time always draw the same frame.
   */
  update(now: number, bursts: readonly GasBurst[]): void;
}

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** A seed from the burst itself, so its puffs never depend on which bursts came before. */
const seedOf = (b: GasBurst): number =>
  Math.round(b.time * 1000) * 0.137 + b.origin.x * 13.1 + b.origin.y * 7.3 + b.origin.z * 3.7;

/**
 * Chunky round puffs, 20 triangles each so a full buffer stays near 3k triangles: bright on top,
 * lilac underneath, painted in vertex colours so no light is needed.
 */
function puffGeometry(): IcosahedronGeometry {
  const g = new IcosahedronGeometry(1, 0);
  const top = new Color(palette.thruster);
  const base = new Color(palette.skyMid);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(base).lerp(top, Math.min(1, Math.max(0, pos.getY(i) * 0.6 + 0.6)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

export function createPuffs(): Puffs {
  const mesh = new InstancedMesh(
    puffGeometry(),
    new MeshBasicMaterial({ vertexColors: true }),
    CAPACITY,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();
  const jitter = new Vector3();

  return {
    mesh,
    update(now, bursts) {
      let n = 0;
      // Newest first, so a full buffer drops the oldest puffs, not the burst the player just fired.
      for (let b = bursts.length - 1; b >= 0; b--) {
        const burst = bursts[b];
        if (!burst) continue;
        const age = now - burst.time;
        if (age < 0 || age > PUFF_SECONDS) continue;
        const seed = seedOf(burst);
        for (let i = 0; i < burst.count && n < CAPACITY; i++) {
          const k = seed + i * 5;
          const life = PUFF_SECONDS * (0.7 + 0.3 * hash(k));
          if (age > life) continue;
          const u = age / life;
          jitter.set(hash(k + 1) - 0.5, hash(k + 2) * 0.6, hash(k + 3) - 0.5).multiplyScalar(2.2);
          const travel = (1 - Math.exp(-DRAG * age)) / DRAG;
          p.copy(burst.origin)
            .addScaledVector(burst.velocity, travel)
            .addScaledVector(jitter, travel);
          p.y += age * age * 0.9;
          // Expand fast, then shrink away at the end of life: an opaque puff's fade.
          const grow = 1 - (1 - Math.min(1, u / 0.35)) ** 2;
          const fade = 1 - Math.max(0, (u - 0.7) / 0.3) ** 2;
          const r = (0.15 + 0.4 * hash(k + 4)) * grow * fade + 0.01;
          // Gas that hits the road spreads over it instead of sinking in.
          p.y = Math.max(p.y, r * 0.8);
          s.set(r, r * 0.85, r);
          mesh.setMatrixAt(n++, m.compose(p, q, s));
        }
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

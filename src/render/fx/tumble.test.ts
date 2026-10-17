import { Box3, BoxGeometry, Mesh, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { TUMBLE_SECONDS, tumblePose } from './tumble';

const HEIGHT = 2;
const SPEED = 24;

/** A stand-in cop: a 2 m tall body whose pivot sits on the road, like the real model. */
function cop(): { root: Object3D; body: Mesh } {
  const root = new Object3D();
  const body = new Mesh(new BoxGeometry(2, HEIGHT, 4.7).translate(0, HEIGHT / 2, 0));
  root.add(body);
  return { root, body };
}

const boundsAt = (age: number) => {
  const { root, body } = cop();
  tumblePose(age, 1, HEIGHT, SPEED, root);
  root.updateMatrixWorld(true);
  return { box: new Box3().setFromObject(body), root };
};

describe('cop tumble', () => {
  it('never sinks into the road', () => {
    for (const age of [0, 0.2, 0.45, 0.7, 0.8, TUMBLE_SECONDS, 1.5, 3]) {
      expect(boundsAt(age).box.min.y, `lowest point at ${String(age)} s`).toBeGreaterThan(-0.05);
    }
  });

  it('lands on its roof, on the road, thrown away from its lunge', () => {
    const { box, root } = boundsAt(2);
    expect(Math.abs(root.rotation.z), 'upside down').toBeCloseTo(Math.PI, 5);
    expect(box.min.y, 'resting on the road').toBeCloseTo(0, 1);
    expect(root.position.x, 'thrown away from the Roadster it lunged at').toBeLessThan(-1.5);
  });

  it('slides to a stop, so the chase leaves it behind', () => {
    const z = (age: number) => boundsAt(age).root.position.z;
    expect(z(1)).toBeGreaterThan(z(0.5));
    expect(z(3) - z(2), 'falls further behind every second').toBeGreaterThan(SPEED * 0.8);
  });
});

import type { Object3D } from 'three';

/** How long the roll and the bounce take, in seconds. The slide goes on until the car stops. */
export const TUMBLE_SECONDS = 0.9;
const SLIDE_DRAG = 2;

/**
 * Add a wrecked cop's goofy tumble to its chase pose, as a pure function of seconds since the
 * wreck. It pops up, barrel-rolls away from the Roadster it lunged at, lands on its roof, and
 * slides to a stop on the road, falling behind a chase that keeps going at `speed` m/s.
 * `side` is the direction of the lunge (-1 left, 1 right). `height` is the car's height, so the
 * upside-down body lands on the road instead of under it. Offsets add to `object`'s pose, so set
 * the chase pose first and call this once per frame.
 */
export function tumblePose(
  age: number,
  side: -1 | 1,
  height: number,
  speed: number,
  object: Object3D,
): void {
  const t = Math.max(age, 0);
  const u = Math.min(1, t / TUMBLE_SECONDS);
  const roll = Math.PI * u;
  object.position.y += Math.sin(Math.PI * u) * 2.4 + (height * (1 - Math.cos(roll))) / 2;
  object.position.x -= side * 1.8 * (1 - (1 - u) * (1 - u));
  object.position.z += speed * t - (speed * (1 - Math.exp(-SLIDE_DRAG * t))) / SLIDE_DRAG;
  object.rotation.z += side * roll;
  object.rotation.y += side * 1.4 * u;
}

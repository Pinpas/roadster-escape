import type { Material, WebGLRenderer } from 'three';
import type { Part, World } from './world';

export type LookId = 'a' | 'b' | 'c';

export interface LookRuntime {
  /** Draw one frame. The look owns everything from scene to canvas, post included. */
  render(): void;
  resize(width: number, height: number, pixelRatio: number): void;
  /** Per-frame animation the look owns (clouds, uniforms). `t` is seconds since start. */
  update?(t: number): void;
}

export interface Look {
  id: LookId;
  title: string;
  /** Whether the default framebuffer gets MSAA. Looks with a post pass usually say false. */
  canvasAntialias: boolean;
  build(renderer: WebGLRenderer, world: World): LookRuntime;
}

/** Give every part the material the look picks for its role. */
export function assignMaterials(world: World, pick: (part: Part) => Material): void {
  for (const part of world.parts) part.mesh.material = pick(part);
}

import { REVISION, ShaderChunk } from 'three';

/**
 * The three.js release these shader patches were written and checked against. Bumping three
 * fails `patches.test.ts` until someone re-checks every patch below and updates this value.
 */
export const PATCHED_REVISION = '186';

export interface ShaderSource {
  vertexShader: string;
  fragmentShader: string;
}

/** One text edit to a built-in three.js shader. `find` must occur exactly once. */
export interface Patch {
  readonly stage: 'vertex' | 'fragment';
  readonly find: string;
  readonly replace: string;
}

export class MissingPatchTarget extends Error {
  constructor(patch: Patch) {
    super(
      `three.js r${REVISION}: ${patch.stage} shader patch target not found exactly once: ` +
        `"${patch.find}". Re-check src/render/look/patches.ts against this three.js release.`,
    );
  }
}

const once = (text: string, patch: Patch): string => {
  const parts = text.split(patch.find);
  if (parts.length !== 2) throw new MissingPatchTarget(patch);
  return parts.join(patch.replace);
};

/** Apply patches in order; throws `MissingPatchTarget` instead of silently doing nothing. */
export function applyPatches(shader: ShaderSource, patches: readonly Patch[]): void {
  for (const patch of patches) {
    if (patch.stage === 'vertex') shader.vertexShader = once(shader.vertexShader, patch);
    else shader.fragmentShader = once(shader.fragmentShader, patch);
  }
}

/** Inline a built-in chunk with an edit applied, as a patch on its `#include` line. */
export function patchedChunk(name: keyof typeof ShaderChunk, edit: Patch): Patch {
  const source = { vertexShader: '', fragmentShader: ShaderChunk[name] };
  applyPatches(source, [{ ...edit, stage: 'fragment' }]);
  return { stage: edit.stage, find: `#include <${name}>`, replace: source.fragmentShader };
}

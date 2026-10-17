import { REVISION, ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { highPatches } from './materials-high';
import { MissingPatchTarget, PATCHED_REVISION, applyPatches } from './patches';

describe('three.js shader patches', () => {
  it('were checked against the installed three.js release', () => {
    expect(REVISION, 'three.js changed: re-check every patch, then bump PATCHED_REVISION').toBe(
      PATCHED_REVISION,
    );
  });

  for (const [name, { lib, patches }] of Object.entries(highPatches)) {
    it(`apply cleanly to ShaderLib.${lib} (${name})`, () => {
      const shader = ShaderLib[lib];
      if (!shader) throw new Error(`ShaderLib.${lib} is gone`);
      const source = { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader };
      expect(() => {
        applyPatches(source, patches);
      }).not.toThrow();
      for (const patch of patches) {
        const text = patch.stage === 'vertex' ? source.vertexShader : source.fragmentShader;
        expect(text).toContain(patch.replace);
      }
    });
  }

  it('fail loudly when a target is missing', () => {
    const source = { vertexShader: 'void main() {}', fragmentShader: '' };
    expect(() => {
      applyPatches(source, [{ stage: 'vertex', find: '#include <gone>', replace: '' }]);
    }).toThrow(MissingPatchTarget);
  });
});

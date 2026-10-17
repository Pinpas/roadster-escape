import { describe, expect, it } from 'vitest';
import { MAX_PIXEL_RATIO_FLAG, parseRenderFlags } from './flags';

describe('parseRenderFlags', () => {
  it('defaults to an uncapped, animated loop at the device pixel ratio', () => {
    expect(parseRenderFlags('')).toEqual({ fps: undefined, still: false, pixelRatio: undefined });
  });

  it('reads all three flags', () => {
    expect(parseRenderFlags('?fps=10&still&dpr=1')).toEqual({
      fps: 10,
      still: true,
      pixelRatio: 1,
    });
  });

  it('accepts a fractional pixel ratio', () => {
    expect(parseRenderFlags('?dpr=0.5').pixelRatio).toBe(0.5);
  });

  it('caps the pixel ratio, so a stray ?dpr=50 cannot ask for a huge buffer', () => {
    expect(parseRenderFlags('?dpr=50').pixelRatio).toBe(MAX_PIXEL_RATIO_FLAG);
  });

  it.each(['?fps=0', '?fps=-5', '?fps=abc', '?fps=', '?fps', '?fps=Infinity'])(
    'ignores a malformed fps in %s',
    (search) => {
      expect(parseRenderFlags(search).fps).toBeUndefined();
    },
  );
});

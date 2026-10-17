/**
 * Quality tiers. `high` is the graded-lit look: toon materials, an HDR render target and one
 * post pass with bloom. `low` is one toon shader straight to the canvas: no render target, no
 * bloom. Phones that cannot render to half-float targets get `low` automatically.
 */
export type Tier = 'high' | 'low';

export interface TierChoice {
  readonly tier: Tier;
  readonly reason: 'requested' | 'default' | 'no-half-float-target';
}

export interface GpuCaps {
  /** WebGL2 can render to RGBA16F (EXT_color_buffer_half_float or EXT_color_buffer_float). */
  readonly halfFloatTarget: boolean;
  /** Most MSAA samples an RGBA16F renderbuffer supports; 0 when it cannot be multisampled. */
  readonly halfFloatSamples: number;
}

/** `?tier=low` or `?tier=high`; anything else leaves the choice to the device. */
export function parseTier(search: string): Tier | undefined {
  const value = new URLSearchParams(search).get('tier');
  return value === 'low' || value === 'high' ? value : undefined;
}

export function resolveTier(requested: Tier | undefined, caps: GpuCaps): TierChoice {
  if (requested === 'low') return { tier: 'low', reason: 'requested' };
  if (!caps.halfFloatTarget) return { tier: 'low', reason: 'no-half-float-target' };
  return requested === 'high'
    ? { tier: 'high', reason: 'requested' }
    : { tier: 'high', reason: 'default' };
}

export function probeCaps(gl: WebGL2RenderingContext): GpuCaps {
  const halfFloatTarget =
    gl.getExtension('EXT_color_buffer_half_float') !== null ||
    gl.getExtension('EXT_color_buffer_float') !== null;
  const counts: unknown = halfFloatTarget
    ? gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES)
    : null;
  const halfFloatSamples = counts instanceof Int32Array ? Math.max(0, ...counts) : 0;
  return { halfFloatTarget, halfFloatSamples };
}

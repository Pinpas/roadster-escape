export interface RenderFlags {
  /** Render-only frame cap. The simulation keeps its fixed 60 Hz step. */
  readonly fps: number | undefined;
  /** Render one frame, then stop the loop. */
  readonly still: boolean;
  /** Replaces the device pixel ratio and its usual cap of 2, up to `MAX_PIXEL_RATIO_FLAG`. */
  readonly pixelRatio: number | undefined;
}

export const MAX_PIXEL_RATIO_FLAG = 4;

const positive = (value: string | null): number | undefined => {
  const parsed = Number(value ?? undefined);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const clampPixelRatio = (value: number | undefined): number | undefined =>
  value === undefined ? undefined : Math.min(value, MAX_PIXEL_RATIO_FLAG);

/** Parses `?fps=N`, `?still` and `?dpr=N`; anything malformed falls back to the default. */
export function parseRenderFlags(search: string): RenderFlags {
  const params = new URLSearchParams(search);
  return {
    fps: positive(params.get('fps')),
    still: params.has('still'),
    pixelRatio: clampPixelRatio(positive(params.get('dpr'))),
  };
}

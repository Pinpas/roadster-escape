import { BlobSource, CanvasSink, Input, MP4 } from 'mediabunny';

const PROBE_TIMES = [0.5, 1.5, 2.5, 3.5, 4.5];

function fnv1a(bytes: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 0x01000193);
  return (h >>> 0).toString(16);
}

// Reads the MP4 back on the device itself, so a phone run proves frame count and
// catches the Safari 16.4 bug where every encoded frame repeats the same image.
export async function selfCheck(blob: Blob, expectedFrames: number) {
  const input = new Input({ source: new BlobSource(blob), formats: [MP4] });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return { ok: false, reason: 'no video track' };
  const { packetCount } = await track.computePacketStats();
  const duration = await input.computeDuration();
  const sink = new CanvasSink(track, { width: 32, height: 32, fit: 'fill' });
  const hashes = new Set<string>();
  for await (const wrapped of sink.canvasesAtTimestamps(PROBE_TIMES)) {
    if (!wrapped) continue;
    const ctx = (wrapped.canvas as HTMLCanvasElement).getContext('2d')!;
    hashes.add(fnv1a(ctx.getImageData(0, 0, 32, 32).data));
  }
  return {
    ok: packetCount === expectedFrames && hashes.size === PROBE_TIMES.length,
    codec: await track.getCodecParameterString(),
    packets: packetCount,
    expectedFrames,
    duration,
    distinctProbeFrames: `${hashes.size}/${PROBE_TIMES.length}`,
  };
}

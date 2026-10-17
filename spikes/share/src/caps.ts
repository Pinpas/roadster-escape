import { canEncodeAudio, canEncodeVideo, getEncodableVideoCodecs } from 'mediabunny';
import { SIZES } from './scene';

const AVC_CONFIGS = ['avc1.42E01F', 'avc1.4D0028', 'avc1.640028', 'avc1.42001F'];
const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

async function avcSupport(codec: string, width: number, height: number, hardwareAcceleration: HardwareAcceleration) {
  if (typeof VideoEncoder === 'undefined') return 'no VideoEncoder';
  try {
    const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 4e6, framerate: 30, hardwareAcceleration, avc: { format: 'avc' } });
    return r.supported ? 'yes' : 'no';
  } catch (e) {
    return `throws ${(e as Error).name}`;
  }
}

function webglRenderer(): string {
  const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
  if (!gl) return 'no WebGL';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

export async function probeCapabilities() {
  const probeFile = new File([new Uint8Array(16)], 'probe.mp4', { type: 'video/mp4' });
  const avc: Record<string, string> = {};
  for (const c of AVC_CONFIGS) {
    for (const hw of ['prefer-hardware', 'prefer-software'] as const) {
      avc[`${c} 720x1280 ${hw}`] = await avcSupport(c, 720, 1280, hw);
      avc[`${c} 1280x720 ${hw}`] = await avcSupport(c, 1280, 720, hw);
    }
  }
  return {
    userAgent: navigator.userAgent,
    isSecureContext: window.isSecureContext,
    hardwareConcurrency: navigator.hardwareConcurrency,
    webgl: webglRenderer(),
    VideoEncoder: typeof VideoEncoder !== 'undefined',
    AudioEncoder: typeof AudioEncoder !== 'undefined',
    mediabunnyAvcPortrait: await canEncodeVideo('avc', SIZES.portrait),
    mediabunnyAvcLandscape: await canEncodeVideo('avc', SIZES.landscape),
    encodableVideoCodecs: await getEncodableVideoCodecs(undefined, SIZES.portrait),
    aac: await canEncodeAudio('aac'),
    opus: await canEncodeAudio('opus'),
    avc,
    mediaRecorder: typeof MediaRecorder === 'undefined'
      ? 'none'
      : Object.fromEntries(RECORDER_TYPES.map((t) => [t, MediaRecorder.isTypeSupported(t)])),
    share: typeof navigator.share === 'function',
    canShareMp4File: typeof navigator.canShare === 'function' ? navigator.canShare({ files: [probeFile] }) : 'no canShare',
  };
}

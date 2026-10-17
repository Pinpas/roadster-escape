// Offline-rendered engine hum: the replay's audio is produced from the same timeline
// as the frames, never captured from the speakers.
export async function renderReplayAudio(seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(70, 0);
  osc.frequency.linearRampToValueAtTime(140, seconds);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, 0);
  for (let s = 0; s < seconds; s += 1.25) {
    gain.gain.setValueAtTime(0.25, s);
    gain.gain.exponentialRampToValueAtTime(0.08, s + 0.4);
  }
  osc.connect(gain).connect(ctx.destination);
  osc.start(0);
  return ctx.startRendering();
}

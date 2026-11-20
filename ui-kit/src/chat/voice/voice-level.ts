/** Level of the signal 0..1 from the samples of an AnalyserNode (bytes around 128): RMS, a little amplified for the wave. */
export function levelOf(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) {
    const centered = (sample - 128) / 128
    sum += centered * centered
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 2)
}

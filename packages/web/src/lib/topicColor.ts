/** Deterministic hue per topic string, so the same topic always renders the
 * same particle color and visually distinct topics (e.g. different
 * exchanges) read as distinct colors - this is what makes wildcard matching
 * legible at a glance ("only the blue dots go to that consumer"). */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function topicHue(topic: string): number {
  return hashString(topic) % 360;
}

export function topicColor(topic: string, opts: { saturation?: number; lightness?: number; alpha?: number } = {}): string {
  const { saturation = 85, lightness = 62, alpha = 1 } = opts;
  const hue = topicHue(topic);
  return alpha < 1 ? `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})` : `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

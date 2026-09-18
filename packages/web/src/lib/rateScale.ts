// Log-scale mapping so a single slider gives fine control at "watch individual
// messages" rates (1-10 msg/s) as well as reach up into overload territory
// (hundreds/s) without most of the track being wasted on the low end.
const MIN_RATE = 0.2;
const MAX_RATE = 500;
const LOG_MIN = Math.log(MIN_RATE);
const LOG_MAX = Math.log(MAX_RATE);

/** Slider position 0-1000 -> messages/sec. */
export function sliderToRate(position: number): number {
  const t = position / 1000;
  return Math.exp(LOG_MIN + t * (LOG_MAX - LOG_MIN));
}

/** Messages/sec -> slider position 0-1000. */
export function rateToSlider(rate: number): number {
  const clamped = Math.min(Math.max(rate, MIN_RATE), MAX_RATE);
  const t = (Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return t * 1000;
}

export function formatRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(0);
  if (rate >= 10) return rate.toFixed(1);
  return rate.toFixed(2);
}

export { MIN_RATE, MAX_RATE };

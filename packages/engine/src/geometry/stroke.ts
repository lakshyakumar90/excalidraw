export function getPressureWidth(baseWidth: number, pressure: number): number {
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2;

  const normalized = Math.max(0, Math.min(1, pressure));
  const scale = MIN_SCALE + normalized * (MAX_SCALE - MIN_SCALE);

  return baseWidth * scale;
}


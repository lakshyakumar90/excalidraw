const DEFAULT_PRESSURE = 0.5;

export function normalizePressure(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) {
    return DEFAULT_PRESSURE;
  }

  return Math.min(1, pressure);
}

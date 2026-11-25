import type { Element, Point } from "@repo/common";

/**
 * Deterministic, low-frequency wobble applied along a path.
 *
 * Older versions added an independent random offset to every subdivision,
 * which produced jagged, zig-zag strokes. Here the offset is a smooth pair of
 * sine waves seeded from the element, so the line gently bends like a real
 * hand-drawn stroke while staying stable between frames and zoom levels.
 */
export function getRoughPathPoints(
  points: readonly Point[],
  closed: boolean,
  element: Element,
): Point[] {
  const roughness = Math.max(0, element.roughness ?? 0);
  if (roughness === 0 || points.length < 2) return [...points];

  let state = (element.seed ?? 1) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const amplitude = Math.min(2.2, roughness * 0.5);
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;
  const waveA = 1 / (30 + random() * 12);
  const waveB = 1 / (12 + random() * 6);

  const segmentCount = closed ? points.length : points.length - 1;
  const cumulative: number[] = [0];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (!start || !end) continue;
    cumulative[index + 1] =
      cumulative[index]! + Math.hypot(end.x - start.x, end.y - start.y);
  }
  const total = cumulative[segmentCount] ?? 0;
  if (total === 0) return [...points];

  const wobble = (distance: number) =>
    amplitude *
    (0.65 * Math.sin(distance * waveA + phaseA) +
      0.35 * Math.sin(distance * waveB + phaseB));

  const result: Point[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (!start || !end) continue;

    result.push(start);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;

    const normalX = -dy / length;
    const normalY = dx / length;
    const subdivisions = Math.max(1, Math.min(48, Math.ceil(length / 10)));

    for (let step = 1; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const distance = cumulative[index]! + length * t;
      // Taper toward the ends of open paths so joins stay exact.
      const taper = closed
        ? 1
        : Math.min(1, distance / 10, (total - distance) / 10);
      const offset = wobble(distance) * Math.max(0, taper);
      result.push({
        x: start.x + dx * t + normalX * offset,
        y: start.y + dy * t + normalY * offset,
      });
    }
  }

  if (!closed) {
    const last = points[points.length - 1];
    if (last) result.push(last);
  }
  return result;
}

export interface LaserFrame {
  type: "laser.move";
  gestureId: string;
  seq: number;
  points: { x: number; y: number }[];
}
export type RemoteLaserFrame = LaserFrame & {
  connectionId: string;
  userId: string;
};
export function isLaserFrame(value: unknown): value is LaserFrame {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "laser.move" &&
    typeof v.gestureId === "string" &&
    v.gestureId.length > 0 &&
    v.gestureId.length <= 64 &&
    Number.isSafeInteger(v.seq) &&
    Number(v.seq) >= 0 &&
    Array.isArray(v.points) &&
    v.points.length > 0 &&
    v.points.length <= 32 &&
    v.points.every(
      (p) =>
        p &&
        typeof p === "object" &&
        Object.keys(p).length === 2 &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Math.abs(p.x) <= 10_000_000 &&
        Math.abs(p.y) <= 10_000_000,
    )
  );
}

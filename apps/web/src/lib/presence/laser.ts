import type { LaserFrame, RemoteLaserFrame } from "@repo/common";
import { getRoomSyncBridge } from "@/lib/sync/syncBridge";

export interface Trail {
  userId: string;
  gestureId: string;
  seq: number;
  points: { x: number; y: number; time: number }[];
}
export class LaserTrails {
  private retired = new Map<string, Set<string>>();
  clear() {
    this.trails.clear();
    this.retired.clear();
  }
  remove(connectionId: string) {
    this.trails.delete(connectionId);
    this.retired.delete(connectionId);
  }
  readonly trails = new Map<string, Trail>();
  receive(frame: RemoteLaserFrame, now: number) {
    this.prune(now);
    const old = this.trails.get(frame.connectionId);
    if (this.retired.get(frame.connectionId)?.has(frame.gestureId)) return;
    if (old && old.gestureId !== frame.gestureId) {
      const retired = this.retired.get(frame.connectionId) ?? new Set<string>();
      retired.add(old.gestureId);
      while (retired.size > 8) retired.delete(retired.values().next().value!);
      this.retired.set(frame.connectionId, retired);
      while (this.retired.size > 100)
        this.retired.delete(this.retired.keys().next().value!);
    }
    if (old?.gestureId === frame.gestureId && frame.seq <= old.seq) return;
    const points = old?.gestureId === frame.gestureId ? old.points : [];
    points.push(...frame.points.map((p) => ({ ...p, time: now })));
    this.trails.set(frame.connectionId, {
      userId: frame.userId,
      gestureId: frame.gestureId,
      seq: frame.seq,
      points: points.slice(-128),
    });
    while (this.trails.size > 100)
      this.remove(this.trails.keys().next().value!);
  }
  prune(now: number) {
    for (const [id, t] of this.trails) {
      t.points = t.points.filter((p) => now - p.time < 1000);
      if (!t.points.length) this.trails.delete(id);
    }
  }
}
export const laserTrails = new LaserTrails();
const listeners = new Set<() => void>();
export function subscribeLaser(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function receiveLaser(frame: RemoteLaserFrame) {
  laserTrails.receive(frame, performance.now());
  for (const cb of listeners) cb();
}
export function removeLaser(connectionId: string) {
  laserTrails.remove(connectionId);
  for (const cb of listeners) cb();
}
export function clearLaser() {
  laserTrails.clear();
  for (const cb of listeners) cb();
}
let gestureId = "",
  seq = 0,
  last = 0;
export function startLaser() {
  gestureId = crypto.randomUUID();
  seq = 0;
  last = 0;
}
export function moveLaser(point: { x: number; y: number }) {
  const now = performance.now();
  if (now - last < 33) return;
  last = now;
  const frame: LaserFrame = {
    type: "laser.move",
    gestureId,
    seq: seq++,
    points: [point],
  };
  receiveLaser({ ...frame, connectionId: "local", userId: "local" });
  getRoomSyncBridge()?.laser?.(frame);
}
export const followState = { active: false };

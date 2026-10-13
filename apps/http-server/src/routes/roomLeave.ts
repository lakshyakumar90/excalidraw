import type { Router } from "express";
import { db, leaveRoomMembership } from "@repo/db";
import { publishRoomAccessChanged } from "../invitationRateLimit.js";
import { accessibleRoom, roomIdOf } from "./roomRouteUtils.js";

export function registerRoomLeaveRoute(router: Router) {
  router.post("/:roomId/leave", async (req, res) => {
    const roomId = roomIdOf(req.params.roomId);
    if (!roomId) return res.status(404).json({ message: "Room not found" });
    try {
      const access = await accessibleRoom(roomId, req.userId!);
      if (!access) return res.status(404).json({ message: "Room not found" });
      if (access.role === "owner")
        return res
          .status(409)
          .json({
            message:
              "The owner cannot leave their room. Delete the room instead.",
          });
      if (!(await leaveRoomMembership(db, { roomId, userId: req.userId! }))) {
        return res.status(404).json({ message: "Membership not found" });
      }
      // Membership is already revoked even if Redis is temporarily unavailable.
      try {
        await publishRoomAccessChanged({
          roomId,
          userId: req.userId!,
          role: null,
        });
      } catch (error) {
        console.error("Room access notification failed after leaving:", error);
      }
      return res.status(204).end();
    } catch (error) {
      console.error("Room leave error:", error);
      return res.status(500).json({ message: "Unable to leave room" });
    }
  });
}

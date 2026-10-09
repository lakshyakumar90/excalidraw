import type { NextFunction, Request, Response } from "express";
import { getSessionFromHeaders } from "@repo/auth";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const session = await getSessionFromHeaders(req.headers);

    if (!session) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.userId = session.user.id;
    return next();
  } catch (error) {
    console.error("Session verification failed:", error);
    return res.status(500).json({ message: "Unable to verify session" });
  }
}

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common";

interface CustomJwtPayload extends jwt.JwtPayload {
  userId: string;
}

export function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["authorization"];
  
  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as CustomJwtPayload;
    if (decoded) {
      req.userId = decoded.userId;
      next();
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
}  
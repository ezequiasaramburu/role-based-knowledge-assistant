import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../auth/token";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

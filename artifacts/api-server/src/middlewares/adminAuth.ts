import type { Request, Response, NextFunction } from "express";
import { isValidSession } from "../lib/sessions";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !isValidSession(token)) {
    res.status(401).json({ error: "Unauthorized — phiên đăng nhập không hợp lệ" });
    return;
  }
  next();
}

import crypto from "crypto";

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 giờ
const sessions = new Map<string, number>(); // token -> expiresAt

export function createSession(): string {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_DURATION_MS);
  return token;
}

export function isValidSession(token: string): boolean {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

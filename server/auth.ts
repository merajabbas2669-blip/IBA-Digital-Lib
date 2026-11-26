import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export interface AuthUser {
  studentId: string;
  fullName: string;
  email: string;
  role: 'student' | 'admin';
  accountStatus: 'Active' | 'Warning Issued' | 'Restricted';
  isDemo: boolean;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  sessionTokenHash?: string;
}

const SCRYPT_KEY_LENGTH = 64;
const SESSION_TTL_HOURS = 12;

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derivedBuf = crypto.scryptSync(plainPassword, salt, SCRYPT_KEY_LENGTH);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

export function hasConfiguredEnvAdminPassword(): boolean {
  const secret = process.env.ADMIN_INITIAL_PASSWORD;
  return typeof secret === 'string' && secret.trim().length > 0;
}

export function verifyEnvAdminPassword(candidate: string): boolean {
  const secret = process.env.ADMIN_INITIAL_PASSWORD;
  if (!secret || secret.trim().length === 0) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createSession(studentId: string, role: 'student' | 'admin'): { token: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000);

  db.prepare(
    `INSERT INTO sessions (token_hash, student_id, role, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(tokenHash, studentId, role, now.toISOString(), expires.toISOString());

  return { token: rawToken, expiresAt: expires.toISOString() };
}

export function revokeSession(tokenHash: string): void {
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
}

export function purgeExpiredSessions(): void {
  db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).run(new Date().toISOString());
}

interface SessionLookupRow {
  student_id: string;
  full_name: string;
  email: string;
  role: 'student' | 'admin';
  account_status: 'Active' | 'Warning Issued' | 'Restricted';
  is_demo: number;
  expires_at: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const rawToken = header.slice('Bearer '.length).trim();
  if (!rawToken) {
    res.status(401).json({ error: 'Invalid authorization token.' });
    return;
  }

  const tokenHash = hashSessionToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.student_id, s.expires_at, u.full_name, u.email, u.role, u.account_status, u.is_demo
       FROM sessions s
       INNER JOIN students u ON u.student_id = s.student_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as SessionLookupRow | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session is invalid or has expired. Please sign in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    revokeSession(tokenHash);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  req.sessionTokenHash = tokenHash;
  req.authUser = {
    studentId: row.student_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    accountStatus: row.account_status,
    isDemo: row.is_demo === 1,
  };
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Administrator privileges are required for this action.' });
    return;
  }
  next();
}

export function requireStudent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.authUser.role !== 'student') {
    res.status(403).json({ error: 'Student account access is required for this endpoint.' });
    return;
  }
  next();
}

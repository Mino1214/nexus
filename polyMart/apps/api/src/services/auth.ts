import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AuthResponse, AuthUser, MeResponse, UserStats } from "@polywatch/shared";
import { POINT_RULES } from "@polywatch/shared";
import {
  findUserByEmail,
  findUserById,
  findUserByUsername,
  getUserStats,
  insertUserWithPointLog,
  type PointLogRecord,
  type StoredUser,
} from "../db/index.js";
import {
  DEFAULT_JWT_SECRET,
  getExternalAdminSsoAudience,
  getExternalAdminSsoIssuer,
  getExternalAdminSsoSecret,
} from "../lib/env.js";
import { conflict, notFound, unauthorized } from "../lib/http.js";

const JWT_EXPIRES_IN = "7d";
const DEV_ADMIN_EMAILS = new Set(["myno_demo@example.com"]);
const DEV_ADMIN_USERNAMES = new Set(["myno_demo"]);
type AuthSource = NonNullable<AuthUser["authSource"]>;
type AdminRole = NonNullable<AuthUser["adminRole"]>;

interface SessionOptions {
  adminOverride?: boolean;
  authSource?: AuthSource;
  adminRole?: AdminRole | null;
}

interface VerifiedAuthToken {
  userId: string;
  authSource: AuthSource;
  adminRole: AdminRole | null;
}

function getJwtSecret() {
  return process.env.JWT_SECRET ?? DEFAULT_JWT_SECRET;
}

function parseAllowlist(value?: string) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(user: Pick<StoredUser, "email" | "username">) {
  const adminEmails = parseAllowlist(process.env.ADMIN_EMAILS);
  const adminUsernames = parseAllowlist(process.env.ADMIN_USERNAMES);

  if (adminEmails.size > 0 || adminUsernames.size > 0) {
    return adminEmails.has(user.email.toLowerCase()) || adminUsernames.has(user.username.toLowerCase());
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_ADMIN_EMAILS.has(user.email.toLowerCase()) || DEV_ADMIN_USERNAMES.has(user.username.toLowerCase());
  }

  return false;
}

function getShadowAdminIdentity(provider: AuthSource, externalId: string) {
  const normalizedId = String(externalId)
    .trim()
    .toLowerCase();
  const safeId = normalizedId.replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "admin";
  const suffix = createHash("sha256").update(`${provider}:${normalizedId}`).digest("hex").slice(0, 8);
  const prefix = `${provider}_${safeId}`.slice(0, 15);

  return {
    username: `${prefix}_${suffix}`.slice(0, 24),
    email: `${provider}.${suffix}@admin.local`,
  };
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) {
    return false;
  }

  const incomingHash = scryptSync(password, salt, 64);
  const knownHash = Buffer.from(storedHash, "hex");

  if (incomingHash.length !== knownHash.length) {
    return false;
  }

  return timingSafeEqual(incomingHash, knownHash);
}

export function signAuthToken(user: Pick<StoredUser, "id" | "username" | "email">, options: SessionOptions = {}) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      email: user.email,
      authSource: options.authSource ?? "local",
      adminRole: options.adminRole ?? null,
    },
    getJwtSecret(),
    {
      expiresIn: JWT_EXPIRES_IN,
    },
  );
}

export function verifyAuthToken(token: string) {
  const payload = jwt.verify(token, getJwtSecret());
  if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
    throw unauthorized("Invalid auth token.");
  }

  const authSource = payload.authSource === "pandora" ? "pandora" : "local";
  const adminRole = payload.adminRole === "master" || payload.adminRole === "admin" ? payload.adminRole : null;

  return {
    userId: payload.sub,
    authSource,
    adminRole,
  } satisfies VerifiedAuthToken;
}

export function toAuthUser(user: StoredUser, options: SessionOptions = {}): AuthUser {
  const isAdmin = options.adminOverride ?? isAdminUser(user);
  const authSource = isAdmin ? options.authSource ?? "local" : undefined;
  const adminRole = isAdmin ? options.adminRole ?? "admin" : null;

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    points: user.points,
    lang: user.lang,
    isAdmin,
    authSource,
    adminRole,
    createdAt: user.createdAt,
    lastLogin: user.lastLogin ?? null,
  };
}

export async function getMePayload(userId: string, options: SessionOptions = {}): Promise<MeResponse> {
  const user = await findUserById(userId);
  if (!user) {
    throw notFound("User not found.");
  }

  return {
    user: toAuthUser(user, options),
    stats: await getUserStats(userId),
  };
}

export async function signupUser(input: {
  username: string;
  email: string;
  password: string;
  lang?: StoredUser["lang"];
}) {
  const existingEmail = await findUserByEmail(input.email);
  if (existingEmail) {
    throw conflict("Email is already in use.");
  }

  const existingUsername = await findUserByUsername(input.username);
  if (existingUsername) {
    throw conflict("Username is already in use.");
  }

  const user: StoredUser = {
    id: randomUUID(),
    username: input.username,
    email: input.email.toLowerCase(),
    passwordHash: hashPassword(input.password),
    points: POINT_RULES.signup,
    lang: input.lang ?? "ko",
    createdAt: new Date().toISOString(),
    lastLogin: null,
    referrerId: null,
  };

  const pointLog: PointLogRecord = {
    id: randomUUID(),
    userId: user.id,
    delta: POINT_RULES.signup,
    reason: "signup",
    refId: null,
    createdAt: new Date().toISOString(),
  };

  await insertUserWithPointLog(user, pointLog);

  return createAuthResponse(user);
}

export async function loginUser(input: { identifier: string; password: string }) {
  const normalizedIdentifier = input.identifier.trim();
  const user = normalizedIdentifier.includes("@")
    ? await findUserByEmail(normalizedIdentifier)
    : (await findUserByUsername(normalizedIdentifier)) ?? (await findUserByEmail(normalizedIdentifier));

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw unauthorized("Email or password is incorrect.");
  }

  return createAuthResponse(user);
}

export async function createAuthResponse(user: StoredUser, options: SessionOptions = {}): Promise<AuthResponse> {
  return {
    token: signAuthToken(user, options),
    user: toAuthUser(user, options),
    stats: await getUserStats(user.id),
  };
}

export function verifyExternalAdminToken(token: string) {
  const secret = getExternalAdminSsoSecret();
  if (!secret) {
    throw unauthorized("External admin SSO is not configured.");
  }

  const payload = jwt.verify(token, secret, {
    issuer: getExternalAdminSsoIssuer(),
    audience: getExternalAdminSsoAudience(),
  });

  if (!payload || typeof payload !== "object" || typeof payload.sub !== "string") {
    throw unauthorized("Invalid external admin token.");
  }

  const role = payload.role === "master" || payload.role === "admin" ? payload.role : null;
  if (!role) {
    throw unauthorized("External admin token does not include a valid admin role.");
  }

  if (payload.target && payload.target !== "polywatch") {
    throw unauthorized("External admin token target is invalid.");
  }

  const username = typeof payload.username === "string" && payload.username.trim()
    ? payload.username.trim()
    : payload.sub;
  const email = typeof payload.email === "string" && payload.email.trim()
    ? payload.email.trim().toLowerCase()
    : getShadowAdminIdentity("pandora", payload.sub).email;

  return {
    provider: "pandora" as const,
    externalId: payload.sub,
    username,
    email,
    role,
  };
}

export async function exchangeExternalAdminToken(token: string) {
  const external = verifyExternalAdminToken(token);
  const shadowIdentity = getShadowAdminIdentity(external.provider, external.externalId);

  const existing =
    (await findUserByEmail(external.email)) ??
    (await findUserByUsername(shadowIdentity.username));

  if (existing) {
    return createAuthResponse(existing, {
      adminOverride: true,
      authSource: external.provider,
      adminRole: external.role,
    });
  }

  const user: StoredUser = {
    id: randomUUID(),
    username: shadowIdentity.username,
    email: external.email,
    passwordHash: hashPassword(randomBytes(24).toString("hex")),
    points: 0,
    lang: "ko",
    createdAt: new Date().toISOString(),
    lastLogin: null,
    referrerId: null,
  };

  const pointLog: PointLogRecord = {
    id: randomUUID(),
    userId: user.id,
    delta: 0,
    reason: "external_admin_sync",
    refId: null,
    createdAt: new Date().toISOString(),
  };

  await insertUserWithPointLog(user, pointLog);

  return createAuthResponse(user, {
    adminOverride: true,
    authSource: external.provider,
    adminRole: external.role,
  });
}

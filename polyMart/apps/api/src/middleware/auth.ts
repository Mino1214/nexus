import type { NextFunction, Request, Response } from "express";
import { findUserById } from "../db/index.js";
import { forbidden, unauthorized } from "../lib/http.js";
import { isAdminUser, verifyAuthToken } from "../services/auth.js";

function extractBearerToken(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw unauthorized();
    }

    const authContext = verifyAuthToken(token);
    const user = await findUserById(authContext.userId);
    if (!user) {
      throw unauthorized("User session is no longer valid.");
    }

    req.authToken = token;
    req.authUser = user;
    req.authContext = authContext;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.authUser) {
      throw unauthorized();
    }

    if (req.authContext?.adminRole) {
      next();
      return;
    }

    if (!isAdminUser(req.authUser)) {
      throw forbidden("Admin access required.");
    }

    next();
  } catch (error) {
    next(error);
  }
}

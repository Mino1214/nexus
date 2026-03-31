import type { StoredUser } from "../db/index.js";

declare global {
  namespace Express {
    interface Request {
      authUser?: StoredUser;
      authToken?: string;
      requestId?: string;
      authContext?: {
        authSource: "local" | "pandora";
        adminRole: "admin" | "master" | null;
      };
    }
  }
}

export {};

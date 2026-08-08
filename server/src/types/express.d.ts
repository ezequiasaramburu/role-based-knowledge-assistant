import type { AuthTokenPayload } from "../auth/token";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

export {};

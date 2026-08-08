import jwt from "jsonwebtoken";
import { env } from "../env";

export interface AuthTokenPayload {
  userId: string;
  email: string;
  displayName: string;
  roleIds: string[];
  roleNames: string[];
}

const TOKEN_TTL = "8h";

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

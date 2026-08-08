import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { signAuthToken, verifyAuthToken } from "./token";
import { env } from "../env";

describe("signAuthToken / verifyAuthToken", () => {
  const payload = {
    userId: "11111111-1111-1111-1111-111111111111",
    email: "test@example.com",
    displayName: "Test User",
    roleIds: ["22222222-2222-2222-2222-222222222222"],
    roleNames: ["finance"],
  };

  it("round-trips a valid token", () => {
    const token = signAuthToken(payload);
    const decoded = verifyAuthToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.roleIds).toEqual(payload.roleIds);
    expect(decoded.roleNames).toEqual(payload.roleNames);
  });

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign(payload, "attacker-guessed-secret", { expiresIn: "8h" });
    expect(() => verifyAuthToken(forged)).toThrow();
  });

  it("rejects a tampered payload even with a valid-looking signature", () => {
    const token = signAuthToken(payload);
    const [header, body, signature] = token.split(".");
    const tamperedPayload = { ...payload, roleIds: ["33333333-3333-3333-3333-333333333333"] };
    const tamperedBody = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
    const tampered = `${header}.${tamperedBody}.${signature}`;
    expect(() => verifyAuthToken(tampered)).toThrow();
  });

  it("rejects an expired token", () => {
    const expired = jwt.sign(payload, env.jwtSecret, { expiresIn: -10 });
    expect(() => verifyAuthToken(expired)).toThrow();
  });
});

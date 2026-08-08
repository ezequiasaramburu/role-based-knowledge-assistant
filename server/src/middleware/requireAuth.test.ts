import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAuth } from "./requireAuth";
import { signAuthToken } from "../auth/token";

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

const validPayload = {
  userId: "11111111-1111-1111-1111-111111111111",
  email: "test@example.com",
  displayName: "Test User",
  roleIds: [],
  roleNames: [],
};

describe("requireAuth", () => {
  it("attaches req.user and calls next() for a valid token", () => {
    const token = signAuthToken(validPayload);
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.userId).toBe(validPayload.userId);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects with 401 when no Authorization header is present", () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects with 401 for a malformed Authorization header (no Bearer prefix)", () => {
    const token = signAuthToken(validPayload);
    const req = { headers: { authorization: token } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects with 401 for an invalid/garbage token", () => {
    const req = { headers: { authorization: "Bearer garbage" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

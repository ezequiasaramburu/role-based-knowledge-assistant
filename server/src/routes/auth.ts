import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/pool";
import { signAuthToken } from "../auth/token";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/asyncHandler";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email or password format" });
  }
  const { email, password } = parsed.data;

  const userResult = await pool.query<{
    id: string;
    email: string;
    password_hash: string;
    display_name: string;
  }>("SELECT id, email, password_hash, display_name FROM users WHERE email = $1", [email]);

  const user = userResult.rows[0];
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const roleResult = await pool.query<{ id: string; name: string }>(
    `SELECT r.id, r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [user.id]
  );

  const token = signAuthToken({
    userId: user.id,
    email: user.email,
    displayName: user.display_name,
    roleIds: roleResult.rows.map((r) => r.id),
    roleNames: roleResult.rows.map((r) => r.name),
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      roles: roleResult.rows.map((r) => r.name),
    },
  });
}));

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.user!.userId,
    email: req.user!.email,
    displayName: req.user!.displayName,
    roles: req.user!.roleNames,
  });
});

import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/asyncHandler";
import { synthesizeAnswer, type RetrievedDocument } from "../llm/openrouter";

export const chatRouter = Router();

chatRouter.use(requireAuth);

type DocumentSummary = Pick<RetrievedDocument, "id" | "title" | "department">;

const NO_AUTHORIZED_INFO_ANSWER = "I don't have authorized information to answer that question.";

export function buildSearchQuery(rawQuery: string): string {
  const words = rawQuery.match(/[a-zA-Z0-9]+/g) ?? [];
  return words.join(" | ");
}

/**
 * Below this, a match is just incidental word overlap (e.g. an unrelated question
 * happening to share a common word with the public Employee Handbook), not a real
 * answer to the question.
 */
const MIN_RELEVANCE_SCORE = 0.03;

/**
 * The security model for this whole app lives in this one query: permission
 * filtering happens in the WHERE clause, before ranking, before the LLM ever
 * sees anything. `roleIds` must always come from the verified JWT (req.user),
 * never from request body/query params.
 */
export async function findPermittedDocuments(roleIds: string[], query: string): Promise<RetrievedDocument[]> {
  const searchQuery = buildSearchQuery(query);
  const result = await pool.query<RetrievedDocument>(
    `SELECT d.id, d.title, d.department, d.body
     FROM documents d
     WHERE (d.visibility = 'public'
        OR d.id IN (
          SELECT document_id FROM document_permissions
          WHERE role_id = ANY($1::uuid[])
        ))
       AND d.search_vector @@ to_tsquery('english', $2)
       AND ts_rank(d.search_vector, to_tsquery('english', $2)) > $3
     ORDER BY ts_rank(d.search_vector, to_tsquery('english', $2)) DESC
     LIMIT 5`,
    [roleIds, searchQuery, MIN_RELEVANCE_SCORE]
  );
  return result.rows;
}

async function insertMessage(sessionId: string, role: "user" | "assistant", content: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3) RETURNING id",
    [sessionId, role, content]
  );
  return result.rows[0].id;
}

async function recordAuditLog(userId: string, queryText: string, documentIds: string[]): Promise<void> {
  await pool.query(
    "INSERT INTO audit_log (user_id, query_text, documents_considered, documents_used) VALUES ($1, $2, $3, $4)",
    [userId, queryText, documentIds, documentIds]
  );
}

// IDOR guard: every /sessions/:id route requires the session to belong to the authenticated user.
const requireSessionOwnership = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const result = await pool.query(
    "SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user!.userId]
  );
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: "Session not found" });
  }
  next();
});

chatRouter.post(
  "/sessions",
  asyncHandler(async (req, res) => {
    const result = await pool.query<{ id: string }>(
      "INSERT INTO chat_sessions (user_id) VALUES ($1) RETURNING id",
      [req.user!.userId]
    );
    res.status(201).json({ id: result.rows[0].id });
  })
);

const messageSchema = z.object({ message: z.string().min(1) });

chatRouter.post("/sessions/:id/messages", requireSessionOwnership, asyncHandler(async (req, res) => {
  const sessionId = req.params.id;

  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "message is required" });
  }
  const { message } = parsed.data;

  await insertMessage(sessionId, "user", message);

  // Role IDs come only from the verified JWT, never from the request.
  const candidates = await findPermittedDocuments(req.user!.roleIds, message);

  if (candidates.length === 0) {
    await insertMessage(sessionId, "assistant", NO_AUTHORIZED_INFO_ANSWER);
    await recordAuditLog(req.user!.userId, message, []);
    return res.json({ answer: NO_AUTHORIZED_INFO_ANSWER, sources: [] });
  }

  let answer: string;
  try {
    answer = await synthesizeAnswer(message, candidates);
  } catch (err) {
    console.error("LLM synthesis failed:", err);
    return res.status(502).json({ error: "Failed to generate an answer from the language model" });
  }

  const assistantMessageId = await insertMessage(sessionId, "assistant", answer);

  for (const doc of candidates) {
    await pool.query(
      "INSERT INTO message_sources (message_id, document_id) VALUES ($1, $2)",
      [assistantMessageId, doc.id]
    );
  }

  await recordAuditLog(req.user!.userId, message, candidates.map((d) => d.id));

  const sources: DocumentSummary[] = candidates.map((d) => ({ id: d.id, title: d.title, department: d.department }));
  res.json({ answer, sources });
}));

chatRouter.get("/sessions/:id/messages", requireSessionOwnership, asyncHandler(async (req, res) => {
  const sessionId = req.params.id;

  const messagesResult = await pool.query<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>(
    "SELECT id, role, content, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );

  const messageIds = messagesResult.rows.map((m) => m.id);
  const sourcesResult = await pool.query<DocumentSummary & { message_id: string }>(
    `SELECT ms.message_id, d.id, d.title, d.department
     FROM message_sources ms
     JOIN documents d ON d.id = ms.document_id
     WHERE ms.message_id = ANY($1::uuid[])`,
    [messageIds]
  );

  const sourcesByMessage = new Map<string, DocumentSummary[]>();
  for (const row of sourcesResult.rows) {
    const list = sourcesByMessage.get(row.message_id) ?? [];
    list.push({ id: row.id, title: row.title, department: row.department });
    sourcesByMessage.set(row.message_id, list);
  }

  res.json(
    messagesResult.rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
      sources: sourcesByMessage.get(m.id) ?? [],
    }))
  );
}));

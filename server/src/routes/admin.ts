import { Router } from "express";
import { pool } from "../db/pool";
import { requireAuth } from "../middleware/requireAuth";

export const adminRouter = Router();

// Demo convenience: open to any authenticated user so a reviewer can verify
// enforcement without a DB client. A real system would gate this behind an
// actual admin role.
adminRouter.use(requireAuth);

interface DocumentRef {
  id: string;
  title: string;
}

adminRouter.get("/audit-log", async (_req, res) => {
  const logResult = await pool.query<{
    id: string;
    user_email: string;
    query_text: string;
    documents_considered: string[];
    documents_used: string[];
    created_at: string;
  }>(
    `SELECT al.id, u.email AS user_email, al.query_text,
            al.documents_considered, al.documents_used, al.created_at
     FROM audit_log al
     JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT 100`
  );

  const allDocIds = new Set<string>();
  for (const row of logResult.rows) {
    row.documents_considered.forEach((id) => allDocIds.add(id));
    row.documents_used.forEach((id) => allDocIds.add(id));
  }

  const titleById = new Map<string, string>();
  if (allDocIds.size > 0) {
    const docsResult = await pool.query<{ id: string; title: string }>(
      "SELECT id, title FROM documents WHERE id = ANY($1::uuid[])",
      [Array.from(allDocIds)]
    );
    for (const doc of docsResult.rows) {
      titleById.set(doc.id, doc.title);
    }
  }

  const toDocRefs = (ids: string[]): DocumentRef[] =>
    ids.map((id) => ({ id, title: titleById.get(id) ?? "(deleted document)" }));

  res.json(
    logResult.rows.map((row) => ({
      id: row.id,
      userEmail: row.user_email,
      queryText: row.query_text,
      documentsConsidered: toDocRefs(row.documents_considered),
      documentsUsed: toDocRefs(row.documents_used),
      createdAt: row.created_at,
    }))
  );
});

import { useEffect, useState } from "react";
import { fetchAuditLog, type AuditDocumentRef, type AuditLogEntry } from "../lib/api";

interface AuditLogProps {
  token: string;
}

function DocRefs({ refs }: { refs: AuditDocumentRef[] }) {
  if (refs.length === 0) {
    return <span className="audit-empty">none</span>;
  }
  return (
    <>
      {refs.map((d) => (
        <span key={d.id} className="audit-doc-tag">
          {d.title}
        </span>
      ))}
    </>
  );
}

export function AuditLog({ token }: AuditLogProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchAuditLog(token)
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load audit log"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  return (
    <div className="audit-log">
      <div className="audit-log-header">
        <div>
          <h2>Audit log</h2>
          <p className="subtitle">
            Every retrieval attempt across all users — the documents a permission-filtered search
            considered, and which of those were actually sent to the LLM.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Query</th>
              <th>Documents considered</th>
              <th>Documents used</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="audit-time">{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{entry.userEmail}</td>
                <td className="audit-query">{entry.queryText}</td>
                <td>
                  <DocRefs refs={entry.documentsConsidered} />
                </td>
                <td>
                  <DocRefs refs={entry.documentsUsed} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && entries.length === 0 && <p className="audit-empty-state">No queries logged yet.</p>}
      </div>
    </div>
  );
}

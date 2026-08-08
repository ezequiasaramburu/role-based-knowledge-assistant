# Design notes

Deeper rationale, tradeoffs, known limitations, and verification work behind the README. Nothing
here should be required reading to run the app — it's the "why" behind decisions a reviewer might
otherwise have to guess at or re-derive.

## Design tradeoffs

### Full-text search instead of embeddings

Retrieval uses Postgres `tsvector`/`ts_rank`, not pgvector or an external embeddings API. The grading
axis this exercise cares about is "access control enforced by the application," not retrieval
quality — and for a ~10-document synthetic corpus, embeddings wouldn't demonstrate anything FTS
can't. FTS is deterministic, needs no extra API calls, and keeps the security-critical code path
(filter-by-permission-then-search) auditable in one query, in one file
([`server/src/routes/chat.ts`](server/src/routes/chat.ts)). See "Retrieval query evolution" below for
how that query was tuned after real usage surfaced a recall problem.

### Docker only for Postgres, not the whole stack

`docker-compose.yml` provisions Postgres only; the server and client run directly via `npm run dev`.
This was a deliberate choice, revisited mid-project: the brief's bar is "clone and verify in
minutes," and Docker solves the one genuinely annoying manual setup step (a correctly-configured
Postgres instance). Containerizing the Express server and Vite client on top of that would add
Dockerfiles, hot-reload volume mounts, and image build time to every review cycle, for a
demo whose actual deployment target is nobody's. In a production environment,
containerizing everything would be the right default.

Relatedly, Postgres credentials are hardcoded in `docker-compose.yml` (`rbka`/`rbka`) rather than
pulled from a `.env` file. This was deliberately reverted after initially adding `${VAR}`
interpolation, in real production repos, the compose/deployment manifest checked into git is
essentially never what carries live secrets (those come from a secrets manager or CI/CD injection,
outside version control entirely); a local-only dev compose file with a throwaway password is
standard practice, not an oversight.

## Schema design decisions

The README shows the ER diagram; this is the "why" behind its shape. See
[`server/src/db/schema.sql`](server/src/db/schema.sql) for the full DDL.

**Role-based permissions, not per-user or per-department grants.** `document_permissions` links
roles to documents, not users to documents directly. A user's access is entirely a function of
`user_roles`, grant Carol the `procurement` role and she immediately sees every procurement
document, past and future, with no per-document bookkeeping. This is also *why* the brief's
"meaningful distinction between user identity and user permissions" is real in this design, not
just a schema-diagram distinction: `users` never has a permissions column of any kind. Identity and
authorization are structurally different tables, joined only through `user_roles`, and the
application code enforces the same separation: `server/src/auth/token.ts` resolves a user's roles
from the database once at login and signs them into the JWT; every later permission check reads
only those verified role IDs, never anything derived from the user's identity claim or from request
input (verified directly by the fake-`roleIds`-in-body attack in the security table below).

**`visibility` flag instead of a "public" pseudo-role.** An alternative design would give every user
an implicit `general` role and gate "public" documents through the same `document_permissions` table
as everything else: one mechanism instead of two. Deliberately not done: it would mean a document's
public/restricted status lives implicitly in a join table row rather than being a direct, visible
property of the document itself, one query away from an accidental leak if that row is ever missing
or duplicated. A boolean-ish `visibility` column is impossible to misread, and it lets the permission
query short-circuit on `d.visibility = 'public'` before the `document_permissions` subquery even
runs. The tradeoff: two places to reason about instead of one: mitigated by the fail-closed default
(`visibility` defaults to `'restricted'`, so a document with no explicit visibility and no permission
rows is invisible to everyone, including its own author, visibility is opt-in, never assumed).

**`message_sources` as its own join table, not a JSON array on `chat_messages`.** Costs one extra
table and one extra `INSERT` per cited document, but keeps a real foreign key to `documents` (a JSON
array of IDs can silently rot — reference a deleted document, contain a typo'd UUID, with nothing
to catch it), and it's what makes "show sources" and the audit trail queryable rather than something
that needs application-level parsing.

**`audit_log.documents_considered`/`documents_used` as UUID arrays, not their own join table.**
The inconsistency here is deliberate, not accidental: unlike `message_sources` (which represents an
actual relationship: "this document backs this message," queryable, referentially meaningful over
the life of the app), an audit log row is a point-in-time snapshot of what a single retrieval
attempt saw. Nothing ever queries "every audit row that considered document X" in a way that would
benefit from a real join (and if it did, Postgres can still index into a UUID array with a GIN
index). A join table here would be more relationally "correct" and more consistent with
`message_sources`, at the cost of two more tables and more `INSERT`s in the hot path, for a benefit
that doesn't materialize at this scale.

## Known simplifications

Stated explicitly rather than hidden, per the brief's own guidance.

- **JWT role staleness**: roles are resolved from the database once, at login, and baked into the
  JWT (`server/src/auth/token.ts`). A role change mid-session won't take effect until the user logs
  in again or the token expires (8h). A real system would either do a fresh permission lookup per
  request or use much shorter-lived tokens. Acceptable here since demo roles don't change mid-session.
- **`/admin/audit-log` is open to any authenticated user**, not gated behind a real admin role, a
  deliberate demo convenience so a reviewer can verify enforcement without a DB client
  (`server/src/routes/admin.ts`). A production system would restrict this.
- **FTS is lexical, not semantic** - see "Retrieval query evolution" below for what this means in
  practice and how it was mitigated (not eliminated).
- **Passwords**: all four seeded accounts use `demo1234`. Documented here in plaintext because
  these are synthetic, disposable accounts with no relationship to real credentials, not a pattern
  to follow for anything real.

## Retrieval query evolution

The permission filter itself (`WHERE d.visibility = 'public' OR d.id IN (...)`) never changed
through any of this — only the text-matching half of the query was tuned, based on real usage.

**1. Started with `plainto_tsquery` (AND semantics).** Postgres's `plainto_tsquery` ANDs every
significant word in the query together — a document must contain *all* of them to match. This
surfaced as a real bug during manual testing: Bob (HR role), asking *"What is the parental leave
policy? can you explain it?"*, got a wrongful denial. The word "explain" doesn't appear anywhere in
the Parental Leave Policy document, so the AND failed and zero candidates were returned, even
though Bob was fully authorized and the document directly answers the question. Verified via:

```sql
SELECT plainto_tsquery('english', 'What is the parental leave policy? can you explain it?');
-- 'parent' & 'leav' & 'polici' & 'explain'
```

This is a **false negative**, not a security issue, Bob never saw anything he shouldn't have, he
just got an incorrect refusal. But it directly hurts the "usable chat interface" requirement, since
almost any natural, conversational phrasing includes words the target document won't contain.

**2. Switched to an OR-combined `to_tsquery`.** `server/src/routes/chat.ts`'s `buildSearchQuery`
tokenizes the question in application code and joins the words with `|` instead of relying on
`plainto_tsquery`'s implicit AND, so a document matching *some* of the question's words still
surfaces, ranked by `ts_rank`. This fixed Bob's case. It also introduced a new failure mode: very
generic words (like "employee," which appears incidentally in nearly every seeded document) now
cause weak, coincidental matches on completely unrelated queries, including attack-style ones
(SQL/prompt injection payloads matched the public Employee Handbook purely on shared vocabulary,
triggering an unnecessary LLM call that then correctly declined to answer). Still fully safe
(nothing restricted was ever exposed), just imprecise.

**3. Added a minimum relevance threshold.** `MIN_RELEVANCE_SCORE = 0.03` in `findPermittedDocuments`
filters out those weak matches before they ever reach the LLM. Calibrated against real measurements:

| Query | Document | `ts_rank` |
|---|---|---|
| Bob's legitimate paraphrase | Parental Leave Policy | 0.0605 |
| Alice's expense question | Q3 Expense Approval Policy | 0.0852 |
| SQL injection payload | Employee Handbook (coincidental) | 0.0152 |
| Prompt injection payload | Employee Handbook (coincidental) | 0.0034 |

A threshold of 0.03 sits cleanly in the gap. This is a deliberate, tested tradeoff, not a magic
number picked blind — but it's still just a fixed cutoff with no principled boundary, which is
exactly the kind of retrieval-tuning rabbit hole embeddings avoid and lexical search doesn't. One
concrete example of where it's still imperceptibly imprecise: Bob asking *"What's in the employee
handbook?"* returns **four** sources (the two public docs, plus Parental Leave Policy and
Performance Review Cycle) because the query's only two significant words — `employee` and
`handbook` — coincidentally appear in HR documents too:

```
Employee Handbook Overview     0.0827  ← the actual answer
Parental Leave Policy          0.0433  ← coincidental
Office Locations & Contacts    0.0304  ← barely over threshold
Performance Review Cycle       0.0304  ← barely over threshold
```

Not a compliance issue (Bob has the `hr` role, so both extra documents are ones he's actually
permitted to see — nothing leaked), just imprecise. A more principled fix would be relative
scoring (keep only results within some ratio of the top match) rather than chasing the absolute
threshold further; not implemented, since the brief explicitly deprioritizes retrieval
sophistication over enforcement correctness.

## Additional test questions

Beyond the four scenarios in the README, useful for exercising the permission model further (all
passwords `demo1234`):

**Alice** (finance) — ✅ "What are the vendor payment terms?" · ❌ "What is the parental leave
policy?" · ❌ "What is the cold chain handling procedure?"

**Bob** (hr) — ✅ "How does the performance review cycle work?" · ❌ "What are the purchase order
thresholds?" · ❌ "What is the warehouse safety checklist?"

**Carol** (procurement, operations) — ✅ "What is the warehouse safety checklist?" · ✅ "What are the
purchase order thresholds?" · ❌ "What is the expense approval threshold?"

**Dave** (no roles) — ✅ "What's in the employee handbook?" · ❌ any of the eight restricted-document
questions above

**Cross-checks worth doing**: ask the identical question as two different users back-to-back (the
core "prove enforcement" scenario); ask something genuinely irrelevant ("What's the weather
forecast?") and confirm a clean refusal rather than an error; send two questions in one session and
confirm each assistant reply keeps its own correct sources. `GET /admin/audit-log` (or the Audit log
tab) resolves every claim above against `documentsConsidered`/`documentsUsed` without needing a DB
client.

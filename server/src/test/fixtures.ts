import { randomUUID } from "crypto";
import { pool } from "../db/pool";

export interface TestFixtures {
  roleAlphaId: string;
  roleBetaId: string;
  publicDocId: string;
  publicDocTitle: string;
  /** visibility='restricted', gated to roleAlpha via document_permissions. */
  restrictedDocId: string;
  restrictedDocTitle: string;
  /** visibility='restricted' with ZERO document_permissions rows — fail-closed case: nobody can see it. */
  orphanDocId: string;
  /** A word unique to this fixture set's docs, safe to search for without matching real seed data. */
  sharedToken: string;
  cleanup: () => Promise<void>;
}

// Every fixture set uses a random suffix so parallel test files never collide with
// each other or with the real demo seed data created by `npm run seed`.
export async function createTestFixtures(): Promise<TestFixtures> {
  const suffix = randomUUID().slice(0, 8);
  const sharedToken = `zzfixtureword${suffix}`;

  const roleAlpha = await pool.query<{ id: string }>("INSERT INTO roles (name) VALUES ($1) RETURNING id", [
    `test_role_alpha_${suffix}`,
  ]);
  const roleBeta = await pool.query<{ id: string }>("INSERT INTO roles (name) VALUES ($1) RETURNING id", [
    `test_role_beta_${suffix}`,
  ]);
  const roleAlphaId = roleAlpha.rows[0].id;
  const roleBetaId = roleBeta.rows[0].id;

  const publicDocTitle = `Public Fixture Doc ${suffix}`;
  const publicDoc = await pool.query<{ id: string }>(
    "INSERT INTO documents (title, body, department, visibility) VALUES ($1, $2, 'general', 'public') RETURNING id",
    [publicDocTitle, `This public document mentions ${sharedToken} for search matching.`]
  );

  const restrictedDocTitle = `Restricted Fixture Doc ${suffix}`;
  const restrictedDoc = await pool.query<{ id: string }>(
    "INSERT INTO documents (title, body, department, visibility) VALUES ($1, $2, 'test', 'restricted') RETURNING id",
    [restrictedDocTitle, `This restricted document mentions ${sharedToken} for search matching.`]
  );
  await pool.query("INSERT INTO document_permissions (document_id, role_id) VALUES ($1, $2)", [
    restrictedDoc.rows[0].id,
    roleAlphaId,
  ]);

  const orphanDoc = await pool.query<{ id: string }>(
    "INSERT INTO documents (title, body, department, visibility) VALUES ($1, $2, 'test', 'restricted') RETURNING id",
    [`Orphan Fixture Doc ${suffix}`, `This orphan document mentions ${sharedToken} for search matching.`]
  );
  // Deliberately no document_permissions row for orphanDoc — proves the fail-closed invariant.

  const docIds = [publicDoc.rows[0].id, restrictedDoc.rows[0].id, orphanDoc.rows[0].id];
  const roleIds = [roleAlphaId, roleBetaId];

  return {
    roleAlphaId,
    roleBetaId,
    publicDocId: publicDoc.rows[0].id,
    publicDocTitle,
    restrictedDocId: restrictedDoc.rows[0].id,
    restrictedDocTitle,
    orphanDocId: orphanDoc.rows[0].id,
    sharedToken,
    cleanup: async () => {
      await pool.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [docIds]);
      await pool.query("DELETE FROM roles WHERE id = ANY($1::uuid[])", [roleIds]);
    },
  };
}

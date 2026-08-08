import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSearchQuery, findPermittedDocuments } from "./chat";
import { pool } from "../db/pool";
import { createTestFixtures, type TestFixtures } from "../test/fixtures";

describe("buildSearchQuery", () => {
  it("joins words with OR so a match doesn't require every word to be present", () => {
    expect(buildSearchQuery("What is the parental leave policy?")).toBe("What | is | the | parental | leave | policy");
  });

  it("strips punctuation and non-word characters", () => {
    expect(buildSearchQuery("expense'; DROP TABLE documents; --")).toBe("expense | DROP | TABLE | documents");
  });

  it("returns an empty string for input with no word characters", () => {
    expect(buildSearchQuery("???")).toBe("");
  });
});

describe("findPermittedDocuments (permission filter — the security-critical hot path)", () => {
  let fx: TestFixtures;

  beforeAll(async () => {
    fx = await createTestFixtures();
  });

  afterAll(async () => {
    await fx.cleanup();
    await pool.end();
  });

  it("returns the public document to a user with no roles at all", async () => {
    const results = await findPermittedDocuments([], fx.sharedToken);
    const titles = results.map((d) => d.title);
    expect(titles).toContain(fx.publicDocTitle);
    expect(titles).not.toContain(fx.restrictedDocTitle);
  });

  it("returns both public and restricted documents to a user with the permitted role", async () => {
    const results = await findPermittedDocuments([fx.roleAlphaId], fx.sharedToken);
    const titles = results.map((d) => d.title);
    expect(titles).toContain(fx.publicDocTitle);
    expect(titles).toContain(fx.restrictedDocTitle);
  });

  it("does NOT return the restricted document to a user with a different, unrelated role", async () => {
    const results = await findPermittedDocuments([fx.roleBetaId], fx.sharedToken);
    const titles = results.map((d) => d.title);
    expect(titles).toContain(fx.publicDocTitle);
    expect(titles).not.toContain(fx.restrictedDocTitle);
  });

  it("fail-closed: a restricted document with zero permission rows is invisible to every role, including a role that can see other restricted docs", async () => {
    const asAlpha = await findPermittedDocuments([fx.roleAlphaId], fx.sharedToken);
    const asBeta = await findPermittedDocuments([fx.roleBetaId], fx.sharedToken);
    const asNoRoles = await findPermittedDocuments([], fx.sharedToken);

    for (const results of [asAlpha, asBeta, asNoRoles]) {
      expect(results.map((d) => d.id)).not.toContain(fx.orphanDocId);
    }
  });

  it("returns nothing for a query with no relevant vocabulary overlap, even for an authorized role", async () => {
    const results = await findPermittedDocuments([fx.roleAlphaId], "completely unrelated gibberish xyzzyplugh");
    expect(results).toEqual([]);
  });
});

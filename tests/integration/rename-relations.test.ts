/**
 * Integration tests: rename collection/field — relation-aware
 *
 * Tests O2M, M2M, M2A relation updates.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, waitForDirectus, unique } from "./helpers/api";
import { seedAll, cleanupAll, type SeedResult } from "./helpers/seed";
import { renameCollection, renameField } from "./helpers/rename";

let s: SeedResult;

beforeAll(async () => {
  await waitForDirectus();
  s = await seedAll(unique);
}, 60_000);

afterAll(async () => {
  await cleanupAll(s);
}, 60_000);

// ─────────────────────────────────────────────
// Rename collection — M2M sides updated
// ─────────────────────────────────────────────

describe("rename collection — M2M both sides updated", () => {
  beforeAll(async () => {
    await renameCollection(s.collection, s.targetCollection);
  }, 30_000);

  it("junction related_collection updated to target", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const rel = res.data.data.find(
      (r) => r["collection"] === s.junctionCollection && r["related_collection"] === s.targetCollection
    );
    expect(rel).toBeDefined();
  });

  it("no user relations still reference source collection", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const userRels = res.data.data.filter(
      (r) => !(r["collection"] as string).startsWith("directus_") &&
             !(r["related_collection"] as string || "").startsWith("directus_")
    );
    const stillRef = userRels.filter(
      (r) => r["collection"] === s.collection || r["related_collection"] === s.collection
    );
    expect(stillRef).toHaveLength(0);
  });

  it("M2O author field still points to directus_users", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const rel = res.data.data.find(
      (r) => r["collection"] === s.targetCollection && r["field"] === s.authorField
    );
    expect(rel).toBeDefined();
    expect(rel!["related_collection"]).toBe("directus_users");
  });
});

// ─────────────────────────────────────────────
// Rename field — FK field in junction updated
// ─────────────────────────────────────────────

describe("rename field — M2M FK field in junction", () => {
  const NEW_FK = unique("posts_id");

  beforeAll(async () => {
    // Rename the FK field in the junction table
    await renameField(s.junctionCollection, [
      { sourceField: `${s.collection}_id`, targetField: NEW_FK },
    ]);
  }, 30_000);

  it("junction field renamed in directus_fields", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(`/fields/${s.junctionCollection}`);
    const fields = res.data.data.map((f) => f.field);
    expect(fields).toContain(NEW_FK);
    expect(fields).not.toContain(`${s.collection}_id`);
  });

  it("relation many_field updated in directus_relations", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const rel = res.data.data.find(
      (r) => r["collection"] === s.junctionCollection && r["field"] === NEW_FK
    );
    expect(rel).toBeDefined();
  });

  it("junction_field on sibling relation updated", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const rel = res.data.data.find(
      (r) => r["collection"] === s.junctionCollection && r["field"] === `${s.tagsCollection}_id`
    );
    expect(rel).toBeDefined();
    const meta = rel!["meta"] as Record<string, unknown>;
    expect(meta["junction_field"]).toBe(NEW_FK);
    expect(meta["junction_field"]).not.toBe(`${s.collection}_id`);
  });
});

// ─────────────────────────────────────────────
// Rename collection — M2A one_allowed_collections
// ─────────────────────────────────────────────

describe("rename collection — M2A one_allowed_collections updated", () => {
  const IMAGE_TARGET = unique("image_sections");

  beforeAll(async () => {
    await renameCollection(s.imageBlocksCollection, IMAGE_TARGET);
  }, 30_000);

  it("old image_blocks collection no longer exists", async () => {
    const res = await api.get(`/collections/${s.imageBlocksCollection}`);
    expect(res.status).not.toBe(200);
  });

  it("new image_sections collection exists", async () => {
    const res = await api.get(`/collections/${IMAGE_TARGET}`);
    expect(res.status).toBe(200);
  });

  it("M2A one_allowed_collections updated", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const m2a = res.data.data.find(
      (r) => r["collection"] === s.m2aJunctionCollection && r["field"] === "item"
    );
    expect(m2a).toBeDefined();
    const meta = m2a!["meta"] as Record<string, unknown>;
    const allowed = meta["one_allowed_collections"] as string[];
    expect(allowed).toContain(IMAGE_TARGET);
    expect(allowed).not.toContain(s.imageBlocksCollection);
    expect(allowed).toContain(s.textBlocksCollection);
  });
});

// ─────────────────────────────────────────────
// Guard rails
// ─────────────────────────────────────────────

describe("rename — guard rails", () => {
  it("rejects system collection rename", async () => {
    await expect(renameCollection("directus_users", "users")).rejects.toThrow();
  });

  it("rejects same source and target collection", async () => {
    await expect(renameCollection(s.tagsCollection, s.tagsCollection)).rejects.toThrow();
  });

  it("rejects system collection field rename", async () => {
    await expect(
      renameField("directus_users", [{ sourceField: "email", targetField: "email_address" }])
    ).rejects.toThrow();
  });
});

/**
 * Integration tests: impact analysis
 *
 * Seeds all data with unique names → analyzes impact → asserts correct counts → cleans up.
 * Tests both collection and field rename impact analysis.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, waitForDirectus, unique } from "./helpers/api";
import { seedAll, cleanupAll, type SeedResult } from "./helpers/seed";

let s: SeedResult;

beforeAll(async () => {
  await waitForDirectus();
  s = await seedAll(unique);
}, 120_000);

afterAll(async () => {
  await cleanupAll(s);
}, 60_000);

// ─────────────────────────────────────────────
// Collection impact analysis
// ─────────────────────────────────────────────

describe("impact analysis — collection rename", () => {
  it("returns collection type impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    expect(res.status).toBe(200);
    expect(res.data.type).toBe("collection");
    expect(res.data.sourceName).toBe(s.collection);
    expect(res.data.targetName).toBe("new_posts");
    expect(res.data.summary.totalDependencies).toBeGreaterThan(0);
  });

  it("includes directus_collections impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const collTable = res.data.tables.find(
      (t: any) => t.table === "directus_collections",
    );
    expect(collTable).toBeDefined();
    expect(collTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes directus_fields impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const fieldsTable = res.data.tables.find(
      (t: any) => t.table === "directus_fields",
    );
    expect(fieldsTable).toBeDefined();
    expect(fieldsTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes directus_permissions impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const permTable = res.data.tables.find(
      (t: any) => t.table === "directus_permissions",
    );
    expect(permTable).toBeDefined();
    expect(permTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes directus_presets impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const presetTable = res.data.tables.find(
      (t: any) => t.table === "directus_presets",
    );
    expect(presetTable).toBeDefined();
    expect(presetTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes directus_flows impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const flowTable = res.data.tables.find(
      (t: any) => t.table === "directus_flows",
    );
    expect(flowTable).toBeDefined();
    expect(flowTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes directus_operations impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const opTable = res.data.tables.find(
      (t: any) => t.table === "directus_operations",
    );
    expect(opTable).toBeDefined();
    expect(opTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes directus_panels impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const panelTable = res.data.tables.find(
      (t: any) => t.table === "directus_panels",
    );
    expect(panelTable).toBeDefined();
    expect(panelTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes database table rename in impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const dbTable = res.data.tables.find(
      (t: any) => t.table === "database_table",
    );
    expect(dbTable).toBeDefined();
  });

  it("includes relations impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const relTable = res.data.tables.find(
      (t: any) => t.table === "directus_relations",
    );
    expect(relTable).toBeDefined();
    expect(relTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes shares impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const shareTable = res.data.tables.find(
      (t: any) => t.table === "directus_shares",
    );
    expect(shareTable).toBeDefined();
    expect(shareTable.affectedRows).toBeGreaterThan(0);
  });

  it("total changes is sum of all tables", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });
    const sum = res.data.tables.reduce(
      (acc: number, t: any) => acc + t.affectedRows,
      0,
    );
    expect(res.data.totalChanges).toBe(sum);
  });

  it("returns dependency details with categories and owners", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "collection",
      collection: s.collection,
      newName: "new_posts",
    });

    expect(res.data.dependencies.length).toBeGreaterThan(0);
    expect(res.data.summary.categories.length).toBeGreaterThan(0);
    expect(
      res.data.dependencies.some(
        (dependency: any) =>
          dependency.ownerLabel === s.collection &&
          dependency.category === "schema",
      ),
    ).toBe(true);
    expect(
      res.data.dependencies.some(
        (dependency: any) =>
          dependency.category === "relationship" ||
          dependency.category === "automation" ||
          dependency.category === "dashboard",
      ),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Field impact analysis
// ─────────────────────────────────────────────

describe("impact analysis — field rename", () => {
  it("returns field type impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });
    expect(res.status).toBe(200);
    expect(res.data.type).toBe("field");
    expect(res.data.sourceName).toBe(s.titleField);
    expect(res.data.targetName).toBe("post_title");
    expect(res.data.summary.totalDependencies).toBeGreaterThan(0);
  });

  it("includes directus_fields impact for field rename", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });
    const fieldsTable = res.data.tables.find(
      (t: any) => t.table === "directus_fields",
    );
    expect(fieldsTable).toBeDefined();
    expect(fieldsTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes collection meta impact (display_template)", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });
    const collTable = res.data.tables.find(
      (t: any) => t.table === "directus_collections",
    );
    expect(collTable).toBeDefined();
  });

  it("includes permissions impact for field in CSV", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });
    const permTable = res.data.tables.find(
      (t: any) => t.table === "directus_permissions",
    );
    // Permission has fields CSV with * so it may not include specific field
    expect(permTable).toBeDefined();
  });

  it("includes presets impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });
    const presetTable = res.data.tables.find(
      (t: any) => t.table === "directus_presets",
    );
    expect(presetTable).toBeDefined();
    expect(presetTable.affectedRows).toBeGreaterThan(0);
  });

  it("includes database column rename in impact", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });
    const dbTable = res.data.tables.find(
      (t: any) => t.table === "database_column",
    );
    expect(dbTable).toBeDefined();
  });

  it("describes where related fields are impacted", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.titleField,
      newName: "post_title",
    });

    expect(
      res.data.dependencies.some(
        (dependency: any) =>
          dependency.ownerLabel.includes(`${s.collection}.`) &&
          typeof dependency.summary === "string" &&
          dependency.summary.length > 0,
      ),
    ).toBe(true);
    expect(
      res.data.dependencies.some(
        (dependency: any) =>
          dependency.category === "filter" ||
          dependency.category === "permission" ||
          dependency.category === "display",
      ),
    ).toBe(true);
  });

  it("status field has impact (used in permissions, presets, flows)", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.statusField,
      newName: "post_status",
    });
    expect(res.data.totalChanges).toBeGreaterThan(0);
  });

  it("views field has impact (used in presets, panels)", async () => {
    const res = await api.post("/safe-rename/impact/analyze", {
      type: "field",
      collection: s.collection,
      field: s.viewsField,
      newName: "view_count",
    });
    expect(res.data.totalChanges).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Guard rails
// ─────────────────────────────────────────────

describe("impact analysis — guard rails", () => {
  it("rejects missing type", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        collection: s.collection,
        newName: "new_posts",
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid type", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        type: "invalid",
        collection: s.collection,
        newName: "new_posts",
      }),
    ).rejects.toThrow();
  });

  it("rejects missing collection", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        type: "collection",
        newName: "new_posts",
      }),
    ).rejects.toThrow();
  });

  it("rejects missing newName", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        type: "collection",
        collection: s.collection,
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid newName (db-unsafe)", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        type: "collection",
        collection: s.collection,
        newName: "invalid-name!",
      }),
    ).rejects.toThrow();
  });

  it("rejects field type without field parameter", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        type: "field",
        collection: s.collection,
        newName: "new_field",
      }),
    ).rejects.toThrow();
  });

  it("rejects same name", async () => {
    await expect(
      api.post("/safe-rename/impact/analyze", {
        type: "collection",
        collection: s.collection,
        newName: s.collection,
      }),
    ).rejects.toThrow();
  });
});

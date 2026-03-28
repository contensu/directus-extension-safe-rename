/**
 * Integration tests: rename field
 *
 * Seeds all data with unique names → renames fields → asserts → cleans up.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, waitForDirectus, unique } from "./helpers/api";
import { seedAll, cleanupAll, type SeedResult } from "./helpers/seed";
import { renameField } from "./helpers/rename";

let s: SeedResult;

// After rename: title → heading
const TARGET_TITLE = "heading";
// After rename: views → view_count
const TARGET_VIEWS = "view_count";
// After rename: slug → url_slug
const TARGET_SLUG = "url_slug";

beforeAll(async () => {
  await waitForDirectus();
  s = await seedAll(unique);
  // Single field rename
  await renameField(s.collection, [
    { sourceField: s.titleField, targetField: TARGET_TITLE },
  ]);
}, 120_000);

afterAll(async () => {
  await cleanupAll(s);
}, 60_000);

// ─────────────────────────────────────────────
// Basic field rename
// ─────────────────────────────────────────────

describe("rename field — basic", () => {
  it("new field exists", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.collection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    expect(fields).toContain(TARGET_TITLE);
  });

  it("old field gone", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.collection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    expect(fields).not.toContain(s.titleField);
  });
});

// ─────────────────────────────────────────────
// Physical column
// ─────────────────────────────────────────────

describe("rename field — physical column", () => {
  it("data queryable with new field name", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      `/items/${s.collection}?fields=${TARGET_TITLE}&limit=1`,
    );
    expect(res.status).toBe(200);
    expect(res.data.data[0]).toHaveProperty(TARGET_TITLE);
  });

  it("old field not present in items", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      `/items/${s.collection}?fields=${TARGET_TITLE}&limit=1`,
    );
    expect(res.data.data[0]).not.toHaveProperty(s.titleField);
  });

  it("data value preserved", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      `/items/${s.collection}?fields=${TARGET_TITLE}&limit=1`,
    );
    expect(res.data.data[0][TARGET_TITLE]).toBe("Hello World");
  });
});

// ─────────────────────────────────────────────
// Collection meta
// ─────────────────────────────────────────────

describe("rename field — collection meta", () => {
  it("display_template updated", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(
      `/collections/${s.collection}`,
    );
    const template = res.data.data.meta.display_template as string;
    expect(template).toContain(TARGET_TITLE);
    expect(template).not.toContain(s.titleField);
  });

  it("item_duplication_fields updated", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(
      `/collections/${s.collection}`,
    );
    const dup = res.data.data.meta.item_duplication_fields as string[];
    expect(dup).toContain(TARGET_TITLE);
    expect(dup).not.toContain(s.titleField);
  });

  it("archive_field unchanged (status not renamed)", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(
      `/collections/${s.collection}`,
    );
    expect(res.data.data.meta.archive_field).toBe(s.statusField);
  });
});

// ─────────────────────────────────────────────
// Conditions on dependent fields (slug conditions ref title)
// ─────────────────────────────────────────────

describe("rename field — conditions on dependent fields", () => {
  it("slug conditions rule key updated to new field name", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      `/fields/${s.collection}`,
    );
    const slug = res.data.data.find((f) => f["field"] === s.slugField);
    expect(slug).toBeDefined();
    const meta = slug!["meta"] as Record<string, unknown>;
    const conditions = meta["conditions"] as Array<Record<string, unknown>>;
    // The condition rule key should be updated (heading), not the human-readable name
    const ruleStr = JSON.stringify(conditions.map((c) => c["rule"]));
    expect(ruleStr).toContain(TARGET_TITLE);
    expect(ruleStr).not.toContain(`"${s.titleField}"`);
  });
});

// ─────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────

describe("rename field — presets", () => {
  it("layout_query fields updated", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/presets/${s.presetId}`,
    );
    const lq = res.data.data["layout_query"] as Record<string, unknown>;
    const tabular = lq["tabular"] as Record<string, unknown>;
    const fields = tabular["fields"] as string[];
    expect(fields).toContain(TARGET_TITLE);
    expect(fields).not.toContain(s.titleField);
  });

  it("layout_query sort updated including negated prefix", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/presets/${s.presetId}`,
    );
    const lq = res.data.data["layout_query"] as Record<string, unknown>;
    const tabular = lq["tabular"] as Record<string, unknown>;
    const sort = tabular["sort"] as string[];
    expect(sort).toContain(TARGET_TITLE);
    expect(sort).toContain(`-${TARGET_TITLE}`);
    expect(sort).not.toContain(s.titleField);
    expect(sort).not.toContain(`-${s.titleField}`);
  });

  it("layout_options widths key updated", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/presets/${s.presetId}`,
    );
    const lo = res.data.data["layout_options"] as Record<string, unknown>;
    const tabular = lo["tabular"] as Record<string, unknown>;
    const widths = tabular["widths"] as Record<string, unknown>;
    expect(Object.keys(widths)).toContain(TARGET_TITLE);
    expect(Object.keys(widths)).not.toContain(s.titleField);
  });
});

// ─────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────

describe("rename field — permissions", () => {
  it("validation JSON updated", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/permissions/${s.permissionId}`,
    );
    const validation = JSON.stringify(res.data.data["validation"]);
    expect(validation).toContain(TARGET_TITLE);
    expect(validation).not.toContain(s.titleField);
  });

  it("presets JSON key updated", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/permissions/${s.permissionId}`,
    );
    const presets = res.data.data["presets"] as Record<string, unknown>;
    expect(Object.keys(presets)).toContain(TARGET_TITLE);
    expect(Object.keys(presets)).not.toContain(s.titleField);
  });
});

// ─────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────

describe("rename field — operations", () => {
  it("item-read query.fields updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/operations/${s.operationIds.readWithFields}`,
    );
    const q = res.data.data.options["query"] as Record<string, unknown>;
    const fields = q["fields"] as string[];
    expect(fields).toContain(TARGET_TITLE);
    expect(fields).not.toContain(s.titleField);
  });

  it("item-read query.sort updated including negated prefix", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/operations/${s.operationIds.readWithFields}`,
    );
    const q = res.data.data.options["query"] as Record<string, unknown>;
    const sort = q["sort"] as string[];
    expect(sort).toContain(TARGET_TITLE);
    expect(sort).toContain(`-${TARGET_TITLE}`);
    expect(sort).not.toContain(s.titleField);
    expect(sort).not.toContain(`-${s.titleField}`);
  });

  it("item-read query.filter key updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/operations/${s.operationIds.readWithFields}`,
    );
    const q = res.data.data.options["query"] as Record<string, unknown>;
    const filter = q["filter"] as Record<string, unknown>;
    // filter was { status: { _nnull } } — status not renamed so unchanged
    expect(Object.keys(filter)).toContain(s.statusField);
  });

  it("item-update payload key updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/operations/${s.operationIds.updateWithPayload}`,
    );
    const payload = res.data.data.options["payload"] as Record<string, unknown>;
    expect(Object.keys(payload)).toContain(TARGET_TITLE);
    expect(Object.keys(payload)).not.toContain(s.titleField);
    expect(payload[TARGET_TITLE]).toBe("updated title");
  });
});

// ─────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────

describe("rename field — panels", () => {
  it("list panel sortField updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.list}`,
    );
    expect(res.data.data.options["sortField"]).toBe(TARGET_TITLE);
    expect(res.data.data.options["sortField"]).not.toBe(s.titleField);
  });

  it("list panel filter updated — no old field name", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.list}`,
    );
    const filter = JSON.stringify(res.data.data.options["filter"]);
    expect(filter).not.toContain(`"${s.titleField}"`);
    expect(filter).toContain(TARGET_TITLE);
  });

  it("list panel displayTemplate still intact (views + author fields)", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.list}`,
    );
    const template = res.data.data.options["displayTemplate"] as string;
    expect(template).toContain(s.viewsField);
    expect(template).toContain(s.authorField);
  });

  it("relational-variable displayTemplate updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.relationalVariable}`,
    );
    const template = res.data.data.options["displayTemplate"] as string;
    expect(template).toContain(TARGET_TITLE);
    expect(template).not.toContain(s.titleField);
  });
});

// ─────────────────────────────────────────────
// Bulk rename — multiple fields at once
// ─────────────────────────────────────────────

describe("rename field — bulk (multiple fields in one request)", () => {
  beforeAll(async () => {
    await renameField(s.collection, [
      { sourceField: s.viewsField, targetField: TARGET_VIEWS },
      { sourceField: s.slugField, targetField: TARGET_SLUG },
    ]);
  }, 30_000);

  it("views renamed to view_count", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.collection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    expect(fields).toContain(TARGET_VIEWS);
    expect(fields).not.toContain(s.viewsField);
  });

  it("slug renamed to url_slug", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.collection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    expect(fields).toContain(TARGET_SLUG);
    expect(fields).not.toContain(s.slugField);
  });

  it("url_slug validation updated to new name", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      `/fields/${s.collection}`,
    );
    const field = res.data.data.find((f) => f["field"] === TARGET_SLUG);
    expect(field).toBeDefined();
    const meta = field!["meta"] as Record<string, unknown>;
    const validation = JSON.stringify(meta["validation"]);
    expect(validation).toContain(TARGET_SLUG);
    // Check exact field name is gone (not substring — url_slug contains "slug")
    expect(validation).not.toContain(`"${s.slugField}":`);
  });

  it("meter panel field updated to view_count", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.meter}`,
    );
    expect(res.data.data.options["field"]).toBe(TARGET_VIEWS);
  });

  it("metric panel field updated to view_count", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.metric}`,
    );
    expect(res.data.data.options["field"]).toBe(TARGET_VIEWS);
  });

  it("line-chart yAxis updated to view_count", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.lineChart}`,
    );
    expect(res.data.data.options["yAxis"]).toBe(TARGET_VIEWS);
  });

  it("bar-chart yAxis updated to view_count", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.barChart}`,
    );
    expect(res.data.data.options["yAxis"]).toBe(TARGET_VIEWS);
  });

  it("time-series valueField updated to view_count", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.timeSeries}`,
    );
    expect(res.data.data.options["valueField"]).toBe(TARGET_VIEWS);
  });

  it("pie-chart column updated to view_count", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(
      `/panels/${s.panelIds.pieChart}`,
    );
    expect(res.data.data.options["column"]).toBe(TARGET_VIEWS);
  });

  it("preset layout_query fields updated for both renames", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/presets/${s.presetId}`,
    );
    const lq = res.data.data["layout_query"] as Record<string, unknown>;
    const tabular = lq["tabular"] as Record<string, unknown>;
    const fields = tabular["fields"] as string[];
    expect(fields).toContain(TARGET_VIEWS);
    expect(fields).toContain(TARGET_SLUG);
    expect(fields).not.toContain(s.viewsField);
    expect(fields).not.toContain(s.slugField);
  });

  it("preset layout_options widths updated for both renames", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(
      `/presets/${s.presetId}`,
    );
    const lo = res.data.data["layout_options"] as Record<string, unknown>;
    const tabular = lo["tabular"] as Record<string, unknown>;
    const widths = tabular["widths"] as Record<string, unknown>;
    expect(Object.keys(widths)).toContain(TARGET_VIEWS);
    expect(Object.keys(widths)).toContain(TARGET_SLUG);
    expect(Object.keys(widths)).not.toContain(s.viewsField);
    expect(Object.keys(widths)).not.toContain(s.slugField);
  });

  it("data still queryable with all new field names", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      `/items/${s.collection}?fields=${TARGET_VIEWS},${TARGET_SLUG}&limit=1`,
    );
    expect(res.status).toBe(200);
    expect(res.data.data[0]).toHaveProperty(TARGET_VIEWS);
  });
});

// ─────────────────────────────────────────────
// Guard rails
// ─────────────────────────────────────────────

describe("rename field — guard rails", () => {
  it("rejects system collection field rename", async () => {
    await expect(
      renameField("directus_users", [
        { sourceField: "email", targetField: "email_address" },
      ]),
    ).rejects.toThrow();
  });

  it("rejects source === target", async () => {
    await expect(
      renameField(s.collection, [
        { sourceField: TARGET_TITLE, targetField: TARGET_TITLE },
      ]),
    ).rejects.toThrow();
  });

  it("rejects invalid characters", async () => {
    await expect(
      renameField(s.collection, [
        { sourceField: TARGET_TITLE, targetField: "invalid-name!" },
      ]),
    ).rejects.toThrow();
  });

  it("rejects empty target", async () => {
    await expect(
      renameField(s.collection, [
        { sourceField: TARGET_TITLE, targetField: "" },
      ]),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────
// Alias field rename (M2M virtual field — no physical column)
// ─────────────────────────────────────────────

describe("rename field — alias field (M2M virtual, no physical column)", () => {
  const TARGET_ALIAS = "post_tags";

  beforeAll(async () => {
    // s.junctionCollection alias field on s.collection (the M2M virtual field)
    await renameField(s.collection, [
      { sourceField: s.junctionCollection, targetField: TARGET_ALIAS },
    ]);
  }, 30_000);

  it("alias field not in directus_fields (Directus generates it from relations)", async () => {
    // M2M alias fields are generated dynamically from directus_relations.one_field
    // They do NOT exist as rows in directus_fields — this is expected Directus behavior
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.collection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    // Neither old nor new name should be in directus_fields
    expect(fields).not.toContain(s.junctionCollection);
    expect(fields).not.toContain(TARGET_ALIAS);
  });

  it("does not crash — no physical column exists for alias field", async () => {
    // If we got here the rename succeeded without a DB error
    const res = await api.get(`/fields/${s.collection}`);
    expect(res.status).toBe(200);
  });

  it("data still queryable on collection after alias rename", async () => {
    const res = await api.get(`/items/${s.collection}?limit=1`);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────
// O2M alias field rename (virtual, no physical column)
// ─────────────────────────────────────────────

describe("rename field — O2M alias field (no physical column)", () => {
  const TARGET_O2M = "child_items";

  beforeAll(async () => {
    await renameField(s.collection, [
      { sourceField: s.o2mAliasField, targetField: TARGET_O2M },
    ]);
  }, 30_000);

  it("O2M alias field not in directus_fields (generated from relations)", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.collection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    expect(fields).not.toContain(s.o2mAliasField);
  });

  it("no crash — no physical column exists for O2M alias", async () => {
    const res = await api.get(`/fields/${s.collection}`);
    expect(res.status).toBe(200);
  });

  it("one_field on relation updated to new alias name", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      "/relations?limit=-1",
    );
    const rel = res.data.data.find(
      (r) =>
        r["collection"] === s.nestedCollection && r["field"] === "parent_id",
    );
    expect(rel).toBeDefined();
    const meta = rel!["meta"] as Record<string, unknown>;
    expect(meta["one_field"]).toBe(TARGET_O2M);
    expect(meta["one_field"]).not.toBe(s.o2mAliasField);
  });
});

// ─────────────────────────────────────────────
// M2A alias field rename (virtual, no physical column)
// ─────────────────────────────────────────────

describe("rename field — M2A alias field (no physical column)", () => {
  const TARGET_M2A = "page_sections";

  beforeAll(async () => {
    await renameField(s.pageBuilderCollection, [
      { sourceField: s.m2aAliasField, targetField: TARGET_M2A },
    ]);
  }, 30_000);

  it("M2A alias field not in directus_fields (generated from relations)", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(
      `/fields/${s.pageBuilderCollection}`,
    );
    const fields = res.data.data.map((f) => f.field);
    expect(fields).not.toContain(s.m2aAliasField);
  });

  it("no crash — no physical column exists for M2A alias", async () => {
    const res = await api.get(`/fields/${s.pageBuilderCollection}`);
    expect(res.status).toBe(200);
  });

  it("one_field on M2A relation updated to new alias name", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(
      "/relations?limit=-1",
    );
    const rel = res.data.data.find(
      (r) =>
        r["collection"] === s.m2aJunctionCollection &&
        r["field"] === "page_builder_id",
    );
    expect(rel).toBeDefined();
    const meta = rel!["meta"] as Record<string, unknown>;
    expect(meta["one_field"]).toBe(TARGET_M2A);
    expect(meta["one_field"]).not.toBe(s.m2aAliasField);
  });
});

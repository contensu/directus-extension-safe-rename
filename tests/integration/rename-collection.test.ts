/**
 * Integration tests: rename collection
 *
 * Seeds all data with unique names → renames → asserts → cleans up.
 * No Docker reset needed — unique names prevent conflicts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, waitForDirectus, unique } from "./helpers/api";
import { seedAll, cleanupAll, type SeedResult } from "./helpers/seed";
import { renameCollection, containsString } from "./helpers/rename";

let s: SeedResult;

beforeAll(async () => {
  await waitForDirectus();
  s = await seedAll(unique);
  await renameCollection(s.collection, s.targetCollection);
}, 120_000);

afterAll(async () => {
  await cleanupAll(s);
}, 60_000);

// ─────────────────────────────────────────────
// Basic metadata
// ─────────────────────────────────────────────

describe("rename collection — basic metadata", () => {
  it("old collection no longer exists", async () => {
    const res = await api.get(`/collections/${s.collection}`);
    expect(res.status).not.toBe(200);
  });

  it("new collection exists", async () => {
    const res = await api.get(`/collections/${s.targetCollection}`);
    expect(res.status).toBe(200);
  });

  it("collection name correct", async () => {
    const res = await api.get<{ data: { collection: string } }>(`/collections/${s.targetCollection}`);
    expect(res.data.data.collection).toBe(s.targetCollection);
  });

  it("archive_field preserved", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.targetCollection}`);
    expect(res.data.data.meta.archive_field).toBe(s.statusField);
  });

  it("sort_field preserved", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.targetCollection}`);
    expect(res.data.data.meta.sort_field).toBe("sort");
  });

  it("item_duplication_fields preserved", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.targetCollection}`);
    expect(res.data.data.meta.item_duplication_fields).toEqual([s.titleField, s.statusField]);
  });

  it("display_template preserved", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.targetCollection}`);
    const template = res.data.data.meta.display_template as string;
    expect(template).toContain(s.titleField);
    expect(template).toContain(s.statusField);
  });

  it("group still points to folder collection", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.targetCollection}`);
    expect(res.data.data.meta.group).toBe(s.folderCollection);
  });
});

// ─────────────────────────────────────────────
// Physical table
// ─────────────────────────────────────────────

describe("rename collection — physical table", () => {
  it("items queryable on new collection", async () => {
    const res = await api.get<{ data: unknown[] }>(`/items/${s.targetCollection}?limit=5`);
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeGreaterThan(0);
  });

  it("items not queryable on old collection", async () => {
    const res = await api.get(`/items/${s.collection}?limit=1`);
    expect(res.status).not.toBe(200);
  });

  it("seeded item data preserved", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(`/items/${s.targetCollection}?limit=1`);
    expect(res.data.data[0][s.titleField]).toBe("Hello World");
    expect(res.data.data[0][s.statusField]).toBe("published");
    expect(res.data.data[0][s.viewsField]).toBe(100);
  });
});

// ─────────────────────────────────────────────
// Nested collection (group update)
// ─────────────────────────────────────────────

describe("rename collection — nested collection group", () => {
  it("nested collection group updated to target", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.nestedCollection}`);
    expect(res.status).toBe(200);
    expect(res.data.data.meta.group).toBe(s.targetCollection);
    expect(res.data.data.meta.group).not.toBe(s.collection);
  });
});

// ─────────────────────────────────────────────
// Fields
// ─────────────────────────────────────────────

describe("rename collection — fields", () => {
  it("fields exist on new collection", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(`/fields/${s.targetCollection}`);
    expect(res.status).toBe(200);
    const fields = res.data.data.map((f) => f.field);
    expect(fields).toContain(s.titleField);
    expect(fields).toContain(s.statusField);
    expect(fields).toContain(s.slugField);
    expect(fields).toContain(s.viewsField);
  });

  it("no fields reference old collection name", async () => {
    const res = await api.get<{ data: Array<{ collection: string }> }>(`/fields/${s.targetCollection}`);
    const colls = res.data.data.map((f) => f.collection);
    expect(colls.every((c) => c === s.targetCollection)).toBe(true);
  });

  it("slug conditions still reference title field", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(`/fields/${s.targetCollection}`);
    const slug = res.data.data.find((f) => f["field"] === s.slugField);
    const meta = slug!["meta"] as Record<string, unknown>;
    expect(containsString(meta["conditions"], s.titleField)).toBe(true);
  });

  it("slug validation still intact", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(`/fields/${s.targetCollection}`);
    const slug = res.data.data.find((f) => f["field"] === s.slugField);
    const meta = slug!["meta"] as Record<string, unknown>;
    expect(containsString(meta["validation"], "_regex")).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────

describe("rename collection — relations", () => {
  it("M2M junction now references target collection", async () => {
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

  it("M2A one_allowed_collections still intact", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>("/relations?limit=-1");
    const m2a = res.data.data.find(
      (r) => r["collection"] === s.m2aJunctionCollection && r["field"] === "item"
    );
    expect(m2a).toBeDefined();
    const meta = m2a!["meta"] as Record<string, unknown>;
    const allowed = meta["one_allowed_collections"] as string[];
    expect(allowed).toContain(s.textBlocksCollection);
    expect(allowed).toContain(s.imageBlocksCollection);
  });
});

// ─────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────

describe("rename collection — permissions", () => {
  it("permission collection updated to target", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/permissions/${s.permissionId}`);
    expect(res.data.data["collection"]).toBe(s.targetCollection);
    expect(res.data.data["collection"]).not.toBe(s.collection);
  });

  it("permissions JSON still intact", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/permissions/${s.permissionId}`);
    const permissions = JSON.stringify(res.data.data["permissions"]);
    expect(permissions).toContain("published");
    expect(permissions).toContain(s.statusField);
  });

  it("validation JSON still intact", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/permissions/${s.permissionId}`);
    const validation = JSON.stringify(res.data.data["validation"]);
    expect(validation).toContain(s.titleField);
    expect(validation).toContain("_nnull");
  });

  it("presets JSON still intact", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/permissions/${s.permissionId}`);
    const presets = res.data.data["presets"] as Record<string, unknown>;
    expect(Object.keys(presets)).toContain(s.titleField);
    expect(Object.keys(presets)).toContain(s.viewsField);
  });
});

// ─────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────

describe("rename collection — presets", () => {
  it("preset collection updated to target", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/presets/${s.presetId}`);
    expect(res.data.data["collection"]).toBe(s.targetCollection);
  });

  it("preset layout_query fields still intact", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/presets/${s.presetId}`);
    const lq = res.data.data["layout_query"] as Record<string, unknown>;
    const tabular = lq["tabular"] as Record<string, unknown>;
    const fields = tabular["fields"] as string[];
    expect(fields).toContain(s.titleField);
    expect(fields).toContain(s.statusField);
  });

  it("preset layout_query sort still intact including negated prefix", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/presets/${s.presetId}`);
    const lq = res.data.data["layout_query"] as Record<string, unknown>;
    const tabular = lq["tabular"] as Record<string, unknown>;
    const sort = tabular["sort"] as string[];
    expect(sort).toContain(s.titleField);
    expect(sort).toContain(`-${s.titleField}`);
  });

  it("preset layout_options widths still intact", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/presets/${s.presetId}`);
    const lo = res.data.data["layout_options"] as Record<string, unknown>;
    const tabular = lo["tabular"] as Record<string, unknown>;
    const widths = tabular["widths"] as Record<string, unknown>;
    expect(Object.keys(widths)).toContain(s.titleField);
    expect(Object.keys(widths)).toContain(s.statusField);
  });

  it("preset filter still intact", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/presets/${s.presetId}`);
    const filter = JSON.stringify(res.data.data["filter"]);
    expect(filter).toContain(s.statusField);
    expect(filter).toContain("published");
  });
});

// ─────────────────────────────────────────────
// Flows
// ─────────────────────────────────────────────

describe("rename collection — flows", () => {
  it.each([0, 1, 2, 3])("flow %i options.collections updated to target", async (i) => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/flows/${s.flowIds[i]}`);
    expect(res.status).toBe(200);
    const collections = res.data.data.options["collections"] as string[];
    expect(collections).toContain(s.targetCollection);
    expect(collections).not.toContain(s.collection);
  });
});

// ─────────────────────────────────────────────
// Operations
// ─────────────────────────────────────────────

describe("rename collection — operations", () => {
  it("item-read (with fields) options.collection updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.readWithFields}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["collection"]).not.toBe(s.collection);
  });

  it("item-read options.query.fields still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.readWithFields}`);
    const q = res.data.data.options["query"] as Record<string, unknown>;
    expect(q["fields"]).toEqual([s.titleField, s.statusField]);
  });

  it("item-read options.query.sort still intact including negated prefix", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.readWithFields}`);
    const q = res.data.data.options["query"] as Record<string, unknown>;
    const sort = q["sort"] as string[];
    expect(sort).toContain(s.titleField);
    expect(sort).toContain(`-${s.titleField}`);
  });

  it("item-read (simple) options.collection updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.readSimple}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
  });

  it("item-delete options.collection updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.deleteWithFilter}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
  });

  it("item-delete options.query.filter still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.deleteWithFilter}`);
    const q = res.data.data.options["query"] as Record<string, unknown>;
    const filter = JSON.stringify(q["filter"]);
    expect(filter).toContain("draft");
    expect(filter).toContain(s.statusField);
  });

  it("item-update options.collection updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.updateWithPayload}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
  });

  it("item-update options.payload still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/operations/${s.operationIds.updateWithPayload}`);
    const payload = res.data.data.options["payload"] as Record<string, unknown>;
    expect(payload[s.titleField]).toBe("updated title");
    expect(payload[s.viewsField]).toBe(999);
  });
});

// ─────────────────────────────────────────────
// Panels
// ─────────────────────────────────────────────

describe("rename collection — panels", () => {
  it("list panel options.collection updated", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.list}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
  });

  it("list panel sortField still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.list}`);
    expect(res.data.data.options["sortField"]).toBe(s.titleField);
  });

  it("list panel displayTemplate still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.list}`);
    const template = res.data.data.options["displayTemplate"] as string;
    expect(template).toContain(s.viewsField);
    expect(template).toContain(s.authorField);
  });

  it("list panel filter still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.list}`);
    const filter = JSON.stringify(res.data.data.options["filter"]);
    expect(filter).toContain(s.titleField);
    expect(filter).toContain(s.slugField);
  });

  it("meter panel options.collection + field still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.meter}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["field"]).toBe(s.viewsField);
  });

  it("metric panel options.collection + field + sortField still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.metric}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["field"]).toBe(s.viewsField);
    expect(res.data.data.options["sortField"]).toBe("date_created");
  });

  it("line-chart panel axes + grouping still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.lineChart}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["xAxis"]).toBe("date_created");
    expect(res.data.data.options["yAxis"]).toBe(s.viewsField);
    expect(res.data.data.options["grouping"]).toBe(s.statusField);
  });

  it("bar-chart panel axes still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.barChart}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["xAxis"]).toBe(s.statusField);
    expect(res.data.data.options["yAxis"]).toBe(s.viewsField);
  });

  it("time-series panel dateField + valueField still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.timeSeries}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["dateField"]).toBe("date_created");
    expect(res.data.data.options["valueField"]).toBe(s.viewsField);
  });

  it("pie-chart panel column still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.pieChart}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    expect(res.data.data.options["column"]).toBe(s.viewsField);
  });

  it("relational-variable panel displayTemplate still intact", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.relationalVariable}`);
    expect(res.data.data.options["collection"]).toBe(s.targetCollection);
    const template = res.data.data.options["displayTemplate"] as string;
    expect(template).toContain(s.statusField);
    expect(template).toContain(s.titleField);
  });

  it("variable panel unaffected (no collection key)", async () => {
    const res = await api.get<{ data: { options: Record<string, unknown> } }>(`/panels/${s.panelIds.variable}`);
    expect(res.data.data.options["field"]).toBe(s.viewsField);
    expect(res.data.data.options["collection"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────
// Shares + Comments
// ─────────────────────────────────────────────

describe("rename collection — shares", () => {
  it("share collection updated to target", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/shares/${s.shareId}`);
    expect(res.status).toBe(200);
    expect(res.data.data["collection"]).toBe(s.targetCollection);
    expect(res.data.data["collection"]).not.toBe(s.collection);
  });
});

describe("rename collection — comments", () => {
  it("comment collection updated to target", async () => {
    const res = await api.get<{ data: Record<string, unknown> }>(`/comments/${s.commentId}`);
    expect(res.status).toBe(200);
    expect(res.data.data["collection"]).toBe(s.targetCollection);
    expect(res.data.data["collection"]).not.toBe(s.collection);
  });
});

// ─────────────────────────────────────────────
// Activity + Revisions
// ─────────────────────────────────────────────

describe("rename collection — activity", () => {
  it("no activity references source collection", async () => {
    const res = await api.get<{ data: unknown[] }>(`/activity?filter[collection][_eq]=${s.collection}&limit=5`);
    expect(res.data.data).toHaveLength(0);
  });

  it("activity references target collection", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(`/activity?filter[collection][_eq]=${s.targetCollection}&limit=5`);
    expect(res.data.data.length).toBeGreaterThan(0);
    res.data.data.forEach((r) => expect(r["collection"]).toBe(s.targetCollection));
  });
});

describe("rename collection — revisions", () => {
  it("no revisions reference source collection", async () => {
    const res = await api.get<{ data: unknown[] }>(`/revisions?filter[collection][_eq]=${s.collection}&limit=5`);
    expect(res.data.data).toHaveLength(0);
  });

  it("revisions reference target collection", async () => {
    const res = await api.get<{ data: Array<Record<string, unknown>> }>(`/revisions?filter[collection][_eq]=${s.targetCollection}&limit=5`);
    expect(res.data.data.length).toBeGreaterThan(0);
    res.data.data.forEach((r) => expect(r["collection"]).toBe(s.targetCollection));
  });
});

// ─────────────────────────────────────────────
// Folder collection (schema: null)
// ─────────────────────────────────────────────

describe("rename collection — folder collection (no physical table)", () => {
  const folderTarget = unique("folder_renamed");

  it("renames folder collection without error", async () => {
    const { renameCollection: rc } = await import("./helpers/rename");
    await expect(rc(s.folderCollection, folderTarget)).resolves.not.toThrow();
  });

  it("old folder no longer exists", async () => {
    const res = await api.get(`/collections/${s.folderCollection}`);
    expect(res.status).not.toBe(200);
  });

  it("new folder exists with schema null", async () => {
    const res = await api.get<{ data: { schema: null } }>(`/collections/${folderTarget}`);
    expect(res.status).toBe(200);
    expect(res.data.data.schema).toBeNull();
  });

  it("target collection group updated to renamed folder", async () => {
    const res = await api.get<{ data: { meta: Record<string, unknown> } }>(`/collections/${s.targetCollection}`);
    expect(res.data.data.meta.group).toBe(folderTarget);
  });
});

// ─────────────────────────────────────────────
// Guard rails
// ─────────────────────────────────────────────

describe("rename collection — guard rails", () => {
  it("rejects system collection rename", async () => {
    await expect(renameCollection("directus_users", "my_users")).rejects.toThrow();
  });

  it("rejects same source and target", async () => {
    await expect(renameCollection(s.targetCollection, s.targetCollection)).rejects.toThrow();
  });

  it("rejects invalid characters", async () => {
    await expect(renameCollection(s.targetCollection, "invalid-name!")).rejects.toThrow();
  });

  it("rejects name starting with number", async () => {
    await expect(renameCollection(s.targetCollection, "2posts")).rejects.toThrow();
  });

  it("rejects empty target", async () => {
    await expect(renameCollection(s.targetCollection, "")).rejects.toThrow();
  });
});

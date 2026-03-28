/**
 * Seed helpers — create Directus test entities via REST API.
 * All names use unique() to avoid conflicts between test runs.
 */

import { api } from "./api";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SeedResult {
  // Collections
  collection: string;
  targetCollection: string;
  nestedCollection: string;
  tagsCollection: string;
  junctionCollection: string;
  textBlocksCollection: string;
  imageBlocksCollection: string;
  pageBuilderCollection: string;
  m2aJunctionCollection: string;
  folderCollection: string;

  // Alias fields
  o2mAliasField: string; // "children" on main collection
  m2aAliasField: string; // "blocks" on pageBuilderCollection

  // Fields
  titleField: string;
  slugField: string;
  viewsField: string;
  statusField: string;
  authorField: string;

  // Entities
  flowIds: string[];
  operationIds: {
    readWithFields: string;
    readSimple: string;
    deleteWithFilter: string;
    updateWithPayload: string;
  };
  presetId: number;
  permissionId: number;
  policyId: string;
  dashboardId: string;
  panelIds: {
    list: string;
    meter: string;
    metric: string;
    lineChart: string;
    barChart: string;
    timeSeries: string;
    pieChart: string;
    relationalVariable: string;
    variable: string;
  };
  shareId: string;
  commentId: string;
  itemId: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await api.post<{ data: T }>(path, body);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `POST ${path} failed (${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`,
    );
  }
  return res.data.data;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await api.patch<{ data: T }>(path, body);
  if (res.status !== 200) {
    throw new Error(
      `PATCH ${path} failed (${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`,
    );
  }
  return res.data.data;
}

async function safeDelete(path: string): Promise<void> {
  try {
    await api.delete(path);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────
// Main seed function
// ─────────────────────────────────────────────

export async function seedAll(
  u: (prefix: string) => string,
): Promise<SeedResult> {
  // ── Names ──
  const collection = u("articles");
  const targetCollection = u("posts");
  const nestedCollection = u("nested");
  const tagsCollection = u("tags");
  const junctionCollection = u("articles_tags");
  const textBlocksCollection = u("text_blocks");
  const imageBlocksCollection = u("image_blocks");
  const pageBuilderCollection = u("page_builder");
  const m2aJunctionCollection = u("page_blocks");
  const folderCollection = u("folder_group");
  const titleField = "title";
  const slugField = "slug";
  const viewsField = "views";
  const statusField = "status";
  const authorField = "author";

  // ── Folder collection (schema: null) ──
  await post("/collections", {
    collection: folderCollection,
    meta: {
      icon: "folder",
      hidden: false,
      accountability: "all",
      collapse: "open",
    },
    schema: null,
  });

  // ── tags ──
  await post("/collections", {
    collection: tagsCollection,
    meta: {
      icon: "sell",
      hidden: false,
      accountability: "all",
      collapse: "open",
    },
    schema: { name: tagsCollection },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: { hidden: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      },
      {
        field: "name",
        type: "string",
        meta: { interface: "input" },
        schema: {},
      },
    ],
  });

  // ── text_blocks ──
  await post("/collections", {
    collection: textBlocksCollection,
    meta: {
      icon: "subject",
      hidden: false,
      accountability: "all",
      collapse: "open",
    },
    schema: { name: textBlocksCollection },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: { hidden: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      },
      {
        field: "content",
        type: "text",
        meta: { interface: "input-multiline" },
        schema: {},
      },
    ],
  });

  // ── image_blocks ──
  await post("/collections", {
    collection: imageBlocksCollection,
    meta: {
      icon: "image",
      hidden: false,
      accountability: "all",
      collapse: "open",
    },
    schema: { name: imageBlocksCollection },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: { hidden: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      },
      {
        field: "url",
        type: "string",
        meta: { interface: "input" },
        schema: {},
      },
      {
        field: "caption",
        type: "string",
        meta: { interface: "input" },
        schema: {},
      },
    ],
  });

  // ── page_builder ──
  await post("/collections", {
    collection: pageBuilderCollection,
    meta: {
      icon: "view_quilt",
      hidden: false,
      accountability: "all",
      collapse: "open",
    },
    schema: { name: pageBuilderCollection },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: { hidden: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      },
    ],
  });

  // ── main articles collection ──
  await post("/collections", {
    collection,
    meta: {
      icon: "article",
      hidden: false,
      accountability: "all",
      collapse: "open",
      archive_field: statusField,
      archive_value: "archived",
      unarchive_value: "draft",
      sort_field: "sort",
      item_duplication_fields: [titleField, statusField],
      display_template: `{{${titleField}}} - {{${statusField}}}`,
      group: folderCollection,
    },
    schema: { name: collection },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: { hidden: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      },
      {
        field: statusField,
        type: "string",
        meta: {
          interface: "select-dropdown",
          options: {
            choices: [
              { text: "Published", value: "published" },
              { text: "Draft", value: "draft" },
              { text: "Archived", value: "archived" },
            ],
          },
        },
        schema: { default_value: "draft", is_nullable: false },
      },
      {
        field: "sort",
        type: "integer",
        meta: { interface: "input", hidden: true },
        schema: {},
      },
      {
        field: titleField,
        type: "string",
        meta: { interface: "input", required: true },
        schema: {},
      },
      {
        field: slugField,
        type: "string",
        meta: {
          interface: "input",
          options: { trim: true, slug: true },
          conditions: [
            {
              name: "hidden when title is empty",
              rule: { _and: [{ [titleField]: { _null: true } }] },
              hidden: true,
              options: {},
            },
          ],
          validation: { _and: [{ [slugField]: { _regex: "^[a-z0-9-]+$" } }] },
        },
        schema: {},
      },
      {
        field: "body",
        type: "text",
        meta: { interface: "input-multiline" },
        schema: {},
      },
      {
        field: viewsField,
        type: "integer",
        meta: { interface: "input" },
        schema: { default_value: 0 },
      },
      {
        field: authorField,
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          options: { enableLink: true },
        },
        schema: {},
      },
    ],
  });

  // ── junction: articles_tags (M2M) ──
  await post("/collections", {
    collection: junctionCollection,
    meta: {
      icon: "import_export",
      hidden: true,
      accountability: "all",
      collapse: "open",
    },
    schema: { name: junctionCollection },
    fields: [
      {
        field: "id",
        type: "integer",
        meta: { hidden: true, interface: "input" },
        schema: { is_primary_key: true, has_auto_increment: true },
      },
      {
        field: `${collection}_id`,
        type: "uuid",
        meta: { hidden: true, interface: "input" },
        schema: {},
      },
      {
        field: `${tagsCollection}_id`,
        type: "uuid",
        meta: { hidden: true, interface: "input" },
        schema: {},
      },
    ],
  });

  // ── junction: page_blocks (M2A) ──
  await post("/collections", {
    collection: m2aJunctionCollection,
    meta: {
      icon: "import_export",
      hidden: true,
      accountability: "all",
      collapse: "open",
    },
    schema: { name: m2aJunctionCollection },
    fields: [
      {
        field: "id",
        type: "integer",
        meta: { hidden: true, interface: "input" },
        schema: { is_primary_key: true, has_auto_increment: true },
      },
      {
        field: "page_builder_id",
        type: "uuid",
        meta: { hidden: true, interface: "input" },
        schema: {},
      },
      {
        field: "item",
        type: "string",
        meta: { hidden: true, interface: "input" },
        schema: {},
      },
      {
        field: "collection",
        type: "string",
        meta: { hidden: true, interface: "input" },
        schema: {},
      },
    ],
  });

  // ── nested collection (has a FK back to main collection for O2M) ──
  await post("/collections", {
    collection: nestedCollection,
    meta: {
      icon: "box",
      hidden: false,
      accountability: "all",
      collapse: "open",
      group: collection,
    },
    schema: { name: nestedCollection },
    fields: [
      {
        field: "id",
        type: "uuid",
        meta: { hidden: true, interface: "input", special: ["uuid"] },
        schema: { is_primary_key: true, is_nullable: false },
      },
      {
        field: "parent_id",
        type: "uuid",
        meta: { hidden: true, interface: "input" },
        schema: {},
      },
    ],
  });

  // ── Relations ──

  // M2O: articles.author → directus_users
  await post("/relations", {
    collection,
    field: authorField,
    related_collection: "directus_users",
    schema: { on_delete: "SET NULL" },
    meta: { one_deselect_action: "nullify" },
  });

  // O2M: collection → nestedCollection (creates alias field "children" on main collection)
  await post("/relations", {
    collection: nestedCollection,
    field: "parent_id",
    related_collection: collection,
    schema: { on_delete: "SET NULL" },
    meta: { one_field: "children", one_deselect_action: "nullify" },
  });

  // M2M: articles ↔ tags via junction
  await post("/relations", {
    collection: junctionCollection,
    field: `${collection}_id`,
    related_collection: collection,
    schema: { on_delete: "SET NULL" },
    meta: {
      one_field: `${junctionCollection}`,
      junction_field: `${tagsCollection}_id`,
      one_deselect_action: "nullify",
    },
  });
  await post("/relations", {
    collection: junctionCollection,
    field: `${tagsCollection}_id`,
    related_collection: tagsCollection,
    schema: { on_delete: "SET NULL" },
    meta: {
      junction_field: `${collection}_id`,
      one_deselect_action: "nullify",
    },
  });

  // M2A: page_blocks → text_blocks | image_blocks
  await post("/relations", {
    collection: m2aJunctionCollection,
    field: "item",
    related_collection: null,
    schema: null,
    meta: {
      one_collection_field: "collection",
      one_allowed_collections: [textBlocksCollection, imageBlocksCollection],
      junction_field: "page_builder_id",
      one_deselect_action: "nullify",
    },
  });
  await post("/relations", {
    collection: m2aJunctionCollection,
    field: "page_builder_id",
    related_collection: pageBuilderCollection,
    schema: { on_delete: "SET NULL" },
    meta: {
      one_field: "blocks",
      junction_field: "item",
      one_deselect_action: "nullify",
    },
  });

  // ── Insert item (creates activity + revisions) ──
  const item = await post<Record<string, unknown>>(`/items/${collection}`, {
    [titleField]: "Hello World",
    [slugField]: "hello-world",
    [statusField]: "published",
    body: "This is the first article",
    [viewsField]: 100,
  });
  const itemId = item["id"] as string;

  // ── Flows + Operations ──

  // Flow 1: item-create with item-read op (fields + sort)
  const flow1 = await post<{ id: string }>("/flows", {
    name: `flow_create_${collection}`,
    icon: "bolt",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: {
      type: "action",
      scope: ["items.create"],
      collections: [collection],
    },
  });
  const opReadWithFields = await post<{ id: string }>("/operations", {
    name: "Read Data",
    key: `read_fields_${Date.now()}`,
    type: "item-read",
    flow: flow1.id,
    position_x: 19,
    position_y: 1,
    options: {
      permissions: "$full",
      collection,
      query: {
        filter: { [statusField]: { _nnull: true } },
        fields: [titleField, statusField],
        sort: [titleField, `-${titleField}`],
      },
    },
  });

  // Flow 2: item-update with simple read op
  const flow2 = await post<{ id: string }>("/flows", {
    name: `flow_update_${collection}`,
    icon: "bolt",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: {
      type: "action",
      scope: ["items.update"],
      collections: [collection],
    },
  });
  const opReadSimple = await post<{ id: string }>("/operations", {
    name: "Read Data",
    key: `read_simple_${Date.now()}`,
    type: "item-read",
    flow: flow2.id,
    position_x: 19,
    position_y: 1,
    options: {
      permissions: "$full",
      collection,
      query: { filter: { [statusField]: { _eq: "published" } } },
    },
  });

  // Flow 3: item-delete
  const flow3 = await post<{ id: string }>("/flows", {
    name: `flow_delete_${collection}`,
    icon: "bolt",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: {
      type: "action",
      scope: ["items.delete"],
      collections: [collection],
    },
  });
  const opDeleteWithFilter = await post<{ id: string }>("/operations", {
    name: "Delete Data",
    key: `delete_${Date.now()}`,
    type: "item-delete",
    flow: flow3.id,
    position_x: 19,
    position_y: 1,
    options: {
      collection,
      query: { filter: { [statusField]: { _eq: "draft" } } },
      permissions: "$full",
    },
  });

  // Flow 4: item-update with payload containing field refs
  const flow4 = await post<{ id: string }>("/flows", {
    name: `flow_update_payload_${collection}`,
    icon: "bolt",
    status: "active",
    trigger: "event",
    accountability: "all",
    options: {
      type: "action",
      scope: ["items.create"],
      collections: [collection],
    },
  });
  const opUpdateWithPayload = await post<{ id: string }>("/operations", {
    name: "Update Data",
    key: `update_payload_${Date.now()}`,
    type: "item-update",
    flow: flow4.id,
    position_x: 19,
    position_y: 1,
    options: {
      collection,
      query: { filter: { [statusField]: { _nnull: true } } },
      payload: { [titleField]: "updated title", [viewsField]: 999 },
    },
  });

  // ── Preset ──
  const preset = await post<{ id: number }>("/presets", {
    collection,
    bookmark: `bookmark_${collection}`,
    layout: "tabular",
    layout_query: {
      tabular: {
        page: 1,
        fields: [titleField, statusField, viewsField, slugField],
        sort: [titleField, `-${titleField}`],
      },
    },
    layout_options: {
      tabular: {
        widths: {
          [titleField]: 300,
          [statusField]: 200,
          [viewsField]: 150,
          [slugField]: 250,
        },
      },
    },
    filter: { _and: [{ [statusField]: { _eq: "published" } }] },
    icon: "bookmark",
    color: "#E35169",
  });

  // ── Policy + Permission ──
  const policy = await post<{ id: string }>("/policies", {
    name: `policy_${collection}`,
    icon: "badge",
    admin_access: false,
    app_access: true,
  });

  const permission = await post<{ id: number }>("/permissions", {
    policy: policy.id,
    collection,
    action: "read",
    fields: ["*"],
    permissions: { _and: [{ [statusField]: { _eq: "published" } }] },
    validation: { _and: [{ [titleField]: { _nnull: true } }] },
    presets: { [titleField]: "default title", [viewsField]: 0 },
  });

  // ── Dashboard + Panels ──
  const dashboard = await post<{ id: string }>("/dashboards", {
    name: `dashboard_${collection}`,
    icon: "space_dashboard",
  });

  const filter = {
    _and: [
      { [titleField]: { _nnull: true } },
      { [slugField]: { _nnull: true } },
    ],
  };

  const panelList = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "list",
    position_x: 1,
    position_y: 1,
    width: 12,
    height: 6,
    show_header: false,
    options: {
      collection,
      sortField: titleField,
      displayTemplate: `{{${viewsField}}}{{${authorField}.first_name}}`,
      filter,
    },
  });

  const panelMeter = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "meter",
    position_x: 14,
    position_y: 1,
    width: 6,
    height: 6,
    show_header: false,
    options: { collection, field: viewsField, fn: "countDistinct", filter },
  });

  const panelMetric = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "metric",
    position_x: 21,
    position_y: 1,
    width: 6,
    height: 4,
    show_header: false,
    options: {
      collection,
      field: viewsField,
      sortField: "date_created",
      function: "countDistinct",
      filter,
    },
  });

  const panelLineChart = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "line-chart",
    position_x: 1,
    position_y: 8,
    width: 12,
    height: 6,
    show_header: false,
    options: {
      collection,
      xAxis: "date_created",
      yAxis: viewsField,
      grouping: statusField,
      aggregation: "count",
      filter,
    },
  });

  const panelBarChart = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "bar-chart",
    position_x: 14,
    position_y: 8,
    width: 12,
    height: 6,
    show_header: false,
    options: { collection, xAxis: statusField, yAxis: viewsField, filter },
  });

  const panelTimeSeries = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "time-series",
    position_x: 1,
    position_y: 15,
    width: 12,
    height: 6,
    show_header: false,
    options: {
      collection,
      dateField: "date_created",
      valueField: viewsField,
      filter,
    },
  });

  const panelPieChart = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "pie-chart",
    position_x: 14,
    position_y: 15,
    width: 10,
    height: 6,
    show_header: false,
    options: { collection, column: viewsField, donut: true, filter },
  });

  const panelRelationalVariable = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "relational-variable",
    position_x: 25,
    position_y: 8,
    width: 12,
    height: 6,
    show_header: false,
    options: {
      collection,
      field: viewsField,
      displayTemplate: `{{${statusField}}} - {{${titleField}}} - {{${authorField}.email}}`,
      filter,
    },
  });

  const panelVariable = await post<{ id: string }>("/panels", {
    dashboard: dashboard.id,
    type: "variable",
    position_x: 25,
    position_y: 15,
    width: 12,
    height: 6,
    show_header: false,
    options: { field: viewsField, type: "string", inter: "input" },
  });

  // ── Share ──
  const share = await post<{ id: string }>("/shares", {
    name: `share_${collection}`,
    collection,
    item: itemId,
    max_uses: 50,
  });

  // ── Comment ──
  const comment = await post<{ id: string }>("/comments", {
    collection,
    item: itemId,
    comment: "Test comment for rename testing",
  });

  return {
    collection,
    targetCollection,
    nestedCollection,
    tagsCollection,
    junctionCollection,
    textBlocksCollection,
    imageBlocksCollection,
    pageBuilderCollection,
    m2aJunctionCollection,
    folderCollection,
    o2mAliasField: "children",
    m2aAliasField: "blocks",
    titleField,
    slugField,
    viewsField,
    statusField,
    authorField,
    flowIds: [flow1.id, flow2.id, flow3.id, flow4.id],
    operationIds: {
      readWithFields: opReadWithFields.id,
      readSimple: opReadSimple.id,
      deleteWithFilter: opDeleteWithFilter.id,
      updateWithPayload: opUpdateWithPayload.id,
    },
    presetId: preset.id,
    permissionId: permission.id,
    policyId: policy.id,
    dashboardId: dashboard.id,
    panelIds: {
      list: panelList.id,
      meter: panelMeter.id,
      metric: panelMetric.id,
      lineChart: panelLineChart.id,
      barChart: panelBarChart.id,
      timeSeries: panelTimeSeries.id,
      pieChart: panelPieChart.id,
      relationalVariable: panelRelationalVariable.id,
      variable: panelVariable.id,
    },
    shareId: share.id,
    commentId: comment.id,
    itemId,
  };
}

// ─────────────────────────────────────────────
// Cleanup
// ─────────────────────────────────────────────

export async function cleanupAll(s: SeedResult): Promise<void> {
  await safeDelete(`/shares/${s.shareId}`);
  await safeDelete(`/comments/${s.commentId}`);
  await safeDelete(`/presets/${s.presetId}`);
  await safeDelete(`/permissions/${s.permissionId}`);
  await safeDelete(`/policies/${s.policyId}`);
  await safeDelete(`/dashboards/${s.dashboardId}`);
  for (const id of s.flowIds) await safeDelete(`/flows/${id}`);
  await safeDelete(`/collections/${s.nestedCollection}`);
  await safeDelete(`/collections/${s.junctionCollection}`);
  await safeDelete(`/collections/${s.m2aJunctionCollection}`);
  // Try both source and target in case rename succeeded
  await safeDelete(`/collections/${s.targetCollection}`);
  await safeDelete(`/collections/${s.collection}`);
  await safeDelete(`/collections/${s.tagsCollection}`);
  await safeDelete(`/collections/${s.textBlocksCollection}`);
  await safeDelete(`/collections/${s.imageBlocksCollection}`);
  await safeDelete(`/collections/${s.pageBuilderCollection}`);
  await safeDelete(`/collections/${s.folderCollection}`);
}

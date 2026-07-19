import type { EndpointExtensionContext } from "@directus/types/dist/extensions";
import type {
  ImpactAnalysisResult,
  ImpactCategory,
  ImpactChange,
  ImpactDependency,
  ImpactOwnerType,
  ImpactSeverity,
  TableImpact,
} from "../types";
import { findRenameMatchesInJson } from "../utils/rename-field-in-json.util";

type LooseRecord = Record<string, any>;

const CATEGORY_LABELS: Record<ImpactCategory, string> = {
  schema: "Schema",
  relationship: "Relations",
  interface: "Field Interface",
  display: "Display",
  filter: "Filters & Validation",
  permission: "Permissions",
  preset: "Presets",
  automation: "Flows & Operations",
  dashboard: "Dashboards & Panels",
  content: "Content & Activity",
};

function parseJson(raw: unknown): LooseRecord | unknown[] | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as LooseRecord | unknown[];
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw as LooseRecord | unknown[];
  }
  return null;
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function relationScope(
  primaryCollection: string,
  ownerCollection?: string,
): "direct" | "related" {
  return ownerCollection && ownerCollection !== primaryCollection ? "related" : "direct";
}

function relationLabel(row: LooseRecord): string {
  const many = row.many_collection
    ? `${row.many_collection}${row.many_field ? `.${row.many_field}` : ""}`
    : "unknown";
  const one = row.one_collection
    ? `${row.one_collection}${row.one_field ? `.${row.one_field}` : ""}`
    : "unknown";
  return `${many} -> ${one}`;
}

function createAccumulator(primaryCollection: string) {
  const dependencies: ImpactDependency[] = [];
  const changes: ImpactChange[] = [];
  const dependencyKeys = new Set<string>();
  const changeKeys = new Set<string>();

  function addDependency(input: {
    category: ImpactCategory;
    severity?: ImpactSeverity;
    table: string;
    column: string;
    path?: string;
    ownerType: ImpactOwnerType;
    ownerId: string | number;
    ownerLabel: string;
    collection?: string;
    field?: string;
    relatedCollection?: string;
    relatedField?: string;
    summary: string;
    currentValue: string;
    nextValue: string;
  }) {
    const key = [
      input.table,
      input.column,
      input.path ?? "",
      input.ownerType,
      input.ownerId,
      input.ownerLabel,
      input.currentValue,
      input.nextValue,
    ].join("|");

    if (dependencyKeys.has(key)) return;
    dependencyKeys.add(key);

    dependencies.push({
      key,
      category: input.category,
      severity: input.severity ?? "medium",
      scope: relationScope(primaryCollection, input.collection),
      table: input.table,
      column: input.column,
      path: input.path,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ownerLabel: input.ownerLabel,
      collection: input.collection,
      field: input.field,
      relatedCollection: input.relatedCollection,
      relatedField: input.relatedField,
      summary: input.summary,
      currentValue: input.currentValue,
      nextValue: input.nextValue,
    });
  }

  function addChange(input: ImpactChange) {
    const key = [
      input.table,
      input.column,
      input.id,
      input.oldValue,
      input.newValue,
      input.path ?? "",
    ].join("|");

    if (changeKeys.has(key)) return;
    changeKeys.add(key);
    changes.push(input);
  }

  function addCombined(input: {
    category: ImpactCategory;
    severity?: ImpactSeverity;
    table: string;
    column: string;
    path?: string;
    ownerType: ImpactOwnerType;
    ownerId: string | number;
    ownerLabel: string;
    collection?: string;
    field?: string;
    relatedCollection?: string;
    relatedField?: string;
    summary: string;
    currentValue: string;
    nextValue: string;
    changeId?: string | number;
    changeOldValue?: string;
    changeNewValue?: string;
  }) {
    addDependency(input);
    addChange({
      table: input.table,
      column: input.column,
      id: input.changeId ?? input.ownerId,
      oldValue: input.changeOldValue ?? input.currentValue,
      newValue: input.changeNewValue ?? input.nextValue,
      path: input.path,
    });
  }

  return { dependencies, changes, addDependency, addChange, addCombined };
}

function finalizeResult(
  type: "collection" | "field",
  sourceName: string,
  targetName: string,
  dependencies: ImpactDependency[],
  changes: ImpactChange[],
): ImpactAnalysisResult {
  const tableMap = new Map<string, TableImpact>();

  for (const change of changes) {
    const existing = tableMap.get(change.table);
    if (existing) {
      existing.changes.push(change);
    } else {
      tableMap.set(change.table, {
        table: change.table,
        affectedRows: 0,
        changes: [change],
      });
    }
  }

  const tables = [...tableMap.values()].map((table) => {
    table.affectedRows = new Set(table.changes.map((change) => String(change.id))).size;
    return table;
  });

  const summary = {
    totalDependencies: dependencies.length,
    totalOwners: new Set(dependencies.map((item) => `${item.ownerType}:${item.ownerId}`)).size,
    totalTables: tables.length,
    directDependencies: dependencies.filter((item) => item.scope === "direct").length,
    relatedDependencies: dependencies.filter((item) => item.scope === "related").length,
    categories: Object.entries(CATEGORY_LABELS)
      .map(([category, label]) => ({
        category: category as ImpactCategory,
        label,
        count: dependencies.filter((item) => item.category === category).length,
      }))
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count),
  };

  return {
    type,
    sourceName,
    targetName,
    totalChanges: tables.reduce((sum, table) => sum + table.affectedRows, 0),
    dependencies,
    summary,
    tables,
  };
}

function addJsonMatches(
  accumulator: ReturnType<typeof createAccumulator>,
  input: {
    primaryCollection: string;
    ownerType: ImpactOwnerType;
    ownerId: string | number;
    ownerLabel: string;
    ownerCollection?: string;
    ownerField?: string;
    table: string;
    column: string;
    category: ImpactCategory;
    severity?: ImpactSeverity;
    summaryPrefix: string;
    value: unknown;
    oldName: string;
    newName: string;
  },
) {
  const parsed = parseJson(input.value);
  if (!parsed) return;

  const matches = findRenameMatchesInJson(parsed, input.oldName, input.newName);
  for (const match of matches) {
    accumulator.addCombined({
      category: input.category,
      severity: input.severity,
      table: input.table,
      column: input.column,
      path: match.path,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ownerLabel: input.ownerLabel,
      collection: input.ownerCollection,
      field: input.ownerField,
      summary: `${input.summaryPrefix} in ${input.ownerLabel} at ${match.path}`,
      currentValue: match.currentValue,
      nextValue: match.nextValue,
    });
  }
}

export async function analyzeCollectionRename(
  collection: string,
  newName: string,
  context: EndpointExtensionContext,
): Promise<ImpactAnalysisResult> {
  const { database } = context;
  const accumulator = createAccumulator(collection);

  const collectionRows = await database("directus_collections")
    .where({ collection })
    .select("collection");
  for (const row of collectionRows) {
    accumulator.addCombined({
      category: "schema",
      severity: "high",
      table: "directus_collections",
      column: "collection",
      ownerType: "collection",
      ownerId: row.collection,
      ownerLabel: row.collection,
      collection: row.collection,
      summary: `Collection ${row.collection} will be renamed in Directus metadata`,
      currentValue: row.collection,
      nextValue: newName,
    });
  }

  const groupedRows = await database("directus_collections")
    .where({ group: collection })
    .select("collection", "group");
  for (const row of groupedRows) {
    accumulator.addCombined({
      category: "schema",
      severity: "medium",
      table: "directus_collections",
      column: "group",
      ownerType: "collection",
      ownerId: row.collection,
      ownerLabel: row.collection,
      collection: row.collection,
      relatedCollection: row.collection,
      summary: `Collection ${row.collection} is grouped under ${collection}`,
      currentValue: row.group,
      nextValue: newName,
    });
  }

  const fieldRows = await database("directus_fields")
    .where({ collection })
    .select("id", "collection", "field");
  for (const row of fieldRows) {
    accumulator.addCombined({
      category: "schema",
      severity: "high",
      table: "directus_fields",
      column: "collection",
      ownerType: "field",
      ownerId: row.id,
      ownerLabel: `${row.collection}.${row.field}`,
      collection: row.collection,
      field: row.field,
      summary: `Field ${row.collection}.${row.field} belongs to the collection being renamed`,
      currentValue: row.collection,
      nextValue: newName,
    });
  }

  const contentTables = [
    "directus_comments",
    "directus_notifications",
    "directus_activity",
    "directus_permissions",
    "directus_presets",
    "directus_shares",
    "directus_versions",
  ] as const;

  for (const table of contentTables) {
    const rows = await database(table).where({ collection }).select("id", "collection");
    for (const row of rows) {
      accumulator.addCombined({
        category:
          table === "directus_permissions"
            ? "permission"
            : table === "directus_presets"
              ? "preset"
              : "content",
        severity: table === "directus_permissions" ? "high" : "medium",
        table,
        column: "collection",
        ownerType:
          table === "directus_permissions"
            ? "permission"
            : table === "directus_presets"
              ? "preset"
              : "record",
        ownerId: row.id,
        ownerLabel: `${table}#${row.id}`,
        collection,
        summary: `${table} record ${row.id} references collection ${collection}`,
        currentValue: row.collection,
        nextValue: newName,
      });
    }
  }

  const revisionCollectionRows = await database("directus_revisions")
    .where({ collection })
    .select("id", "collection");
  for (const row of revisionCollectionRows) {
    accumulator.addCombined({
      category: "content",
      table: "directus_revisions",
      column: "collection",
      ownerType: "record",
      ownerId: row.id,
      ownerLabel: `directus_revisions#${row.id}`,
      collection,
      summary: `Revision ${row.id} stores the collection name`,
      currentValue: row.collection,
      nextValue: newName,
    });
  }

  const revisionItemRows = await database("directus_revisions")
    .where({ item: collection })
    .select("id", "item");
  for (const row of revisionItemRows) {
    accumulator.addCombined({
      category: "content",
      table: "directus_revisions",
      column: "item",
      ownerType: "record",
      ownerId: row.id,
      ownerLabel: `directus_revisions#${row.id}`,
      collection,
      summary: `Revision ${row.id} stores ${collection} as an item identifier`,
      currentValue: row.item,
      nextValue: newName,
    });
  }

  const relations = await database("directus_relations")
    .where({ many_collection: collection })
    .orWhere({ one_collection: collection })
    .select(
      "id",
      "many_collection",
      "many_field",
      "one_collection",
      "one_field",
      "one_allowed_collections",
    );

  for (const row of relations) {
    const ownerLabel = relationLabel(row);
    if (row.many_collection === collection) {
      accumulator.addCombined({
        category: "relationship",
        severity: "high",
        table: "directus_relations",
        column: "many_collection",
        ownerType: "relation",
        ownerId: row.id,
        ownerLabel,
        collection: row.many_collection,
        relatedCollection: row.one_collection,
        relatedField: row.one_field,
        summary: `Relation ${ownerLabel} points to the renamed collection on the many side`,
        currentValue: row.many_collection,
        nextValue: newName,
      });
    }
    if (row.one_collection === collection) {
      accumulator.addCombined({
        category: "relationship",
        severity: "high",
        table: "directus_relations",
        column: "one_collection",
        ownerType: "relation",
        ownerId: row.id,
        ownerLabel,
        collection: row.one_collection,
        relatedCollection: row.many_collection,
        relatedField: row.many_field,
        summary: `Relation ${ownerLabel} points to the renamed collection on the one side`,
        currentValue: row.one_collection,
        nextValue: newName,
      });
    }

    const allowedCollections = typeof row.one_allowed_collections === "string"
      ? row.one_allowed_collections.split(",").map((entry: string) => entry.trim()).filter(Boolean)
      : Array.isArray(row.one_allowed_collections)
        ? row.one_allowed_collections
        : [];
    if (allowedCollections.includes(collection)) {
      accumulator.addCombined({
        category: "relationship",
        severity: "high",
        table: "directus_relations",
        column: "one_allowed_collections",
        ownerType: "relation",
        ownerId: row.id,
        ownerLabel,
        collection: row.one_collection ?? row.many_collection,
        relatedCollection: row.many_collection === collection ? row.one_collection : row.many_collection,
        summary: `M2A relation ${ownerLabel} allows ${collection} as a target collection`,
        currentValue: collection,
        nextValue: newName,
      });
    }
  }

  const operations = await database("directus_operations")
    .whereNotNull("options")
    .select("id", "name", "options");
  for (const row of operations) {
    const options = parseJson(row.options);
    if (!options) continue;
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "operation",
      ownerId: row.id,
      ownerLabel: row.name || `Operation ${row.id}`,
      table: "directus_operations",
      column: "options",
      category: "automation",
      severity: "medium",
      summaryPrefix: `Operation ${row.name || row.id} references the renamed collection`,
      value: options,
      oldName: collection,
      newName,
    });
  }

  const flows = await database("directus_flows")
    .whereNotNull("options")
    .select("id", "name", "options");
  for (const row of flows) {
    const options = parseJson(row.options);
    if (!options) continue;
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "flow",
      ownerId: row.id,
      ownerLabel: row.name || `Flow ${row.id}`,
      table: "directus_flows",
      column: "options",
      category: "automation",
      severity: "medium",
      summaryPrefix: `Flow ${row.name || row.id} references the renamed collection`,
      value: options,
      oldName: collection,
      newName,
    });
  }

  const panels = await database("directus_panels")
    .whereNotNull("options")
    .select("id", "name", "options");
  for (const row of panels) {
    const options = parseJson(row.options);
    if (!options) continue;
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "panel",
      ownerId: row.id,
      ownerLabel: row.name || `Panel ${row.id}`,
      table: "directus_panels",
      column: "options",
      category: "dashboard",
      severity: "medium",
      summaryPrefix: `Panel ${row.name || row.id} references the renamed collection`,
      value: options,
      oldName: collection,
      newName,
    });
  }

  const tableExists = await database.schema.hasTable(collection);
  if (tableExists) {
    accumulator.addCombined({
      category: "schema",
      severity: "high",
      table: "database_table",
      column: "table_name",
      ownerType: "database",
      ownerId: collection,
      ownerLabel: collection,
      collection,
      summary: `Physical database table ${collection} will be renamed`,
      currentValue: collection,
      nextValue: newName,
    });
  }

  return finalizeResult(
    "collection",
    collection,
    newName,
    accumulator.dependencies,
    accumulator.changes,
  );
}

export async function analyzeFieldRename(
  collection: string,
  field: string,
  newName: string,
  context: EndpointExtensionContext,
): Promise<ImpactAnalysisResult> {
  const { database } = context;
  const accumulator = createAccumulator(collection);

  const fieldRows = await database("directus_fields")
    .where({ collection, field })
    .select("id", "field");
  for (const row of fieldRows) {
    accumulator.addCombined({
      category: "schema",
      severity: "high",
      table: "directus_fields",
      column: "field",
      ownerType: "field",
      ownerId: row.id,
      ownerLabel: `${collection}.${field}`,
      collection,
      field,
      summary: `Field ${collection}.${field} will be renamed in schema metadata`,
      currentValue: row.field,
      nextValue: newName,
    });
  }

  const groupRows = await database("directus_fields")
    .where({ collection, group: field })
    .select("id", "field", "group");
  for (const row of groupRows) {
    accumulator.addCombined({
      category: "interface",
      table: "directus_fields",
      column: "group",
      ownerType: "field",
      ownerId: row.id,
      ownerLabel: `${collection}.${row.field}`,
      collection,
      field: row.field,
      relatedField: field,
      summary: `Field ${collection}.${row.field} is grouped under ${field}`,
      currentValue: row.group,
      nextValue: newName,
    });
  }

  const collectionMetaRows = await database("directus_collections")
    .where({ collection })
    .select(
      "collection",
      "archive_field",
      "sort_field",
      "display_template",
      "item_duplication_fields",
    );
  for (const row of collectionMetaRows) {
    if (row.archive_field === field) {
      accumulator.addCombined({
        category: "display",
        severity: "high",
        table: "directus_collections",
        column: "archive_field",
        ownerType: "collection",
        ownerId: row.collection,
        ownerLabel: row.collection,
        collection,
        summary: `Collection ${row.collection} uses ${field} as its archive field`,
        currentValue: row.archive_field,
        nextValue: newName,
      });
    }
    if (row.sort_field === field) {
      accumulator.addCombined({
        category: "display",
        severity: "medium",
        table: "directus_collections",
        column: "sort_field",
        ownerType: "collection",
        ownerId: row.collection,
        ownerLabel: row.collection,
        collection,
        summary: `Collection ${row.collection} sorts items by ${field}`,
        currentValue: row.sort_field,
        nextValue: newName,
      });
    }
    if (typeof row.display_template === "string" && row.display_template.includes(field)) {
      addJsonMatches(accumulator, {
        primaryCollection: collection,
        ownerType: "collection",
        ownerId: row.collection,
        ownerLabel: row.collection,
        ownerCollection: collection,
        table: "directus_collections",
        column: "display_template",
        category: "display",
        severity: "medium",
        summaryPrefix: `Collection ${row.collection} display template references ${field}`,
        value: row.display_template,
        oldName: field,
        newName,
      });
    }
    const duplicationFields = parseJson(row.item_duplication_fields);
    if (duplicationFields) {
      addJsonMatches(accumulator, {
        primaryCollection: collection,
        ownerType: "collection",
        ownerId: row.collection,
        ownerLabel: row.collection,
        ownerCollection: collection,
        table: "directus_collections",
        column: "item_duplication_fields",
        category: "display",
        severity: "low",
        summaryPrefix: `Collection ${row.collection} duplicates ${field} when cloning items`,
        value: duplicationFields,
        oldName: field,
        newName,
      });
    }
  }

  const relationRows = await database("directus_relations")
    .where({ one_collection: collection })
    .orWhere({ many_collection: collection })
    .select(
      "id",
      "many_collection",
      "many_field",
      "one_collection",
      "one_field",
      "one_collection_field",
      "junction_field",
      "sort_field",
    );

  for (const row of relationRows) {
    const ownerLabel = relationLabel(row);
    const candidates: Array<{ column: string; value: string | null | undefined; ownerCollection?: string; relatedCollection?: string; relatedField?: string }> = [
      {
        column: "many_field",
        value: row.many_field,
        ownerCollection: row.many_collection,
        relatedCollection: row.one_collection,
        relatedField: row.one_field,
      },
      {
        column: "one_field",
        value: row.one_field,
        ownerCollection: row.one_collection,
        relatedCollection: row.many_collection,
        relatedField: row.many_field,
      },
      {
        column: "one_collection_field",
        value: row.one_collection_field,
        ownerCollection: row.one_collection,
        relatedCollection: row.many_collection,
      },
      {
        column: "junction_field",
        value: row.junction_field,
        ownerCollection: row.many_collection,
        relatedCollection: row.one_collection,
      },
      {
        column: "sort_field",
        value: row.sort_field,
        ownerCollection: row.many_collection,
        relatedCollection: row.one_collection,
      },
    ];

    for (const candidate of candidates) {
      if (candidate.value !== field) continue;
      accumulator.addCombined({
        category: "relationship",
        severity: "high",
        table: "directus_relations",
        column: candidate.column,
        ownerType: "relation",
        ownerId: row.id,
        ownerLabel,
        collection: candidate.ownerCollection,
        field: candidate.value,
        relatedCollection: candidate.relatedCollection,
        relatedField: candidate.relatedField,
        summary: `Relation ${ownerLabel} depends on field ${field} via ${candidate.column}`,
        currentValue: candidate.value,
        nextValue: newName,
      });
    }
  }

  const relatedCollections = new Set<string>([collection]);
  relationRows.forEach((row) => {
    if (row.many_collection) relatedCollections.add(row.many_collection);
    if (row.one_collection) relatedCollections.add(row.one_collection);
  });

  const fieldJsonRows = await database("directus_fields")
    .whereIn("collection", [...relatedCollections])
    .select(
      "id",
      "collection",
      "field",
      "options",
      "display_options",
      "conditions",
      "validation",
    );

  for (const row of fieldJsonRows) {
    const ownerLabel = `${row.collection}.${row.field}`;
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "field",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      ownerField: row.field,
      table: "directus_fields",
      column: "options",
      category: "interface",
      summaryPrefix: `Field options for ${ownerLabel} reference ${field}`,
      value: row.options,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "field",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      ownerField: row.field,
      table: "directus_fields",
      column: "display_options",
      category: "display",
      summaryPrefix: `Display options for ${ownerLabel} reference ${field}`,
      value: row.display_options,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "field",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      ownerField: row.field,
      table: "directus_fields",
      column: "conditions",
      category: "filter",
      severity: "high",
      summaryPrefix: `Conditional logic for ${ownerLabel} references ${field}`,
      value: row.conditions,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "field",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      ownerField: row.field,
      table: "directus_fields",
      column: "validation",
      category: "filter",
      severity: "high",
      summaryPrefix: `Validation rules for ${ownerLabel} reference ${field}`,
      value: row.validation,
      oldName: field,
      newName,
    });
  }

  const permissionRows = await database("directus_permissions")
    .whereIn("collection", [...relatedCollections])
    .select("id", "collection", "fields", "permissions", "validation", "presets");
  for (const row of permissionRows) {
    const ownerLabel = `${row.collection} permission ${row.id}`;
    if (typeof row.fields === "string") {
      const csvFields = row.fields.split(",").map((entry: string) => entry.trim());
      if (csvFields.includes(field)) {
        accumulator.addCombined({
          category: "permission",
          severity: "high",
          table: "directus_permissions",
          column: "fields",
          ownerType: "permission",
          ownerId: row.id,
          ownerLabel,
          collection: row.collection,
          relatedField: field,
          summary: `${ownerLabel} explicitly allows field ${field}`,
          currentValue: field,
          nextValue: newName,
        });
      }
    }

    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "permission",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      table: "directus_permissions",
      column: "permissions",
      category: "permission",
      severity: "high",
      summaryPrefix: `${ownerLabel} filter rules reference ${field}`,
      value: row.permissions,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "permission",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      table: "directus_permissions",
      column: "validation",
      category: "permission",
      severity: "high",
      summaryPrefix: `${ownerLabel} validation rules reference ${field}`,
      value: row.validation,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "permission",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      table: "directus_permissions",
      column: "presets",
      category: "permission",
      summaryPrefix: `${ownerLabel} preset values reference ${field}`,
      value: row.presets,
      oldName: field,
      newName,
    });
  }

  const presetRows = await database("directus_presets")
    .whereIn("collection", [...relatedCollections])
    .select("id", "collection", "layout_query", "layout_options", "filter");
  for (const row of presetRows) {
    const ownerLabel = `${row.collection} preset ${row.id}`;
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "preset",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      table: "directus_presets",
      column: "layout_query",
      category: "preset",
      summaryPrefix: `${ownerLabel} layout query references ${field}`,
      value: row.layout_query,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "preset",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      table: "directus_presets",
      column: "layout_options",
      category: "preset",
      summaryPrefix: `${ownerLabel} layout options reference ${field}`,
      value: row.layout_options,
      oldName: field,
      newName,
    });
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "preset",
      ownerId: row.id,
      ownerLabel,
      ownerCollection: row.collection,
      table: "directus_presets",
      column: "filter",
      category: "filter",
      severity: "high",
      summaryPrefix: `${ownerLabel} saved filters reference ${field}`,
      value: row.filter,
      oldName: field,
      newName,
    });
  }

  const operations = await database("directus_operations")
    .whereNotNull("options")
    .select("id", "name", "options");
  for (const row of operations) {
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "operation",
      ownerId: row.id,
      ownerLabel: row.name || `Operation ${row.id}`,
      table: "directus_operations",
      column: "options",
      category: "automation",
      summaryPrefix: `Operation ${row.name || row.id} references ${field}`,
      value: row.options,
      oldName: field,
      newName,
    });
  }

  const flows = await database("directus_flows")
    .whereNotNull("options")
    .select("id", "name", "options");
  for (const row of flows) {
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "flow",
      ownerId: row.id,
      ownerLabel: row.name || `Flow ${row.id}`,
      table: "directus_flows",
      column: "options",
      category: "automation",
      summaryPrefix: `Flow ${row.name || row.id} references ${field}`,
      value: row.options,
      oldName: field,
      newName,
    });
  }

  const panels = await database("directus_panels")
    .whereNotNull("options")
    .select("id", "name", "options");
  for (const row of panels) {
    addJsonMatches(accumulator, {
      primaryCollection: collection,
      ownerType: "panel",
      ownerId: row.id,
      ownerLabel: row.name || `Panel ${row.id}`,
      table: "directus_panels",
      column: "options",
      category: "dashboard",
      summaryPrefix: `Panel ${row.name || row.id} references ${field}`,
      value: row.options,
      oldName: field,
      newName,
    });
  }

  const columnExists = await database.schema.hasColumn(collection, field);
  if (columnExists) {
    accumulator.addCombined({
      category: "schema",
      severity: "high",
      table: "database_column",
      column: collection,
      ownerType: "database",
      ownerId: `${collection}.${field}`,
      ownerLabel: `${collection}.${field}`,
      collection,
      field,
      summary: `Physical database column ${collection}.${field} will be renamed`,
      currentValue: field,
      nextValue: newName,
    });
  }

  return finalizeResult(
    "field",
    field,
    newName,
    accumulator.dependencies,
    accumulator.changes,
  );
}

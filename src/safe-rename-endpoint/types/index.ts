import { Accountability } from "@directus/types/dist/accountability";
import { EndpointExtensionContext } from "@directus/types/dist/extensions";
import type { Request as _Request, Router } from "express";

export type EndpointConfigFunction = (
  router: Router,
  context: EndpointExtensionContext,
) => void;

export interface Request<T> extends _Request {
  accountability?: Accountability;
  body: T;
}

export type RenameCollectionRequest = {
  sourceCollection: string;
  targetCollection: string;
};

export interface RenameFieldRequest {
  collection: string;
  fields: {
    sourceField: string;
    targetField: string;
  }[];
}

// ─────────────────────────────────────────────
// Impact Analysis Types
// ─────────────────────────────────────────────

export interface ImpactChange {
  /** The table where the change occurs */
  table: string;
  /** The column/field being changed */
  column: string;
  /** The row identifier */
  id: string | number;
  /** The current value */
  oldValue: string;
  /** The value after rename */
  newValue: string;
  /** Optional JSON path or nested location */
  path?: string;
}

export interface TableImpact {
  /** Table name */
  table: string;
  /** Number of rows that will be affected */
  affectedRows: number;
  /** Detailed changes per row */
  changes: ImpactChange[];
}

export type ImpactCategory =
  | "schema"
  | "relationship"
  | "interface"
  | "display"
  | "filter"
  | "permission"
  | "preset"
  | "automation"
  | "dashboard"
  | "content";

export type ImpactSeverity = "low" | "medium" | "high";

export type ImpactOwnerType =
  | "collection"
  | "field"
  | "relation"
  | "permission"
  | "preset"
  | "flow"
  | "operation"
  | "panel"
  | "record"
  | "database";

export interface ImpactDependency {
  /** Stable key for rendering */
  key: string;
  /** High-level bucket for charts and grouping */
  category: ImpactCategory;
  /** Relative importance of the dependency */
  severity: ImpactSeverity;
  /** Direct reference or related-collection reference */
  scope: "direct" | "related";
  /** Table where the dependency lives */
  table: string;
  /** Column or JSON field where the dependency lives */
  column: string;
  /** Optional nested path for JSON documents */
  path?: string;
  /** Human-friendly owner */
  ownerType: ImpactOwnerType;
  ownerId: string | number;
  ownerLabel: string;
  /** The collection that owns the dependency when applicable */
  collection?: string;
  /** The specific field that owns the dependency when applicable */
  field?: string;
  /** The related collection or field that is indirectly impacted */
  relatedCollection?: string;
  relatedField?: string;
  /** User-facing explanation */
  summary: string;
  /** Current referenced value */
  currentValue: string;
  /** Rewritten value */
  nextValue: string;
}

export interface ImpactCategorySummary {
  category: ImpactCategory;
  label: string;
  count: number;
}

export interface ImpactSummary {
  totalDependencies: number;
  totalOwners: number;
  totalTables: number;
  directDependencies: number;
  relatedDependencies: number;
  categories: ImpactCategorySummary[];
}

export interface ImpactAnalysisResult {
  /** Type of rename operation */
  type: "collection" | "field";
  /** The source name being renamed */
  sourceName: string;
  /** The target name */
  targetName: string;
  /** Total number of affected rows across all tables */
  totalChanges: number;
  /** Semantic dependency graph for UI review */
  dependencies: ImpactDependency[];
  /** Aggregated summary for dashboards/charts */
  summary: ImpactSummary;
  /** List of affected tables and their changes */
  tables: TableImpact[];
}

export interface ImpactAnalysisRequest {
  /** What is being renamed: collection or field */
  type: "collection" | "field";
  /** Collection name (required for both types) */
  collection: string;
  /** For field rename: the field name. For collection rename: same as collection */
  field?: string;
  /** The new name */
  newName: string;
}

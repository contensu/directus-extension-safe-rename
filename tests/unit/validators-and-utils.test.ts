import { describe, it, expect } from "vitest";
import { validateDbSafeName } from "../../src/safe-rename-endpoint/validators/db-safe.validator";
import { validateRenameCollectionRequest } from "../../src/safe-rename-endpoint/validators/rename-collection.validator";
import { validateRenameFieldsRequest } from "../../src/safe-rename-endpoint/validators/rename-field.validator";
import { getFkCheckStatements } from "../../src/safe-rename-endpoint/utils/fk-checks.util";

// ─────────────────────────────────────────────
// validateDbSafeName
// ─────────────────────────────────────────────

describe("validateDbSafeName", () => {
  it("accepts lowercase letters", () => {
    expect(validateDbSafeName("articles")).toBe(true);
  });

  it("accepts letters with underscores and numbers", () => {
    expect(validateDbSafeName("my_collection_2")).toBe(true);
  });

  it("accepts uppercase letters", () => {
    expect(validateDbSafeName("MyCollection")).toBe(true);
  });

  it("rejects names starting with a number", () => {
    expect(validateDbSafeName("2articles")).toBe(false);
  });

  it("rejects names starting with underscore", () => {
    expect(validateDbSafeName("_articles")).toBe(false);
  });

  it("rejects names with hyphens", () => {
    expect(validateDbSafeName("my-collection")).toBe(false);
  });

  it("rejects names with spaces", () => {
    expect(validateDbSafeName("my collection")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateDbSafeName("")).toBe(false);
  });
});

// ─────────────────────────────────────────────
// validateRenameCollectionRequest
// ─────────────────────────────────────────────

describe("validateRenameCollectionRequest", () => {
  it("passes valid request", () => {
    const result = validateRenameCollectionRequest({
      sourceCollection: "articles",
      targetCollection: "posts",
    });
    expect(result).toEqual({
      sourceCollection: "articles",
      targetCollection: "posts",
    });
  });

  it("trims whitespace from names", () => {
    const result = validateRenameCollectionRequest({
      sourceCollection: "  articles  ",
      targetCollection: "  posts  ",
    });
    expect(result.sourceCollection).toBe("articles");
    expect(result.targetCollection).toBe("posts");
  });

  it("throws when sourceCollection is missing", () => {
    expect(() =>
      validateRenameCollectionRequest({
        sourceCollection: "",
        targetCollection: "posts",
      }),
    ).toThrow("sourceCollection and targetCollection are required");
  });

  it("throws when targetCollection is missing", () => {
    expect(() =>
      validateRenameCollectionRequest({
        sourceCollection: "articles",
        targetCollection: "",
      }),
    ).toThrow("sourceCollection and targetCollection are required");
  });

  it("throws when source is a system collection", () => {
    expect(() =>
      validateRenameCollectionRequest({
        sourceCollection: "directus_users",
        targetCollection: "posts",
      }),
    ).toThrow("System collections cannot be renamed");
  });

  it("throws when source and target are the same", () => {
    expect(() =>
      validateRenameCollectionRequest({
        sourceCollection: "articles",
        targetCollection: "articles",
      }),
    ).toThrow("Source and target collection cannot be the same");
  });

  it("throws when collection name has invalid characters", () => {
    expect(() =>
      validateRenameCollectionRequest({
        sourceCollection: "my-articles",
        targetCollection: "posts",
      }),
    ).toThrow("db-safe rules");
  });
});

// ─────────────────────────────────────────────
// validateRenameFieldsRequest
// ─────────────────────────────────────────────

describe("validateRenameFieldsRequest", () => {
  it("passes valid request", () => {
    const result = validateRenameFieldsRequest({
      collection: "articles",
      fields: [{ sourceField: "old_title", targetField: "title" }],
    });
    expect(result).toEqual({
      collection: "articles",
      fields: [{ sourceField: "old_title", targetField: "title" }],
    });
  });

  it("trims whitespace from field names", () => {
    const result = validateRenameFieldsRequest({
      collection: "articles",
      fields: [{ sourceField: "  old_title  ", targetField: "  title  " }],
    });
    expect(result.fields[0]).toEqual({
      sourceField: "old_title",
      targetField: "title",
    });
  });

  it("throws when collection is a system collection", () => {
    expect(() =>
      validateRenameFieldsRequest({
        collection: "directus_users",
        fields: [{ sourceField: "old", targetField: "new" }],
      }),
    ).toThrow("system collections");
  });

  it("throws when fields array is empty", () => {
    expect(() =>
      validateRenameFieldsRequest({
        collection: "articles",
        fields: [],
      }),
    ).toThrow("collection and fields are required");
  });

  it("throws when sourceField equals targetField", () => {
    expect(() =>
      validateRenameFieldsRequest({
        collection: "articles",
        fields: [{ sourceField: "title", targetField: "title" }],
      }),
    ).toThrow("Source and target field cannot be the same");
  });

  it("throws when field name has invalid chars", () => {
    expect(() =>
      validateRenameFieldsRequest({
        collection: "articles",
        fields: [{ sourceField: "old-field", targetField: "new_field" }],
      }),
    ).toThrow("db-safe rules");
  });

  it("accepts multiple fields in one request", () => {
    const result = validateRenameFieldsRequest({
      collection: "articles",
      fields: [
        { sourceField: "old_title", targetField: "title" },
        { sourceField: "old_body", targetField: "body" },
      ],
    });
    expect(result.fields).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────
// getFkCheckStatements
// ─────────────────────────────────────────────

describe("getFkCheckStatements", () => {
  it("returns correct SQL for postgres", () => {
    const { disable, enable } = getFkCheckStatements("pg");
    expect(disable).toBe(`SET session_replication_role = 'replica'`);
    expect(enable).toBe(`SET session_replication_role = 'origin'`);
  });

  it("returns correct SQL for postgresql alias", () => {
    const { disable, enable } = getFkCheckStatements("postgresql");
    expect(disable).toContain("replica");
    expect(enable).toContain("origin");
  });

  it("returns correct SQL for mysql", () => {
    const { disable, enable } = getFkCheckStatements("mysql");
    expect(disable).toBe(`SET FOREIGN_KEY_CHECKS = 0`);
    expect(enable).toBe(`SET FOREIGN_KEY_CHECKS = 1`);
  });

  it("returns correct SQL for mysql2", () => {
    const { disable, enable } = getFkCheckStatements("mysql2");
    expect(disable).toBe(`SET FOREIGN_KEY_CHECKS = 0`);
    expect(enable).toBe(`SET FOREIGN_KEY_CHECKS = 1`);
  });

  it("returns null for sqlite3 (PRAGMA handled outside transaction)", () => {
    const { disable, enable } = getFkCheckStatements("sqlite3");
    expect(disable).toBeNull();
    expect(enable).toBeNull();
  });

  it("returns null for unknown client (cockroachdb)", () => {
    const { disable, enable } = getFkCheckStatements("cockroachdb");
    expect(disable).toBeNull();
    expect(enable).toBeNull();
  });

  it("returns null for oracle", () => {
    const { disable, enable } = getFkCheckStatements("oracledb");
    expect(disable).toBeNull();
    expect(enable).toBeNull();
  });
});

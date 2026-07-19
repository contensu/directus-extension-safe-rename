/**
 * Unit tests: validators and utils for impact analysis
 */

import { describe, it, expect } from "vitest";
import { validateImpactAnalysisRequest } from "../../src/safe-rename-endpoint/validators/impact-analysis.validator";
import {
  findRenameMatchesInJson,
  renameFieldInJson,
  renameFieldInString,
} from "../../src/safe-rename-endpoint/utils/rename-field-in-json.util";

describe("impact analysis validator", () => {
  it("accepts valid collection request", () => {
    const result = validateImpactAnalysisRequest({
      type: "collection" as const,
      collection: "articles",
      newName: "posts",
    });
    expect(result).toEqual({
      type: "collection",
      collection: "articles",
      field: undefined,
      newName: "posts",
    });
  });

  it("accepts valid field request", () => {
    const result = validateImpactAnalysisRequest({
      type: "field" as const,
      collection: "articles",
      field: "title",
      newName: "post_title",
    });
    expect(result).toEqual({
      type: "field",
      collection: "articles",
      field: "title",
      newName: "post_title",
    });
  });

  it("rejects missing type", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        collection: "articles",
        newName: "posts",
      }),
    ).toThrow("type must be 'collection' or 'field'");
  });

  it("rejects invalid type", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "invalid",
        collection: "articles",
        newName: "posts",
      }),
    ).toThrow("type must be 'collection' or 'field'");
  });

  it("rejects missing collection", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "collection",
        newName: "posts",
      }),
    ).toThrow("collection is required");
  });

  it("rejects missing newName", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "collection",
        collection: "articles",
      }),
    ).toThrow("newName is required");
  });

  it("rejects invalid newName (db-unsafe)", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "collection",
        collection: "articles",
        newName: "invalid-name!",
      }),
    ).toThrow("New name must follow db-safe rules");
  });

  it("rejects newName starting with number", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "collection",
        collection: "articles",
        newName: "2posts",
      }),
    ).toThrow("New name must follow db-safe rules");
  });

  it("rejects system collections", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "collection",
        collection: "directus_users",
        newName: "admin_users",
      }),
    ).toThrow("System collections cannot be renamed");
  });

  it("rejects same source and target name", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "collection",
        collection: "articles",
        newName: "articles",
      }),
    ).toThrow("Source name and target name cannot be the same");
  });

  it("rejects field type without field parameter", () => {
    expect(() =>
      validateImpactAnalysisRequest({
        type: "field",
        collection: "articles",
        newName: "new_title",
      }),
    ).toThrow("field is required for field-type impact analysis");
  });

  it("trims newName whitespace", () => {
    const result = validateImpactAnalysisRequest({
      type: "collection",
      collection: "articles",
      newName: "  posts  ",
    });
    expect(result.newName).toBe("posts");
  });
});

describe("renameFieldInJson utility", () => {
  it("renames field key in object", () => {
    const input = { title: "Hello", status: "draft" };
    const result = renameFieldInJson(input, "title", "post_title");
    expect(result).toHaveProperty("post_title", "Hello");
    expect(result).toHaveProperty("status", "draft");
    expect(result).not.toHaveProperty("title");
  });

  it("renames field in nested object", () => {
    const input = { meta: { title: "Hello" } };
    const result = renameFieldInJson(input, "title", "post_title");
    expect(result.meta).toHaveProperty("post_title", "Hello");
  });

  it("renames field in array items", () => {
    const input = [{ title: "Hello" }, { title: "World" }];
    const result = renameFieldInJson(input, "title", "post_title");
    expect(result[0]).toHaveProperty("post_title", "Hello");
    expect(result[1]).toHaveProperty("post_title", "World");
  });

  it("renames field values in strings", () => {
    const input = { template: "{{title}}-{{status}}" };
    const result = renameFieldInJson(input, "title", "post_title");
    expect(result.template).toBe("{{ post_title }}-{{ status }}");
  });

  it("handles null input", () => {
    expect(renameFieldInJson(null, "a", "b")).toBeNull();
  });

  it("handles undefined input", () => {
    const result = renameFieldInJson(undefined, "a", "b");
    expect(result).toBeUndefined();
  });

  it("returns unchanged object if field not found", () => {
    const input = { name: "test" };
    const result = renameFieldInJson(input, "title", "post_title");
    expect(result).toEqual(input);
  });

  it("handles deep nested structures", () => {
    const input = {
      level1: {
        level2: {
          level3: {
            title: "deep",
          },
        },
      },
    };
    const result = renameFieldInJson(input, "title", "post_title");
    expect(result.level1.level2.level3).toHaveProperty("post_title", "deep");
  });
});

describe("renameFieldInString utility", () => {
  it("renames field in template string", () => {
    const input = "{{title}} - {{status}}";
    const result = renameFieldInString(input, "title", "post_title");
    expect(result).toBe("{{ post_title }} - {{ status }}");
  });

  it("handles string without field reference", () => {
    const input = "Plain text";
    const result = renameFieldInString(input, "title", "post_title");
    expect(result).toBe("Plain text");
  });

  it("handles null input", () => {
    expect(renameFieldInString(null as any, "a", "b")).toBeNull();
  });

  it("renames field in dotted path", () => {
    const input = "{{author.title}} - something";
    const result = renameFieldInString(input, "title", "post_title");
    expect(result).toBe("{{ author.post_title }} - something");
  });

  it("renames field without brackets", () => {
    const input = "title: value";
    const result = renameFieldInString(input, "title", "post_title");
    expect(result).toBe("post_title: value");
  });
});

describe("findRenameMatchesInJson utility", () => {
  it("finds nested key and value matches with paths", () => {
    const input = {
      filter: {
        _and: [
          { title: { _eq: "Hello" } },
          { template: "{{title}}" },
        ],
      },
    };

    const result = findRenameMatchesInJson(input, "title", "post_title");

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "$.filter._and[0].title",
          kind: "key",
          currentValue: "title",
          nextValue: "post_title",
        }),
        expect.objectContaining({
          path: "$.filter._and[1].template",
          kind: "value",
          currentValue: "{{title}}",
          nextValue: "{{ post_title }}",
        }),
      ]),
    );
  });
});

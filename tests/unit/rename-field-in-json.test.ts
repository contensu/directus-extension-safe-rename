import { describe, it, expect } from "vitest";
import {
  renameFieldInJson,
  renameFieldInString,
} from "../../src/safe-rename-endpoint/utils/rename-field-in-json.util";

// ─────────────────────────────────────────────
// renameFieldInString
// ─────────────────────────────────────────────

describe("renameFieldInString", () => {
  it("renames exact string match", () => {
    expect(renameFieldInString("old_field", "old_field", "new_field")).toBe(
      "new_field",
    );
  });

  it("renames handlebars template", () => {
    expect(
      renameFieldInString("{{ old_field }}", "old_field", "new_field"),
    ).toBe("{{ new_field }}");
  });

  it("renames handlebars with relation prefix", () => {
    expect(
      renameFieldInString("{{ relation.old_field }}", "old_field", "new_field"),
    ).toBe("{{ relation.new_field }}");
  });

  it("renames dotted path string", () => {
    expect(
      renameFieldInString("relation.old_field", "old_field", "new_field"),
    ).toBe("relation.new_field");
  });

  it("does not rename unrelated string", () => {
    expect(renameFieldInString("title", "old_field", "new_field")).toBe(
      "title",
    );
  });

  it("case-insensitive fallback", () => {
    expect(renameFieldInString("Old_Field", "old_field", "new_field")).toBe(
      "new_field",
    );
  });

  it("does not rename partial match in dotted path", () => {
    // 'old_field_extra' should not become 'new_field_extra'
    expect(
      renameFieldInString("old_field_extra", "old_field", "new_field"),
    ).toBe("old_field_extra");
  });

  it("renames negated sort prefix: -old_field → -new_field", () => {
    expect(renameFieldInString("-old_field", "old_field", "new_field")).toBe(
      "-new_field",
    );
  });
});

// ─────────────────────────────────────────────
// renameFieldInJson — keys
// ─────────────────────────────────────────────

describe("renameFieldInJson — key renaming", () => {
  it("renames exact key", () => {
    expect(
      renameFieldInJson({ old_field: "value" }, "old_field", "new_field"),
    ).toEqual({ new_field: "value" });
  });

  it("does not rename unrelated key", () => {
    expect(
      renameFieldInJson({ title: "value" }, "old_field", "new_field"),
    ).toEqual({
      title: "value",
    });
  });

  it("does not rename partial key match", () => {
    expect(
      renameFieldInJson({ old_field_extra: 1 }, "old_field", "new_field"),
    ).toEqual({ old_field_extra: 1 });
  });

  it("renames dotted key — segment match", () => {
    expect(
      renameFieldInJson(
        { "relation.old_field": true },
        "old_field",
        "new_field",
      ),
    ).toEqual({ "relation.new_field": true });
  });

  it("renames item: prefixed key", () => {
    expect(
      renameFieldInJson({ "item:old_field": {} }, "old_field", "new_field"),
    ).toEqual({ "item:new_field": {} });
  });

  it("does not rename item: key with different name", () => {
    expect(
      renameFieldInJson({ "item:other_col": {} }, "old_field", "new_field"),
    ).toEqual({ "item:other_col": {} });
  });
});

// ─────────────────────────────────────────────
// renameFieldInJson — values
// ─────────────────────────────────────────────

describe("renameFieldInJson — value renaming", () => {
  it("renames exact string value", () => {
    expect(
      renameFieldInJson({ field: "old_field" }, "old_field", "new_field"),
    ).toEqual({ field: "new_field" });
  });

  it("does not rename unrelated string value", () => {
    expect(
      renameFieldInJson({ field: "title" }, "old_field", "new_field"),
    ).toEqual({ field: "title" });
  });

  it("renames string value in array including negated sort prefix", () => {
    expect(
      renameFieldInJson(
        { sort: ["old_field", "-old_field"] },
        "old_field",
        "new_field",
      ),
    ).toEqual({ sort: ["new_field", "-new_field"] });
  });
});

// ─────────────────────────────────────────────
// renameFieldInJson — recursion
// ─────────────────────────────────────────────

describe("renameFieldInJson — recursive structures", () => {
  it("renames inside nested object", () => {
    expect(
      renameFieldInJson(
        { _and: [{ old_field: { _eq: "foo" } }] },
        "old_field",
        "new_field",
      ),
    ).toEqual({ _and: [{ new_field: { _eq: "foo" } }] });
  });

  it("renames inside conditions array", () => {
    expect(
      renameFieldInJson(
        { conditions: [{ field: "old_field", value: "x" }] },
        "old_field",
        "new_field",
      ),
    ).toEqual({ conditions: [{ field: "new_field", value: "x" }] });
  });

  it("renames deeply nested filter", () => {
    const filter = {
      _and: [{ old_field: { _eq: "value" } }, { other_field: { _neq: "foo" } }],
    };
    expect(renameFieldInJson(filter, "old_field", "new_field")).toEqual({
      _and: [{ new_field: { _eq: "value" } }, { other_field: { _neq: "foo" } }],
    });
  });

  it("handles null values safely", () => {
    expect(renameFieldInJson(null, "old_field", "new_field")).toBeNull();
  });

  it("handles undefined values safely", () => {
    expect(
      renameFieldInJson(undefined, "old_field", "new_field"),
    ).toBeUndefined();
  });

  it("handles number values unchanged", () => {
    expect(renameFieldInJson(42, "old_field", "new_field")).toBe(42);
  });

  it("handles boolean values unchanged", () => {
    expect(renameFieldInJson(true, "old_field", "new_field")).toBe(true);
  });

  it("renames inside deeply nested array of objects", () => {
    const input = [
      { group: "old_field", conditions: [{ field: "old_field" }] },
    ];
    expect(renameFieldInJson(input, "old_field", "new_field")).toEqual([
      { group: "new_field", conditions: [{ field: "new_field" }] },
    ]);
  });
});

// ─────────────────────────────────────────────
// renameFieldInJson — real Directus structures
// ─────────────────────────────────────────────

describe("renameFieldInJson — real Directus data shapes", () => {
  it("renames field in directus_permissions permissions JSON", () => {
    const permissions = {
      _and: [{ old_field: { _submitted: true } }],
    };
    expect(renameFieldInJson(permissions, "old_field", "new_field")).toEqual({
      _and: [{ new_field: { _submitted: true } }],
    });
  });

  it("renames field in directus_presets layout_query", () => {
    const layoutQuery = {
      tabular: {
        fields: ["old_field", "title", "status"],
        sort: ["old_field"],
      },
    };
    expect(renameFieldInJson(layoutQuery, "old_field", "new_field")).toEqual({
      tabular: {
        fields: ["new_field", "title", "status"],
        sort: ["new_field"],
      },
    });
  });

  it("renames field in directus_presets filter", () => {
    const filter = { old_field: { _eq: "active" } };
    expect(renameFieldInJson(filter, "old_field", "new_field")).toEqual({
      new_field: { _eq: "active" },
    });
  });

  it("renames field in display_options with template string", () => {
    const displayOptions = { template: "{{ old_field }} - {{ title }}" };
    expect(renameFieldInJson(displayOptions, "old_field", "new_field")).toEqual(
      {
        template: "{{ new_field }} - {{ title }}",
      },
    );
  });

  it("renames field in M2A item: key structure", () => {
    const validation = {
      _and: [{ "item:old_field": { required_field: { _submitted: true } } }],
    };
    expect(renameFieldInJson(validation, "old_field", "new_field")).toEqual({
      _and: [{ "item:new_field": { required_field: { _submitted: true } } }],
    });
  });
});

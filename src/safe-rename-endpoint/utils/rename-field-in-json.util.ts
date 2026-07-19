export function renameFieldInJson(
  value: any,
  oldName: string,
  newName: string,
): any {
  // Arrays
  if (Array.isArray(value)) {
    return value.map((v) => renameFieldInJson(v, oldName, newName));
  }

  // Objects
  if (value !== null && typeof value === "object") {
    const result: Record<string, any> = {};

    for (const [rawKey, rawValue] of Object.entries(value)) {
      let newKey = rawKey;

      // 🔁 1. Rename KEYS (field names) - exact match
      if (rawKey === oldName) {
        newKey = newName;
      }

      // 🔁 1b. Rename dotted KEYS (relation.field.field)
      else if (rawKey.includes(".")) {
        newKey = rawKey
          .split(".")
          .map((part) => (part === oldName ? newName : part))
          .join(".");
      }

      // 🔁 2. Rename `item:collection` style keys
      if (rawKey.startsWith("item:")) {
        const collection = rawKey.slice(5);
        if (collection === oldName) {
          newKey = `item:${newName}`;
        }
      }

      result[newKey] = renameFieldInJson(rawValue, oldName, newName);
    }

    return result;
  }

  // 🔁 3. Rename STRING VALUES
  if (typeof value === "string") {
    return renameFieldInString(value, oldName, newName);
  }

  return value;
}

export interface RenameJsonMatch {
  path: string;
  kind: "key" | "value";
  currentValue: string;
  nextValue: string;
}

export function findRenameMatchesInJson(
  value: any,
  oldName: string,
  newName: string,
): RenameJsonMatch[] {
  const matches: RenameJsonMatch[] = [];

  function visit(node: any, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => {
        visit(entry, `${path}[${index}]`);
      });
      return;
    }

    if (node !== null && typeof node === "object") {
      for (const [rawKey, rawValue] of Object.entries(node)) {
        const keyReplacement = getReplacement(rawKey, oldName, newName);
        if (keyReplacement && keyReplacement !== rawKey) {
          matches.push({
            path: `${path}.${rawKey}`,
            kind: "key",
            currentValue: rawKey,
            nextValue: keyReplacement,
          });
        }

        visit(rawValue, `${path}.${rawKey}`);
      }
      return;
    }

    if (typeof node === "string") {
      const updated = renameFieldInString(node, oldName, newName);
      if (updated !== node) {
        matches.push({
          path,
          kind: "value",
          currentValue: node,
          nextValue: updated,
        });
      }
    }
  }

  visit(value, "$");
  return matches;
}

function getReplacement(value: string, oldName: string, newName: string): string {
  if (value === oldName) {
    return newName;
  }

  if (value.startsWith("item:")) {
    const collection = value.slice(5);
    if (collection === oldName) {
      return `item:${newName}`;
    }
  }

  if (value.includes(".")) {
    const renamed = value
      .split(".")
      .map((part) => (part === oldName ? newName : part))
      .join(".");

    if (renamed !== value) {
      return renamed;
    }
  }

  if (value.toLowerCase() === oldName.toLowerCase()) {
    return newName;
  }

  return value;
}

export function renameFieldInString(
  value: string,
  oldName: string,
  newName: string,
): string {
  if (typeof value !== "string") {
    return value as any;
  }

  // 🔹 A. Handlebars templates ({{ ... }})
  if (value.includes("{{")) {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
      const renamedExpr = expr
        .split(".")
        .map((part: string) => (part === oldName ? newName : part))
        .join(".");
      return `{{ ${renamedExpr} }}`;
    });
  }

  // 🔹 B. Exact match
  if (value === oldName) {
    return newName;
  }

  // 🔹 B2. Negated sort prefix: "-old_field" → "-new_field"
  if (value.startsWith("-") && value.slice(1) === oldName) {
    return `-${newName}`;
  }

  // 🔹 C. Plain dotted paths (relation.field.field)
  if (value.includes(".")) {
    return value
      .split(".")
      .map((p) => (p === oldName ? newName : p))
      .join(".");
  }

  // 🔹 D. Case-insensitive fallback
  if (value.toLowerCase() === oldName.toLowerCase()) {
    return newName;
  }

  // 🔹 E. Tokenized text where the field is used as a standalone word
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenRegex = new RegExp(`(^|[^A-Za-z0-9_])(${escaped})(?=[^A-Za-z0-9_]|$)`, "g");
  if (tokenRegex.test(value)) {
    return value.replace(tokenRegex, (_, prefix) => `${prefix}${newName}`);
  }

  return value;
}

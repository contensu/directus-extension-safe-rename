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

export function renameFieldInString(
  value: string,
  oldName: string,
  newName: string,
): string {
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

  return value;
}

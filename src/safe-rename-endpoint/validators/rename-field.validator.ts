import { validateDbSafeName } from "./db-safe.validator";
import { PROTECTED_COLLECTION_PREFIX } from "../constants";
import type { RenameFieldRequest } from "../types";

export function validateRenameFieldsRequest(
  payload: RenameFieldRequest,
): RenameFieldRequest {
  const collection = payload?.collection?.trim();
  const fields = payload?.fields;

  if (!collection || !fields || !Array.isArray(fields) || !fields.length) {
    throw new Error("collection and fields are required");
  }

  if (collection.startsWith(PROTECTED_COLLECTION_PREFIX)) {
    throw new Error("Fields of system collections cannot be renamed");
  }

  if (!validateDbSafeName(collection)) {
    throw new Error("Collection name must follow db-safe rules");
  }

  for (const f of fields) {
    const source = f.sourceField?.trim();
    const target = f.targetField?.trim();

    if (!source || !target) {
      throw new Error("Each field must have a sourceField and targetField");
    }

    if (!validateDbSafeName(source) || !validateDbSafeName(target)) {
      throw new Error(
        `Field names must follow db-safe rules: ${source} -> ${target}`,
      );
    }

    if (source === target) {
      throw new Error(
        `Source and target field cannot be the same: "${source}"`,
      );
    }
  }

  return {
    collection,
    fields: fields.map((f) => ({
      sourceField: f.sourceField.trim(),
      targetField: f.targetField.trim(),
    })),
  };
}

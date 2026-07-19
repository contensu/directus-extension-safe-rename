import { validateDbSafeName } from "./db-safe.validator";
import { PROTECTED_COLLECTION_PREFIX } from "../constants";
import type { ImpactAnalysisRequest } from "../types";

export function validateImpactAnalysisRequest(
  payload: unknown,
): ImpactAnalysisRequest {
  const typed = payload as Record<string, unknown>;
  const type = typed?.type as string;
  const collection = typed?.collection as string;
  const field = typed?.field as string | undefined;
  const newName = typeof typed?.newName === "string" ? typed.newName.trim() : undefined;

  if (!type || (type !== "collection" && type !== "field")) {
    throw new Error("type must be 'collection' or 'field'");
  }

  if (!collection || typeof collection !== "string") {
    throw new Error("collection is required");
  }

  if (!newName || typeof newName !== "string") {
    throw new Error("newName is required");
  }

  if (!validateDbSafeName(newName)) {
    throw new Error("New name must follow db-safe rules (letters, numbers, underscores, starting with a letter)");
  }

  if (collection.startsWith(PROTECTED_COLLECTION_PREFIX)) {
    throw new Error("System collections cannot be renamed");
  }

  const sourceName = type === "field" ? (field ?? "") : collection;

  if (type === "field" && !field) {
    throw new Error("field is required for field-type impact analysis");
  }

  if (sourceName === newName) {
    throw new Error("Source name and target name cannot be the same");
  }

  return {
    type,
    collection,
    field,
    newName,
  };
}

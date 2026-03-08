import { validateDbSafeName } from "./db-safe.validator";
import { PROTECTED_COLLECTION_PREFIX } from "../constants";
import type { RenameCollectionRequest } from "../types";

export function validateRenameCollectionRequest(
  payload: RenameCollectionRequest,
): RenameCollectionRequest {
  const sourceCollection = payload?.sourceCollection?.trim();
  const targetCollection = payload?.targetCollection?.trim();

  if (!sourceCollection || !targetCollection) {
    throw new Error("sourceCollection and targetCollection are required");
  }

  if (
    !validateDbSafeName(sourceCollection) ||
    !validateDbSafeName(targetCollection)
  ) {
    throw new Error("Collection names must follow db-safe rules");
  }

  if (sourceCollection.startsWith(PROTECTED_COLLECTION_PREFIX)) {
    throw new Error("System collections cannot be renamed");
  }

  if (sourceCollection === targetCollection) {
    throw new Error("Source and target collection cannot be the same");
  }

  return {
    sourceCollection,
    targetCollection,
  };
}

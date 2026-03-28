import { api } from "./api";

export async function renameCollection(sourceCollection: string, targetCollection: string): Promise<void> {
  const res = await api.post<{ message?: string; error?: string }>(
    "/safe-rename/collections/rename",
    { sourceCollection, targetCollection },
  );
  if (res.status !== 200) {
    throw new Error(`renameCollection failed (${res.status}): ${JSON.stringify(res.data)}`);
  }
}

export async function renameField(
  collection: string,
  fields: { sourceField: string; targetField: string }[],
): Promise<void> {
  const res = await api.post<{ message?: string; error?: string }>(
    "/safe-rename/fields/rename",
    { collection, fields },
  );
  if (res.status !== 200) {
    throw new Error(`renameField failed (${res.status}): ${JSON.stringify(res.data)}`);
  }
}

export function containsString(value: unknown, search: string): boolean {
  if (typeof value === "string") return value.includes(search);
  if (Array.isArray(value)) return value.some((v) => containsString(v, search));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(
      ([k, v]) => k.includes(search) || containsString(v, search),
    );
  }
  return false;
}

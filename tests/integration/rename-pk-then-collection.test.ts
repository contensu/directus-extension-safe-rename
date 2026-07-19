/**
 * Regression test for issue #5:
 * https://github.com/contensu/directus-extension-safe-rename/issues/5
 *
 * Renaming a collection AFTER its primary-key field had been renamed used to
 * fail with `column "id" of relation "..." does not exist`, because the
 * sequence fix assumed the primary-key column was always named "id". This test
 * renames the PK first, then the collection, and asserts the whole flow works
 * and auto-increment is still intact.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, waitForDirectus, unique } from "./helpers/api";
import { renameCollection, renameField } from "./helpers/rename";

const source = unique("pk_rename_src");
const target = unique("pk_rename_dst");

beforeAll(async () => {
  await waitForDirectus();

  // Collection with the default auto-increment integer primary key "id".
  const created = await api.post("/collections", {
    collection: source,
    fields: [
      {
        field: "id",
        type: "integer",
        meta: { hidden: true },
        schema: { is_primary_key: true, has_auto_increment: true },
      },
    ],
    schema: {},
    meta: {},
  });
  if (created.status !== 200) {
    throw new Error(`failed to create ${source}: ${JSON.stringify(created.data)}`);
  }

  // 1) rename the primary-key field id -> id_test
  await renameField(source, [{ sourceField: "id", targetField: "id_test" }]);
  // 2) rename the collection (this step used to crash)
  await renameCollection(source, target);
}, 120_000);

afterAll(async () => {
  await api.delete(`/collections/${target}`);
  await api.delete(`/collections/${source}`);
}, 60_000);

describe("regression #5 — rename collection after primary-key rename", () => {
  it("renamed collection exists", async () => {
    const res = await api.get(`/collections/${target}`);
    expect(res.status).toBe(200);
  });

  it("old collection no longer exists", async () => {
    const res = await api.get(`/collections/${source}`);
    expect(res.status).not.toBe(200);
  });

  it("renamed primary-key field id_test exists (and 'id' is gone)", async () => {
    const res = await api.get<{ data: Array<{ field: string }> }>(`/fields/${target}`);
    const fields = res.data.data.map((f) => f.field);
    expect(fields).toContain("id_test");
    expect(fields).not.toContain("id");
  });

  it("auto-increment still works after both renames", async () => {
    const first = await api.post<{ data: Record<string, unknown> }>(`/items/${target}`, {});
    const second = await api.post<{ data: Record<string, unknown> }>(`/items/${target}`, {});
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(typeof first.data.data["id_test"]).toBe("number");
    expect(second.data.data["id_test"] as number).toBeGreaterThan(
      first.data.data["id_test"] as number,
    );
  });
});

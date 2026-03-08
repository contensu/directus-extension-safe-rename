import type { AbstractServiceOptions } from "@directus/types/dist/services";

export function getAbstractServiceOptions({
  schema,
  database,
}: {
  schema: AbstractServiceOptions["schema"];
  database: AbstractServiceOptions["knex"];
}): AbstractServiceOptions {
  return {
    schema,
    knex: database,
    accountability: {
      admin: true,
    } as AbstractServiceOptions["accountability"],
  };
}

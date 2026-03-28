import type { EndpointExtensionContext } from "@directus/types/dist/extensions";
import type { RenameCollectionRequest } from "../types";
import { getAbstractServiceOptions } from "../utils/get-abstract-service-options.util";
import { disableFkChecks, enableFkChecks } from "../utils/fk-checks.util";
import { fixSequence } from "../utils/fix-sequence.util";

export async function renameCollection(
  requestBody: RenameCollectionRequest,
  context: EndpointExtensionContext,
) {
  const { database, services, logger, getSchema } = context;

  const { sourceCollection, targetCollection } = requestBody;

  await database.transaction(async (trx) => {
    try {
      // Disable FK checks
      await disableFkChecks(trx, database);

      /* -------------------------
         Update Directus metadata
      --------------------------*/

      await trx("directus_collections")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_collections")
        .where({ group: sourceCollection })
        .update({ group: targetCollection });

      await trx("directus_fields")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_comments")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_notifications")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_activity")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_permissions")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_presets")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_shares")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_versions")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_revisions")
        .where({ collection: sourceCollection })
        .update({ collection: targetCollection });

      await trx("directus_revisions")
        .where({ item: sourceCollection })
        .update({ item: targetCollection });

      await trx("directus_relations")
        .where({ many_collection: sourceCollection })
        .update({ many_collection: targetCollection });

      await trx("directus_relations")
        .where({ one_collection: sourceCollection })
        .update({ one_collection: targetCollection });

      // directus_operations - small table, JS filter is fine
      const operations = await trx("directus_operations")
        .whereNotNull("options")
        .select("id", "options");

      for (const operation of operations) {
        const options =
          typeof operation.options === "string"
            ? JSON.parse(operation.options)
            : operation.options;

        if (options?.collection !== sourceCollection) continue;

        options.collection = targetCollection;

        await trx("directus_operations")
          .where({ id: operation.id })
          .update({ options: JSON.stringify(options) });
      }

      // directus_flows - small table, JS filter is fine
      const flows = await trx("directus_flows")
        .whereNotNull("options")
        .select("id", "options");

      for (const flow of flows) {
        const options =
          typeof flow.options === "string"
            ? JSON.parse(flow.options)
            : flow.options;

        if (!options?.collections?.includes(sourceCollection)) continue;

        options.collections = options.collections.map((c: string) =>
          c === sourceCollection ? targetCollection : c,
        );

        await trx("directus_flows")
          .where({ id: flow.id })
          .update({ options: JSON.stringify(options) });
      }

      // directus_panels - update options.collection
      const panels = await trx("directus_panels")
        .whereNotNull("options")
        .select("id", "options");

      for (const panel of panels) {
        const options =
          typeof panel.options === "string"
            ? JSON.parse(panel.options)
            : panel.options;

        if (options?.collection !== sourceCollection) continue;

        options.collection = targetCollection;

        await trx("directus_panels")
          .where({ id: panel.id })
          .update({ options: JSON.stringify(options) });
      }

      // directus_relations - update one_allowed_collections (M2A)
      const m2aRelations = await trx("directus_relations")
        .whereNotNull("one_allowed_collections")
        .select("id", "one_allowed_collections");

      for (const rel of m2aRelations) {
        let allowed = rel.one_allowed_collections;

        // Directus stores one_allowed_collections as a comma-separated string
        if (typeof allowed === "string") {
          allowed = allowed
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
        }

        if (!Array.isArray(allowed) || !allowed.includes(sourceCollection))
          continue;

        const updated = allowed.map((c: string) =>
          c === sourceCollection ? targetCollection : c,
        );

        await trx("directus_relations")
          .where({ id: rel.id })
          .update({ one_allowed_collections: updated.join(",") });
      }

      /* -------------------------
         Rename actual table
         (skip for folder collections — they have no physical table)
      --------------------------*/

      const tableExists = await trx.schema.hasTable(sourceCollection);

      if (tableExists) {
        await trx.schema.renameTable(sourceCollection, targetCollection);

        /* -------------------------
           Fix sequence
        --------------------------*/

        await fixSequence(trx, sourceCollection, targetCollection);
      }

      // Re-enable FK checks
      await enableFkChecks(trx, database);
    } catch (err) {
      await enableFkChecks(trx, database);
      logger.error({ err }, "Failed to rename collection");
      throw err;
    }
  });

  try {
    const oldSchema = await getSchema();

    const abstractServiceOptions = getAbstractServiceOptions({
      schema: oldSchema,
      database,
    });

    const utilsService = new services.UtilsService(abstractServiceOptions);

    await utilsService.clearCache({ system: true });
  } catch (err) {
    logger.error({ err }, "Failed to refresh the schema");
  }
}

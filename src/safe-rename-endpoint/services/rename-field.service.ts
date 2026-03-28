import type { EndpointExtensionContext } from "@directus/types/dist/extensions";
import type { RenameFieldRequest } from "../types";
import { getAbstractServiceOptions } from "../utils/get-abstract-service-options.util";
import { disableFkChecks, enableFkChecks } from "../utils/fk-checks.util";
import {
  renameFieldInJson,
  renameFieldInString,
} from "../utils/rename-field-in-json.util";

export async function renameField(
  requestBody: RenameFieldRequest,
  context: EndpointExtensionContext,
) {
  const { database, services, logger, getSchema } = context;
  const { collection, fields } = requestBody;

  await database.transaction(async (trx: any) => {
    try {
      await disableFkChecks(trx);

      for (const { sourceField, targetField } of fields) {
        /* -------------------------
           Rename actual column
           (skip for alias fields — M2M, M2A, O2M virtual fields have no physical column)
        --------------------------*/

        const columnExists = await trx.schema.hasColumn(
          collection,
          sourceField,
        );

        if (columnExists) {
          await trx.schema.table(collection, (table: any) => {
            table.renameColumn(sourceField, targetField);
          });
        }

        /* -------------------------
           Update Directus metadata
        --------------------------*/

        // directus_fields.field
        await trx("directus_fields")
          .where({ collection, field: sourceField })
          .update({ field: targetField });

        // directus_fields.group
        await trx("directus_fields")
          .where({ collection, group: sourceField })
          .update({ group: targetField });

        // directus_collections.archive_field
        await trx("directus_collections")
          .where({ collection, archive_field: sourceField })
          .update({ archive_field: targetField });

        // directus_collections.sort_field
        await trx("directus_collections")
          .where({ collection, sort_field: sourceField })
          .update({ sort_field: targetField });

        // directus_relations.many_field
        await trx("directus_relations")
          .where({ many_collection: collection, many_field: sourceField })
          .update({ many_field: targetField });

        // directus_relations.one_field
        await trx("directus_relations")
          .where({ one_collection: collection, one_field: sourceField })
          .update({ one_field: targetField });

        // directus_relations.one_collection_field
        await trx("directus_relations")
          .where({
            one_collection: collection,
            one_collection_field: sourceField,
          })
          .update({ one_collection_field: targetField });

        // directus_relations.junction_field
        await trx("directus_relations")
          .where({ many_collection: collection, junction_field: sourceField })
          .update({ junction_field: targetField });

        // directus_relations.sort_field
        await trx("directus_relations")
          .where({ many_collection: collection, sort_field: sourceField })
          .update({ sort_field: targetField });

        /* -------------------------
           Find related collections
           for safe JSON updates
        --------------------------*/

        const relations = await trx("directus_relations")
          .where({ one_collection: collection })
          .orWhere({ many_collection: collection })
          .select("many_collection", "one_collection");

        const relatedCollections = new Set<string>([
          collection,
          ...relations.map((r: any) => r.many_collection),
          ...relations.map((r: any) => r.one_collection),
        ]);

        /* -------------------------
           Update JSON metadata
        --------------------------*/

        // directus_permissions - fields CSV, permissions, validation, presets
        const permissionRows = await trx("directus_permissions")
          .whereIn("collection", [...relatedCollections])
          .select("id", "fields", "permissions", "validation", "presets");

        for (const perm of permissionRows) {
          let changed = false;

          // CSV fields string
          let fieldsStr = perm.fields;
          if (fieldsStr) {
            const updatedStr = fieldsStr
              .split(",")
              .map((f: string) =>
                f.trim() === sourceField ? targetField : f.trim(),
              )
              .join(",");
            if (updatedStr !== fieldsStr) {
              fieldsStr = updatedStr;
              changed = true;
            }
          }

          // permissions JSON
          let permissionsJson =
            typeof perm.permissions === "string"
              ? JSON.parse(perm.permissions)
              : perm.permissions;
          if (permissionsJson) {
            const updated = renameFieldInJson(
              permissionsJson,
              sourceField,
              targetField,
            );
            if (JSON.stringify(updated) !== JSON.stringify(permissionsJson)) {
              permissionsJson = updated;
              changed = true;
            }
          }

          // validation JSON
          let validationJson =
            typeof perm.validation === "string"
              ? JSON.parse(perm.validation)
              : perm.validation;
          if (validationJson) {
            const updated = renameFieldInJson(
              validationJson,
              sourceField,
              targetField,
            );
            if (JSON.stringify(updated) !== JSON.stringify(validationJson)) {
              validationJson = updated;
              changed = true;
            }
          }

          // presets JSON
          let presetsJson =
            typeof perm.presets === "string"
              ? JSON.parse(perm.presets)
              : perm.presets;
          if (presetsJson) {
            const updated = renameFieldInJson(
              presetsJson,
              sourceField,
              targetField,
            );
            if (JSON.stringify(updated) !== JSON.stringify(presetsJson)) {
              presetsJson = updated;
              changed = true;
            }
          }

          if (!changed) continue;

          await trx("directus_permissions")
            .where({ id: perm.id })
            .update({
              fields: fieldsStr,
              permissions: JSON.stringify(permissionsJson),
              validation: JSON.stringify(validationJson),
              presets: JSON.stringify(presetsJson),
            });
        }

        // directus_presets - layout_query, layout_options, filter
        const presets = await trx("directus_presets")
          .whereIn("collection", [...relatedCollections])
          .select(
            "id",
            "collection",
            "layout_query",
            "layout_options",
            "filter",
          );

        for (const preset of presets) {
          let changed = false;

          const rawLayoutQuery =
            typeof preset.layout_query === "string"
              ? JSON.parse(preset.layout_query)
              : preset.layout_query;

          const rawLayoutOptions =
            typeof preset.layout_options === "string"
              ? JSON.parse(preset.layout_options)
              : preset.layout_options;

          const rawFilter =
            typeof preset.filter === "string"
              ? JSON.parse(preset.filter)
              : preset.filter;

          const layout_query = rawLayoutQuery
            ? renameFieldInJson(rawLayoutQuery, sourceField, targetField)
            : rawLayoutQuery;

          const layout_options = rawLayoutOptions
            ? renameFieldInJson(rawLayoutOptions, sourceField, targetField)
            : rawLayoutOptions;

          const filter = rawFilter
            ? renameFieldInJson(rawFilter, sourceField, targetField)
            : rawFilter;

          if (
            JSON.stringify(layout_query) !== JSON.stringify(rawLayoutQuery) ||
            JSON.stringify(layout_options) !==
              JSON.stringify(rawLayoutOptions) ||
            JSON.stringify(filter) !== JSON.stringify(rawFilter)
          ) {
            changed = true;
          }

          if (!changed) continue;

          await trx("directus_presets")
            .where({ id: preset.id })
            .update({
              layout_query: JSON.stringify(layout_query),
              layout_options: JSON.stringify(layout_options),
              filter: JSON.stringify(filter),
            });
        }

        // directus_operations.options
        const operations = await trx("directus_operations")
          .whereNotNull("options")
          .select("id", "options");

        for (const operation of operations) {
          const options =
            typeof operation.options === "string"
              ? JSON.parse(operation.options)
              : operation.options;

          let updatedOptions = options;
          let changed = false;

          // Rename inside executable code string
          if (typeof updatedOptions.code === "string") {
            const newCode = renameInCodeString(updatedOptions.code, {
              [sourceField]: targetField,
            });
            if (newCode !== updatedOptions.code) {
              updatedOptions = { ...updatedOptions, code: newCode };
              changed = true;
            }
          }

          // Rename structured JSON
          const renamedJson = renameFieldInJson(
            updatedOptions,
            sourceField,
            targetField,
          );
          if (JSON.stringify(renamedJson) !== JSON.stringify(updatedOptions)) {
            updatedOptions = renamedJson;
            changed = true;
          }

          if (!changed) continue;

          await trx("directus_operations")
            .where({ id: operation.id })
            .update({ options: JSON.stringify(updatedOptions) });
        }

        // directus_flows.options
        const flows = await trx("directus_flows")
          .whereNotNull("options")
          .select("id", "options");

        for (const flow of flows) {
          const options =
            typeof flow.options === "string"
              ? JSON.parse(flow.options)
              : flow.options;

          const updated = renameFieldInJson(options, sourceField, targetField);

          if (JSON.stringify(updated) === JSON.stringify(options)) continue;

          await trx("directus_flows")
            .where({ id: flow.id })
            .update({ options: JSON.stringify(updated) });
        }

        // directus_panels.options
        const panels = await trx("directus_panels")
          .whereNotNull("options")
          .select("id", "options");

        for (const panel of panels) {
          const options =
            typeof panel.options === "string"
              ? JSON.parse(panel.options)
              : panel.options;

          const updated = renameFieldInJson(options, sourceField, targetField);

          if (JSON.stringify(updated) === JSON.stringify(options)) continue;

          await trx("directus_panels")
            .where({ id: panel.id })
            .update({ options: JSON.stringify(updated) });
        }

        // directus_fields - options, display_options, conditions, validation
        // Scoped to related collections only
        const fieldRows = await trx("directus_fields")
          .whereIn("collection", [...relatedCollections])
          .select(
            "id",
            "collection",
            "field",
            "options",
            "display_options",
            "conditions",
            "validation",
          );

        for (const row of fieldRows) {
          let changed = false;

          const rawOptions =
            typeof row.options === "string"
              ? JSON.parse(row.options)
              : row.options;

          const rawDisplayOptions =
            typeof row.display_options === "string"
              ? JSON.parse(row.display_options)
              : row.display_options;

          const rawConditions =
            typeof row.conditions === "string"
              ? JSON.parse(row.conditions)
              : row.conditions;

          const rawValidation =
            typeof row.validation === "string"
              ? JSON.parse(row.validation)
              : row.validation;

          const options = rawOptions
            ? renameFieldInJson(rawOptions, sourceField, targetField)
            : rawOptions;

          const display_options = rawDisplayOptions
            ? renameFieldInJson(rawDisplayOptions, sourceField, targetField)
            : rawDisplayOptions;

          const conditions = rawConditions
            ? renameFieldInJson(rawConditions, sourceField, targetField)
            : rawConditions;

          const validation = rawValidation
            ? renameFieldInJson(rawValidation, sourceField, targetField)
            : rawValidation;

          if (
            JSON.stringify(options) !== JSON.stringify(rawOptions) ||
            JSON.stringify(display_options) !==
              JSON.stringify(rawDisplayOptions) ||
            JSON.stringify(conditions) !== JSON.stringify(rawConditions) ||
            JSON.stringify(validation) !== JSON.stringify(rawValidation)
          ) {
            changed = true;
          }

          if (!changed) continue;

          await trx("directus_fields")
            .where({ id: row.id })
            .update({
              options: JSON.stringify(options),
              display_options: JSON.stringify(display_options),
              conditions: JSON.stringify(conditions),
              validation: JSON.stringify(validation),
            });
        }

        // directus_collections - display_template, item_duplication_fields
        // Scoped to related collections
        const collectionRows = await trx("directus_collections")
          .whereIn("collection", [...relatedCollections])
          .select("collection", "display_template", "item_duplication_fields");

        for (const collectionRow of collectionRows) {
          let changed = false;

          const display_template = collectionRow.display_template
            ? renameFieldInString(
                collectionRow.display_template,
                sourceField,
                targetField,
              )
            : collectionRow.display_template;

          const rawDuplicationFields =
            typeof collectionRow.item_duplication_fields === "string"
              ? JSON.parse(collectionRow.item_duplication_fields)
              : collectionRow.item_duplication_fields;

          const item_duplication_fields = rawDuplicationFields
            ? renameFieldInJson(rawDuplicationFields, sourceField, targetField)
            : rawDuplicationFields;

          if (
            display_template !== collectionRow.display_template ||
            JSON.stringify(item_duplication_fields) !==
              JSON.stringify(rawDuplicationFields)
          ) {
            changed = true;
          }

          if (!changed) continue;

          await trx("directus_collections")
            .where({ collection: collectionRow.collection })
            .update({
              display_template,
              item_duplication_fields: JSON.stringify(item_duplication_fields),
            });
        }
      }

      await enableFkChecks(trx);
    } catch (err) {
      await enableFkChecks(trx);
      logger.error({ err }, "Failed to rename fields(s)");
      throw err;
    }
  });

  /* -------------------------
     Refresh Directus schema
  --------------------------*/

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

/* -------------------------
   Helper
--------------------------*/

function renameInCodeString(
  code: string,
  renameMap: Record<string, string>,
): string {
  let updated = code;

  for (const [oldName, newName] of Object.entries(renameMap)) {
    const regex = new RegExp(`\\b${oldName}\\b`, "g");
    updated = updated.replace(regex, newName);
  }

  return updated;
}

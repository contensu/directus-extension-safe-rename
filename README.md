# directus-extension-safe-rename

A [Directus](https://directus.io) extension that lets you safely rename collections and fields — updating all metadata, relations, permissions, presets, flows, and more in a single atomic transaction.

Built by [Contensu](https://github.com/contensu) — a Directus agency.

---

## Why?

Directus does not provide a built-in way to rename collections or fields after they are created. Doing it manually means hunting down every reference across a dozen system tables — and missing one breaks your project silently.

This extension handles all of that automatically.

---

## Features

- 🏷️ **Rename collections** — renames the table and updates all Directus system tables
- 🔤 **Rename fields** — renames the column and updates all references across metadata, relations, permissions, presets, flows, panels, and more
- 🔗 **Relation-aware** — updates field references in related collections too (O2M, M2M, M2A)
- 🔒 **Atomic transactions** — all changes happen in a single DB transaction, rolls back on failure
- 🧹 **Cache clearing** — automatically clears Directus schema cache after renaming
- 🛡️ **Protected collections** — prevents renaming of Directus system collections (`directus_*`)

---

## What gets updated

### When renaming a collection

| Table                    | Columns updated                     |
| ------------------------ | ----------------------------------- |
| `directus_collections`   | `collection`, `group`               |
| `directus_fields`        | `collection`                        |
| `directus_relations`     | `many_collection`, `one_collection` |
| `directus_permissions`   | `collection`                        |
| `directus_presets`       | `collection`                        |
| `directus_shares`        | `collection`                        |
| `directus_versions`      | `collection`                        |
| `directus_revisions`     | `collection`, `item`                |
| `directus_activity`      | `collection`                        |
| `directus_notifications` | `collection`                        |
| `directus_comments`      | `collection`                        |
| `directus_flows`         | `options.collections[]`             |
| `directus_operations`    | `options.collection`                |

### When renaming a field

| Table                  | Columns updated                                                                   |
| ---------------------- | --------------------------------------------------------------------------------- |
| `directus_fields`      | `field`, `group`, `options`, `display_options`, `conditions`, `validation`        |
| `directus_relations`   | `many_field`, `one_field`, `one_collection_field`, `junction_field`, `sort_field` |
| `directus_collections` | `archive_field`, `sort_field`, `display_template`, `item_duplication_fields`      |
| `directus_permissions` | `fields` (CSV), `permissions`, `validation`, `presets` (JSON)                     |
| `directus_presets`     | `layout_query`, `layout_options`, `filter`                                        |
| `directus_flows`       | `options`                                                                         |
| `directus_operations`  | `options`                                                                         |
| `directus_panels`      | `options`                                                                         |

---

## Requirements

- Directus `^11.0.0`
- Admin access required

---

## Installation

### Via npm (recommended)

```bash
npm install @contensu/directus-extension-safe-rename
```

Then restart your Directus instance.

### Via Directus Marketplace

This extension requires direct database access and is classified as a **non-sandboxed** extension. It will **not appear in the Directus Marketplace** by default.

To enable Marketplace installation, set the following environment variable in your Directus instance:

```env
MARKETPLACE_TRUST="all"
```

> ⚠️ This setting allows installation of all non-sandboxed extensions from the Marketplace. Only enable it if you trust the extensions you are installing.

For more details, see the [Directus self-hosting extensions guide](https://directus.io/docs/self-hosting/including-extensions).

---

## Usage

1. Go to **Settings → Project Settings** and enable the **Schema Rename** module under the Modules bar
2. The **Schema Rename** module will now appear in the left sidebar — click it
3. Select a collection from the list
4. **To rename the collection** — edit the collection name field and click **Rename Collection**
5. **To rename fields** — edit any field name in the list and click **Rename Fields**

![Rename Collection](https://raw.githubusercontent.com/contensu/directus-extension-safe-rename/main/docs/images/rename-collection.png)

![Rename Fields](https://raw.githubusercontent.com/contensu/directus-extension-safe-rename/main/docs/images/rename-fields.png)

---

## Database Support

| Database      | Status    |
| ------------- | --------- |
| PostgreSQL 13 | ✅ Tested |
| PostgreSQL 16 | ✅ Tested |
| MySQL 8       | ✅ Tested |
| MariaDB 11    | ✅ Tested |
| SQLite        | ✅ Tested |

Tested against Directus `11.14.1`, `11.16.1`, and `11.17.0`.

---

## CI & Releases

Every pull request runs a full integration test suite across **15 jobs** (3 Directus versions × 5 databases) via GitHub Actions. Releases are published to npm automatically when a version tag is pushed.

---

## Roadmap

- [ ] Impact analyzer — preview all changes before applying
- [ ] Translations support

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss what you would like to change.

---

## License

MIT © [Contensu](https://github.com/contensu)

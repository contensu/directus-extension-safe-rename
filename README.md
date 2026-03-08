# directus-extension-safe-rename

> ⚠️ **This extension is currently in beta. Always backup your database before using.**

A [Directus](https://directus.io) extension that lets you safely rename collections and fields directly from the Directus UI — updating all metadata, relations, permissions, presets, flows, and more in a single atomic transaction.

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
| Table | Columns updated |
|---|---|
| `directus_collections` | `collection`, `group` |
| `directus_fields` | `collection` |
| `directus_relations` | `many_collection`, `one_collection` |
| `directus_permissions` | `collection` |
| `directus_presets` | `collection` |
| `directus_shares` | `collection` |
| `directus_versions` | `collection` |
| `directus_revisions` | `collection`, `item` |
| `directus_activity` | `collection` |
| `directus_notifications` | `collection` |
| `directus_comments` | `collection` |
| `directus_flows` | `options.collections[]` |
| `directus_operations` | `options.collection` |

### When renaming a field
| Table | Columns updated |
|---|---|
| `directus_fields` | `field`, `group`, `options`, `display_options`, `conditions`, `validation` |
| `directus_relations` | `many_field`, `one_field`, `one_collection_field`, `junction_field`, `sort_field` |
| `directus_collections` | `archive_field`, `sort_field`, `display_template`, `item_duplication_fields` |
| `directus_permissions` | `fields` (CSV), `permissions`, `validation`, `presets` (JSON) |
| `directus_presets` | `layout_query`, `layout_options`, `filter` |
| `directus_flows` | `options` |
| `directus_operations` | `options` |
| `directus_panels` | `options` |

---

## Requirements

- Directus `^11.0.0`
- Admin access required

---

## Installation
Search for `directus-extension-safe-rename` in the Directus Marketplace, or install via npm:
```bash
npm install @contensu/directus-extension-safe-rename
```

Then restart your Directus instance.

---

## Usage

1. Go to the **Schema Rename** module in the left sidebar
2. Select a collection from the list
3. **To rename the collection** — edit the collection name field and click **Rename Collection**
4. **To rename fields** — edit any field name in the list and click **Rename Fields**

---

## Database Support

| Database | Status |
|---|---|
| PostgreSQL | ✅ Tested |
| MySQL | ⚠️ Untested |
| SQLite | ⚠️ Untested |
| CockroachDB | ⚠️ Untested |
| Oracle | ⚠️ Untested |

---

## Roadmap

- [ ] Multi-DB support testing (MySQL, SQLite, CockroachDB, Oracle)
- [ ] Impact analyzer — preview all changes before applying
- [ ] Translations support
- [ ] Automated test suite

---

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you would like to change.

---

## License

MIT © [Contensu](https://github.com/contensu)

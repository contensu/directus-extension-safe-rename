import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanupAll, seedAll, type SeedResult } from "../tests/integration/helpers/seed";
import { resetToken, waitForDirectus } from "../tests/integration/helpers/api";

const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, ".tmp");
const STATE_FILE = path.join(TMP_DIR, "safe-rename-dev-seed.json");

function makeNamer(tag: string) {
  return (prefix: string) => `${tag}_${prefix}_${Math.floor(Math.random() * 9999)}`;
}

function printSummary(seed: SeedResult) {
  const summary = {
    collections: {
      main: seed.collection,
      target: seed.targetCollection,
      nested: seed.nestedCollection,
      tags: seed.tagsCollection,
      junction: seed.junctionCollection,
      pageBuilder: seed.pageBuilderCollection,
      m2aJunction: seed.m2aJunctionCollection,
      textBlocks: seed.textBlocksCollection,
      imageBlocks: seed.imageBlocksCollection,
      folder: seed.folderCollection,
    },
    fields: {
      title: seed.titleField,
      slug: seed.slugField,
      status: seed.statusField,
      views: seed.viewsField,
      author: seed.authorField,
      o2mAlias: seed.o2mAliasField,
      m2aAlias: seed.m2aAliasField,
    },
    coverage: [
      "collection groups",
      "display templates",
      "field conditions and validation",
      "permissions and presets",
      "flows and operations",
      "dashboard panels",
      "M2O, O2M, M2M, and M2A relations",
      "shares, comments, activity, and revisions",
    ],
  };

  console.log(JSON.stringify(summary, null, 2));
}

async function readExistingState(): Promise<SeedResult | null> {
  try {
    const file = await readFile(STATE_FILE, "utf8");
    return JSON.parse(file) as SeedResult;
  } catch {
    return null;
  }
}

async function main() {
  const tag = process.env["SEED_TAG"]?.trim() || `safe_rename_${Date.now()}`;

  await waitForDirectus();
  await mkdir(TMP_DIR, { recursive: true });

  const existing = await readExistingState();
  if (existing) {
    console.log("Cleaning up previous dev seed before creating a new one...");
    resetToken();
    await cleanupAll(existing);
  }

  resetToken();
  const seed = await seedAll(makeNamer(tag));
  await writeFile(STATE_FILE, JSON.stringify(seed, null, 2));

  console.log("Seeded Directus rename playground.");
  console.log(`State file: ${STATE_FILE}`);
  printSummary(seed);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

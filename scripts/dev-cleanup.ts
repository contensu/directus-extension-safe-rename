import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { cleanupAll, type SeedResult } from "../tests/integration/helpers/seed";
import { resetToken, waitForDirectus } from "../tests/integration/helpers/api";

const STATE_FILE = path.join(process.cwd(), ".tmp", "safe-rename-dev-seed.json");

async function main() {
  await waitForDirectus();

  const file = await readFile(STATE_FILE, "utf8").catch(() => null);
  if (!file) {
    console.log("No saved dev seed state found.");
    return;
  }

  const seed = JSON.parse(file) as SeedResult;
  resetToken();
  await cleanupAll(seed);
  await rm(STATE_FILE, { force: true });

  console.log("Cleaned up the saved Directus dev seed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

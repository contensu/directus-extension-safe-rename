import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 120_000,
    testTimeout: 30_000,
    reporters: ["verbose"],
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});

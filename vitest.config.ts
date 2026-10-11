import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: { DATABASE_URL: "mysql://adspilot:adspilot_dev_pw@localhost:3306/adspilot_test", APP_URL: "http://localhost:3000", ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") },
  },
});

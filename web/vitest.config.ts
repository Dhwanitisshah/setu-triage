import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/lib/triage/**/*.test.ts", "src/lib/intake/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/lib/triage/news2.ts",
        "src/lib/triage/rules-engine.ts",
        "src/lib/intake/schema.ts",
      ],
      reporter: ["text", "text-summary"],
    },
  },
});

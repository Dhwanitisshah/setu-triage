import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/lib/triage/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/triage/news2.ts", "src/lib/triage/rules-engine.ts"],
      reporter: ["text", "text-summary"],
    },
  },
});

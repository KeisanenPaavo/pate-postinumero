import { fileURLToPath } from "node:url";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Yksikkötestit puhtaalle logiikalle (laskurit, taloyhtiön nimilogiikka). Ei komponenttien renderöintiä.
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // server-only heittää virheen muualla kuin Reactin palvelinympäristössä.
    alias: { "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

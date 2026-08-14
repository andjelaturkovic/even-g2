import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const sharedEntry = fileURLToPath(
  new URL("../shared/src/index.ts", import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: {
      "@even-g2/shared": sharedEntry
    }
  },
  server: {
    host: true,
    port: 5173
  }
});

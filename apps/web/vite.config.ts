import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    // Alias eksplisit: tsconfig memakai project references, sehingga plugin
    // tsconfig-paths tidak selalu menemukan `paths` saat build produksi.
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
});

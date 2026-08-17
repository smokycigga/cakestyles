import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      // Same-origin API in dev and prod: the client always calls relative /api.
      "/api": "http://localhost:5000",
    },
  },
});

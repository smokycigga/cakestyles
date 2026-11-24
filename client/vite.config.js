import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        // React and the router barely change between deploys, but they used to
        // live inside the entry chunk — so every release gave every returning
        // visitor a fresh 180 kB of framework they already had. Pinning them to
        // their own chunks keeps their hashes stable and lets the immutable
        // cache in vercel.json do its job.
        manualChunks(id) {
          const path = id.replace(/\\/g, "/");
          if (!path.includes("/node_modules/")) return;
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(path)) {
            return "react";
          }
        },
      },
    },
  },
  server: {
    proxy: {
      // Same-origin API in dev and prod: the client always calls relative /api.
      "/api": "http://localhost:5000",
    },
  },
});

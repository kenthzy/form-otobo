// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// Static site output (served by a web server / CDN).
// The Express backend stays a separate process on port 3000.
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    server: {
      // During `astro dev`, forward API calls to the backend.
      proxy: {
        "/api": "http://172.22.2.101:3000",
      },
    },
  },
});
import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001" },
    },
  },
});

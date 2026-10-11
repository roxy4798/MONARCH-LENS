import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";

const port = process.env.PORT ? Number(process.env.PORT) : 5174;
const basePath = process.env.BASE_PATH || "/";
const host = process.env.HOST || "localhost";
const allowedHosts = process.env.ALLOWED_HOSTS?.split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

if (!localHosts.has(host) && (!allowedHosts || allowedHosts.length === 0)) {
  throw new Error(
    "Remote Vite binding requires ALLOWED_HOSTS to list trusted hostnames explicitly.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [mockupPreviewPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host,
    allowedHosts,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host,
    allowedHosts,
  },
});

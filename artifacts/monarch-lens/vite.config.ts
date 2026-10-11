import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const port = process.env.PORT ? Number(process.env.PORT) : 5173;
const basePath =
  process.env.BASE_PATH ||
  (process.env.NODE_ENV === "production" ? "/MONARCH-LENS/" : "/");
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
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false,
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

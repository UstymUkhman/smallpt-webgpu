import { defineConfig } from "vite";

export default defineConfig(
{
    base: "./",
    build: { target: "esnext" },
    worker: { format: "es" }
});

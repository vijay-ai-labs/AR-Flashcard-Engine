import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: false
  },
  build: {
    target: "es2022"
  }
});

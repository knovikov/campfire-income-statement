import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/income-statement": "http://127.0.0.1:3001",
      "/accounts": "http://127.0.0.1:3001",
    },
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // IPv4 + síť; bez toho na některých PC funguje jen [::1], ne 127.0.0.1
  },
});

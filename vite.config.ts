import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages repo path: https://<user>.github.io/mens-rg-scorer/
export default defineConfig({
  plugins: [react()],
  base: "/mens-rg-scorer/",
});

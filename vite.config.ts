import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// NOTE: Do NOT import tailwindcss or @tailwindcss/postcss here.
// Tailwind is handled by PostCSS via postcss.config.cjs, not Vite.
// Adding it to Vite plugins causes conflicts with the PostCSS pipeline.

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  },
  build: {
    // Output to dist/ — this is what wrangler pages deploy expects
    outDir: 'dist',
    sourcemap: true
  }
})

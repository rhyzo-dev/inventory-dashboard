/**
 * Tailwind CSS v3 configuration.
 *
 * content: Scans these paths for class names to generate utility CSS.
 *   If a path is missing here, classes used in those files won't appear in the output CSS.
 *   This is why the v4 attempt failed — @tailwindcss/postcss doesn't scan React sources.
 *
 * theme.extend.colors: Custom color palette. Primary blue is #2563eb (blue-600 equivalent).
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // Scan all React/TypeScript source files for Tailwind class usage
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#2563eb',
          600: '#1d4ed8',
        }
      }
    },
  },
  plugins: [],
}

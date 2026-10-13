/**
 * PostCSS configuration for Tailwind CSS v3.
 *
 * NOTE: We use tailwindcss@3 (NOT @tailwindcss/postcss from v4).
 * Tailwind v4's PostCSS plugin is ESM-only and cannot be loaded from CJS.
 * When loaded incorrectly, it compiles without error but fails to scan
 * source files, producing CSS missing all color/spacing/shadow utilities.
 *
 * Plugin order matters: tailwindcss first (generates utilities from src/),
 * then autoprefixer (adds vendor prefixes to output).
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

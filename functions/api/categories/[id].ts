/**
 * GET  /api/categories/[id] — get a single category (not implemented, falls through to list)
 * PUT  /api/categories/[id] — update a category
 * DELETE /api/categories/[id] — delete a category
 */
export { onRequestGet } from './categories'
export { onRequestPut } from './categories'
export { onRequestDelete } from './categories'

/**
 * PUT  /api/users/[id] — update user role/status (admin)
 * DELETE /api/users/[id] — delete user (admin, cannot delete self)
 */
export { onRequestPut } from '../users'
export { onRequestDelete } from '../users'

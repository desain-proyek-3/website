/**
 * Authentication helpers.
 *
 *   POST /api/v1/auth/login  (JSON { username, password }) → { access_token, token_type }
 *   GET  /api/v1/auth/me     (Bearer token)                → { id, username, email, role, full_name, is_active, created_at }
 *
 * The JWT is stored by api.js (localStorage "dentify_token"); the user profile
 * is never persisted — it is re-fetched from /auth/me on every page load.
 *
 * There is no self-signup: accounts are created by an admin on /users.
 */

import { ApiError, apiFetch, clearToken, getToken, setToken } from './api.js'

// Legacy mock keys — only cleared now, no longer read.
const LEGACY_KEYS = ['dentify_session', 'dentify_users']

// The three backend roles (enum user_role), with UI labels.
export const ROLES = [
  {
    value: 'admin',
    label: 'Admin',
    desc: 'Mengelola akun pengguna dan seluruh data.',
  },
  {
    value: 'examiner',
    label: 'Examiner',
    desc: 'Membuat subjek, mengunggah citra, dan menjalankan AI.',
  },
  {
    value: 'viewer',
    label: 'Viewer',
    desc: 'Hanya dapat melihat data.',
  },
]

export const PASSWORD_MIN_LENGTH = 8

export function roleLabel(role) {
  return ROLES.find((r) => r.value === role)?.label || role
}

/** Up to two initials for an avatar, e.g. "Administrator Dentify" → "AD". */
export function initialsOf(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/**
 * Fetch the profile of the user owning the stored token.
 */
export function fetchCurrentUser() {
  return apiFetch('/api/v1/auth/me')
}

/**
 * Authenticate against the backend, store the JWT, then load the profile.
 * @returns {Promise<object>} the /auth/me payload
 */
export async function login({ username, password }) {
  let token
  try {
    token = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      json: { username, password },
      skipAuthRedirect: true,
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw new ApiError('Username atau password salah.', 401)
    }
    throw err
  }

  setToken(token.access_token)
  try {
    return await fetchCurrentUser()
  } catch (err) {
    clearToken()
    throw err
  }
}

export function logout() {
  clearToken()
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k))
}

export function hasToken() {
  return Boolean(getToken())
}

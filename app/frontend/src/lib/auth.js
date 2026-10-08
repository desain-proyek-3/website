/**
 * Authentication helpers.
 *
 * Login/logout talk to the real backend:
 *   POST /api/v1/auth/login  (JSON { username, password }) → { access_token, token_type }
 *   GET  /api/v1/auth/me     (Bearer token)                → { id, username, email, role, full_name, is_active, created_at }
 *
 * The JWT is stored by api.js (localStorage "dentify_token"); the user profile
 * is never persisted — it is re-fetched from /auth/me on every page load.
 *
 * signUp() is still a localStorage mock: the backend has no public signup yet
 * (see integration.md §2).
 */

import { ApiError, apiFetch, clearToken, getToken, setToken } from './api.js'

const USERS_KEY = 'dentify_users'
// Legacy mock session key — only cleared now, no longer read.
const LEGACY_SESSION_KEY = 'dentify_session'

export const AVAILABLE_ROLES = [
  'Field Technician',
  'Forensic Odontologist',
  'DVI Team Specialist',
  'Posko Officer / Admin',
]

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || []
  } catch {
    return []
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function generateId() {
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function getInitials(name) {
  if (!name) return 'U'
  return name
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Register a new user (mock — not wired to the backend yet).
 */
export function signUp({ name, email, password, role }) {
  const users = getUsers()

  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email sudah terdaftar. Silakan login.')
  }

  const selectedRole = role || 'Field Technician'

  const user = {
    id: generateId(),
    name,
    email: email.toLowerCase(),
    password,
    role: selectedRole,
    initials: getInitials(name),
  }

  users.push(user)
  saveUsers(users)

  return { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials }
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
  localStorage.removeItem(LEGACY_SESSION_KEY)
}

export function hasToken() {
  return Boolean(getToken())
}

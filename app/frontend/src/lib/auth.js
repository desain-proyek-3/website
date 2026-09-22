/**
 * Mock authentication helpers backed by localStorage.
 *
 * All user records live in localStorage under the key "dentify_users".
 * The currently logged-in session is stored under "dentify_session".
 */

const USERS_KEY = 'dentify_users'
const SESSION_KEY = 'dentify_session'

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
 * Register a new user.
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

  const session = { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))

  return session
}

/**
 * Authenticate an existing user.
 */
export function login({ email, password, role }) {
  const users = getUsers()
  const userIndex = users.findIndex(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
  )

  if (userIndex === -1) {
    throw new Error('Email atau password salah.')
  }

  const user = users[userIndex]
  if (role && role !== user.role) {
    user.role = role
    users[userIndex] = user
    saveUsers(users)
  }

  const session = { id: user.id, name: user.name, email: user.email, role: user.role, initials: user.initials }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))

  return session
}

export function logout() {
  localStorage.removeItem(SESSION_KEY)
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null
  } catch {
    return null
  }
}

export function isAuthenticated() {
  return getCurrentUser() !== null
}

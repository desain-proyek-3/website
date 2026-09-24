import { Link } from 'react-router-dom'

/** Mark: Icon-only logo using /logo2.svg */
export function Mark({ className = 'h-9 w-9' }) {
  return (
    <img
      src="/logo2.svg"
      alt="Dentify Icon Logo"
      className={`object-contain ${className}`}
    />
  )
}

/** Full Logo: Logo + text using /logo-dentify.png */
export default function Logo({ className = 'h-10 w-auto', to = '/' }) {
  return (
    <Link to={to} className="inline-flex items-center">
      <img
        src="/logo-dentify.png"
        alt="Dentify Logo"
        className={`object-contain ${className}`}
      />
    </Link>
  )
}

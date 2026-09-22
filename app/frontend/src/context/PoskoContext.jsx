import { createContext, useContext, useState, useEffect } from 'react'

const POSKO_STORAGE_KEY = 'dentify_active_posko'

export const PRESET_POSKOS = [
  'Posko Forensik Palu',
  'Posko DVI Cianjur',
  'Posko Sektor 1',
  'Posko Sektor 2',
  'Posko Utama DVI',
  'Posko Lapangan 3',
]

const PoskoContext = createContext(null)

export function PoskoProvider({ children }) {
  const [posko, setPoskoState] = useState(() => {
    try {
      return localStorage.getItem(POSKO_STORAGE_KEY) || PRESET_POSKOS[0]
    } catch {
      return PRESET_POSKOS[0]
    }
  })

  const setPosko = (newPosko) => {
    setPoskoState(newPosko)
    try {
      localStorage.setItem(POSKO_STORAGE_KEY, newPosko)
    } catch (e) {
      console.error('Failed to save posko to localStorage', e)
    }
  }

  return (
    <PoskoContext.Provider value={{ posko, setPosko, PRESET_POSKOS }}>
      {children}
    </PoskoContext.Provider>
  )
}

export function usePosko() {
  const ctx = useContext(PoskoContext)
  if (!ctx) throw new Error('usePosko must be used inside <PoskoProvider>')
  return ctx
}

import { createContext, useContext, useState, useCallback } from 'react'

const HISTORY_STORAGE_KEY = 'dentify_analysis_history'

const HistoryContext = createContext(null)

export function HistoryProvider({ children }) {
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  const addHistoryItem = useCallback((item) => {
    setHistory((prev) => {
      const updated = [item, ...prev]
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated))
      } catch (e) {
        console.error('Failed to save analysis history to localStorage', e)
      }
      return updated
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear analysis history', e)
    }
  }, [])

  return (
    <HistoryContext.Provider value={{ history, addHistoryItem, clearHistory }}>
      {children}
    </HistoryContext.Provider>
  )
}

export function useHistory() {
  const ctx = useContext(HistoryContext)
  if (!ctx) throw new Error('useHistory must be used inside <HistoryProvider>')
  return ctx
}

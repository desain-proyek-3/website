import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2, Search } from 'lucide-react'
import { listSubjects } from '../lib/api.js'

/**
 * Search bar di header: cari subjek (AM & PM) berdasarkan nama, referensi kasus, atau awalan ID
 * lewat GET /api/v1/subjects?q=. Memilih hasil membuka /analysis?subject=<id>.
 * Keyboard: "/" atau Ctrl+K fokus · ↑/↓ pilih · Enter buka · Esc tutup.
 */
const MIN_QUERY = 2 // sama dengan SEARCH_MIN_LENGTH di backend
const DEBOUNCE_MS = 300
const FETCH_LIMIT = 20
const PER_GROUP = 8
const GROUPS = [
  { type: 'post_mortem', tag: 'PM', label: 'Post-mortem', tone: 'text-amber-600' },
  { type: 'ante_mortem', tag: 'AM', label: 'Ante-mortem', tone: 'text-teal-700' },
]
const EMPTY = { status: 'idle', items: [], total: 0, message: '' } // idle | loading | ready | error

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const isTypingTarget = (el) =>
  el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function HeaderSearch() {
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(EMPTY)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const term = query.trim()

  // Pencarian ber-debounce; request sebelumnya dibatalkan agar hasil tidak tertukar.
  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setResult(EMPTY)
      return
    }
    const ctrl = new AbortController()
    setResult((r) => ({ ...r, status: 'loading' }))
    const timer = setTimeout(() => {
      listSubjects({ q: term, limit: FETCH_LIMIT, signal: ctrl.signal })
        .then(({ items, total }) => {
          setResult({ status: 'ready', items, total, message: '' })
          setActive(-1)
        })
        .catch((err) => {
          if (err.name === 'AbortError') return
          setResult({ status: 'error', items: [], total: 0, message: err.message || 'Pencarian gagal.' })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [term])

  // Hasil dikelompokkan PM → AM; `options` = urutan tampil (untuk navigasi keyboard).
  const groups = useMemo(
    () =>
      GROUPS.map((g) => {
        const all = result.items.filter((s) => s.subject_type === g.type)
        return { ...g, items: all.slice(0, PER_GROUP), hidden: Math.max(all.length - PER_GROUP, 0) }
      }).filter((g) => g.items.length),
    [result.items],
  )
  const options = groups.flatMap((g) => g.items)

  // Tutup saat klik di luar.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Shortcut global: "/" atau Ctrl/Cmd+K.
  useEffect(() => {
    const onKey = (e) => {
      const ctrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (ctrlK || (e.key === '/' && !isTypingTarget(e.target))) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const choose = (subject) => {
    navigate(`/analysis?subject=${subject.id}`)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    } else if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (e.key === 'Enter' && options.length && result.status === 'ready') {
      e.preventDefault()
      choose(options[active >= 0 ? active : 0])
    }
  }

  const showDropdown = open && term.length > 0
  let optionIndex = -1

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-[420px] flex-1">
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-[18px] w-[18px] text-slate-400" />
        <span className="sr-only">Cari subjek</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="header-search-results"
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && active >= 0 ? `header-search-opt-${active}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Cari subjek: nama, referensi kasus, atau ID…"
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-11 pr-10 text-[14px]
                     placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:outline-none
                     focus:ring-4 focus:ring-teal-500/10 shadow-sm transition-all"
        />
        {result.status === 'loading' ? (
          <Loader2 className="pointer-events-none absolute right-3.5 h-4 w-4 animate-spin text-slate-400" />
        ) : (
          !query && (
            <kbd className="pointer-events-none absolute right-3 hidden rounded-md border border-slate-200 bg-white px-1.5 font-mono text-[11px] text-slate-400 sm:block">
              /
            </kbd>
          )
        )}
      </label>

      {showDropdown && (
        <div
          id="header-search-results"
          role="listbox"
          aria-label="Hasil pencarian subjek"
          className="absolute left-0 z-50 mt-2 max-h-[70vh] w-full min-w-[300px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl scroll-slim"
        >
          {term.length < MIN_QUERY ? (
            <p className="px-3 py-3 text-[12.5px] text-slate-400">Ketik minimal {MIN_QUERY} karakter.</p>
          ) : result.status === 'error' ? (
            <p className="flex items-center gap-2 px-3 py-3 text-[12.5px] font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {result.message}
            </p>
          ) : result.status === 'ready' && options.length === 0 ? (
            <p className="px-3 py-3 text-[12.5px] text-slate-400">
              Tidak ada subjek yang cocok dengan “{term}”.
            </p>
          ) : options.length === 0 ? (
            <p className="px-3 py-3 text-[12.5px] text-slate-400">Mencari…</p>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.type} className="py-1">
                  <div className="px-3 pb-1 pt-1.5 font-mono text-[10.5px] tracking-[.12em] text-slate-400">
                    <span className={`font-bold ${g.tone}`}>{g.tag}</span> · {g.label.toUpperCase()}
                  </div>
                  <ul>
                    {g.items.map((s) => {
                      optionIndex += 1
                      const idx = optionIndex
                      return (
                        <li
                          key={s.id}
                          id={`header-search-opt-${idx}`}
                          role="option"
                          aria-selected={idx === active}
                          onMouseDown={(e) => e.preventDefault()} // jaga fokus input sampai klik selesai
                          onClick={() => choose(s)}
                          onMouseEnter={() => setActive(idx)}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                            idx === active ? 'bg-teal-50' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold text-ink">
                              {s.full_name || 'Tanpa nama'}
                            </div>
                            <div className="truncate font-mono text-[11px] text-slate-500">
                              {s.case_reference || '–'} · {s.id.slice(0, 8)}
                            </div>
                          </div>
                          <span className="shrink-0 font-mono text-[10.5px] text-slate-400">{fmtDate(s.created_at)}</span>
                        </li>
                      )
                    })}
                  </ul>
                  {g.hidden > 0 && (
                    <p className="px-3 pt-0.5 text-[11.5px] text-slate-400">+{g.hidden} lainnya — perjelas kata kunci</p>
                  )}
                </div>
              ))}
              <p className="mt-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[11.5px] text-slate-400">
                {result.total > result.items.length
                  ? `${result.items.length} dari ${result.total} hasil terbaru · `
                  : ''}
                Enter untuk membuka di Feature analysis
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

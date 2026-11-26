import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileText, Loader2, Printer, RotateCcw } from 'lucide-react'
import { ApiError, VIEW_TYPES, generateReportNarrative, getIdentificationReport } from '../lib/api.js'
import ToothComparisonTable from '../components/ToothComparisonTable.jsx'

const fmtDate = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' }) : '–'
const person = (p) => (p ? `${p.full_name || p.username} (${p.username})` : '–')
const viewLabel = (v) => VIEW_TYPES.find((x) => x.value === v)?.label || v
const num = (v, digits = 2, suffix = '') => (v == null ? 'Belum tersedia' : `${Number(v).toFixed(digits)}${suffix}`)

function Section({ no, title, children }) {
  return (
    <section className="break-inside-avoid-page border-t border-slate-200 pt-5 print:pt-3">
      <h2 className="text-[15px] font-semibold text-ink">
        <span className="mr-2 font-mono text-teal-700">{no}.</span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Field({ label, children }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1 text-[13px]">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-ink">{children || '–'}</dd>
    </div>
  )
}

function SubjectBlock({ title, s }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="readout">{title}</div>
      <dl className="mt-2">
        <Field label="Nama / label">{s.full_name}</Field>
        <Field label="Referensi kasus">{s.case_reference}</Field>
        <Field label="ID subjek"><span className="font-mono text-[12px]">{s.id}</span></Field>
        <Field label="Dicatat">{fmtDate(s.created_at)} · {person(s.created_by)}</Field>
        <Field label="Catatan">{s.notes}</Field>
      </dl>
    </div>
  )
}

function useElapsedSeconds(running) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!running) return undefined
    const start = Date.now()
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running])
  return elapsed
}

const refLabel = (r) => {
  const section = r.section && r.section.trim() !== '-' ? r.section : null
  return [r.source || 'Sumber tidak diketahui', r.page != null ? `hlm. ${r.page}` : null].filter(Boolean).join(', ') +
    (section ? ` — ${section}` : '')
}

/** Section 4: AI (RAG) narrative — available / not configured / generating / failed. */
function AiAnalysis({ narrative, generating, error, onRetry }) {
  const elapsed = useElapsedSeconds(generating)

  if (narrative.status === 'available') {
    return (
      <>
        <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{narrative.content}</div>
        {narrative.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            {narrative.warnings.map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        )}
        {narrative.references.length > 0 && (
          <div className="mt-4">
            <div className="readout">RUJUKAN</div>
            <ol className="mt-1.5 space-y-1 text-[12px] text-slate-600">
              {narrative.references.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 font-mono text-slate-400">[{r.n ?? i + 1}]</span>
                  <span>{refLabel(r)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-snug text-slate-400">
          Disusun AI{narrative.model_version ? ` (${narrative.model_version})` : ''} pada {fmtDate(narrative.generated_at)}.
          Analisis ini merupakan alat bantu dan harus diverifikasi oleh odontolog forensik.
        </p>
      </>
    )
  }

  if (narrative.status === 'not_available') {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="text-[13px] text-slate-700">
          <p className="font-semibold">Analisis AI tidak tersedia.</p>
          {narrative.message && <p className="mt-0.5 text-[12px] text-slate-500">{narrative.message}</p>}
        </div>
      </div>
    )
  }

  if (error && !generating) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="text-[13px] text-red-900">
            <p className="font-semibold">Analisis AI gagal dibuat.</p>
            <p className="mt-0.5 text-[12px] text-red-800">{error}</p>
            <p className="mt-0.5 text-[12px] text-red-800">Laporan dapat dicetak setelah analisis AI berhasil dibuat.</p>
          </div>
        </div>
        <button onClick={onRetry} className="btn-ghost h-8 shrink-0 px-3 text-[12px]">
          <RotateCcw className="h-3.5 w-3.5" />
          Coba lagi
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-teal-600" />
      <div className="text-[13px] text-teal-900">
        <p className="font-semibold">Menyusun analisis AI… {elapsed > 0 && <span className="font-mono font-normal">{elapsed} dtk</span>}</p>
        <p className="mt-0.5 text-[12px] text-teal-800">
          AI menelaah hasil perbandingan gigi dan rujukan INTERPOL DVI. Proses ini dapat memakan waktu hingga beberapa
          menit; jangan tutup halaman ini.
        </p>
      </div>
    </div>
  )
}

/** INTERPOL DVI identification report for one confirmed PM–AM pair; print → PDF. */
export default function Report() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null) // { status, message }
  const [narrative, setNarrative] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [narrativeError, setNarrativeError] = useState(null)
  const generationRef = useRef(null) // AbortController of the running generation

  const generateNarrative = useCallback(() => {
    generationRef.current?.abort()
    const ctrl = new AbortController()
    generationRef.current = ctrl
    setGenerating(true)
    setNarrativeError(null)
    generateReportNarrative(id, { signal: ctrl.signal })
      .then((n) => !ctrl.signal.aborted && setNarrative(n))
      .catch((err) => {
        if (err.name !== 'AbortError' && !ctrl.signal.aborted) setNarrativeError(err.message)
      })
      .finally(() => !ctrl.signal.aborted && setGenerating(false))
  }, [id])

  useEffect(() => {
    let cancelled = false
    generationRef.current?.abort()
    setReport(null)
    setError(null)
    setNarrative(null)
    setGenerating(false)
    setNarrativeError(null)
    getIdentificationReport(id)
      .then((r) => {
        if (cancelled) return
        setReport(r)
        setNarrative(r.narrative)
        // Generated once per match and stored by the backend; afterwards it is reused as-is.
        if (r.narrative.status === 'pending') generateNarrative()
      })
      .catch((err) => !cancelled && setError({ status: err instanceof ApiError ? err.status : 0, message: err.message }))
    return () => {
      cancelled = true
      generationRef.current?.abort()
    }
  }, [id, generateNarrative])

  if (error) {
    return (
      <div className="card mx-auto max-w-[720px] p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              {error.status === 409 ? 'Laporan belum dapat dibuat' : 'Laporan tidak dapat dimuat'}
            </h2>
            <p className="mt-1 text-[13px] text-slate-600">{error.message}</p>
            <Link to="/review" className="btn-ghost mt-4 h-9 px-3.5 text-[12.5px]">
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali ke Forensic Review
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!report || !narrative) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-[13px] text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        Menyusun laporan…
      </div>
    )
  }

  const { pm_subject: pm, am_subject: am, scores, decision } = report
  // Printing waits for the AI analysis; only an unconfigured RAG service may print without it.
  const printReady = narrative.status === 'available' || narrative.status === 'not_available'
  const printHint = printReady
    ? undefined
    : narrativeError && !generating
      ? 'Analisis AI gagal — coba lagi di bagian 4 sebelum mencetak'
      : 'Tunggu hingga analisis AI selesai disusun'
  const subjectLabel = (sid) => (sid === pm.id ? 'PM' : 'AM')
  const images = [...report.images].sort(
    (a, b) => subjectLabel(b.subject_id).localeCompare(subjectLabel(a.subject_id)) || a.view_type.localeCompare(b.view_type),
  )

  return (
    <div className="mx-auto max-w-[960px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/review?pm=${pm.id}`} className="btn-ghost h-9 px-3.5 text-[12.5px]">
          <ArrowLeft className="h-3.5 w-3.5" />
          Forensic Review
        </Link>
        <button
          onClick={() => window.print()}
          disabled={!printReady}
          title={printHint}
          className="btn-primary h-9 px-4 text-[12.5px] disabled:cursor-not-allowed"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
          {generating ? 'Menunggu analisis AI…' : 'Cetak / simpan PDF'}
        </button>
      </div>

      {/* Ctrl+P bypasses the disabled button → print a notice instead of an incomplete report. */}
      {!printReady && (
        <div className="hidden p-8 text-[14px] text-ink print:block">
          <p className="font-semibold">Laporan belum lengkap — analisis AI belum selesai.</p>
          <p className="mt-1">Tunggu hingga bagian 4 "Analisis AI" selesai disusun, lalu cetak kembali.</p>
        </div>
      )}

      <article
        className={`card space-y-6 p-8 print:border-0 print:p-0 print:shadow-none ${printReady ? '' : 'print:hidden'}`}
      >
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="readout">INTERPOL DVI · IDENTIFICATION REPORT</div>
            <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">Laporan Identifikasi Odontologi Forensik</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Referensi kasus: <span className="font-semibold text-ink">{report.case_reference || '–'}</span>
            </p>
          </div>
          <dl className="text-right text-[12px] text-slate-500">
            <div>Dibuat {fmtDate(report.generated_at)}</div>
            <div>oleh {person(report.generated_by)}</div>
            <div className="mt-1 font-mono text-[11px]">ID pencocokan {report.matching_result_id}</div>
          </dl>
        </header>

        <Section no={1} title="Identitas subjek">
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <SubjectBlock title="POST-MORTEM (KORBAN)" s={pm} />
            <SubjectBlock title="ANTE-MORTEM (ORANG HILANG)" s={am} />
          </div>
        </Section>

        <Section no={2} title="Hasil pencocokan & keputusan odontolog">
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <dl>
              <Field label="Confidence">{num(scores.confidence_score, 2, '%')}</Field>
              <Field label="Cosine similarity">{num(scores.cosine_similarity, 4)}</Field>
              <Field label="Peringkat kandidat">{scores.rank ? `#${scores.rank}` : '–'}</Field>
              <Field label="Superimposition">{num(scores.superimposition_score)}</Field>
              <Field label="Selisih morfologi">{num(scores.morphology_diff_score)}</Field>
            </dl>
            <dl>
              <Field label="Keputusan">
                <span className="chip bg-teal-50 font-semibold text-teal-700 ring-1 ring-teal-200">IDENTIFIKASI DIKONFIRMASI</span>
              </Field>
              <Field label="Dikonfirmasi oleh">{person(decision.decided_by)}</Field>
              <Field label="Waktu konfirmasi">{fmtDate(decision.decided_at)}</Field>
              <Field label="Pencocokan oleh">{person(decision.matched_by)}</Field>
              <Field label="Waktu pencocokan">{fmtDate(decision.matched_at)}</Field>
            </dl>
          </div>
        </Section>

        <Section no={3} title="Perbandingan gigi (FDI) PM vs AM">
          <ToothComparisonTable comparison={report.comparison} />
        </Section>

        <Section no={4} title="Analisis AI">
          <AiAnalysis narrative={narrative} generating={generating} error={narrativeError} onRetry={generateNarrative} />
        </Section>

        <Section no={5} title="Chain-of-custody citra">
          <div className="scroll-slim overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70">
                  {['Subjek', 'Sudut', 'SHA-256', 'Diunggah', 'Gigi'].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-[10.5px] font-medium tracking-[.1em] text-slate-500">
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {images.map((img) => (
                  <tr key={img.dental_image_id} className="align-top">
                    <td className="px-3 py-2 font-semibold text-ink">{subjectLabel(img.subject_id)}</td>
                    <td className="px-3 py-2">{viewLabel(img.view_type)}</td>
                    <td className="px-3 py-2 font-mono text-[11px] break-all text-slate-600">{img.file_hash}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {fmtDate(img.uploaded_at)}
                      <div className="text-[11.5px] text-slate-400">{person(img.uploaded_by)}</div>
                    </td>
                    <td className="px-3 py-2 font-mono">{img.teeth_detected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11.5px] text-slate-400">
            Hash SHA-256 dihitung saat citra diunggah dan dapat dipakai untuk memverifikasi bahwa berkas citra tidak berubah.
          </p>
        </Section>

        <footer className="break-inside-avoid-page border-t border-slate-200 pt-5">
          <p className="text-[12px] leading-snug text-slate-500">
            Laporan ini disusun otomatis oleh sistem Dentify dari data pencocokan dan hasil deteksi AI, dan baru sah
            setelah diperiksa serta ditandatangani odontolog forensik yang berwenang.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-10 text-[12.5px] text-slate-600">
            {['Odontolog forensik pemeriksa', 'Ketua tim DVI'].map((role) => (
              <div key={role}>
                <div className="h-14 border-b border-slate-400" />
                <div className="mt-1.5">{role}</div>
                <div className="text-[11px] text-slate-400">Nama, tanda tangan, tanggal</div>
              </div>
            ))}
          </div>
        </footer>
      </article>
    </div>
  )
}

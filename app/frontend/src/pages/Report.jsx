import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileText, Loader2, Printer } from 'lucide-react'
import { ApiError, VIEW_TYPES, getIdentificationReport } from '../lib/api.js'
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

/** INTERPOL DVI identification report for one confirmed PM–AM pair; print → PDF. */
export default function Report() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null) // { status, message }

  useEffect(() => {
    let cancelled = false
    setReport(null)
    setError(null)
    getIdentificationReport(id)
      .then((r) => !cancelled && setReport(r))
      .catch((err) => !cancelled && setError({ status: err instanceof ApiError ? err.status : 0, message: err.message }))
    return () => {
      cancelled = true
    }
  }, [id])

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

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-[13px] text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
        Menyusun laporan…
      </div>
    )
  }

  const { pm_subject: pm, am_subject: am, scores, decision, narrative } = report
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
        <button onClick={() => window.print()} className="btn-primary h-9 px-4 text-[12.5px]">
          <Printer className="h-3.5 w-3.5" />
          Cetak / simpan PDF
        </button>
      </div>

      <article className="card space-y-6 p-8 print:border-0 print:p-0 print:shadow-none">
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

        <Section no={4} title="Analisis & narasi temuan (Agentic RAG)">
          {narrative.status === 'available' ? (
            <>
              <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{narrative.content}</div>
              {narrative.references.length > 0 && (
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12px] text-slate-500">
                  {narrative.references.map((r, i) => (
                    <li key={i}>{r.title || r.source || JSON.stringify(r)}</li>
                  ))}
                </ol>
              )}
              {narrative.model_version && (
                <p className="mt-2 font-mono text-[11px] text-slate-400">Model: {narrative.model_version}</p>
              )}
            </>
          ) : (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[13px] text-amber-900">
                {narrative.message || 'Narasi belum tersedia.'} Bagian ini akan berisi sintesis temuan dari Agentic RAG
                (rujukan literatur odontologi forensik & panduan INTERPOL DVI) setelah layanan tersebut terhubung.
              </p>
            </div>
          )}
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

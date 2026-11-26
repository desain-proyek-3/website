// PDF version of the INTERPOL DVI identification report (pages/Report.jsx), rendered in the
// browser with @react-pdf/renderer so it downloads directly under a chosen file name.
// Real text (selectable/searchable, SHA-256 hashes copyable), not a screenshot.
// Loaded lazily — import() this module only when the user downloads.
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer'
import { TOOTH_STATUS } from '../lib/api.js'
import {
  VIEW_SHORT,
  featureLine,
  fmtConf,
  fmtDate,
  num,
  person,
  refLabel,
  viewLabel,
} from '../lib/reportFormat.js'

// Full Inter TTFs (public/fonts, OFL) — cover Indonesian text plus → Δ — · ⚠.
const asset = (path) => new URL(`${import.meta.env.BASE_URL}${path}`, window.location.origin).href
Font.register({
  family: 'Inter',
  fonts: [
    { src: asset('fonts/Inter-Regular.ttf'), fontWeight: 400 },
    { src: asset('fonts/Inter-Bold.ttf'), fontWeight: 700 },
  ],
})
// No automatic hyphenation (it would split Indonesian words and identifiers with "-").
Font.registerHyphenationCallback((word) => [word])

const A4_HEIGHT = 841.89 // pt

const C = {
  ink: '#1E293B',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  soft: '#F8FAFC',
  teal: '#0F766E',
}
const STATUS_COLOR = {
  consistent: { fg: '#0F766E', bg: '#F0FDFA', border: '#99F6E4' },
  discrepant: { fg: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  pm_only: { fg: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
  am_only: { fg: '#475569', bg: '#F1F5F9', border: '#E2E8F0' },
}

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 42, fontFamily: 'Inter', fontSize: 8.5, color: C.ink, lineHeight: 1.35 },
  readout: { fontSize: 6.5, letterSpacing: 1, color: C.muted, fontWeight: 700 },
  mono: { fontFamily: 'Courier', fontSize: 7 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 15, fontWeight: 700, marginTop: 4, lineHeight: 1.2 },
  subtitle: { marginTop: 5, color: C.muted },
  logo: { width: 92, marginLeft: 'auto' },
  meta: { fontSize: 7.5, color: C.muted, textAlign: 'right', marginTop: 4 },
  section: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, marginTop: 12 },
  sectionTitle: { fontSize: 10.5, fontWeight: 700, marginBottom: 7 },
  sectionNo: { color: C.teal },
  cols: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  box: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 5, padding: 8 },
  field: { flexDirection: 'row', paddingVertical: 1.6 },
  fieldLabel: { width: 92, color: C.muted },
  fieldValue: { flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 7 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1.5, fontSize: 7.5 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 4 },
  tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line },
  th: { flexDirection: 'row', backgroundColor: C.soft },
  thCell: { padding: 4, fontSize: 6.5, letterSpacing: 0.6, color: C.muted, fontWeight: 700 },
  td: { padding: 4 },
  note: { fontSize: 7, color: C.faint, marginTop: 5 },
  warnBox: { marginTop: 6, padding: 6, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', borderRadius: 4, color: '#92400E' },
  infoBox: { padding: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.soft, borderRadius: 4 },
  refRow: { flexDirection: 'row', gap: 4, marginTop: 2, color: C.muted },
  sigRow: { flexDirection: 'row', gap: 40, marginTop: 30 },
  sig: { flex: 1 },
  sigLine: { height: 36, borderBottomWidth: 1, borderBottomColor: C.faint },
  // Anchored with `top`, not `bottom`: on multi-page documents react-pdf resolves `bottom`
  // against the unpaginated content height and draws the footer off the page.
  footerLine: { position: 'absolute', top: A4_HEIGHT - 36, left: 42, right: 42, borderTopWidth: 1, borderTopColor: C.line },
  footerText: { position: 'absolute', top: A4_HEIGHT - 32, fontSize: 6.5, color: C.faint },
})

function Section({ no, title, children }) {
  return (
    <View style={s.section}>
      {/* Keep the heading together with the start of its content */}
      <Text style={s.sectionTitle} minPresenceAhead={60}>
        <Text style={s.sectionNo}>{no}. </Text>
        {title}
      </Text>
      {children}
    </View>
  )
}

function Field({ label, children }) {
  return (
    <View style={s.field} wrap={false}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{children || '–'}</Text>
    </View>
  )
}

function SubjectBox({ title, subject }) {
  return (
    <View style={s.box}>
      <Text style={s.readout}>{title}</Text>
      <View style={{ marginTop: 4 }}>
        <Field label="Nama / label">{subject.full_name}</Field>
        <Field label="Referensi kasus">{subject.case_reference}</Field>
        <Field label="ID subjek"><Text style={s.mono}>{subject.id}</Text></Field>
        <Field label="Dicatat">{`${fmtDate(subject.created_at)} · ${person(subject.created_by)}`}</Field>
        <Field label="Catatan">{subject.notes}</Field>
      </View>
    </View>
  )
}

const sideText = (side) =>
  side ? `${fmtConf(side.confidence)}  ${side.views.map((v) => VIEW_SHORT[v] || v).join('·')}` : 'tidak terdeteksi'

function Chip({ status, children }) {
  const c = STATUS_COLOR[status]
  return <Text style={[s.chip, { color: c.fg, backgroundColor: c.bg, borderColor: c.border }]}>{children}</Text>
}

const TOOTH_COLS = [
  { key: 'fdi', label: 'FDI', width: 30 },
  { key: 'status', label: 'STATUS', width: 66 },
  { key: 'pm', label: 'PM', width: 74 },
  { key: 'am', label: 'AM', width: 74 },
  { key: 'features', label: 'FITUR MORFOLOGI (PM → AM)', flex: 1 },
]

function ToothTable({ comparison }) {
  const { summary, teeth } = comparison
  return (
    <View>
      <View style={s.chipRow}>
        {Object.entries(TOOTH_STATUS).map(([key, st]) => (
          <Chip key={key} status={key}>{`${st.label}: ${summary[key]}`}</Chip>
        ))}
        <Text style={[s.chip, { color: C.muted, borderColor: C.line }]}>
          {`Fitur morfologi berbeda: ${summary.features_different}/${summary.features_compared}`}
        </Text>
      </View>
      {teeth.length === 0 ? (
        <Text style={{ color: C.muted }}>
          Belum ada hasil deteksi gigi untuk dibandingkan — jalankan AI pada citra PM dan AM terlebih dahulu.
        </Text>
      ) : (
        <View style={s.table}>
          <View style={s.th} fixed>
            {TOOTH_COLS.map((c) => (
              <Text key={c.key} style={[s.thCell, c.width ? { width: c.width } : { flex: c.flex }]}>{c.label}</Text>
            ))}
          </View>
          {teeth.map((t) => (
            <View key={t.fdi_number} style={s.tr} wrap={false}>
              <Text style={[s.td, { width: 30, fontWeight: 700 }]}>{t.fdi_number}</Text>
              <View style={[s.td, { width: 66 }]}>
                <Chip status={t.status}>{TOOTH_STATUS[t.status].label}</Chip>
              </View>
              <Text style={[s.td, { width: 74, color: t.pm ? C.ink : C.faint }]}>{sideText(t.pm)}</Text>
              <Text style={[s.td, { width: 74, color: t.am ? C.ink : C.faint }]}>{sideText(t.am)}</Text>
              <View style={[s.td, { flex: 1 }]}>
                {t.features.length === 0 ? (
                  <Text style={{ color: C.faint }}>{t.pm && t.am ? 'tidak ada data morfologi' : '–'}</Text>
                ) : (
                  t.features.map((f) => (
                    <Text
                      key={f.feature}
                      style={f.status === 'different' ? { color: '#B45309', fontWeight: 700 } : { color: C.muted }}
                    >
                      {featureLine(f)}
                    </Text>
                  ))
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      <Text style={s.note}>
        Gigi dari 3 sudut citra digabung (deteksi dengan confidence tertinggi; D/Ki/Ka = sudut tempat gigi terdeteksi).
        Gigi yang tidak terdeteksi belum tentu tidak ada — interpretasi klinis tetap pada odontolog.
      </Text>
    </View>
  )
}

function AiAnalysis({ narrative }) {
  if (narrative.status !== 'available') {
    return (
      <View style={s.infoBox}>
        <Text style={{ fontWeight: 700 }}>Analisis AI tidak tersedia.</Text>
        {narrative.message ? <Text style={{ color: C.muted, marginTop: 2 }}>{narrative.message}</Text> : null}
      </View>
    )
  }
  return (
    <View>
      <Text style={{ fontSize: 9, lineHeight: 1.5 }}>{narrative.content}</Text>
      {narrative.warnings.length > 0 && (
        <View style={s.warnBox} wrap={false}>
          {narrative.warnings.map((w, i) => (
            <Text key={i}>⚠ {w}</Text>
          ))}
        </View>
      )}
      {narrative.references.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={s.readout} minPresenceAhead={20}>RUJUKAN</Text>
          {narrative.references.map((r, i) => (
            <View key={i} style={s.refRow} wrap={false}>
              <Text style={{ width: 18, color: C.faint }}>[{r.n ?? i + 1}]</Text>
              <Text style={{ flex: 1 }}>{refLabel(r)}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={s.note}>
        {`Disusun AI${narrative.model_version ? ` (${narrative.model_version})` : ''} pada ${fmtDate(narrative.generated_at)}. ` +
          'Analisis ini merupakan alat bantu dan harus diverifikasi oleh odontolog forensik.'}
      </Text>
    </View>
  )
}

const CUSTODY_COLS = [
  { label: 'SUBJEK', width: 36 },
  { label: 'SUDUT', width: 44 },
  { label: 'SHA-256', width: 278 },
  { label: 'DIUNGGAH', flex: 1 },
  { label: 'GIGI', width: 28 },
]

function CustodyTable({ images, subjectLabel }) {
  return (
    <View>
      <View style={s.table}>
        <View style={s.th} fixed>
          {CUSTODY_COLS.map((c) => (
            <Text key={c.label} style={[s.thCell, c.width ? { width: c.width } : { flex: c.flex }]}>{c.label}</Text>
          ))}
        </View>
        {images.map((img) => (
          <View key={img.dental_image_id} style={s.tr} wrap={false}>
            <Text style={[s.td, { width: 36, fontWeight: 700 }]}>{subjectLabel(img.subject_id)}</Text>
            <Text style={[s.td, { width: 44 }]}>{viewLabel(img.view_type)}</Text>
            <Text style={[s.td, s.mono, { width: 278, fontSize: 6.8 }]}>{img.file_hash}</Text>
            <View style={[s.td, { flex: 1 }]}>
              <Text>{fmtDate(img.uploaded_at)}</Text>
              <Text style={{ color: C.faint, fontSize: 7 }}>{person(img.uploaded_by)}</Text>
            </View>
            <Text style={[s.td, { width: 28 }]}>{img.teeth_detected}</Text>
          </View>
        ))}
      </View>
      <Text style={s.note}>
        Hash SHA-256 dihitung saat citra diunggah dan dapat dipakai untuk memverifikasi bahwa berkas citra tidak berubah.
      </Text>
    </View>
  )
}

function ReportDocument({ report, narrative, downloadedAt }) {
  const { pm_subject: pm, am_subject: am, scores, decision } = report
  const subjectLabel = (sid) => (sid === pm.id ? 'PM' : 'AM')
  const images = [...report.images].sort(
    (a, b) => subjectLabel(b.subject_id).localeCompare(subjectLabel(a.subject_id)) || a.view_type.localeCompare(b.view_type),
  )
  const caseRef = report.case_reference || '–'

  return (
    <Document
      title={`Laporan Identifikasi ${caseRef}`}
      author={person(report.generated_by)}
      subject="INTERPOL DVI Identification Report"
      creator="Dentify"
      producer="Dentify"
      language="id-ID"
    >
      <Page size="A4" style={s.page}>
        {/* Repeated on every page; declared first so it is laid out before the content flows. */}
        <View style={s.footerLine} fixed />
        <Text style={[s.footerText, { left: 42 }]} fixed>{`Dentify · Laporan identifikasi · ${caseRef}`}</Text>
        <Text
          style={[s.footerText, { right: 42, textAlign: 'right' }]}
          fixed
          render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} dari ${totalPages}`}
        />

        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.readout}>INTERPOL DVI · IDENTIFICATION REPORT</Text>
            <View>
              <Text style={s.title}>Laporan Identifikasi Odontologi Forensik</Text>
            </View>
            <View style={[s.subtitle, { flexDirection: 'row' }]}>
              <Text>Referensi kasus: </Text>
              <Text style={{ color: C.ink, fontWeight: 700 }}>{caseRef}</Text>
            </View>
          </View>
          <View style={{ width: 190 }}>
            <Image src={asset('logo-dentify.png')} style={s.logo} />
            <Text style={s.meta}>{`Dibuat ${fmtDate(report.generated_at)}`}</Text>
            <Text style={[s.meta, { marginTop: 0 }]}>{`oleh ${person(report.generated_by)}`}</Text>
            <Text style={[s.meta, { marginTop: 0 }]}>{`Diunduh ${fmtDate(downloadedAt)}`}</Text>
            <Text style={[s.meta, s.mono, { marginTop: 2, fontSize: 6.5 }]}>{`ID pencocokan ${report.matching_result_id}`}</Text>
          </View>
        </View>

        <Section no={1} title="Identitas subjek">
          <View style={s.cols}>
            <SubjectBox title="POST-MORTEM (KORBAN)" subject={pm} />
            <SubjectBox title="ANTE-MORTEM (ORANG HILANG)" subject={am} />
          </View>
        </Section>

        <Section no={2} title="Hasil pencocokan & keputusan odontolog">
          <View style={s.cols}>
            <View style={s.col}>
              <Field label="Confidence">{num(scores.confidence_score, 2, '%')}</Field>
              <Field label="Cosine similarity">{num(scores.cosine_similarity, 4)}</Field>
              <Field label="Peringkat kandidat">{scores.rank ? `#${scores.rank}` : '–'}</Field>
              <Field label="Superimposition">{num(scores.superimposition_score)}</Field>
              <Field label="Selisih morfologi">{num(scores.morphology_diff_score)}</Field>
            </View>
            <View style={s.col}>
              <Field label="Keputusan">
                <Text style={{ color: C.teal, fontWeight: 700 }}>IDENTIFIKASI DIKONFIRMASI</Text>
              </Field>
              <Field label="Dikonfirmasi oleh">{person(decision.decided_by)}</Field>
              <Field label="Waktu konfirmasi">{fmtDate(decision.decided_at)}</Field>
              <Field label="Pencocokan oleh">{person(decision.matched_by)}</Field>
              <Field label="Waktu pencocokan">{fmtDate(decision.matched_at)}</Field>
            </View>
          </View>
        </Section>

        <Section no={3} title="Perbandingan gigi (FDI) PM vs AM">
          <ToothTable comparison={report.comparison} />
        </Section>

        <Section no={4} title="Analisis AI">
          <AiAnalysis narrative={narrative} />
        </Section>

        <Section no={5} title="Chain-of-custody citra">
          <CustodyTable images={images} subjectLabel={subjectLabel} />
        </Section>

        <View style={s.section} wrap={false}>
          <Text style={{ fontSize: 7.5, color: C.muted }}>
            Laporan ini disusun otomatis oleh sistem Dentify dari data pencocokan dan hasil deteksi AI, dan baru sah
            setelah diperiksa serta ditandatangani odontolog forensik yang berwenang.
          </Text>
          <View style={s.sigRow}>
            {['Odontolog forensik pemeriksa', 'Ketua tim DVI'].map((role) => (
              <View key={role} style={s.sig}>
                <View style={s.sigLine} />
                <Text style={{ marginTop: 3 }}>{role}</Text>
                <Text style={{ fontSize: 7, color: C.faint }}>Nama, tanda tangan, tanggal</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  )
}

/** Render the report to PDF and save it via a download link (no print dialog). */
export async function downloadReportPdf({ report, narrative, filename }) {
  const blob = await pdf(<ReportDocument report={report} narrative={narrative} downloadedAt={new Date()} />).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export { ReportDocument }

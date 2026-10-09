/**
 * Demo data for DVI operations.
 */

export const CASE = {
  id: 'DVI-2026-PLU-04',
  event: 'Tanggap Darurat DVI Coastal Collapse, Sektor 4',
  site: 'Posko Forensik Palu',
  pmRecords: 312,
  amRecords: 268,
  opened: '14 Sep 2026',
}

export const AI_PIPELINE_STACK = [
  {
    name: 'CNN Feature Extractor',
    role: 'Deteksi Bounding Box & Morfologi Mahkota Gigi',
    version: 'dental-yolo-v8 / ResNet-101',
    status: 'Active',
  },
  {
    name: 'RNN Sequence Alignment',
    role: 'Analisis Lengkung Rahang & Relasi Posisi Gigi',
    version: 'Bi-LSTM dental-arch-v2',
    status: 'Active',
  },
  {
    name: 'Agentic RAG Engine',
    role: 'Pencarian & Korelasi Multi-Sumber Rekam Medis AM',
    version: 'Agentic-DVI-RAG-v4',
    status: 'Active',
  },
]

export const MATCH_PROGRESS = {
  completed: 94,
  pending: 4,
  pairsResolved: 128,
  pairsTotal: 136,
  meters: [
    {
      label: 'CNN Morphology & Crown Boundary',
      value: 91,
      hint: 'Ekstraksi bentuk cusp dan kontur mahkota 32 landmark konsisten',
      tone: 'teal',
    },
    {
      label: 'RNN Dental Arch Sequence Alignment',
      value: 84,
      hint: 'Kurva Spee dan orientasi rotasi kuadran bawah sesuai urutan AM',
      tone: 'teal',
    },
    {
      label: 'Agentic RAG Record Correlation',
      value: 96,
      hint: 'Amalgam pada #26 dan #36 terkonfirmasi dari 3 arsip klinik',
      tone: 'teal',
    },
  ],
}

export const AI_INSIGHTS = {
  confidence: 98.4,
  model: 'Agentic RAG + CNN/RNN Ensemble · v4',
  retrieved: 6,
  findings: [
    {
      key: 'Midline alignment',
      value: '+0.4 mm',
      state: 'match',
      note: 'Upper midline sits right of facial midline in both records (RNN curve verified).',
    },
    {
      key: 'Canine relation',
      value: 'Class I',
      state: 'match',
      note: 'Bilateral Class I confirmed from intraoral series via CNN extraction.',
    },
    {
      key: 'Overbite depth',
      value: '3.2 mm',
      state: 'review',
      note: 'PM value is 0.6 mm deeper; jaw drift is the likely cause.',
    },
    {
      key: 'Root canal on #46',
      value: 'Absent in PM',
      state: 'conflict',
      note: 'Tooth #46 missing post-mortem; flagged by RAG as non-fatal trauma artifact.',
    },
  ],
  sources: [
    'AM dental chart · Klinik Sehat, 2024-03-11',
    'PM intraoral series · Tim Alicia Kiyoumi, 2026-09-16',
    'Interpol DVI form F1, section D',
  ],
}

export const COMPARISON = {
  am: {
    title: 'Baseline scan (AM)',
    tag: 'AM',
    source: 'Klinik Sehat · panoramic',
    captured: '11 Mar 2024',
    quality: 'Diagnostic',
    facts: [
      ['Teeth present', '28'],
      ['Restorations', '2 amalgam'],
      ['Third molars', 'Extracted'],
    ],
  },
  pm: {
    title: 'Post-mortem scan (PM)',
    tag: 'PM',
    source: 'Posko Forensik · portable panoramic',
    captured: '16 Sep 2026',
    quality: 'Reduced — fractured crowns',
    facts: [
      ['Teeth present', '27'],
      ['Restorations', '2 amalgam'],
      ['Third molars', 'Absent'],
    ],
  },
  agreements: [
    { label: 'Amalgam on #26', status: 'match' },
    { label: 'Amalgam on #36', status: 'match' },
    { label: 'Rotation of #27', status: 'match' },
    { label: 'Tooth #46 present', status: 'conflict' },
    { label: 'Crown height #24–#25', status: 'review' },
  ],
}

/**
 * AI Candidate Triage for Dashboard
 * Thresholds:
 *   ≥ 79%  : High Match Candidate (Lolos seleksi AI)
 *   50–78% : Borderline / Ambiguous (Perlu re-scan atau validasi manual)
 *   < 50%  : Definite Exclusion (Kontradiksi fatal, dieliminasi)
 */
export const AI_CANDIDATE_TRIAGE = [
  {
    id: 'AM-2291',
    pmId: 'PM-0418',
    name: 'Alicia Kiyoumi',
    age: 23,
    score: 98.4,
    tier: 'high', // high >= 79
    clinic: 'Klinik Sehat, Palu',
    cnnScore: 98,
    rnnScore: 96,
    ragScore: 99,
    statusNote: 'Karakteristik restorasi amalgam #26/#36 dan rotasi molar identik.',
  },
  {
    id: 'AM-2140',
    pmId: 'PM-0422',
    name: 'Jonathan Kosasih',
    age: 23,
    score: 84.6,
    tier: 'high', // high >= 79
    clinic: 'RS Bhayangkara, Palu',
    cnnScore: 88,
    rnnScore: 82,
    ragScore: 86,
    statusNote: 'Full-coverage crown #30 cocok; sedikit artefak under-exposed.',
  },
  {
    id: 'AM-2317',
    pmId: 'PM-0431',
    name: 'Bonifasius Radit',
    age: 23,
    score: 74.0,
    tier: 'borderline', // 50 - 78
    clinic: 'Puskesmas Talise',
    cnnScore: 78,
    rnnScore: 68,
    ragScore: 76,
    statusNote: 'Anterior selaras, namun distorsi lengkung rahang akibat benturan.',
  },
  {
    id: 'AM-1904',
    pmId: 'PM-0435',
    name: 'Gregorius Leslie',
    age: 23,
    score: 63.5,
    tier: 'borderline', // 50 - 78
    clinic: 'Klinik Gigi Sentosa',
    cnnScore: 66,
    rnnScore: 60,
    ragScore: 65,
    statusNote: 'Pola tambalan mirip, tetapi resolusi citra PM rendah (kamera intraoral buram).',
  },
  {
    id: 'AM-1882',
    pmId: 'PM-0440',
    name: 'Gangsar Satryajati',
    age: 23,
    score: 41.2,
    tier: 'excluded', // < 50
    clinic: 'RSUP Undata',
    cnnScore: 44,
    rnnScore: 38,
    ragScore: 41,
    statusNote: 'Fatal conflict: Molar #36 utuh di PM, namun di rekam AM dicabut tahun 2021.',
  },
]

export const REVIEW_QUEUE = [
  {
    id: 'PM-0418',
    name: 'Alicia Kiyoumi',
    age: 23,
    amRef: 'AM-2291',
    confidence: 98,
    flagged: ['#14', '#15'],
    recovered: 'Grid C4 · Posko Sektor 1',
    summary:
      'Crown outline, pulp chamber shape and mesial restoration margin on teeth #14 and #15 align with the ante-mortem chart. The engine found 12.4° rotation on the upper left first molar.',
    highlight: [24, 25, 26],
    pillars: {
      cnnScore: 98,
      cnnNote: 'Morfologi mahkota & batas cusp #14/#15 identik (IoU 0.94)',
      rnnScore: 96,
      rnnNote: 'Lengkung oklusal & rotasi molar 12.4° selaras dengan kurva AM',
      ragScore: 99,
      ragNote: '3 arsip odontogram klinik mengonfirmasi restorasi komposit mesial',
      contradiction: 'None (Zero Fatal Contradictions)',
      contradictionStatus: 'clear',
    },
  },
  {
    id: 'PM-0422',
    name: 'Jonathan Kosasih',
    age: 23,
    amRef: 'AM-2140',
    confidence: 85,
    flagged: ['#30'],
    recovered: 'Grid C6 · Posko Sektor 2',
    summary:
      'Full-coverage crown on #30 matches the ante-mortem record, but the post-mortem film is under-exposed on the right posterior segment.',
    highlight: [46],
    pillars: {
      cnnScore: 88,
      cnnNote: 'Full-coverage crown #30 terdeteksi, sedikit underexposed di distal',
      rnnScore: 82,
      rnnNote: 'Orientasi oklusi kuadran 4 cocok dalam toleransi margin 0.3mm',
      ragScore: 86,
      ragNote: 'Catatan prostodonsia AM 2022 cocok dengan margin preparasi',
      contradiction: 'Minor artifact: pencahayaan rendah pada segmen kanan',
      contradictionStatus: 'warning',
    },
  },
  {
    id: 'PM-0431',
    name: 'Bonifasius Radit',
    age: 23,
    amRef: 'AM-2317',
    confidence: 74,
    flagged: ['#8', '#9'],
    recovered: 'Grid D1 · Posko Utama',
    summary:
      'Anterior morphology is consistent. Second reviewer confirmation required before release.',
    highlight: [11, 21],
    pillars: {
      cnnScore: 78,
      cnnNote: 'Incisivus sentral #8/#9 cocok, namun tepi insisal fraktur ringan',
      rnnScore: 69,
      rnnNote: 'Deviasi jarak inter-canine 0.8mm akibat pergeseran post-mortem',
      ragScore: 75,
      ragNote: 'Riwayat pembersihan karang gigi AM selaras, data periapikal nihil',
      contradiction: 'Borderline: fraktur insisal baru perlu verifikasi trauma',
      contradictionStatus: 'warning',
    },
  },
  {
    id: 'PM-0435',
    name: 'Gregorius Leslie',
    age: 23,
    amRef: 'AM-1904',
    confidence: 64,
    flagged: ['#11', '#12'],
    recovered: 'Grid B4 · Posko Sektor 3',
    summary:
      'Anatomi kaninus dan insisivus lateral mendekati rekam AM, namun resolusi citra kamera intraoral pada segmen anterior buram sehingga membutuhkan verifikasi tambahan.',
    highlight: [11, 12],
    pillars: {
      cnnScore: 66,
      cnnNote: 'Resolusi citra rendah; batas batas restorasi servikal kabur',
      rnnScore: 60,
      rnnNote: 'Lengkung rahang atas konsisten dengan deviasi minimal',
      ragScore: 65,
      ragNote: 'Catatan penambalan karies superfisial AM cocok parsial',
      contradiction: 'Borderline: artefak gambar buram perlu re-scan sudut labial',
      contradictionStatus: 'warning',
    },
  },
  {
    id: 'PM-0440',
    name: 'Gangsar Satryajati (Kandidat Tereliminasi)',
    age: 23,
    amRef: 'AM-1882',
    confidence: 41,
    flagged: ['#36', '#46'],
    recovered: 'Grid B2 · Posko Lapangan 3',
    summary:
      'AI mendeteksi kontradiksi fatal: Gigi molar #36 utuh di radiograf PM, namun di rekam medis AM tercatat telah diekstraksi pada tahun 2021. Eliminasi otomatis oleh filter konsistensi.',
    highlight: [36],
    pillars: {
      cnnScore: 44,
      cnnNote: 'Morfologi oklusal tidak cocok dengan arsip cetak gigi AM',
      rnnScore: 38,
      rnnNote: 'Struktur lengkung rahang berbeda signifikan pada regio premolar',
      ragScore: 41,
      ragNote: 'Rekam ekstraksi AM #36 bertolak belakang dengan kondisi fisik PM',
      contradiction: 'Fatal Contradiction: Gigi #36 hadir di PM tapi dicabut di AM',
      contradictionStatus: 'danger',
    },
  },
]


export const FOLLOW_UP = [
  { time: '09:30', title: 'Sesi Review Tim', who: 'Alicia Kiyoumi + Jonathan Kosasih', place: 'Ruang Posko 2' },
  { time: '11:00', title: 'Briefing Rekonsiliasi Tim', who: 'Bonifasius Radit', place: 'Posko Utama' },
  { time: '14:15', title: 'Re-scan PM-0422 Segmen Kanan', who: 'Gregorius Leslie', place: 'Mobile Unit' },
  { time: '16:00', title: 'Handover Harian DVI', who: 'Gangsar Satryajati', place: 'Tenda Komando' },
]

export const TOOTH_DATA = [
  { label: 'Molar rotation', value: '12.4°', ref: 'AM 12.1° · Δ 0.3°', state: 'match' },
  { label: 'Inter-arch gap', value: '2.1 mm', ref: 'AM 2.0 mm · Δ 0.1 mm', state: 'match' },
  { label: 'Crown height #15', value: '7.8 mm', ref: 'AM 7.9 mm · Δ 0.1 mm', state: 'match' },
  { label: 'Overbite depth', value: '3.2 mm', ref: 'AM 2.6 mm · Δ 0.6 mm', state: 'review' },
  { label: 'Curve of Spee', value: '1.9 mm', ref: 'AM 1.8 mm · Δ 0.1 mm', state: 'match' },
]

export const ACTIVITY_LOG = [
  {
    time: '16 Sep · 08:12',
    record: 'PM-0418',
    action: 'Intraoral 3-view uploaded',
    detail: 'frontal, right buccal, left buccal',
    operator: 'Gangsar Satryajati',
    status: 'complete',
  },
  {
    time: '16 Sep · 08:19',
    record: 'PM-0418',
    action: 'CNN Feature extraction',
    detail: '32 landmarks · 0.02 mm precision',
    operator: 'CNN Model v8',
    status: 'complete',
  },
  {
    time: '16 Sep · 08:24',
    record: 'PM-0418',
    action: 'Agentic RAG candidate retrieval',
    detail: 'Top 6 candidate ranked from 268 records',
    operator: 'Agentic RAG',
    status: 'complete',
  },
  {
    time: '16 Sep · 08:31',
    record: 'PM-0418 ↔ AM-2291',
    action: 'Match scored 98.4%',
    detail: 'Lolos threshold ≥79% (High Probability)',
    operator: 'Ensemble Evaluator',
    status: 'flagged',
  },
  {
    time: '16 Sep · 09:02',
    record: 'PM-0422',
    action: 'RNN Arch alignment run',
    detail: 'Segmen posterior kanan underexposed (84.6%)',
    operator: 'RNN Arch Align',
    status: 'attention',
  },
  {
    time: '16 Sep · 09:14',
    record: 'PM-0440',
    action: 'Auto-Exclusion trigger',
    detail: 'Kontradiksi fatal gigi #36 (Skor 41.2% < 50%)',
    operator: 'Contradiction Filter',
    status: 'complete',
  },
]

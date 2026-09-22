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

export const MATCH_PROGRESS = {
  completed: 94,
  pending: 4,
  pairsResolved: 128,
  pairsTotal: 136,
  meters: [
    {
      label: 'Cephalometric alignment',
      value: 91,
      hint: '36 of 40 landmarks resolved within tolerance',
      tone: 'teal',
    },
    {
      label: 'Morphology consistency',
      value: 78,
      hint: 'Crown outline drift on lower left quadrant',
      tone: 'amber',
    },
    {
      label: 'Restoration signature',
      value: 96,
      hint: 'Amalgam on #26 and #36 present in both records',
      tone: 'teal',
    },
  ],
}

export const AI_INSIGHTS = {
  confidence: 98.4,
  model: 'Agentic RAG · dental-forensic-v4',
  retrieved: 6,
  findings: [
    {
      key: 'Midline alignment',
      value: '+0.4 mm',
      state: 'match',
      note: 'Upper midline sits right of facial midline in both records.',
    },
    {
      key: 'Canine relation',
      value: 'Class I',
      state: 'match',
      note: 'Bilateral Class I confirmed from intraoral series.',
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
      note: 'Tooth #46 is missing post-mortem, filling cannot be verified.',
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

export const REVIEW_QUEUE = [
  {
    id: 'PM-0418',
    name: 'Alicia Kiyoumi',
    age: 34,
    amRef: 'AM-2291',
    confidence: 98,
    flagged: ['#14', '#15'],
    recovered: 'Grid C4 · Posko Sektor 1',
    summary:
      'Crown outline, pulp chamber shape and mesial restoration margin on teeth #14 and #15 align with the ante-mortem chart. The engine found 12.4° rotation on the upper left first molar.',
    highlight: [24, 25, 26],
  },
  {
    id: 'PM-0422',
    name: 'Jonathan Kosasih',
    age: 51,
    amRef: 'AM-2140',
    confidence: 91,
    flagged: ['#30'],
    recovered: 'Grid C6 · Posko Sektor 2',
    summary:
      'Full-coverage crown on #30 matches the ante-mortem record, but the post-mortem film is under-exposed on the right posterior segment.',
    highlight: [46],
  },
  {
    id: 'PM-0431',
    name: 'Bonifasius Radit',
    age: 28,
    amRef: 'AM-2317',
    confidence: 76,
    flagged: ['#8', '#9'],
    recovered: 'Grid D1 · Posko Utama',
    summary:
      'Anterior morphology is consistent. Second reviewer confirmation required before release.',
    highlight: [11, 21],
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
    action: 'Feature extraction',
    detail: '32 landmarks · 0.02 mm precision',
    operator: 'AI engine',
    status: 'complete',
  },
  {
    time: '16 Sep · 08:24',
    record: 'PM-0418',
    action: 'AM candidate retrieval',
    detail: '6 candidates from 268 records',
    operator: 'Agentic RAG',
    status: 'complete',
  },
  {
    time: '16 Sep · 08:31',
    record: 'PM-0418 ↔ AM-2291',
    action: 'Match scored 98.4%',
    detail: 'flagged for human confirmation',
    operator: 'Alicia Kiyoumi',
    status: 'flagged',
  },
  {
    time: '16 Sep · 09:02',
    record: 'PM-0422',
    action: 'Radiograph quality check',
    detail: 'right posterior under-exposed',
    operator: 'Gregorius Leslie',
    status: 'attention',
  },
  {
    time: '16 Sep · 09:14',
    record: 'PM-0431',
    action: 'AI analysis running',
    detail: 'morphology pass 2 of 3',
    operator: 'Jonathan Kosasih',
    status: 'running',
  },
]

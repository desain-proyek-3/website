# DENTIFY — Dental Identification

Antarmuka DVI (Disaster Victim Identification) berbasis dental biometrics. Mencocokkan data
**Post-Mortem (PM)** dengan **Ante-Mortem (AM)**, dengan skor AI sebagai urutan antrean —
bukan sebagai keputusan akhir. Setiap match tetap dirilis oleh odontolog forensik.

## Menjalankan

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output ke dist/
```

Stack: React 18 · Vite 5 · Tailwind CSS 3 · React Router 6 · lucide-react.

## Halaman

| Route        | Isi |
|--------------|-----|
| `/`          | Landing: hero, viewer radiografi gelap + floating badges, CTA "Start Identification" |
| `/dashboard` | Radial gauge 94%, meter Landmark/Morphology/Restoration, AI Insights (Agentic RAG), komparasi AM vs PM |
| `/review`    | Banner antrean, kartu "AI review required" (approve/reject interaktif), preview panoramik, jadwal tim |
| `/analysis`  | Viewport overlay "LIVE ARCH MAPPING", slider distribusi Low/Med/High, tooth-level data, activity log |

## Struktur

```
src/
├─ App.jsx                 # routing
├─ index.css               # token Tailwind + komponen (.card, .chip, .readout, slider)
├─ lib/
│  ├─ arch.js              # geometri lengkung gigi (parabola oklusal, FDI + Universal numbering)
│  └─ data.js              # seluruh data kasus — ganti file ini saat menyambung ke API
├─ components/
│  ├─ AppShell.jsx         # sidebar + header search, drawer di mobile
│  ├─ Radiograph.jsx       # radiograf panoramik SVG + overlay forensik
│  ├─ RadialGauge.jsx      # dial match (teal = confirmed, amber = pending)
│  ├─ MeterBar.jsx
│  └─ Logo.jsx
└─ pages/                  # Landing, Dashboard, Review, Analysis
```

## Catatan teknis

**Warna** didefinisikan di `tailwind.config.js`: `teal-700/600/500` (primary), `canvas` `#F8FAFC`,
`viewer-800` `#0F172A` untuk viewer, `ink` `#1E293B`, serta `signal.amber` / `signal.cyan` untuk
badge confidence.

**Aksesibilitas:** focus ring terlihat di semua kontrol, `prefers-reduced-motion` dihormati,
progress bar memakai `role="progressbar"`, setiap radiograf punya `aria-label`.

Antarmuka ini demo. Jangan dipakai untuk identifikasi operasional tanpa validasi klinis.

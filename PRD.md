# **Dentify: AI-Powered Dental Identification for Disaster Victims**

> **Version:** 1.0.0  
> **Last Updated:** 2026-05-04  
> **Scope:** PRD + Technical Architecture + ML Strategy + Infrastructure

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Success Metrics](#3-goals--success-metrics)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [Hardware Layer](#5-hardware-layer)
6. [Computer Vision Pipeline (Faster RCNN)](#6-computer-vision-pipeline-faster-rcnn)
7. [ML Retrieval Strategy — RAG vs CAG vs Agentic RAG](#7-ml-retrieval-strategy--rag-vs-cag-vs-agentic-rag)
8. [Recommended Stack: Agentic RAG](#8-recommended-stack-agentic-rag)
9. [Database Architecture](#9-database-architecture)
10. [Matching Engine — Ante-mortem vs Post-mortem](#10-matching-engine--ante-mortem-vs-post-mortem)
11. [Application Layer](#11-application-layer)
12. [Security & Privacy](#12-security--privacy)
13. [Infrastructure & Deployment](#13-infrastructure--deployment)
14. [Team Responsibilities](#14-team-responsibilities)
15. [Timeline — 8 Months](#15-timeline--8-months)
16. [API Contracts](#16-api-contracts)
17. [Risk Register](#17-risk-register)
18. [Glossary](#18-glossary)

---

## 1. Project Overview

**SmartDVI** (Smart Disaster Victim Identification) adalah sistem identifikasi forensik berbasis AI yang dirancang untuk mempercepat dan mengotomasi proses identifikasi korban bencana alam melalui analisis forensik dental (odontologi).

Sistem ini menggabungkan tiga teknologi inti:

- **Faster R-CNN** — Computer Vision untuk segmentasi, landmark detection, dan ekstraksi fitur morfologi gigi dari foto intraoral multi-sudut
- **Agentic RAG / CAG** — Retrieval-Augmented Generation berbasis jurnal forensik odontologi untuk analisis klinis dan laporan identifikasi
- **Smart Holder Hardware** — Perangkat keras intraoral camera dengan NFC authentication dan wireless charging

Sistem bekerja dalam dua alur paralel:

```
ANTE-MORTEM (AM)              POST-MORTEM (PM)
Rekam medis gigi hidup   vs   Foto gigi korban bencana
Foto klinik ortodonti         3 sudut: frontal, oklusal atas, bawah
Dokumentasi FDI               Real-time di lapangan
        ↓                              ↓
              MATCHING ENGINE (AI)
              Superimposisi + Morfologi + Feature Vector
                        ↓
              LAPORAN IDENTIFIKASI
              Confidence score + Referensi jurnal
```

---

## 2. Problem Statement

### Konteks

Indonesia adalah negara dengan frekuensi bencana alam tertinggi di dunia. Identifikasi korban bencana massal (Mass Disaster Victim Identification) secara konvensional memiliki keterbatasan kritis:

| Metode Konvensional | Masalah |
|---|---|
| Sidik jari | Rusak akibat pembusukan, tekanan fisik, atau suhu ekstrem |
| DNA | Mahal, butuh 3–7 hari di laboratorium, perlu sampel keluarga |
| Visual | Tidak valid bila kondisi jenazah parah |
| Odontologi manual | Akurat, tapi lambat dan bergantung pada ahli forensik |

### Gap yang Diselesaikan

Forensik dental memiliki keunggulan alami — gigi adalah bagian tubuh paling tahan rusak. Namun proses matching ante-mortem vs post-mortem masih dilakukan secara manual oleh dokter gigi forensik, memakan waktu berhari-hari, dan tidak bisa dijalankan di lapangan.

**SmartDVI menyelesaikan gap ini** dengan pipeline AI yang:

1. Bisa dijalankan di lapangan bencana tanpa koneksi internet (offline mode)
2. Mengotomasi matching dari foto intraoral ke database rekam medis
3. Menghasilkan laporan forensik terstandar dalam hitungan menit, bukan hari

---

## 3. Goals & Success Metrics

### Primary Goals

- Kurangi waktu identifikasi korban dari rata-rata 3 hari → < 30 menit per kasus
- Akurasi matching dental ≥ 85% pada confidence threshold 90%
- Sistem bisa beroperasi 100% offline di lapangan bencana
- Data identik dengan standar INTERPOL DVI (AM/PM form)

### Key Performance Indicators

| Metric | Target | Metode Ukur |
|---|---|---|
| Matching accuracy (top-1) | ≥ 85% | Evaluasi dengan dataset berlabel |
| Matching accuracy (top-5) | ≥ 95% | Retrieval recall@5 |
| CNN detection confidence | ≥ 90% per gigi | YOLOv8 / Faster R-CNN conf score |
| Landmark localization error | ≤ 2mm | MRE (Mean Radial Error) |
| Inference time (full pipeline) | < 60 detik | Wall-clock benchmark |
| Uptime sistem (online mode) | 99.5% | Server monitoring |
| False positive rate | < 5% | Confusion matrix |

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HARDWARE LAYER                               │
│  Intraoral Camera Holder · NFC Auth · Wireless Charging · RPi 5     │
└────────────────────────────┬────────────────────────────────────────┘
                             │ USB-C / Bluetooth
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MOBILE / WEB APPLICATION                         │
│  Android / iOS / Web · NFC deep-link · Preview · Quality check      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST API / WebSocket
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     BACKEND API SERVER                              │
│  FastAPI · JWT Auth · Rate limiting · Audit trail                   │
│                             │                                       │
│         ┌───────────────────┼───────────────────┐                  │
│         ▼                   ▼                   ▼                  │
│  ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐         │
│  │  CV Engine  │   │  RAG Engine  │   │  Matching Engine │         │
│  │ Faster RCNN │   │ Agentic RAG  │   │  Feature Vector  │         │
│  │ Landmark    │   │ ChromaDB     │   │  Superimposisi   │         │
│  │ Morphology  │   │ LLM (Qwen3)  │   │  Similarity      │         │
│  └─────────────┘   └──────────────┘   └─────────────────┘         │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌──────────┐  ┌──────────────┐  ┌──────────────┐
       │ PostreSQL│  │  ChromaDB    │  │  MinIO /     │
       │ AM/PM DB │  │  Vector DB   │  │  File Store  │
       └──────────┘  └──────────────┘  └──────────────┘
```

### Mode Operasional

| Mode | Koneksi | Kapabilitas |
|---|---|---|
| **Offline** | Tidak ada | CV detection + landmark + simpan lokal |
| **Mesh** | WiFi Direct antar device | Sinkronisasi antar tim lapangan |
| **Online** | Internet | Full matching + RAG report + sync ke server |

---

## 5. Hardware Layer

### 5.1 Intraoral Camera Holder

Holder dirancang untuk menampung smartphone dan kamera intraoral dengan form factor ergonomis untuk penggunaan di lapangan bencana.

**Spesifikasi teknis:**

| Komponen | Spesifikasi | Tanggung Jawab |
|---|---|---|
| Kamera intraoral | USB-C / wireless, resolusi min 5MP, IP67 | Tim Elektro |
| LED ring | 6500K daylight, dimmable, heat-managed | Tim Elektro |
| NFC module | NTAG215 / PN532, 13.56MHz | Tim Elektro |
| Wireless charging | Qi standard, 10W, thermal protection | Tim Elektro |
| PCB | Custom thin PCB < 4mm, battery management | Tim Elektro |
| Frame | Material non-logam di area koil, sterilizable | Tim Elektro |
| MCU | Raspberry Pi 5 (4GB) — on-device ML | Tim Komputer |

### 5.2 Sudut Foto Standar (3 View Protocol)

```
View 1: FRONTAL
  → Tampak depan seluruh gigi
  → Posisi: oklusi sentris
  → Jarak: 5–8 cm dari gigi anterior

View 2: OKLUSAL ATAS
  → Tampak dari arah palatal
  → Posisi: mouth mirror oklusal
  → Menampilkan seluruh arch maksila

View 3: OKLUSAL BAWAH
  → Tampak dari arah lingual
  → Posisi: mouth mirror oklusal bawah
  → Menampilkan seluruh arch mandibula
```

### 5.3 NFC Flow

```
Smartphone didekatkan ke holder
        ↓
NFC tag mengirim NDEF message
        ↓
Android/iOS: Intent filter buka app
        ↓
App verifikasi hardware ID (terenkripsi AES-256)
        ↓
Kalau valid → aktifkan CV pipeline + kamera
Kalau invalid → tampil error, pipeline terkunci
```

---

## 6. Computer Vision Pipeline (Faster R-CNN)

### 6.1 Kenapa Faster R-CNN, Bukan YOLOv8?

Untuk konteks forensik, akurasi lebih penting dari kecepatan real-time. Faster R-CNN memiliki keunggulan:

| Aspek | Faster R-CNN | YOLOv8 |
|---|---|---|
| Akurasi (mAP) | Lebih tinggi, terutama objek kecil | Lebih rendah untuk objek kecil |
| False positive rate | Lebih rendah | Lebih tinggi |
| Region proposal | RPN (learnable) — lebih presisi | Grid-based |
| Cocok untuk | Forensik — akurasi kritis | Real-time aplikasi |
| Kecepatan | 5–7 FPS (cukup untuk foto statis) | 30+ FPS |
| Transfer learning | Pretrained COCO + fine-tune dental | Sama |

Untuk kasus forensik di mana false positive bisa berakibat identifikasi salah, Faster R-CNN adalah pilihan yang lebih tepat.

### 6.2 Pipeline CV Lengkap

```
Input: 3 foto intraoral (frontal, oklusal atas, oklusal bawah)
                │
                ▼
┌──────────────────────────────┐
│     PREPROCESSING            │
│  • Resize → 800×800px        │
│  • Normalisasi mean/std       │
│  • Quality check (blur, exp) │
│  • CLAHE enhancement         │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   FASTER R-CNN BACKBONE      │
│  ResNet-101 + FPN            │
│  (Feature Pyramid Network)   │
│  Pretrained ImageNet         │
│  Fine-tuned dental dataset   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   REGION PROPOSAL NETWORK    │
│  Generate candidate regions  │
│  per gigi + background       │
│  NMS threshold: 0.5 IoU      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   DETECTION HEAD             │
│  • Klasifikasi: FDI 11–48    │
│  • Bounding box regression   │
│  • Instance mask (Mask RCNN) │
│  • Conf threshold: 0.85      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   LANDMARK DETECTION         │
│  HRNet-W32 per gigi crop     │
│  6 titik anatomi per gigi:   │
│  • Incisal edge / Cusp tip   │
│  • Mesial CEJ                │
│  • Distal CEJ                │
│  • Root apex (estimasi)      │
│  • Mesial contact point      │
│  • Distal contact point      │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   MORPHOLOGY EXTRACTION      │
│  Multi-label classifier:     │
│  • Diastema (gap)            │
│  • Rotasi / malposisi        │
│  • Tambalan / restorasi      │
│  • Missing tooth             │
│  • Crowding / impaksi        │
│  • Anomali bentuk            │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│   FEATURE VECTOR             │
│  Siamese Network             │
│  EfficientNet-B3 backbone    │
│  ArcFace loss                │
│  Output: 512-dim embedding   │
└──────────────┬───────────────┘
               │
               ▼
        OUTPUT JSON:
        {
          "fdi_id": "13",
          "bbox": [x,y,w,h],
          "landmarks": {"cusp":[x,y], "cej_m":[x,y], ...},
          "morphology": {"diastema":0, "tambalan":1, ...},
          "embedding": [float × 512],
          "conf": 0.94
        }
```

### 6.3 Dataset Strategy

**Sumber data training:**

| Sumber | Tipe | Jumlah Est. | Keterangan |
|---|---|---|---|
| DENTEX (MICCAI 2023) | Foto panoramik + anotasi | 3.000+ | Public dataset |
| Tufts Dental Database | Foto intraoral | 1.000+ | Public dataset |
| Dataset kolaborasi FKG | Foto intraoral + rekam medis | 500+ | Kolaborasi institusi |
| Augmentasi synthetic | Generated | 10.000+ | Augmentasi otomatis |

**Augmentasi:**
- Random rotation ±15°
- Brightness/contrast jitter
- Gaussian noise
- Horizontal flip
- Elastic deformation (simulate different jaw shapes)
- Color jitter (simulate different lighting/camera)

**Anotasi tool:** Roboflow atau Label Studio  
**Format:** COCO JSON + landmark keypoints

### 6.4 Evaluasi Model CV

| Metric | Target | Formula |
|---|---|---|
| mAP@0.5 (detection) | ≥ 0.85 | Standard COCO mAP |
| mAP@0.5:0.95 | ≥ 0.65 | Strict COCO mAP |
| MRE (landmark) | ≤ 2.0mm | Mean Radial Error |
| SDR@2mm (landmark) | ≥ 75% | % landmark dalam radius 2mm |
| Morphology F1 | ≥ 0.80 | Per-class F1 score |
| Embedding retrieval (R@1) | ≥ 80% | Recall at 1 |

---

## 7. ML Retrieval Strategy — RAG vs CAG vs Agentic RAG

Tiga opsi arsitektur retrieval tersedia. Masing-masing memiliki trade-off yang perlu dipertimbangkan.

---

### Opsi A: Standard RAG (Retrieval-Augmented Generation)

**Cara kerja:**
```
Query klinis (dari CV output)
        ↓
Embed query → vektor
        ↓
ChromaDB similarity search
        ↓
Top-K chunks jurnal forensik
        ↓
LLM generate laporan
```

**Pros:**
- Implementasi paling sederhana
- Latency rendah (~2–5 detik)
- Mudah di-maintain dan di-debug
- Cocok untuk query yang well-defined

**Cons:**
- Satu kali retrieval — kalau chunk yang diambil tidak tepat, laporan kurang akurat
- Tidak bisa iterasi atau klarifikasi query
- Tidak bisa menggunakan multiple knowledge source secara adaptif

**Cocok untuk:** MVP, tim yang baru mulai, skenario query yang konsisten dan terstruktur

---

### Opsi B: CAG (Cache-Augmented Generation)

**Cara kerja:**
```
Seluruh knowledge base jurnal forensik
        ↓
Diload ke context window LLM saat startup
(bukan diambil per-query)
        ↓
Query langsung dijawab dari cached context
```

**Pros:**
- Tidak ada langkah retrieval → lebih cepat
- Tidak ada risiko retrieval error
- Cocok untuk knowledge base yang kecil dan statis

**Cons:**
- Hanya feasible kalau knowledge base < context window LLM (32K–128K token)
- 4.821 chunks × ~300 kata = ~1.4M token → **terlalu besar untuk di-cache semua**
- Harus pilih subset jurnal yang paling relevan (preprocessing manual)
- Tidak scalable kalau knowledge base berkembang

**Cocok untuk:** Knowledge base sangat kecil (< 500 chunk), sistem offline dengan resource terbatas, subset jurnal yang sangat spesifik (misalnya: hanya panduan INTERPOL DVI)

---

### Opsi C: Agentic RAG ✅ RECOMMENDED

**Cara kerja:**
```
Query kompleks dari CV output
        ↓
Agent planner: pecah jadi sub-query
        ↓
Multi-step retrieval:
  Step 1: Cari jurnal tentang morfologi gigi yang relevan
  Step 2: Cari standar INTERPOL DVI yang applicable
  Step 3: Cari precedent kasus serupa
        ↓
Agent synthesizer: gabungkan semua context
        ↓
LLM generate laporan forensik komprehensif
        ↓
Agent validator: verifikasi konsistensi laporan
```

**Pros:**
- Multi-step reasoning — bisa tangani query kompleks
- Adaptive — bisa retry kalau retrieval pertama kurang relevan
- Bisa gunakan multiple knowledge sources (jurnal + standar INTERPOL + database kasus)
- Self-correcting — agent bisa validasi output sendiri
- Confidence scoring lebih akurat

**Cons:**
- Latency lebih tinggi (5–15 detik)
- Lebih kompleks untuk di-implement dan di-debug
- Membutuhkan LLM yang lebih capable (Qwen3 14B atau lebih)

**Cocok untuk:** Sistem forensik production — akurasi laporan lebih penting dari kecepatan

---

### Perbandingan Ringkas

| Dimensi | Standard RAG | CAG | Agentic RAG |
|---|---|---|---|
| Implementasi | ⭐⭐⭐ Mudah | ⭐⭐ Medium | ⭐ Kompleks |
| Akurasi laporan | ⭐⭐ Cukup | ⭐⭐ Cukup | ⭐⭐⭐ Terbaik |
| Kecepatan | ⭐⭐⭐ Cepat | ⭐⭐⭐ Tercepat | ⭐⭐ Medium |
| Scalability | ⭐⭐⭐ Baik | ⭐ Terbatas | ⭐⭐⭐ Baik |
| Offline support | ✅ | ✅ | ✅ (terbatas) |
| Multi-source | ❌ | ❌ | ✅ |
| Self-correction | ❌ | ❌ | ✅ |
| Cocok untuk | MVP | Subset kecil | Production |

---

## 8. Recommended Stack: Agentic RAG

### 8.1 Arsitektur Agentic RAG untuk DVI

```python
# Pseudocode arsitektur agent

class DVIForensicAgent:
    def __init__(self):
        self.planner    = QueryPlanner(llm=Qwen3_14B)
        self.retriever  = MultiSourceRetriever([
            ChromaDB("forensik_jurnal"),      # Jurnal odontologi forensik
            ChromaDB("interpol_dvi_standard"),# Standar INTERPOL DVI
            PostgreSQL("dental_am_database"), # Database rekam medis AM
        ])
        self.synthesizer = ReportSynthesizer(llm=Qwen3_14B)
        self.validator   = OutputValidator(llm=Qwen3_8B)

    def identify(self, cv_output: dict) -> ForensicReport:
        # Step 1: Plan
        sub_queries = self.planner.decompose(cv_output)
        # → ["morfologi diastema implikasi forensik",
        #    "standar matching INTERPOL odontologi",
        #    "tambalan komposit identifikasi karakteristik"]

        # Step 2: Multi-source retrieve
        contexts = []
        for query in sub_queries:
            results = self.retriever.search(query, top_k=3)
            contexts.extend(results)

        # Step 3: Synthesize
        draft_report = self.synthesizer.generate(cv_output, contexts)

        # Step 4: Validate
        validated = self.validator.check(draft_report, cv_output)
        if not validated.passed:
            # Retry dengan konteks tambahan
            extra_context = self.retriever.search(validated.gap_query)
            draft_report = self.synthesizer.generate(cv_output, contexts + extra_context)

        return draft_report
```

### 8.2 Knowledge Base Setup

**Dokumen yang di-chunk dan di-embed:**

| Sumber | Jumlah Est. Halaman | Topik |
|---|---|---|
| Proffit's Contemporary Orthodontics | 800+ | Morfologi & patologi dental |
| INTERPOL DVI Guide | 300+ | Standar prosedur DVI |
| Jurnal: Angle Orthodontist (2015–2024) | 500+ | Penelitian odontologi forensik |
| Jurnal: AJO-DO (2015–2024) | 500+ | Forensik dental |
| Jurnal: Forensic Science International | 400+ | Odontologi forensik kasus nyata |
| Manual WinID / DAVID DVI software | 200+ | Standar sistem DVI komersial |

**Chunking strategy:**
- Chunk size: 512 token
- Overlap: 64 token
- Chunking method: Sentence-aware (tidak potong di tengah kalimat)
- Metadata: `{sumber, halaman, tahun, topik, bahasa}`

**Embedding model:**
- `pritamdeka/S-PubMedBert-MS-MARCO` (domain biomedis, lebih akurat untuk teks forensik)
- Fallback: `paraphrase-multilingual-MiniLM-L12-v2` (untuk query bahasa Indonesia)

### 8.3 LLM Selection

| Model | Parameter | VRAM | Keunggulan | Use Case |
|---|---|---|---|---|
| Qwen3 14B | 14B | ~16GB | Reasoning kuat, bilingual | Main forensic agent |
| Qwen3 8B | 8B | ~10GB | Balance kecepatan/akurasi | Validator + summary |
| LLaMA 3.1 8B | 8B | ~10GB | Fallback option | Backup |

**Fine-tuning strategy (LoRA):**
- Dataset: 200–500 pasangan kasus forensik dental (input CV output → laporan DVI)
- Method: QLoRA rank=8, alpha=16
- Framework: Unsloth + TRL
- Training time: ~4–8 jam pada GPU RTX 4090

---

## 9. Database Architecture

### 9.1 PostgreSQL — Data Relasional

```sql
-- Tabel utama identitas
CREATE TABLE persons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name   VARCHAR(200),
    dob         DATE,
    id_number   VARCHAR(50),
    status      ENUM('ante_mortem', 'post_mortem', 'identified'),
    created_at  TIMESTAMP DEFAULT NOW(),
    encrypted   BOOLEAN DEFAULT TRUE  -- semua field PII dienkripsi
);

-- Rekam medis dental ante-mortem
CREATE TABLE dental_records_am (
    id          UUID PRIMARY KEY,
    person_id   UUID REFERENCES persons(id),
    session_date DATE,
    source      VARCHAR(100),  -- 'klinik_xyz', 'rs_abc'
    photos      JSONB,         -- {frontal, oklusal_atas, oklusal_bawah}
    fdi_chart   JSONB,         -- status tiap gigi per FDI notation
    notes       TEXT,
    created_at  TIMESTAMP DEFAULT NOW()
);

-- Data CV extraction
CREATE TABLE dental_features (
    id              UUID PRIMARY KEY,
    record_id       UUID REFERENCES dental_records_am(id),
    fdi_id          VARCHAR(3),       -- e.g. "13"
    bbox            FLOAT[4],
    landmarks       JSONB,
    morphology      JSONB,
    embedding       VECTOR(512),      -- pgvector extension
    conf_score      FLOAT,
    extracted_at    TIMESTAMP
);

-- Data post-mortem (lapangan bencana)
CREATE TABLE dental_records_pm (
    id          UUID PRIMARY KEY,
    case_number VARCHAR(50),          -- nomor kasus DVI
    disaster_id VARCHAR(50),
    location    POINT,                -- koordinat lokasi penemuan
    photos      JSONB,
    extracted_at TIMESTAMP,
    device_id   VARCHAR(100)          -- NFC hardware ID
);

-- Hasil matching
CREATE TABLE identification_results (
    id              UUID PRIMARY KEY,
    pm_record_id    UUID REFERENCES dental_records_pm(id),
    am_person_id    UUID REFERENCES persons(id),
    confidence      FLOAT,
    method          JSONB,  -- {superimposisi: 0.88, morfologi: 0.91, embedding: 0.87}
    final_score     FLOAT,
    status          ENUM('candidate', 'probable', 'confirmed', 'excluded'),
    validated_by    VARCHAR(100),     -- nama dokter forensik
    validated_at    TIMESTAMP,
    report_url      VARCHAR(500)
);

-- Audit trail
CREATE TABLE audit_log (
    id          UUID PRIMARY KEY,
    user_id     UUID,
    action      VARCHAR(100),
    resource    VARCHAR(100),
    ip_address  INET,
    timestamp   TIMESTAMP DEFAULT NOW(),
    details     JSONB
);
```

### 9.2 ChromaDB — Vector Database

```python
# Collections

collections = {
    "dental_embeddings_am": {
        "description": "512-dim embedding tiap gigi ante-mortem",
        "metadata_fields": ["person_id", "fdi_id", "session_date", "source"]
    },
    "forensik_knowledge": {
        "description": "Chunks jurnal forensik odontologi",
        "metadata_fields": ["sumber", "halaman", "tahun", "topik", "bahasa"]
    },
    "interpol_standards": {
        "description": "Chunks standar INTERPOL DVI",
        "metadata_fields": ["section", "version", "language"]
    }
}
```

### 9.3 File Storage (MinIO)

```
bucket: smartdvi-media
├── am/
│   ├── {person_id}/
│   │   ├── frontal_001.jpg
│   │   ├── oklusal_atas_001.jpg
│   │   └── oklusal_bawah_001.jpg
├── pm/
│   ├── {case_number}/
│   │   ├── frontal_raw.jpg
│   │   ├── frontal_annotated.jpg  ← overlay landmark
│   │   └── oklusal_atas.jpg
└── reports/
    └── {identification_id}/
        └── forensic_report.pdf
```

---

## 10. Matching Engine — Ante-mortem vs Post-mortem

### 10.1 Tiga Metode Matching (Ensemble)

```
POST-MORTEM foto gigi
        │
        ▼ CV Pipeline
    PM Features
        │
        ├──────────────────────────────────────────┐
        │                                          │
        ▼                                          ▼
METHOD 1: SUPERIMPOSISI              METHOD 2: MORPHOLOGY MATCHING
TPS (Thin Plate Spline)              Feature vector comparison
Landmark alignment                   Diastema, tambalan, malposisi
Geometric similarity score           Multi-label jaccard similarity
Score: 0.0 – 1.0                    Score: 0.0 – 1.0
        │                                          │
        └──────────────┬───────────────────────────┘
                       │
                       ▼
            METHOD 3: EMBEDDING MATCHING
            Siamese Network cosine similarity
            512-dim feature vector
            Search top-K dari ChromaDB
            Score: 0.0 – 1.0
                       │
                       ▼
            ENSEMBLE SCORING
            final = w1×superimposisi + w2×morfologi + w3×embedding
            w1=0.35, w2=0.30, w3=0.35  (dapat di-tune)
                       │
                       ▼
            CONFIDENCE THRESHOLD
            ≥ 0.90 → "Probable" (laporkan ke dokter forensik)
            ≥ 0.85 → "Candidate" (perlu review manual)
            < 0.85 → "Insufficient" (butuh data tambahan)
                       │
                       ▼
            AGENTIC RAG REPORT
            Analisis + Referensi jurnal + Rekomendasi
```

### 10.2 Adaptive Weight System

Weight dapat di-adjust secara otomatis berdasarkan kualitas data yang tersedia:

```python
def compute_adaptive_weights(pm_data, am_data):
    w = {"superimposisi": 0.35, "morfologi": 0.30, "embedding": 0.35}

    # Kalau foto PM hanya 1 sudut → kurangi bobot superimposisi
    if pm_data.n_views < 3:
        w["superimposisi"] -= 0.10
        w["morfologi"] += 0.10

    # Kalau AM hanya dari foto (bukan rekam medis klinik) → kurangi kepercayaan
    if am_data.source == "social_media":
        w["superimposisi"] -= 0.05
        w["embedding"] += 0.05

    return w
```

### 10.3 Output Laporan Forensik

```json
{
  "identification_id": "uuid-xxx",
  "pm_case": "DVI-2026-001-PM-042",
  "timestamp": "2026-05-04T09:34:12Z",
  "top_candidates": [
    {
      "rank": 1,
      "person_id": "uuid-yyy",
      "name_encrypted": "ENCRYPTED",
      "confidence": 0.912,
      "scores": {
        "superimposisi": 0.94,
        "morfologi": 0.88,
        "embedding": 0.91
      },
      "matching_features": ["tambalan_gigi_14", "diastema_11_21", "rotasi_23"],
      "status": "probable"
    }
  ],
  "llm_analysis": {
    "id": "Gigi post-mortem menunjukkan...",
    "en": "Post-mortem dental examination reveals...",
    "references": ["Kravitz 2019", "INTERPOL DVI Guide 2023"],
    "recommendation": "Konfirmasi dengan pemeriksaan fisik langsung oleh dokter gigi forensik"
  },
  "explainability": {
    "grad_cam_url": "https://storage/reports/xxx/gradcam.jpg",
    "overlay_url": "https://storage/reports/xxx/overlay.jpg"
  }
}
```

---

## 11. Application Layer

### 11.1 Mobile App (Android/iOS)

**Framework:** React Native atau Flutter  
**Target:** Android 10+, iOS 14+

**Fitur:**
- NFC deep-link → auto-launch saat holder didekatkan
- Camera controller untuk kamera intraoral via USB/BT
- Quality check real-time (blur detection, exposure)
- Panduan posisi foto (overlay guide)
- Offline cache (SQLite + local file storage)
- Sync queue — upload saat koneksi tersedia
- Status baterai holder (via BLE/NFC data channel)

### 11.2 Web Dashboard (Dokter Forensik)

**Framework:** Next.js + TailwindCSS  
**Target:** Desktop browser

**Fitur:**
- Manajemen database AM (upload, edit, search)
- Review hasil matching PM/AM
- Visualisasi: dental arch map, overlay superimposisi, Grad-CAM
- Grafik pergerakan dan tren (untuk kasus aligner)
- Laporan PDF generator (standar INTERPOL DVI)
- Audit trail viewer
- Admin panel (user management, system health)

### 11.3 Backend API (FastAPI)

```
POST /api/v1/pm/upload          → Upload foto post-mortem
POST /api/v1/pm/{id}/analyze    → Trigger CV pipeline
POST /api/v1/pm/{id}/match      → Trigger matching engine
GET  /api/v1/results/{id}       → Ambil hasil matching
POST /api/v1/am/upload          → Upload rekam medis AM
GET  /api/v1/am/search          → Cari data AM
POST /api/v1/auth/login         → JWT authentication
GET  /api/v1/health             → Health check
WS   /api/v1/ws/progress/{id}   → Real-time progress via WebSocket
```

---

## 12. Security & Privacy

### 12.1 Data Sensitivity

Data dental rekam medis adalah data kesehatan yang dilindungi oleh UU Kesehatan No. 17/2023 dan PDPA. Semua data harus diperlakukan sebagai **Highly Sensitive**.

### 12.2 Encryption

| Layer | Metode | Keterangan |
|---|---|---|
| Data at rest | AES-256-GCM | Semua field PII di database |
| Data in transit | TLS 1.3 | Semua API request |
| NFC authentication | AES-256 encrypted NDEF | Hardware ID terenkripsi |
| File storage | Server-side encryption (MinIO SSE) | Semua foto dan laporan |
| Database backups | Encrypted backup + offsite | Nightly backup |

### 12.3 Access Control

```
Role-based access control (RBAC):

ADMIN       → Full access + user management + audit log
FORENSIK    → Read/write PM data + view matching results + generate report
OPERATOR    → Upload PM data + view own submissions only
API_DEVICE  → NFC-authenticated device, upload only
READ_ONLY   → View reports only (untuk pihak hukum / keluarga terotorisasi)
```

### 12.4 Audit Trail

Setiap akses dan modifikasi data dicatat di `audit_log`:

```
User X accessed PM record Y at [timestamp] from IP [ip]
User X validated identification Z at [timestamp]
Device NFC-ABC uploaded PM case DVI-001 at [timestamp]
```

### 12.5 Anonymisasi untuk Training

Data rekam medis yang digunakan untuk training model harus:

1. Di-anonimisasi (hapus nama, tanggal lahir, nomor rekam medis)
2. Mendapat persetujuan tertulis dari pasien atau institusi
3. Disimpan terpisah dari database produksi
4. Hanya diakses oleh tim ML dengan clearance khusus

---

## 13. Infrastructure & Deployment

### 13.1 Server Stack

```
Production Server (On-premise / private cloud):
├── OS: Ubuntu 24.04 LTS
├── API: FastAPI + Uvicorn + Nginx (reverse proxy)
├── Database: PostgreSQL 16 + pgvector extension
├── Vector DB: ChromaDB (persistent mode)
├── File Storage: MinIO (self-hosted S3-compatible)
├── LLM: Ollama (Qwen3 14B + Qwen3 8B)
├── ML Runtime: PyTorch 2.x + ONNX Runtime
├── Cache: Redis
├── Task Queue: Celery + Redis
└── Monitoring: Prometheus + Grafana

Hardware Minimum (Production):
├── CPU: 16 core (AMD EPYC / Intel Xeon)
├── RAM: 64 GB
├── GPU: NVIDIA RTX 4090 (24GB VRAM) atau A100
├── Storage: 2TB NVMe SSD (RAID 1)
└── Network: 1 Gbps

Hardware Lapangan (Offline mode):
└── Raspberry Pi 5 (8GB) di dalam holder
    └── Model: TFLite / ONNX compressed (YOLOv8-nano sebagai fallback)
```

### 13.2 Containerization

```yaml
# docker-compose.yml (ringkasan)
services:
  api:         FastAPI backend
  postgres:    PostgreSQL + pgvector
  chromadb:    Vector database
  minio:       File storage
  ollama:      LLM server
  redis:       Cache + queue broker
  celery:      Async task worker (CV + matching pipeline)
  nginx:       Reverse proxy + SSL termination
  prometheus:  Metrics collection
  grafana:     Dashboard monitoring
```

### 13.3 CI/CD Pipeline

```
GitHub Push → GitHub Actions
        ↓
Lint + Unit test
        ↓
Build Docker image
        ↓
Integration test (dengan test database)
        ↓
Push ke container registry
        ↓
Deploy ke staging → smoke test
        ↓
Deploy ke production (manual approval)
```

---

## 14. Team Responsibilities

### Tim Teknik Komputer (Tekkom)

| Area | Tanggung Jawab |
|---|---|
| CV Pipeline | Faster R-CNN training, landmark detection, morphology classifier, Siamese Network |
| RAG/Agentic RAG | ChromaDB setup, chunking pipeline, embedding, Agentic RAG implementation |
| LLM | Ollama setup, Qwen3 fine-tuning (QLoRA), prompt engineering |
| Backend API | FastAPI, database schema, authentication, WebSocket |
| Web Dashboard | Next.js frontend, visualisasi grafik, laporan PDF |
| Mobile App | React Native, NFC integration, offline mode, camera controller |
| Security | Enkripsi, RBAC, audit trail, NFC authentication |
| Infrastructure | Docker, CI/CD, monitoring, backup |

### Tim Biomedik

| Area | Tanggung Jawab |
|---|---|
| Domain expertise | Validasi titik landmark yang benar secara medis |
| Dataset annotation | Anotasi dataset dental menggunakan Label Studio |
| Ground truth | Tentukan definisi "match" yang valid secara forensik |
| Model validation | Validasi akurasi CV dan laporan dari sisi klinis |
| DVI protocol | Pastikan output sistem sesuai standar INTERPOL DVI |
| Knowledge base | Kurasi jurnal dan textbook yang masuk ke RAG |

### Tim Elektro

| Area | Tanggung Jawab |
|---|---|
| Hardware design | PCB holder, integrasi LED, power management |
| NFC module | Implementasi NFC tag + enkripsi NDEF |
| Wireless charging | Integrasi koil Qi, thermal management |
| Kamera integration | Interfacing kamera intraoral ke RPi 5 |
| Firmware | RPi 5 firmware, on-device inference (TFLite) |
| Prototyping | Workshop prototyping V1, V2, finalisasi casing |

---

## 15. Timeline — 8 Months

```
Bulan 1–2: Foundation
  [Tekkom]    Setup infrastruktur, API skeleton, database schema
  [Tekkom]    Collect dataset, setup anotasi pipeline
  [Biomedik]  Mulai anotasi landmark di Label Studio
  [Elektro]   Riset komponen NFC + Qi, desain sirkuit awal
  [Semua]     Kickoff meeting, alignment requirement

Bulan 3–4: Core ML Development
  [Tekkom]    Training Faster R-CNN (detection + segmentasi)
  [Tekkom]    Training HRNet landmark detection
  [Tekkom]    Setup ChromaDB + chunking pipeline jurnal
  [Tekkom]    MVP backend API + basic mobile app
  [Biomedik]  Selesaikan 500+ anotasi dataset
  [Elektro]   Prototipe PCB V1, integrasi NFC basic

Bulan 5–6: Integration & RAG
  [Tekkom]    Training morphology classifier + Siamese Network
  [Tekkom]    Implementasi Agentic RAG pipeline
  [Tekkom]    LLM fine-tuning (QLoRA) dengan data forensik
  [Tekkom]    Integrasi CV + RAG + Matching engine
  [Tekkom]    Dashboard web — dental map + visualisasi
  [Biomedik]  Validasi akurasi CV output, iterasi anotasi
  [Elektro]   Prototipe PCB V2, integrasi wireless charging

Bulan 7–8: Testing, Security & Polish
  [Tekkom]    End-to-end testing + load testing
  [Tekkom]    Implementasi security (enkripsi, audit trail, RBAC)
  [Tekkom]    Optimasi performa (ONNX export, batch inference)
  [Tekkom]    Offline mode + mesh network
  [Tekkom]    Laporan PDF generator + INTERPOL DVI format
  [Biomedik]  Uji sistem dengan kasus forensik simulasi
  [Elektro]   Finalisasi casing, uji thermal, uji baterai
  [Semua]     Demo final + dokumentasi
```

---

## 16. API Contracts

### POST /api/v1/pm/upload

**Request:**
```json
{
  "case_number": "DVI-2026-001-PM-042",
  "disaster_id": "LONGSOR-CIANJUR-2026",
  "location": {"lat": -6.8, "lng": 107.1},
  "device_id": "NFC-ENCRYPTED-ID",
  "photos": {
    "frontal": "base64_encoded_jpg",
    "oklusal_atas": "base64_encoded_jpg",
    "oklusal_bawah": "base64_encoded_jpg"
  }
}
```

**Response:**
```json
{
  "pm_id": "uuid-xxx",
  "status": "queued",
  "job_id": "celery-job-uuid",
  "estimated_seconds": 45,
  "ws_url": "wss://api/ws/progress/uuid-xxx"
}
```

### GET /api/v1/results/{id}

**Response:**
```json
{
  "identification_id": "uuid-xxx",
  "status": "completed",
  "top_candidates": [...],
  "llm_analysis": {...},
  "confidence_threshold_met": true,
  "report_url": "https://storage/reports/xxx/report.pdf"
}
```

---

## 17. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dataset dental terbatas | Tinggi | Tinggi | Augmentasi agresif + kolaborasi FKG + public dataset |
| Akurasi CV < target | Sedang | Tinggi | Iterasi model, tambah data, ensemble model |
| LLM hallucination di laporan forensik | Sedang | Sangat Tinggi | Grounding ketat ke retrieved context, validasi output, human-in-the-loop mandatory |
| Privacy breach data pasien | Rendah | Sangat Tinggi | Enkripsi AES-256, RBAC ketat, audit trail, penetration testing |
| Koneksi tidak ada di lapangan | Tinggi | Sedang | Offline mode dengan on-device model (TFLite compressed) |
| Hardware holder terlalu tebal | Sedang | Sedang | Iterasi desain PCB, workshop prototyping |
| NFC tidak kompatibel semua HP | Sedang | Sedang | Test 20+ model smartphone, fallback ke QR code |
| GPU server tidak tersedia | Sedang | Tinggi | Gunakan cloud GPU (vast.ai / runpod) untuk training, on-premise untuk inference |

---

## 18. Glossary

| Istilah | Definisi |
|---|---|
| DVI | Disaster Victim Identification — prosedur identifikasi korban bencana massal |
| AM | Ante-mortem — data rekam medis saat korban masih hidup |
| PM | Post-mortem — data yang dikumpulkan dari jenazah |
| FDI | Federation Dentaire Internationale — sistem penomoran gigi internasional (11–48) |
| CEJ | Cemento-Enamel Junction — batas antara mahkota dan akar gigi |
| Superimposisi | Overlay foto AM dan PM untuk melihat kesesuaian anatomi |
| Faster R-CNN | Region-based Convolutional Neural Network — arsitektur object detection presisi tinggi |
| HRNet | High-Resolution Network — arsitektur untuk keypoint/landmark detection |
| RAG | Retrieval-Augmented Generation — LLM yang diperkaya dengan knowledge base eksternal |
| CAG | Cache-Augmented Generation — LLM dengan seluruh knowledge di-cache ke context |
| Agentic RAG | RAG dengan multi-step reasoning dan self-correction oleh AI agent |
| QLoRA | Quantized Low-Rank Adaptation — teknik fine-tuning LLM efisien |
| ChromaDB | Open-source vector database untuk similarity search |
| pgvector | PostgreSQL extension untuk vector similarity search |
| TPS | Thin Plate Spline — algoritma transformasi non-linear untuk superimposisi |
| ArcFace | Loss function untuk face/dental recognition berbasis angular margin |
| MRE | Mean Radial Error — metrik evaluasi akurasi landmark detection |
| Confidence score | Nilai 0–1 yang menunjukkan tingkat keyakinan sistem terhadap hasil matching |
| NFC | Near Field Communication — teknologi komunikasi jarak dekat untuk hardware authentication |
| RBAC | Role-Based Access Control — sistem kontrol akses berdasarkan peran pengguna |

---

*Dokumen ini adalah living document — update setiap sprint review.*  
*Untuk pertanyaan teknis, hubungi tim Tekkom.*  
*Untuk validasi medis, hubungi tim Biomedik.*
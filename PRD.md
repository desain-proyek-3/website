# **Dentify: AI-Powered Dental Identification for Disaster Victims**

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

**Dentify** (AI-Powered Dental Identification for Disaster Victims) adalah sistem identifikasi forensik berbasis AI yang dirancang untuk mempercepat dan mengotomasi proses identifikasi korban bencana alam melalui analisis forensik dental (odontologi).

Sistem ini menggabungkan tiga teknologi inti:

- **Faster R-CNN**  
Computer Vision untuk segmentasi, landmark detection, dan ekstraksi fitur morfologi gigi dari foto intraoral multi-sudut
- **Agentic RAG / CAG**  
Retrieval-Augmented Generation berbasis jurnal forensik odontologi untuk analisis klinis dan laporan identifikasi
- **Smart Holder Hardware**  
Perangkat keras intraoral camera dengan NFC authentication dan wireless charging

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
|-|-|
| Sidik jari | Rusak akibat pembusukan, tekanan fisik, atau suhu ekstrem |
| DNA | Mahal, butuh 3–7 hari di laboratorium, perlu sampel keluarga |
| Visual | Tidak valid bila kondisi jenazah parah |
| Odontologi manual | Akurat, tapi lambat dan bergantung pada ahli forensik |

### Gap yang Diselesaikan

Forensik dental memiliki keunggulan alami. Gigi adalah bagian tubuh paling tahan rusak. Namun proses matching ante-mortem vs post-mortem masih dilakukan secara manual oleh dokter gigi forensik, memakan waktu berhari-hari, dan tidak bisa dijalankan di lapangan.

**Dentify menyelesaikan gap ini** dengan pipeline AI yang:

1. Bisa dijalankan di lapangan bencana tanpa koneksi internet (offline mode)
2. Mengotomasi matching dari foto intraoral ke database rekam medis
3. Menghasilkan laporan forensik terstandar dalam hitungan menit, bukan hari

---

## 3. Goals & Success Metrics

### Primary Goals

- Kurangi waktu identifikasi korban dari rata-rata 3 hari menjadi < 30 menit per kasus
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
│         Intraoral Camera Holder · Wireless Charging · RPi 5         │
└────────────────────────────┬────────────────────────────────────────┘
                             │ USB-C / Bluetooth
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MOBILE / WEB APPLICATION                         │
│  Android / iOS / Web · NFC deep-link · Preview · Quality check      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST API / WebSocket
                             ▼
┌────────────────────────────────────────────────────────────────────┐
│                        BACKEND API SERVER                          │
│     FastAPI · JWT Auth · Rate limiting · Audit trail               │
│                                │                                   │
│            ┌───────────────────┼───────────────────┐               │
│            ▼                   ▼                   ▼               │
│     ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐      │
│     │  CV Engine  │   │  RAG Engine  │   │  Matching Engine │      │
│     │ Faster RCNN │   │ Agentic RAG  │   │  Feature Vector  │      │
│     │ Landmark    │   │ ChromaDB     │   │  Superimposisi   │      │
│     │ Morphology  │   │ LLM (Qwen3)  │   │  Similarity      │      │
│     └─────────────┘   └──────────────┘   └──────────────────┘      │
└───────────────────────────────┬────────────────────────────────────┘
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

## 6. Computer Vision Pipeline (Faster R-CNN)


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

**Sumber data training:**

| Sumber | Tipe | Jumlah Est. | Keterangan |
|-|-|-|-|
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

---

## 7. ML Retrieval Strategy — RAG vs CAG vs Agentic RAG

### Agentic RAG

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
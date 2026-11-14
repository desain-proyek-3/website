"""
Dentify Services — Dental Comparison (PM vs AM per gigi)
Membandingkan hasil deteksi AI (`tooth_records`) subjek post-mortem dan ante-mortem
per nomor FDI: keberadaan gigi, confidence, dan delta tiap fitur morfologi.

⚠️ Kontrak `morphology_features` dari tim AI BELUM final (PRD §6 menyebut mis.
   {"diastema": 0, "tambalan": 1, ...}). Seluruh asumsi bentuk data morfologi
   TERISOLASI di modul ini — bila kontrak berubah, cukup sesuaikan file ini.

Aturan delta (generik, tanpa mengarang makna klinis):
- angka (int/float, bukan bool) → delta = PM − AM; "same" bila |delta| ≤ NUMERIC_TOLERANCE
- bool / string / lainnya      → "same" bila sama persis, selain itu "different"
- fitur hanya ada di satu sisi   → "pm_only" / "am_only" (delta null)

Agregasi 3 sudut citra (depan/kiri/kanan): satu gigi bisa terdeteksi di beberapa
sudut — dipakai deteksi dengan confidence tertinggi; sudut lain dicatat di `views`.
"""

from dataclasses import dataclass, field
from typing import Any, Iterable

# Toleransi selisih angka yang dianggap sama (mis. derajat rotasi / mm hasil estimasi)
NUMERIC_TOLERANCE = 1e-6


@dataclass
class ToothObservation:
    """Satu deteksi gigi dari satu citra."""
    fdi_number: int
    view_type: str
    confidence: float | None  # persen 0–100 (sudah dinormalisasi)
    morphology: dict[str, Any]


@dataclass
class AggregatedTooth:
    fdi_number: int
    confidence: float | None
    morphology: dict[str, Any]
    views: list[str] = field(default_factory=list)


def normalize_confidence(value: Any) -> float | None:
    """Confidence AI bisa 0–1 atau 0–100 (kontrak belum dikunci) → persen 0–100."""
    if value is None or isinstance(value, bool):
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return round(v * 100 if v <= 1 else v, 2)


def normalize_morphology(value: Any) -> dict[str, Any]:
    """Hanya objek {fitur: nilai} yang dipakai; bentuk lain diabaikan."""
    return dict(value) if isinstance(value, dict) else {}


def aggregate_teeth(observations: Iterable[ToothObservation]) -> dict[int, AggregatedTooth]:
    """Gabungkan deteksi dari beberapa sudut citra menjadi satu entri per FDI."""
    best: dict[int, AggregatedTooth] = {}
    for obs in observations:
        current = best.get(obs.fdi_number)
        if current is None:
            best[obs.fdi_number] = AggregatedTooth(
                fdi_number=obs.fdi_number,
                confidence=obs.confidence,
                morphology=obs.morphology,
                views=[obs.view_type],
            )
            continue
        if obs.view_type not in current.views:
            current.views.append(obs.view_type)
        if (obs.confidence or -1) > (current.confidence or -1):
            current.confidence = obs.confidence
            current.morphology = obs.morphology
    return best


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def diff_feature(pm_value: Any, am_value: Any, pm_has: bool, am_has: bool) -> dict[str, Any]:
    if pm_has and not am_has:
        return {"pm": pm_value, "am": None, "delta": None, "status": "pm_only"}
    if am_has and not pm_has:
        return {"pm": None, "am": am_value, "delta": None, "status": "am_only"}
    if _is_number(pm_value) and _is_number(am_value):
        delta = round(float(pm_value) - float(am_value), 6)
        status = "same" if abs(delta) <= NUMERIC_TOLERANCE else "different"
        return {"pm": pm_value, "am": am_value, "delta": delta, "status": status}
    status = "same" if pm_value == am_value else "different"
    return {"pm": pm_value, "am": am_value, "delta": None, "status": status}


def diff_morphology(pm: dict[str, Any], am: dict[str, Any]) -> list[dict[str, Any]]:
    """Delta per fitur morfologi, urut nama fitur."""
    return [
        {"feature": key, **diff_feature(pm.get(key), am.get(key), key in pm, key in am)}
        for key in sorted(set(pm) | set(am))
    ]


def compare_dentition(
    pm_observations: Iterable[ToothObservation],
    am_observations: Iterable[ToothObservation],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """
    Bandingkan seluruh gigi PM vs AM.

    Status per gigi:
    - consistent : ada di PM & AM, tidak ada fitur morfologi yang berbeda
    - discrepant : ada di PM & AM, minimal satu fitur morfologi berbeda
    - pm_only    : hanya terdeteksi di PM
    - am_only    : hanya terdeteksi di AM
    Catatan: gigi yang tidak terdeteksi belum tentu tidak ada (bisa tidak terlihat di
    sudut foto / gagal dideteksi) — interpretasi klinis tetap pada odontolog.
    """
    pm = aggregate_teeth(pm_observations)
    am = aggregate_teeth(am_observations)

    teeth: list[dict[str, Any]] = []
    summary = {"consistent": 0, "discrepant": 0, "pm_only": 0, "am_only": 0, "features_compared": 0, "features_different": 0}

    for fdi in sorted(set(pm) | set(am)):
        p, a = pm.get(fdi), am.get(fdi)
        features = diff_morphology(p.morphology, a.morphology) if p and a else []
        if p and a:
            status = "discrepant" if any(f["status"] == "different" for f in features) else "consistent"
        else:
            status = "pm_only" if p else "am_only"
        summary[status] += 1
        summary["features_compared"] += sum(1 for f in features if f["status"] in ("same", "different"))
        summary["features_different"] += sum(1 for f in features if f["status"] == "different")

        teeth.append(
            {
                "fdi_number": fdi,
                "status": status,
                "pm": _side(p),
                "am": _side(a),
                "features": features,
            }
        )
    return teeth, summary


def _side(tooth: AggregatedTooth | None) -> dict[str, Any] | None:
    if tooth is None:
        return None
    return {
        "confidence": tooth.confidence,
        "views": tooth.views,
        "morphology": tooth.morphology,
    }

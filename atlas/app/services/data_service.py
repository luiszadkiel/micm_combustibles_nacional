import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("services.data")

# Root data directory relative to project root
DATA_DIR = Path(__file__).resolve().parents[2] / "data"


def _load(filename: str) -> list[dict]:
    """Load and parse a JSON data file from the data/ directory."""
    path = DATA_DIR / filename
    if not path.exists():
        logger.error(f"Data file not found: {path}")
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else [data]


# ──────────────────────────────────────────────
# Module 1 — Volume Anomaly Data
# ──────────────────────────────────────────────

def get_anomalias(
    provincia: str = "",
    tipo_combustible: str = "",
    severidad: str = "",
    semana: str = "",
) -> list[dict]:
    """Return anomaly records, optionally filtered."""
    records = _load("anomalias.json")
    if provincia:
        records = [r for r in records if provincia.lower() in r.get("provincia", "").lower()]
    if tipo_combustible:
        records = [r for r in records if tipo_combustible.lower() in r.get("tipo_combustible", "").lower()]
    if severidad:
        records = [r for r in records if r.get("severidad", "") == severidad.upper()]
    if semana:
        records = [r for r in records if r.get("semana", "") == semana]
    # Sort by desviacion_porcentaje descending
    records.sort(key=lambda r: r.get("desviacion_porcentaje", 0), reverse=True)
    return records


def get_top_anomalias(n: int = 5) -> list[dict]:
    """Return top N anomalies by deviation percentage."""
    return get_anomalias()[:n]


# ──────────────────────────────────────────────
# Module 2 — Fiscal Triangulation Data
# ──────────────────────────────────────────────

def get_triangulacion(
    empresa: str = "",
    estado: str = "",
    categoria: str = "",
) -> list[dict]:
    """Return fiscal triangulation records, optionally filtered."""
    records = _load("triangulacion.json")
    # Exclude the global indicators dict if present
    records = [r for r in records if "empresa" in r]
    if empresa:
        records = [r for r in records if empresa.lower() in r.get("empresa", "").lower()]
    if estado:
        records = [r for r in records if r.get("estado", "") == estado.upper()]
    if categoria:
        records = [r for r in records if categoria.lower() in r.get("categoria_exencion", "").lower()]
    records.sort(key=lambda r: r.get("volumen_sin_destino_galones", 0), reverse=True)
    return records


def get_alertas_fiscales() -> list[dict]:
    """Return only active fiscal alerts."""
    return get_triangulacion(estado="ALERTA_ACTIVA")


# ──────────────────────────────────────────────
# Module 3 — Border Risk Data
# ──────────────────────────────────────────────

def get_riesgo_fronterizo(
    provincia: str = "",
    nivel_riesgo: str = "",
) -> list[dict]:
    """Return border risk records, optionally filtered."""
    records = _load("riesgo_fronterizo.json")
    # Exclude global indicators dict
    records = [r for r in records if "provincia" in r]
    if provincia:
        records = [r for r in records if provincia.lower() in r.get("provincia", "").lower()]
    if nivel_riesgo:
        records = [r for r in records if r.get("nivel_riesgo", "") == nivel_riesgo.upper()]
    records.sort(key=lambda r: r.get("indice_riesgo", 0), reverse=True)
    return records


def get_indicadores_globales() -> dict[str, Any]:
    """Return the global economic indicators (WTI, subsidy, etc.)."""
    records = _load("riesgo_fronterizo.json")
    for r in records:
        if "indicadores_globales" in r:
            return r["indicadores_globales"]
    return {}


# ──────────────────────────────────────────────
# Module 4 — Entity Network Data
# ──────────────────────────────────────────────

def get_redes(
    nivel_riesgo: str = "",
    estado: str = "",
    provincia: str = "",
) -> list[dict]:
    """Return entity network records, optionally filtered."""
    records = _load("redes.json")
    if nivel_riesgo:
        records = [r for r in records if r.get("nivel_riesgo", "") == nivel_riesgo.upper()]
    if estado:
        records = [r for r in records if r.get("estado", "") == estado.upper()]
    if provincia:
        records = [r for r in records if any(
            provincia.lower() in p.lower() for p in r.get("provincias_operacion", [])
        )]
    return records


def get_redes_activas() -> list[dict]:
    """Return only active fraud networks."""
    return get_redes(estado="ACTIVA")

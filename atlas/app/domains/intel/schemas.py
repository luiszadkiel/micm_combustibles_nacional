from pydantic import BaseModel
from typing import Any


class HandlerResult(BaseModel):
    """Standard result returned by all domain handlers."""
    message: str
    datos: list[dict[str, Any]] = []
    intent: str = ""


class QueryEntities(BaseModel):
    """Entities extracted from a user query."""
    provincia: str = ""
    distribuidor: str = ""
    tipo_combustible: str = ""
    severidad: str = ""
    fecha_inicio: str = ""
    fecha_fin: str = ""
    semana: str = ""

import logging
from fastapi import APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.orchestrator.handle_query import process_query

router = APIRouter(prefix="/agent", tags=["Agent"])
logger = logging.getLogger("api.agent")


class QueryRequest(BaseModel):
    consulta: str

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"consulta": "¿Cuáles distribuidoras tienen mayor anomalía esta semana?"},
                {"consulta": "¿Qué nivel de riesgo tiene Dajabón?"},
                {"consulta": "Muéstrame las alertas fiscales activas"},
                {"consulta": "¿Hay redes organizadas activas?"},
            ]
        }
    }


class QueryResponse(BaseModel):
    respuesta: str
    intent: str
    confianza: float
    datos: list


@router.post("/query", response_model=QueryResponse, summary="Consultar al Analista MICM-INTEL")
async def query_agent(request: QueryRequest):
    """
    Envíe una consulta en español al Analista MICM-INTEL.
    El agente interpreta la intención, consulta los datos del sistema
    y devuelve un análisis estructurado.
    """
    if not request.consulta or not request.consulta.strip():
        raise HTTPException(status_code=400, detail="La consulta no puede estar vacía.")

    logger.info(f"POST /agent/query | consulta='{request.consulta[:80]}'")

    try:
        result = await process_query(request.consulta.strip())
        return QueryResponse(**result)
    except Exception as e:
        logger.error(f"Error procesando consulta: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Error interno al procesar la consulta. Por favor intente de nuevo.",
        )

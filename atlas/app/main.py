from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.logger import setup_logging
from app.api.routes_agent import router as agent_router

setup_logging()

app = FastAPI(
    title="MICM-INTEL — Analista de Inteligencia de Combustibles",
    description=(
        "Sistema de Inteligencia de Datos para la detección de comercio ilícito "
        "en el mercado de combustibles de la República Dominicana. "
        "Desarrollado para el Ministerio de Industria, Comercio y Mipymes (MICM)."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Allow the web platform frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to specific origins in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent_router)


@app.get("/", tags=["Status"])
async def root():
    return {
        "sistema": "MICM-INTEL",
        "descripcion": "Analista de Inteligencia de Combustibles — República Dominicana",
        "estado": "operativo",
        "version": "1.0.0",
        "modulos": [
            "Módulo 1 — Anomalías de Volumen",
            "Módulo 2 — Triangulación Fiscal",
            "Módulo 3 — Riesgo Fronterizo",
            "Módulo 4 — Redes de Entidades",
        ],
    }


@app.get("/health", tags=["Status"])
async def health():
    return {"estado": "saludable"}

import logging
from app.nlp.extractor import extract_intent_entities
from app.nlp.composer import compose_reply
from app.domains.intel.handlers.anomaly_handler import AnomalyHandler
from app.domains.intel.handlers.fiscal_handler import FiscalHandler
from app.domains.intel.handlers.border_handler import BorderHandler
from app.domains.intel.handlers.network_handler import NetworkHandler
from app.domains.intel.handlers.data_query_handler import DataQueryHandler

logger = logging.getLogger("orchestrator")

# Singleton handlers
_anomaly = AnomalyHandler()
_fiscal = FiscalHandler()
_border = BorderHandler()
_network = NetworkHandler()
_data_query = DataQueryHandler()


async def process_query(consulta: str) -> dict:
    """
    Process an analyst query end-to-end:
    1. Extract intent + entities
    2. Route to the appropriate domain handler
    3. Return structured response

    Returns a dict with: respuesta, intent, confianza, datos
    """
    logger.info(f"📩 CONSULTA: {consulta}")

    extraction = extract_intent_entities(consulta)
    intent = extraction["intent"]
    confidence = extraction["confidence"]
    entities = extraction["entities"]

    logger.info(f"🧠 intent={intent}, confianza={confidence:.2f}, entidades={entities}")

    try:
        if intent == "ANOMALIA_VOLUMEN":
            result = _anomaly.handle(entities)

        elif intent == "TRIANGULACION_FISCAL":
            result = _fiscal.handle(entities)

        elif intent == "RIESGO_FRONTERIZO":
            result = _border.handle(entities)

        elif intent == "RED_ENTIDADES":
            result = _network.handle(entities)

        elif intent == "CONSULTA_DATOS":
            result = _data_query.handle(entities)

        elif intent == "INFO_INSTITUCIONAL":
            respuesta = _handle_info_institucional(consulta, entities)
            logger.info(f"📤 RESPUESTA:\n{respuesta}")
            return {"respuesta": respuesta, "intent": intent, "confianza": confidence, "datos": []}

        elif intent == "SMALLTALK":
            respuesta = _handle_smalltalk(consulta)
            logger.info(f"📤 RESPUESTA:\n{respuesta}")
            return {"respuesta": respuesta, "intent": intent, "confianza": confidence, "datos": []}

        else:  # GENERAL_QA or unknown
            respuesta = compose_reply(
                context="El usuario realiza una consulta general sobre el sistema MICM-INTEL o el mercado de combustibles.",
                instruction=consulta,
            )
            logger.info(f"📤 RESPUESTA:\n{respuesta}")
            return {"respuesta": respuesta, "intent": intent, "confianza": confidence, "datos": []}

        logger.info(f"📤 RESPUESTA generada | intent={intent} | registros={len(result.datos)}\n{result.message}")
        return {
            "respuesta": result.message,
            "intent": result.intent,
            "confianza": confidence,
            "datos": result.datos,
        }

    except Exception as e:
        logger.error(f"Error en orchestrator: {e}", exc_info=True)
        raise


def _handle_info_institucional(consulta: str, entities: dict) -> str:
    """Return hard-coded institutional information for MICM-INTEL."""
    text = consulta.lower()

    if any(w in text for w in ["ceccom", "control físico", "campo", "decomiso", "inspección"]):
        return (
            "🏛️ *CECCOM — Cuerpo Especializado en Control del Combustible*\n\n"
            "El CECCOM es el brazo de control físico en campo. Es responsable de:\n"
            "  • Operativos de inspección en distribuidoras y gasolineras\n"
            "  • Decomisos de combustible adulterado o desviado\n"
            "  • Ejecución de las alertas generadas por MICM-INTEL en el territorio\n\n"
            "*Nota institucional:* el CECCOM migró al Ministerio de Defensa con la Ley 139-13, "
            "pero el MICM preside la Mesa Contra los Ilícitos y coordina la inteligencia operativa."
        )
    if any(w in text for w in ["cesfront", "frontera", "contrabando", "haití"]):
        return (
            "🛂 *CESFRONT — Cuerpo Especializado de Seguridad Fronteriza*\n\n"
            "El CESFRONT controla la seguridad fronteriza terrestre. En el contexto de MICM-INTEL:\n"
            "  • Recibe alertas del Módulo 3 (Riesgo Fronterizo) para priorizar operativos\n"
            "  • Controla el contrabando de combustible subsidiado hacia Haití\n"
            "  • Opera en las provincias: Dajabón, Elías Piña, Independencia, Pedernales y Barahona"
        )
    if any(w in text for w in ["refidomsa", "refinería", "despacho", "haina"]):
        return (
            "🏭 *REFIDOMSA — Refinería Dominicana de Petróleo*\n\n"
            "REFIDOMSA es 100% estatal desde 2021 y controla más del 60% del mercado.\n"
            "  • Fuente primaria de datos de despacho del sistema MICM-INTEL\n"
            "  • Despacha directamente desde Haina hacia cada distribuidora autorizada\n"
            "  • Opera un laboratorio de calidad que analiza muestras de combustibles\n\n"
            "Sus registros de despacho alimentan directamente el *Módulo 1 — Anomalías de Volumen*."
        )
    if any(w in text for w in ["dga", "aduanas", "importación", "importar"]):
        return (
            "📋 *DGA — Dirección General de Aduanas*\n\n"
            "La DGA registra toda importación de hidrocarburos al país:\n"
            "  • Volumen, clasificación arancelaria y uso declarado por cada importador\n"
            "  • Fuente clave del *Módulo 2 — Triangulación Fiscal*\n"
            "  • Permite detectar brechas entre lo declarado al importar y lo reportado a la DGII"
        )
    if any(w in text for w in ["dgii", "impuesto", "facturación", "factura", "recaudación"]):
        return (
            "💰 *DGII — Dirección General de Impuestos Internos*\n\n"
            "La DGII recauda el impuesto al consumo de combustibles y gestiona la facturación electrónica.\n"
            "  • Fuente del lado de 'ventas declaradas' en el *Módulo 2 — Triangulación Fiscal*\n"
            "  • Permite cruzar volúmenes vendidos con volúmenes importados por empresa"
        )

    # Generic institutional overview
    return (
        "🏛️ *Ecosistema Institucional — MICM-INTEL*\n\n"
        "El sistema MICM-INTEL centraliza la inteligencia analítica del MICM y coordina con:\n\n"
        "  • *REFIDOMSA*: Fuente primaria de datos de despacho (Módulo 1)\n"
        "  • *DGA*: Registros de importación de hidrocarburos (Módulo 2)\n"
        "  • *DGII*: Facturación electrónica y declaraciones fiscales (Módulo 2)\n"
        "  • *CECCOM*: Control físico en campo — ejecuta las alertas en territorio\n"
        "  • *CESFRONT*: Control fronterizo — actúa sobre alertas del Módulo 3\n"
        "  • *ProConsumidor*: Verificación de calidad en punto de venta\n"
        "  • *PEDECSA / Procuraduría*: Procesamiento penal de casos confirmados\n\n"
        "¿Sobre qué institución desea más detalle?"
    )


def _handle_smalltalk(consulta: str) -> str:
    """Handle greetings and conversational messages in Spanish."""
    text = consulta.lower().strip()
    if any(w in text for w in ["hola", "buenos días", "buenas tardes", "buenas noches", "buenas", "buen día"]):
        return (
            "Buenos días. 👋 Soy el Analista MICM-INTEL, el asistente de inteligencia del sistema "
            "de detección de comercio ilícito de combustibles.\n\n"
            "Puedo ayudarle con:\n"
            "  • Anomalías de volumen en distribuidoras (Módulo 1)\n"
            "  • Triangulación fiscal DGA + DGII + MICM (Módulo 2)\n"
            "  • Riesgo de contrabando fronterizo (Módulo 3)\n"
            "  • Redes de entidades con patrones coordinados (Módulo 4)\n\n"
            "¿En qué puedo asistirle?"
        )
    if any(w in text for w in ["gracias", "muchas gracias", "agradezco"]):
        return "Con gusto. ¿Hay alguna otra consulta en la que pueda asistirle?"
    if any(w in text for w in ["adiós", "hasta luego", "hasta mañana", "chao"]):
        return "Hasta luego. Quedo a su disposición cuando lo necesite. — MICM-INTEL"
    return compose_reply(
        context="El usuario envió un mensaje conversacional al sistema MICM-INTEL.",
        instruction=consulta,
    )

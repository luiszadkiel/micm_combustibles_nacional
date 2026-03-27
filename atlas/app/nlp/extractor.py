import json
import logging
from app.nlp.llm_client import get_llm_client
from app.nlp.prompts import EXTRACTOR_USER, MICM_SYSTEM, get_today
from app.settings import settings

logger = logging.getLogger("nlp.extractor")

_DEFAULT_EXTRACTION = {
    "intent": "GENERAL_QA",
    "confidence": 0.5,
    "entities": {
        "provincia": "",
        "distribuidor": "",
        "tipo_combustible": "",
        "severidad": "",
        "fecha_inicio": "",
        "fecha_fin": "",
        "semana": "",
    },
}


def extract_intent_entities(user_text: str) -> dict:
    """
    Use GPT-4 to classify the intent and extract entities from a Spanish
    analyst query about the MICM-INTEL fuel intelligence platform.

    Returns a dict with keys: intent, confidence, entities
    """
    client = get_llm_client()

    user_prompt = EXTRACTOR_USER.format(
        today=get_today(),
        user_text=user_text,
    )

    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": MICM_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content.strip()
        result = json.loads(raw)

        # Validate required keys
        if "intent" not in result or "entities" not in result:
            logger.warning("Extractor response missing required keys — using default")
            return _DEFAULT_EXTRACTION

        # Ensure all entity fields exist
        entities = result.get("entities", {})
        for key in _DEFAULT_EXTRACTION["entities"]:
            if key not in entities:
                entities[key] = ""

        result["entities"] = entities
        result.setdefault("confidence", 0.75)
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse extractor JSON: {e}")
        return _DEFAULT_EXTRACTION
    except Exception as e:
        logger.error(f"Extractor error: {e}", exc_info=True)
        return _DEFAULT_EXTRACTION

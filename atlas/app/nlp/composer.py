import logging
from app.nlp.llm_client import get_llm_client
from app.nlp.prompts import COMPOSER_SYSTEM, COMPOSER_USER
from app.settings import settings

logger = logging.getLogger("nlp.composer")


def compose_reply(context: str, instruction: str) -> str:
    """
    Generate a Spanish institutional response using GPT-4 given a context
    (data retrieved from handlers) and the original user instruction.
    """
    client = get_llm_client()

    user_prompt = COMPOSER_USER.format(
        context=context,
        instruction=instruction,
    )

    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": COMPOSER_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        logger.error(f"Composer error: {e}", exc_info=True)
        return (
            "Lo siento, se produjo un error al generar la respuesta. "
            "Por favor intente de nuevo o contacte al administrador del sistema."
        )

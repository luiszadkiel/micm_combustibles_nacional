from openai import OpenAI
from app.settings import settings

_client: OpenAI | None = None


def get_llm_client() -> OpenAI:
    """Return a singleton OpenAI client."""
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY)
    return _client

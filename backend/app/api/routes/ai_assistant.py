from fastapi import APIRouter

router = APIRouter(prefix="/ai-assistant", tags=["ai-assistant"])

# The MVP analyzer is exposed through /api/incidents/{incident_id}/analyze.
# This module is kept as an extension point for future Bedrock/OpenRouter/Gemini/OpenAI adapters.

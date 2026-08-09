"""Thin wrapper around the google-genai client for text and structured outputs."""

from __future__ import annotations

import os
from typing import TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

DEFAULT_MODEL = "gemini-2.5-flash"


class GeminiClient:
    """Gemini client with structured JSON support (native response schema)."""

    def __init__(
        self,
        model: str | None = None,
        api_key: str | None = None,
        project: str | None = None,
        location: str | None = None,
        use_enterprise: bool | None = None,
    ) -> None:
        self.model = model or os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
        enterprise = (
            use_enterprise
            if use_enterprise is not None
            else os.getenv("GOOGLE_GENAI_USE_ENTERPRISE", "False").lower() == "true"
        )
        if enterprise:
            self._client = genai.Client(
                vertexai=True,
                project=project or os.getenv("GOOGLE_CLOUD_PROJECT"),
                location=location or os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
            )
        else:
            self._client = genai.Client(api_key=api_key or os.getenv("GOOGLE_API_KEY"))

    def generate_text(self, prompt: str) -> str:
        response = self._client.models.generate_content(model=self.model, contents=prompt)
        if not response.text:
            raise RuntimeError("Gemini returned no text response")
        return response.text.strip()

    def generate_structured(self, prompt: str, schema: type[T]) -> T:
        response = self._client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )
        if not response.text:
            raise RuntimeError("Gemini returned no JSON response")
        return schema.model_validate_json(response.text)

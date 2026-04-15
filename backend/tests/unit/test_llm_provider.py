"""Unit tests for LLM provider JSON parsing logic."""
import json
import pytest
from unittest.mock import MagicMock, patch

from app.models import ExtractedRecipe, ExtractionResult


class TestExtractJsonBlock:
    """Test the JSON extraction from LLM responses."""

    def _extract_json(self, text: str) -> dict:
        """Helper that mimics the JSON extraction logic in llm_provider."""
        import re
        # Try to find JSON block in markdown code fences
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        # Try raw JSON
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError("No JSON found")

    def test_extract_plain_json(self):
        text = '{"title": "Pasta", "lang": "de"}'
        result = self._extract_json(text)
        assert result["title"] == "Pasta"

    def test_extract_json_from_markdown_fence(self):
        text = '```json\n{"title": "Pizza", "lang": "de"}\n```'
        result = self._extract_json(text)
        assert result["title"] == "Pizza"

    def test_extract_json_from_unmarked_fence(self):
        text = '```\n{"title": "Salat", "lang": "de"}\n```'
        result = self._extract_json(text)
        assert result["title"] == "Salat"

    def test_no_json_raises(self):
        with pytest.raises((ValueError, json.JSONDecodeError)):
            self._extract_json("No JSON here at all")


class TestExtractedRecipeFromLLMOutput:
    """Test that LLM output can be parsed into ExtractedRecipe."""

    def test_full_recipe_json(self):
        data = {
            "title": "Spaghetti Bolognese",
            "lang": "de",
            "category": "Hauptspeisen",
            "servings": 4,
            "prep_time": "15 min",
            "cook_time": "30 min",
            "tags": ["Fleisch", "Pasta", "Italienisch"],
            "ingredients": [
                {"id": 1, "name": "Spaghetti", "amount": 400, "unit": "g"},
                {"id": 2, "name": "Hackfleisch", "amount": 500, "unit": "g"},
            ],
            "steps": [
                {"id": 1, "text": "Wasser kochen", "time_minutes": 10},
                {"id": 2, "text": "Hack anbraten"},
            ],
        }
        recipe = ExtractedRecipe(**data)
        assert recipe.title == "Spaghetti Bolognese"
        assert recipe.category == "Hauptspeisen"
        assert len(recipe.ingredients) == 2
        assert len(recipe.steps) == 2
        assert recipe.steps[1].time_minutes is None

    def test_minimal_recipe_json(self):
        data = {"title": "Omelett"}
        recipe = ExtractedRecipe(**data)
        assert recipe.title == "Omelett"
        assert recipe.lang == "de"

    def test_category_normalisation_invalid_value(self):
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            ExtractedRecipe(title="Test", category="Hauptgericht")  # wrong value

    def test_extraction_result_wraps_recipe(self):
        recipe = ExtractedRecipe(title="Pasta")
        result = ExtractionResult(recipe=recipe, cover_frame_index=2)
        assert result.recipe.title == "Pasta"
        assert result.cover_frame_index == 2
        assert result.cover_timestamp is None

"""Unit tests for Pydantic models in app.models."""
import pytest
from pydantic import ValidationError

from app.models import (
    CATEGORIES,
    ExtractedRecipe,
    ExtractionResult,
    Ingredient,
    IngredientInput,
    ImportRequest,
    RecipeUpdateRequest,
    Step,
    StepInput,
)


class TestCategories:
    def test_categories_list_contains_expected_values(self):
        assert "Vorspeisen" in CATEGORIES
        assert "Hauptspeisen" in CATEGORIES
        assert "Desserts" in CATEGORIES
        assert "Brunch" in CATEGORIES
        assert "Snacks" in CATEGORIES
        assert "Drinks" in CATEGORIES

    def test_categories_has_six_entries(self):
        assert len(CATEGORIES) == 6


class TestIngredient:
    def test_ingredient_minimal(self):
        ing = Ingredient(id=1, name="Mehl")
        assert ing.id == 1
        assert ing.name == "Mehl"
        assert ing.amount is None
        assert ing.unit is None
        assert ing.group_name is None

    def test_ingredient_full(self):
        ing = Ingredient(id=2, name="Milch", amount=200.0, unit="ml", group_name="Teig")
        assert ing.amount == 200.0
        assert ing.unit == "ml"
        assert ing.group_name == "Teig"

    def test_ingredient_requires_id_and_name(self):
        with pytest.raises(ValidationError):
            Ingredient(name="Mehl")  # missing id


class TestStep:
    def test_step_minimal(self):
        step = Step(id=1, text="Mehl sieben")
        assert step.id == 1
        assert step.text == "Mehl sieben"
        assert step.time_minutes is None

    def test_step_with_time(self):
        step = Step(id=1, text="Kochen", time_minutes=20)
        assert step.time_minutes == 20


class TestExtractedRecipe:
    def test_extracted_recipe_minimal(self):
        recipe = ExtractedRecipe(title="Pasta")
        assert recipe.title == "Pasta"
        assert recipe.lang == "de"
        assert recipe.category is None
        assert recipe.ingredients == []
        assert recipe.steps == []
        assert recipe.tags == []

    def test_extracted_recipe_valid_category(self):
        recipe = ExtractedRecipe(title="Salat", category="Vorspeisen")
        assert recipe.category == "Vorspeisen"

    def test_extracted_recipe_invalid_category_raises(self):
        with pytest.raises(ValidationError):
            ExtractedRecipe(title="Test", category="Ungültig")

    def test_extracted_recipe_with_ingredients_and_steps(self):
        recipe = ExtractedRecipe(
            title="Pasta",
            category="Hauptspeisen",
            servings=4,
            tags=["Vegetarisch", "Schnell"],
            ingredients=[Ingredient(id=1, name="Nudeln", amount=400, unit="g")],
            steps=[Step(id=1, text="Nudeln kochen", time_minutes=10)],
        )
        assert len(recipe.ingredients) == 1
        assert len(recipe.steps) == 1
        assert recipe.servings == 4


class TestImportRequest:
    def test_import_request_defaults(self):
        req = ImportRequest(url="https://example.com/recipe")
        assert req.url == "https://example.com/recipe"
        assert req.source_type == "telegram"
        assert req.media_paths == []
        assert req.caption == ""

    def test_import_request_requires_url(self):
        with pytest.raises(ValidationError):
            ImportRequest()


class TestRecipeUpdateRequest:
    def test_update_request_all_optional(self):
        req = RecipeUpdateRequest()
        assert req.title is None
        assert req.rating is None

    def test_update_request_partial(self):
        req = RecipeUpdateRequest(title="Neuer Titel", rating=1)
        assert req.title == "Neuer Titel"
        assert req.rating == 1

    def test_update_request_invalid_category(self):
        with pytest.raises(ValidationError):
            RecipeUpdateRequest(category="InvalidCategory")

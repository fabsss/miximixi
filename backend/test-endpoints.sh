#!/bin/bash

# Test script for new recipe endpoints
# Prerequisites:
# - Backend running on http://localhost:8000
# - Database with test recipe data

BASE_URL="http://localhost:8000"

# Get a recipe ID (replace with actual ID from your database)
RECIPE_ID=$(curl -s "$BASE_URL/recipes" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$RECIPE_ID" ]; then
    echo "❌ No recipes found in database. Create one first."
    exit 1
fi

echo "📝 Testing Recipe Update & Translation Endpoints"
echo "Using Recipe ID: $RECIPE_ID"
echo ""

# ── Test 1: PATCH /recipes/{recipe_id} ────────────────────────────
echo "1️⃣  Testing PATCH /recipes/{recipe_id} - Update metadata"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -X PATCH "$BASE_URL/recipes/$RECIPE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Pasta Recipe",
    "rating": 1,
    "notes": "Very tasty!"
  }' | jq .

echo ""
echo ""

# ── Test 2: POST /recipes/{recipe_id}/translate ──────────────────
echo "2️⃣  Testing POST /recipes/{recipe_id}/translate - Get translation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -X POST "$BASE_URL/recipes/$RECIPE_ID/translate?lang=en" \
  -H "Content-Type: application/json" | jq .

echo ""
echo ""

# ── Test 3: Verify translation is cached ────────────────────────
echo "3️⃣  Testing Translation Cache (second call should return immediately)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Calling endpoint again (should be cached)..."
curl -X POST "$BASE_URL/recipes/$RECIPE_ID/translate?lang=en" \
  -H "Content-Type: application/json" | jq .

echo ""
echo "✅ All tests completed!"

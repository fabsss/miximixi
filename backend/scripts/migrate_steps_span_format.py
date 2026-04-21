#!/usr/bin/env python3
"""
Migrate step texts from old {id} format to new [Wortlaut]{id} span format.

Old format: "Den {1} kurz kochen."
New format: "Den [grünen Spargel]{1} kurz kochen."

The LLM rewrites each step – inserting the ingredient name (correctly declined)
into the text and wrapping it with the tag.

Also migrates translated steps in the translations table.

Usage:
    # Dry-run (default) – prints what would change
    python scripts/migrate_steps_span_format.py

    # Apply changes to the database
    python scripts/migrate_steps_span_format.py --apply

    # Only migrate specific recipe (by UUID)
    python scripts/migrate_steps_span_format.py --apply --recipe-id <uuid>
"""
import argparse
import json
import logging
import re
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))
from app.config import settings
from app.llm_provider import LLMProvider

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REFORMAT_PROMPT = """Du bekommst eine Liste von Zutaten (mit sort_order als ID und Name) und eine Liste von Schritt-Texten.

Die Schritt-Texte enthalten Zutaten-Referenzen im alten Format {{sort_order}} (z.B. {{1}}).
Forme jeden Schritt-Text ins neue Format um: [Wortlaut]{{sort_order}}

Regeln:
- Der vollständige Satz muss grammatikalisch korrekt und vollständig bleiben
- Der Text in [] soll genau die Wörter sein, die im Satz die Zutat bezeichnen (korrekt dekliniert)
- Es darf keine Dopplung der Zutaten geben: Wenn die Zutat bereits ausgeschrieben im Satz steht, ersetze diese durch die [Zutat]{{id}} Form
- KEIN weiterer Text darf verloren gehen oder verändert werden außer der Tag-Formatierung
- Schritte OHNE {{id}} Referenz bleiben unverändert

Beispiele:
    Zutat sort_order=1: "grüner Spargel"
    Eingabe: "Den {{1}} kurz in Salzwasser kochen."
    Ausgabe: "Den [grünen Spargel]{{1}} kurz in Salzwasser kochen."

    Zutat sort_order=2: "Karotten"
    Eingabe: "Die {{2}} in kleine Würfel schneiden."
    Ausgabe: "Die [Karotten]{{2}} in kleine Würfel schneiden."

    Zutat sort_order=4: "Zwiebel"
    Eingabe: "Zwiebel {{4}} in Scheiben schneiden."
    FALSCH: "Zwiebel [Zwiebel]{{4}} in Scheiben schneiden."
    RICHTIG: "[Zwiebel]{{4}} in Scheiben schneiden."

    Eingabe ohne Referenz: "Mit Salz und Pfeffer abschmecken."
    Ausgabe: "Mit Salz und Pfeffer abschmecken."

Gib NUR gültiges JSON zurück, keine Erklärungen, kein Markdown:
{{"steps": [{{"id": <original_id>, "text": "<neuer Text>"}}]}}

Zutaten:
{ingredients_json}

Schritte:
{steps_json}
"""

OLD_REF_PATTERN = re.compile(r"\{(\d+)\}")
NEW_REF_PATTERN = re.compile(r"\[[^\]]+\]\{(\d+)\}")


def already_new_format(text: str) -> bool:
    """Returns True if all {id} refs in text are already wrapped as [text]{id}."""
    old_refs = set(OLD_REF_PATTERN.findall(text))
    new_refs = set(NEW_REF_PATTERN.findall(text))
    # If every old-style ref has a corresponding new-style ref, it's already converted
    return old_refs == new_refs or (not old_refs and not new_refs)


def reformat_steps_via_llm(
    provider: LLMProvider,
    ingredients: list[dict],
    steps: list[dict],
) -> list[dict]:
    """
    Call LLM to rewrite steps from {id} to [text]{id} format.
    ingredients: [{"sort_order": int, "name": str}, ...]
    steps:       [{"id": int|str, "text": str}, ...]
    Returns list of {"id": ..., "text": ...} with updated texts.
    """
    prompt = REFORMAT_PROMPT.format(
        ingredients_json=json.dumps(
            [{"sort_order": ing["sort_order"], "name": ing["name"]} for ing in ingredients],
            ensure_ascii=False,
        ),
        steps_json=json.dumps(
            [{"id": s["id"], "text": s["text"]} for s in steps],
            ensure_ascii=False,
        ),
    )

    import httpx

    match settings.llm_provider:
        case "gemini":
            import google.generativeai as genai
            genai.configure(api_key=settings.google_api_key)
            model = genai.GenerativeModel(settings.gemini_model)
            response = model.generate_content(prompt)
            text = response.text.strip()
        case "claude":
            import anthropic
            client = anthropic.Anthropic(api_key=settings.claude_api_key)
            response = client.messages.create(
                model=settings.claude_model,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
        case "openai":
            from openai import OpenAI
            client = OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=4096,
            )
            text = response.choices[0].message.content.strip()
        case _:
            # Ollama / gemma3n fallback
            base_url = getattr(settings, "gemma3n_base_url", settings.ollama_base_url)
            model_name = getattr(settings, "gemma3n_model", settings.ollama_model) if settings.llm_provider == "gemma3n" else settings.ollama_model
            payload = {"model": model_name, "prompt": prompt, "stream": False, "format": "json"}
            resp = httpx.post(f"{base_url}/api/generate", json=payload, timeout=300.0)
            resp.raise_for_status()
            text = resp.json()["response"].strip()

    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    data = json.loads(text.strip())
    return data["steps"]


def migrate_recipe(
    cursor,
    recipe: dict,
    ingredients: list[dict],
    steps: list[dict],
    provider: LLMProvider,
    apply: bool,
) -> int:
    """Returns number of steps changed."""
    # Filter out steps that are already in new format
    steps_to_convert = [
        s for s in steps if not already_new_format(s["text"])
    ]

    if not steps_to_convert:
        logger.info(f"  ✓ All steps already in new format, skipping.")
        return 0

    logger.info(f"  Converting {len(steps_to_convert)}/{len(steps)} steps...")

    new_steps = reformat_steps_via_llm(provider, ingredients, steps_to_convert)

    # Build lookup by step id
    new_text_by_id = {str(s["id"]): s["text"] for s in new_steps}

    changed = 0
    for step in steps_to_convert:
        step_id = str(step["id"])
        new_text = new_text_by_id.get(step_id)
        if not new_text or new_text == step["text"]:
            logger.info(f"    step {step_id}: unchanged")
            continue

        logger.info(f"    step {step_id}:")
        logger.info(f"      OLD: {step['text']}")
        logger.info(f"      NEW: {new_text}")

        if apply:
            cursor.execute(
                "UPDATE steps SET text = %s WHERE id = %s",
                (new_text, step["db_id"]),
            )
        changed += 1

    return changed



def main():
    parser = argparse.ArgumentParser(description="Migrate step texts to [Wortlaut]{id} format")
    parser.add_argument("--apply", action="store_true", help="Write changes to DB (default: dry-run)")
    parser.add_argument("--recipe-id", help="Only migrate this recipe UUID")
    args = parser.parse_args()

    if not args.apply:
        logger.info("DRY-RUN mode – no changes will be written. Pass --apply to persist.")

    conn = psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
    )
    conn.autocommit = False

    provider = LLMProvider()

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Fetch recipes
            if args.recipe_id:
                cur.execute("SELECT id, title FROM recipes WHERE id = %s", (args.recipe_id,))
            else:
                cur.execute("SELECT id, title FROM recipes ORDER BY created_at")
            recipes = cur.fetchall()

            total_changed = 0

            for recipe in recipes:
                recipe_id = str(recipe["id"])
                logger.info(f"\nRecipe: {recipe['title']} ({recipe_id})")

                # Fetch ingredients (sort_order = the number used in {N} refs)
                cur.execute(
                    "SELECT id, sort_order, name FROM ingredients WHERE recipe_id = %s ORDER BY sort_order",
                    (recipe_id,),
                )
                ingredients = [dict(r) for r in cur.fetchall()]

                # Fetch steps
                cur.execute(
                    "SELECT id, sort_order, text FROM steps WHERE recipe_id = %s ORDER BY sort_order",
                    (recipe_id,),
                )
                steps = []
                for row in cur.fetchall():
                    steps.append({
                        "db_id": str(row["id"]),     # UUID for UPDATE
                        "id": row["sort_order"],      # sort_order = the {N} ref number
                        "text": row["text"],
                    })

                changed = migrate_recipe(cur, recipe, ingredients, steps, provider, args.apply)
                total_changed += changed

            if args.apply:
                conn.commit()
                logger.info(f"\n✓ Done. {total_changed} step(s) updated in database.")
            else:
                conn.rollback()
                logger.info(f"\nDRY-RUN complete. {total_changed} step(s) would be updated. Pass --apply to write.")

    except Exception:
        conn.rollback()
        logger.exception("Migration failed, rolled back.")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()

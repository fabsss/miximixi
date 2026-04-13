-- Migration 005: Zutaten-Gruppen (z.B. "Für das Soja-Hack", "Dressing", "Toppings")
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS group_name TEXT;

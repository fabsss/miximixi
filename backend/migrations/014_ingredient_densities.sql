-- 014_ingredient_densities.sql
-- Zutatendichten für Cup-zu-Gramm-Konvertierung

CREATE TABLE ingredient_density_types (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name        TEXT NOT NULL UNIQUE,
    display_name     TEXT,
    density_g_per_ml NUMERIC NOT NULL
);

CREATE TABLE ingredient_density_keywords (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_id  UUID NOT NULL REFERENCES ingredient_density_types(id) ON DELETE CASCADE,
    keyword  TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_ingredient_density_keywords_type_id ON ingredient_density_keywords(type_id);

-- Seed: Typen
INSERT INTO ingredient_density_types (id, type_name, display_name, density_g_per_ml) VALUES
  (gen_random_uuid(), 'flour',          'Mehl / Flour',               0.593),
  (gen_random_uuid(), 'sugar',          'Zucker / Sugar',             0.845),
  (gen_random_uuid(), 'powdered_sugar', 'Puderzucker / Icing Sugar',  0.560),
  (gen_random_uuid(), 'butter',         'Butter / Margarine',         0.911),
  (gen_random_uuid(), 'breadcrumbs',    'Semmelbrösel / Breadcrumbs', 0.370),
  (gen_random_uuid(), 'oats',           'Haferflocken / Oats',        0.340),
  (gen_random_uuid(), 'cocoa',          'Kakao / Cocoa Powder',       0.520),
  (gen_random_uuid(), 'rice',           'Reis / Rice',                0.780),
  (gen_random_uuid(), 'salt',           'Salz / Salt',                1.217),
  (gen_random_uuid(), 'herbs_dried',    'Getrocknete Kräuter',        0.150),
  (gen_random_uuid(), 'granules',       'Granulate / Körner',         0.600),
  (gen_random_uuid(), 'paste',          'Pasten',                     1.100);

-- Seed: Keywords
INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'mehl','weizenmehl','flour','all-purpose flour','dinkelmehl','spelt flour',
  'roggenmehl','rye flour','vollkornmehl','whole wheat flour',
  'backpulver','baking powder','natron','baking soda',
  'stärke','speisestärke','cornstarch','corn starch','maisstärke',
  'kartoffelstärke','potato starch'
]) AS k WHERE type_name = 'flour';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'zucker','sugar','kristallzucker','granulated sugar',
  'brauner zucker','brown sugar','rohrzucker','cane sugar',
  'vanillezucker','vanilla sugar'
]) AS k WHERE type_name = 'sugar';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'puderzucker','powdered sugar','icing sugar','confectioners sugar','staubzucker'
]) AS k WHERE type_name = 'powdered_sugar';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'butter','margarine','pflanzenmargarine','vegane butter','vegan butter'
]) AS k WHERE type_name = 'butter';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'semmelbrösel','semmelbröseln','breadcrumbs','paniermehl','bread crumbs','panko'
]) AS k WHERE type_name = 'breadcrumbs';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'haferflocken','oats','rolled oats','instant oats','porridge oats',
  'zartblatt haferflocken','kernige haferflocken'
]) AS k WHERE type_name = 'oats';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'kakao','cocoa','cocoa powder','kakaopulver','backkakao',
  'dutch process cocoa','unsweetened cocoa'
]) AS k WHERE type_name = 'cocoa';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'reis','rice','langkornreis','long grain rice','rundkornreis',
  'short grain rice','jasminreis','jasmine rice','basmatireis','basmati rice',
  'risottoreis','risotto rice'
]) AS k WHERE type_name = 'rice';

INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'salz','salt','meersalz','sea salt','tafelsalz','table salt',
  'grobes salz','coarse salt','fleur de sel'
]) AS k WHERE type_name = 'salt';

-- Getrocknete Kräuter (0.150 g/ml)
INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'dried oregano','dried basil','dried thyme','dried rosemary','dried parsley',
  'getrocknetes oregano','getrocknetes basilikum','getrockneter thymian','getrockneter rosmarin',
  'dried herbs','trockengewürze','italian seasoning'
]) AS k WHERE type_name = 'herbs_dried';

-- Granulate (0.600 g/ml)
INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'granules','chilli granules','chilli flakes','dried chillies','chilli crisp',
  'red pepper flakes','paprika granules','getrocknete chilis','chiliflöckchen',
  'dried chile','chili powder','paprika powder', 'flakes','chili flakes','chili granules','chili crisp','chili knusper','paprikaflocken',
]) AS k WHERE type_name = 'granules';

-- Pasten (1.100 g/ml)
INSERT INTO ingredient_density_keywords (id, type_id, keyword)
SELECT gen_random_uuid(), id, k FROM ingredient_density_types, unnest(ARRAY[
  'paste','chili paste','tomato paste','miso paste','garlic paste','ginger paste',
  'curry paste','harissa paste','pesto',
  'chilipaste','tomatenpaste','misopaste','knobellauchpaste','ingwerpaste',
  'currypaste','pesto'
]) AS k WHERE type_name = 'paste';

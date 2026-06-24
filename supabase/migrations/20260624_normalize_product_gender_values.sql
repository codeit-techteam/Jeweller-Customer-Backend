-- Normalize legacy gender chip labels to canonical DB values (female | male | unisex | kids).

UPDATE products
SET gender = '["female"]'::jsonb
WHERE gender @> '["For Her"]'::jsonb
   OR gender @> '["Female"]'::jsonb;

UPDATE products
SET gender = '["male"]'::jsonb
WHERE gender @> '["For Him"]'::jsonb
   OR gender @> '["Male"]'::jsonb;

UPDATE products
SET gender = '["kids"]'::jsonb
WHERE gender @> '["Kids"]'::jsonb;

UPDATE products
SET gender = '["unisex"]'::jsonb
WHERE gender @> '["Unisex"]'::jsonb;

UPDATE products
SET gender = sub.normalized
FROM (
  SELECT
    p.id,
    COALESCE(
      (
        SELECT jsonb_agg(DISTINCT mapped ORDER BY mapped)
        FROM (
          SELECT CASE lower(trim(elem))
            WHEN 'for her' THEN 'female'
            WHEN 'for him' THEN 'male'
            WHEN 'female' THEN 'female'
            WHEN 'male' THEN 'male'
            WHEN 'unisex' THEN 'unisex'
            WHEN 'kids' THEN 'kids'
            ELSE lower(trim(elem))
          END AS mapped
          FROM jsonb_array_elements_text(p.gender) AS elem
        ) tokens
      ),
      '[]'::jsonb
    ) AS normalized
  FROM products p
  WHERE p.gender IS NOT NULL
    AND jsonb_typeof(p.gender) = 'array'
    AND jsonb_array_length(p.gender) > 0
) sub
WHERE products.id = sub.id
  AND products.gender IS DISTINCT FROM sub.normalized;

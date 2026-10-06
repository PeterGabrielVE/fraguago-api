-- Slug del gym para los enlaces públicos (/registro/<slug>).
ALTER TABLE "Gym" ADD COLUMN "slug" TEXT;

-- Relleno de los gyms existentes: nombre en minúsculas, sin acentos, con
-- guiones. Si dos gyms dan el mismo slug (o queda vacío) se le añade el
-- inicio del id para que sea único.
WITH base AS (
  SELECT
    id,
    "createdAt",
    trim(BOTH '-' FROM regexp_replace(
      translate(lower(name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9]+', '-', 'g'
    )) AS s
  FROM "Gym"
),
ranked AS (
  SELECT id, s, row_number() OVER (PARTITION BY s ORDER BY "createdAt", id) AS n
  FROM base
)
UPDATE "Gym" g
SET "slug" = CASE
  WHEN r.s = '' THEN 'gym-' || left(g.id, 8)
  WHEN r.n = 1 THEN left(r.s, 50)
  ELSE left(r.s, 41) || '-' || left(g.id, 8)
END
FROM ranked r
WHERE r.id = g.id;

ALTER TABLE "Gym" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Gym_slug_key" ON "Gym"("slug");

import { randomBytes } from 'crypto';

// Formato válido de un slug: minúsculas, números y guiones simples.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 50;

// "Fragua Gym Ñaña!" → "fragua-gym-nana". Misma regla que la migración
// 20261006000000_gym_slug.
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}

// Slug libre a partir del nombre: si ya existe, prueba con un sufijo
// aleatorio corto. `taken` consulta la base.
export async function uniqueSlug(name: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  const base = slugify(name) || 'gym';
  if (!(await taken(base))) return base;
  for (let i = 0; i < 5; i++) {
    const candidate = `${base.slice(0, SLUG_MAX_LENGTH - 7)}-${randomBytes(3).toString('hex')}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `gym-${randomBytes(6).toString('hex')}`;
}

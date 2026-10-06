import { NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ScopedPrismaClient } from '../prisma/prisma.service';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from './slug';

// Resuelve el gym de una ruta pública (/registro/<slug>, /check-in/<slug>).
// Acepta el slug o, por compatibilidad con enlaces ya compartidos, el id.
// Gym no tiene RLS, así que la búsqueda no necesita contexto de tenant.
export async function findPublicGym(prisma: ScopedPrismaClient, ref: string) {
  const slug = ref.toLowerCase();
  const byId = isUUID(ref);
  // Un slug mal formado no puede existir: se corta sin ir a la base.
  if (!byId && (slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))) {
    throw new NotFoundException('Gimnasio no encontrado');
  }
  const gym = await prisma.gym.findUnique({
    where: byId ? { id: ref } : { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!gym) throw new NotFoundException('Gimnasio no encontrado');
  return gym;
}

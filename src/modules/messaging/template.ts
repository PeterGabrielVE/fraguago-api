// Variables disponibles en los mensajes automáticos ({{nombre}}, etc.).
export const TEMPLATE_VARIABLES = {
  nombre: 'Nombre del socio',
  apellido: 'Apellido del socio',
  gimnasio: 'Nombre del gimnasio',
  dias_inactivo: 'Días desde la última asistencia',
  ultima_visita: 'Fecha de la última asistencia',
  plan: 'Plan de la membresía vigente',
  vence: 'Fecha de vencimiento de la membresía',
} as const;

export type TemplateVariable = keyof typeof TEMPLATE_VARIABLES;
export type TemplateValues = Partial<Record<TemplateVariable, string>>;

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

// Variables usadas en un texto que NO existen (para validar al guardar).
export function unknownVariables(text: string): string[] {
  const unknown = new Set<string>();
  for (const [, name] of text.matchAll(PLACEHOLDER_RE)) {
    if (!(name in TEMPLATE_VARIABLES)) unknown.add(name);
  }
  return [...unknown];
}

// Reemplaza {{variable}} por su valor; las que no tengan valor quedan vacías.
export function renderTemplate(text: string, values: TemplateValues): string {
  return text.replace(PLACEHOLDER_RE, (_, name: string) => values[name as TemplateVariable] ?? '');
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// HTML mínimo y seguro para el email: el texto ya renderizado se escapa (los
// valores vienen de datos de usuarios) y los saltos de línea pasan a <br>.
export function toEmailHtml(body: string, gymName: string): string {
  const content = escapeHtml(body).replace(/\r?\n/g, '<br>');
  return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#d97706;color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold;">${escapeHtml(gymName)}</td></tr>
      <tr><td style="padding:24px;color:#1e293b;font-size:15px;line-height:1.6;">${content}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

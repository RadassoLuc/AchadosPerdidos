// Todas as datas são guardadas em UTC (ISO 8601). A contagem de dias usa o
// calendário de Belém/PA (America/Belem, UTC-3, sem horário de verão).
const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Belem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const nowIso = () => new Date().toISOString();

const belemDay = (d) => Date.parse(`${dayFmt.format(d)}T00:00:00Z`);

/** Dias de calendário (Belém) entre `fromIso` e `to` (padrão: agora). Nunca negativo. */
export function diasEntre(fromIso, to = new Date()) {
  const diff = Math.round((belemDay(to) - belemDay(new Date(fromIso))) / 86400000);
  return Math.max(0, diff);
}

/** Faixa de cor do contador: recente (0-7), atencao (8-30), alerta (31-60), critico (61+). */
export function faixaDias(n) {
  if (n <= 7) return 'recente';
  if (n <= 30) return 'atencao';
  if (n <= 60) return 'alerta';
  return 'critico';
}

/**
 * Converte "2026-10-27T14:30" (sem fuso => horário de Belém) ou ISO com fuso em ISO UTC.
 * Retorna null se inválido.
 */
export function parseOcorrido(valor) {
  if (typeof valor !== 'string') return null;
  const m = valor.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/);
  if (!m) return null;
  const tz = m[4] ? (m[4] === 'Z' ? 'Z' : m[4]) : '-03:00';
  const d = new Date(`${m[1]}T${m[2]}:${m[3] || '00'}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

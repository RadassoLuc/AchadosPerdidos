// Utilidades de interface. O template `html` ESCAPA tudo por padrão (proteção contra XSS);
// só `raw()` e outros `html` aninhados passam sem escape.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);
const render = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : v === false || v == null ? '' : esc(v));
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += render(vals[i]); });
  return new Raw(out);
}
export const mostrar = (el, r) => { el.innerHTML = r.s; };

const P = {
  bottle: 'M10 2h4M10 2v3l-2 3v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8l-2-3V2M8 12h8',
  doc: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6',
  card: 'M2 6h20v12H2zM2 10h20M6 15h4',
  chip: 'M7 7h10v10H7zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3',
  key: 'M14 10a4 4 0 1 0-3.9 4L21 14v3h-3v3h-3v-3l-4.9-.1',
  book: 'M4 4a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 1 2-2h14',
  shirt: 'M8 3 2 6l2 5 3-1v11h10V10l3 1 2-5-6-3a4 4 0 0 1-8 0z',
  glasses: 'M2 15a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zM15 15a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0zM9 15h6M2 15l2-8M22 15l-2-8',
  bag: 'M5 8h14l1 13H4zM9 8V6a3 3 0 0 1 6 0v2',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  pin: 'M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  user: 'M20 21a8 8 0 0 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  check: 'M20 6 9 17l-5-5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M3 3h18v18H3zM3 16l5-5 4 4 3-3 6 6M9 8.5a1 1 0 1 0 0-.01',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
};
export const icone = (nome, cls = '') =>
  raw(`<svg class="icone ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[nome] || P.box}"/></svg>`);

/** Foto de perfil ou, se não houver, um círculo com as iniciais. `rotulo`: lê "Foto de X" para leitor de tela (use só quando o nome não aparece ao lado). */
export function avatar(u, tam = 'md', rotulo = false) {
  const nome = u?.nome || '?';
  if (u?.avatar) return html`<img class="avatar av-${tam}" src="${u.avatar}" alt="${rotulo ? `Foto de ${nome}` : ''}" loading="lazy">`;
  const p = nome.split(' ').filter(Boolean);
  const ini = ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  let h = 0; for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 6;
  return html`<span class="avatar av-${tam} av-ini av-c${h}" ${raw(rotulo ? `role="img" aria-label="${esc(nome)}"` : 'aria-hidden="true"')}>${ini}</span>`;
}

export function toast(msg, tipo = '') {
  const box = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.remove(), 5000);
}

export const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const dataCurta = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Belem', day: '2-digit', month: 'short' });

export const rotuloDias = (n) => (n === 0 ? 'Hoje' : n === 1 ? 'Há 1 dia' : `Há ${n} dias`);
export function seloDias(i) {
  const txt = i.faixa === 'final' ? `${i.dias} ${i.dias === 1 ? 'dia' : 'dias'}` : rotuloDias(i.dias);
  const titulo = i.tipo === 'achado' ? 'Tempo desde que foi achado' : 'Tempo desde que foi perdido';
  return html`<span class="dias dias-${i.faixa}" title="${titulo}">${icone('clock')} ${txt}</span>`;
}

export function cartaoItem(i) {
  return html`<a class="card item" href="#/itens/${i.id}">
    <div class="capa">
      ${i.capa ? html`<img src="${i.capa}" alt="Foto de ${i.titulo}" loading="lazy">` : icone(i.categoria.icone)}
      <span class="selo selo-${i.tipo}">${i.tipo === 'achado' ? 'Achado' : 'Perdido'}</span>
      ${seloDias(i)}
    </div>
    <div class="corpo">
      <h2 class="h3">${i.titulo}</h2>
      <div class="meta">${icone('pin')} ${i.local.nome}</div>
      <div class="meta"><span class="selo selo-status">${i.status_rotulo}</span> <span class="mono">${i.codigo}</span></div>
    </div>
  </a>`;
}

export function erroCampos(form, campos = {}) {
  form.querySelectorAll('.erro-campo').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((i) => { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); });
  let primeiro = null;
  for (const [nome, msg] of Object.entries(campos)) {
    const input = form.querySelector(`[name="${nome}"]`);
    const alvo = input?.closest('.campo') || form;
    const p = document.createElement('div');
    p.className = 'erro-campo'; p.id = `erro-${nome}`; p.textContent = msg; p.setAttribute('role', 'alert');
    alvo.append(p);
    if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', p.id); primeiro ??= input; }
  }
  const alvoFoco = primeiro || form.querySelector('.erro-campo');
  if (alvoFoco) { alvoFoco.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (primeiro) primeiro.focus({ preventScroll: true }); }
}

export const formDados = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
export function ocupado(btn, fn) {
  return async (...a) => {
    btn.disabled = true;
    try { return await fn(...a); } finally { btn.disabled = false; }
  };
}

export class ApiError extends Error {
  constructor(status, corpo) { super(corpo?.erro || 'Falha na requisição'); this.status = status; this.campos = corpo?.campos; this.codigo = corpo?.codigo; }
}
export const sessao = { usuario: null, csrf: '' };

export async function api(metodo, url, corpo, opts = {}) {
  const headers = { Accept: 'application/json' };
  let body;
  if (opts.raw) { body = opts.raw; headers['Content-Type'] = opts.tipo; }
  else if (corpo !== undefined) { body = JSON.stringify(corpo); headers['Content-Type'] = 'application/json'; }
  if (metodo !== 'GET' && sessao.csrf) headers['X-CSRF-Token'] = sessao.csrf;
  let res;
  try { res = await fetch(url, { method: metodo, headers, body, credentials: 'same-origin' }); }
  catch { throw new ApiError(0, { erro: 'Sem conexão com o servidor. Verifique a internet e tente de novo.' }); }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && sessao.usuario) { sessao.usuario = null; sessao.csrf = ''; window.dispatchEvent(new Event('sessao-expirou')); }
    throw new ApiError(res.status, dados);
  }
  return dados;
}
export const get = (u) => api('GET', u);
export const post = (u, b = {}) => api('POST', u, b);
export const patch = (u, b = {}) => api('PATCH', u, b);

export async function carregarSessao() {
  const r = await get('/api/auth/eu');
  sessao.usuario = r.usuario;
  sessao.csrf = r.csrf || '';
}
export function definirSessao(r) { sessao.usuario = r.usuario; sessao.csrf = r.csrf; }

let metaCache;
export const meta = () => (metaCache ??= get('/api/meta'));

/** Reduz a foto no navegador (máx. 1600 px) e converte para JPEG: isso também remove o GPS/EXIF. */
export async function prepararFoto(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new ApiError(0, { erro: 'Escolha um arquivo de imagem.' });
  const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) throw new ApiError(0, { erro: 'Não consegui ler essa imagem. Tente outra foto (JPEG ou PNG).' });
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(64, Math.round(bmp.width * escala));
  c.height = Math.max(64, Math.round(bmp.height * escala));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  if (!blob) throw new ApiError(0, { erro: 'Falha ao preparar a foto.' });
  return blob;
}
export const enviarFoto = (blob) => api('POST', '/api/uploads', undefined, { raw: blob, tipo: 'image/jpeg' });

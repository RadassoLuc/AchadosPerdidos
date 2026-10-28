import { HttpError } from './validate.js';

const COOKIE_RE = /;\s*/;

export function lerCookies(req) {
  const out = {};
  for (const par of (req.headers.cookie || '').split(COOKIE_RE)) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i)] = decodeURIComponent(par.slice(i + 1));
  }
  return out;
}

export function setCookie(res, nome, valor, { maxAge, secure, httpOnly = true } = {}) {
  const partes = [`${nome}=${encodeURIComponent(valor)}`, 'Path=/', 'SameSite=Lax'];
  if (httpOnly) partes.push('HttpOnly');
  if (secure) partes.push('Secure');
  if (maxAge !== undefined) partes.push(`Max-Age=${maxAge}`);
  const atual = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(atual ? [].concat(atual) : []), partes.join('; ')]);
}

export function ipDe(req, trustProxy) {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || 'desconhecido';
}

/**
 * Monta a Content-Security-Policy. O VLibras (tradutor de Libras do governo) carrega scripts, estilos, o avatar 3D
 * (Unity/WebGL) e os dicionários de sinais de vlibras.gov.br e subdomínios, e usa estilos inline e eval.
 * Por isso, com VLibras ligado liberamos só esses domínios + 'unsafe-eval' e estilos inline.
 * O restante do site não usa nenhum dos dois (sem scripts/estilos inline); VLIBRAS_CSP=estrita mantém tudo restrito.
 */
export function montarCsp({ vlibras = false, vlibrasCspEstrita = false, cspExtraScript = '' } = {}) {
  const v = vlibras ? ' https://vlibras.gov.br https://*.vlibras.gov.br' : '';
  const compat = vlibras && !vlibrasCspEstrita;
  const partes = [
    "default-src 'self'",
    `script-src 'self'${v}${vlibras ? " 'wasm-unsafe-eval'" : ''}${compat ? " 'unsafe-eval'" : ''}${cspExtraScript ? ` ${cspExtraScript}` : ''}`,
    `style-src 'self'${v}${compat ? " 'unsafe-inline'" : ''}`,
    `img-src 'self' data: blob:${v}`,
    `font-src 'self' data:${v}`,
    `connect-src 'self'${v}${vlibras ? ' blob: data:' : ''}`,
    `media-src 'self' blob:${v}`,
    `frame-src ${vlibras ? v.trim() : "'none'"}`,
    "worker-src 'self' blob:",
    "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
  ];
  return partes.join('; ');
}

export function cabecalhosSeguranca(res, production, csp = montarCsp()) {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

export function enviarJson(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo),
    'Cache-Control': 'no-store',
  });
  res.end(corpo);
}

export function lerCorpo(req, limite) {
  return new Promise((resolve, reject) => {
    const declarado = Number(req.headers['content-length'] || 0);
    if (declarado > limite) {
      req.resume();
      return reject(new HttpError(413, 'Conteúdo grande demais.'));
    }
    const pedacos = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limite) {
        req.destroy();
        reject(new HttpError(413, 'Conteúdo grande demais.'));
      } else pedacos.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(pedacos)));
    req.on('error', reject);
  });
}

export async function lerJson(req, limite = 32 * 1024) {
  const tipo = String(req.headers['content-type'] || '');
  if (!tipo.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'Use Content-Type: application/json.');
  const buf = await lerCorpo(req, limite);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

/** Roteador mínimo: padrões como /api/itens/:id */
export function criarRoteador() {
  const rotas = [];
  return {
    add(metodo, padrao, handler, opts = {}) {
      const nomes = [];
      const re = new RegExp('^' + padrao.replace(/:([a-z_]+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '/?$');
      rotas.push({ metodo, re, nomes, handler, opts });
    },
    achar(metodo, caminho) {
      let existe = false;
      for (const r of rotas) {
        const m = caminho.match(r.re);
        if (!m) continue;
        existe = true;
        if (r.metodo !== metodo) continue;
        const params = {};
        r.nomes.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
        return { handler: r.handler, params, opts: r.opts };
      }
      return { naoPermitido: existe };
    },
  };
}

/** Limitador de taxa em memória (janela fixa). */
export function criarLimitador(ativo = true) {
  const mapa = new Map();
  const timer = setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of mapa) if (v.fim <= agora) mapa.delete(k);
  }, 60_000);
  timer.unref();
  return {
    /** Lança 429 se `chave` passou de `max` ações em `janelaMs`. */
    usar(chave, max, janelaMs) {
      if (!ativo) return;
      const agora = Date.now();
      let e = mapa.get(chave);
      if (!e || e.fim <= agora) { e = { n: 0, fim: agora + janelaMs }; mapa.set(chave, e); }
      e.n += 1;
      if (e.n > max) {
        const seg = Math.ceil((e.fim - agora) / 1000);
        throw new HttpError(429, `Muitas tentativas. Tente de novo em ${Math.ceil(seg / 60)} min.`, { retryAfter: seg });
      }
    },
    zerar(chave) { mapa.delete(chave); },
  };
}

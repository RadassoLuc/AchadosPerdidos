// "Entrar com Google" (OAuth 2.0 / OpenID Connect, fluxo Authorization Code + PKCE).
// Só entram contas cujo e-mail pertence aos domínios permitidos (ex.: aluno.uepa.br).
import { createHash, randomBytes } from 'node:crypto';
import { lerCookies, setCookie } from '../lib/http.js';
import { novoToken } from '../lib/crypto.js';
import { emailInstitucional } from '../lib/validate.js';
import { nowIso } from '../lib/dates.js';

const COOKIE = 'ap_oauth';
const DEZ_MIN = 10 * 60_000;

export default function googleRoutes(r, d) {
  const { db, config, limitador } = d;
  const g = config.google;
  const pendentes = new Map(); // state -> { verifier, nonce, exp }

  const limpar = () => { const agora = Date.now(); for (const [k, v] of pendentes) if (v.exp < agora) pendentes.delete(k); };
  const voltar = (ctx, destino) => {
    ctx.res.writeHead(302, { Location: destino, 'Cache-Control': 'no-store' });
    ctx.res.end();
    return ctx.handled;
  };
  const erro = (ctx, codigo) => voltar(ctx, `/#/entrar?erro=${codigo}`);

  r.add('GET', '/api/auth/google', async (ctx) => {
    limitador.usar(`goo:${ctx.ip}`, 30, 15 * 60_000);
    limpar();
    if (pendentes.size > 2000) pendentes.clear();
    const state = novoToken();
    const verifier = randomBytes(32).toString('base64url');
    const nonce = novoToken();
    pendentes.set(state, { verifier, nonce, exp: Date.now() + DEZ_MIN });
    setCookie(ctx.res, COOKIE, state, { maxAge: 600, secure: config.production });
    const q = new URLSearchParams({
      client_id: g.clientId, redirect_uri: g.redirectUri, response_type: 'code', scope: 'openid email profile',
      state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
      prompt: 'select_account', hd: '*',
    });
    return voltar(ctx, `${g.authUrl}?${q}`);
  });

  r.add('GET', '/api/auth/google/callback', async (ctx) => {
    limitador.usar(`goo:${ctx.ip}`, 30, 15 * 60_000);
    const state = ctx.query.get('state') || '';
    const code = ctx.query.get('code') || '';
    const cookie = lerCookies(ctx.req)[COOKIE];
    setCookie(ctx.res, COOKIE, '', { maxAge: 0, secure: config.production });
    const p = pendentes.get(state);
    pendentes.delete(state);
    if (!p || p.exp < Date.now() || !cookie || cookie !== state) return erro(ctx, 'google_falhou');
    if (ctx.query.get('error') || !code) return erro(ctx, 'google_negado');

    let claims;
    try {
      const resp = await fetch(g.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: g.redirectUri, grant_type: 'authorization_code', code_verifier: p.verifier }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) throw new Error(`token endpoint ${resp.status}`);
      const { id_token: idToken } = await resp.json();
      // O id_token vem direto do endpoint do Google por TLS, junto com o client_secret: a spec OIDC
      // (Core 3.1.3.7) permite validar as claims sem verificar a assinatura.
      claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    } catch (e) {
      console.error('[google] falha na troca do código:', e.message);
      return erro(ctx, 'google_falhou');
    }

    const agora = Math.floor(Date.now() / 1000);
    const emissorOk = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
    if (!emissorOk || claims.aud !== g.clientId || !(claims.exp > agora) || claims.nonce !== p.nonce) return erro(ctx, 'google_falhou');
    const email = String(claims.email || '').toLowerCase();
    if (claims.email_verified !== true || !/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) return erro(ctx, 'google_falhou');
    if (!emailInstitucional(email, config.allowedDomains)) return erro(ctx, 'dominio');

    let u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    if (u?.bloqueado) return erro(ctx, 'suspensa');
    if (!u) {
      let nome = String(claims.name || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      if (nome.length < 3) nome = email.split('@')[0].slice(0, 100).padEnd(3, '_');
      const info = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, verificado_em, aceite_termos_em) VALUES (?,?,?,?,?)')
        .run(nome, email, 'google$sem-senha', nowIso(), nowIso());
      u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
      d.auditar(ctx, 'usuario.cadastro_google', `usuario:${u.id}`, '', u.id);
    } else if (!u.verificado_em) {
      db.prepare('UPDATE usuarios SET verificado_em = ? WHERE id = ?').run(nowIso(), u.id);
    }
    d.promoverAdmin(u);
    d.criarSessao(ctx, u.id);
    d.auditar(ctx, 'usuario.login_google', `usuario:${u.id}`, '', u.id);
    return voltar(ctx, '/#/itens');
  });
}

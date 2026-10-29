import { hashSenha, verificarSenha, gastarTempo, novoToken, sha256 } from '../lib/crypto.js';
import { setCookie } from '../lib/http.js';
import { EMAIL_RE, HttpError, emailInstitucional, validar, validarSenha } from '../lib/validate.js';
import { nowIso } from '../lib/dates.js';

const MIN = 60_000, HORA = 3_600_000;
export const nomeCookie = (config) => (config.production ? '__Host-ap_sid' : 'ap_sid');

export const avatarUrl = (a) => (a ? `/uploads/${a}` : null);
export const usuarioPublico = (u) => ({ id: u.id, nome: u.nome, email: u.email, matricula: u.matricula, papel: u.papel, avatar: avatarUrl(u.avatar), tem_senha: !String(u.senha_hash).startsWith('google$') });

export default function authRoutes(r, d) {
  const { db, config, mailer, limitador } = d;

  function criarSessao(ctx, usuarioId) {
    const token = novoToken();
    const csrf = novoToken();
    const expira = new Date(Date.now() + config.sessionDays * 86_400_000).toISOString();
    db.prepare('INSERT INTO sessoes (usuario_id, token_hash, csrf, expira_em, ip) VALUES (?,?,?,?,?)')
      .run(usuarioId, sha256(token), csrf, expira, ctx.ip);
    setCookie(ctx.res, nomeCookie(config), token, { maxAge: config.sessionDays * 86_400, secure: config.production });
    return csrf;
  }

  async function enviarToken(usuario, tipo, validadeMs, rota, assunto, texto) {
    const token = novoToken();
    db.prepare('UPDATE tokens_email SET usado_em = ? WHERE usuario_id = ? AND tipo = ? AND usado_em IS NULL').run(nowIso(), usuario.id, tipo);
    db.prepare('INSERT INTO tokens_email (usuario_id, tipo, token_hash, expira_em) VALUES (?,?,?,?)')
      .run(usuario.id, tipo, sha256(token), new Date(Date.now() + validadeMs).toISOString());
    const link = `${config.appUrl}/#/${rota}?token=${token}`;
    await mailer.enviar({ to: usuario.email, subject: assunto, text: `Olá, ${usuario.nome.split(' ')[0]}!\n\n${texto}\n\n${link}\n\nSe não foi você, ignore esta mensagem.` });
  }

  const promoverAdmin = (u) => {
    if (config.adminEmails.includes(u.email) && u.papel !== 'admin') db.prepare("UPDATE usuarios SET papel='admin' WHERE id=?").run(u.id);
  };

  d.criarSessao = criarSessao;
  d.promoverAdmin = promoverAdmin;

  r.add('POST', '/api/auth/cadastro', async (ctx) => {
    limitador.usar(`cad:${ctx.ip}`, 5, HORA);
    const b = validar(await ctx.json(), {
      nome: { min: 3, max: 100, label: 'Nome' },
      email: { max: 120, label: 'E-mail', pattern: EMAIL_RE, patternMsg: 'E-mail inválido.' },
      matricula: { optional: true, max: 20, label: 'Matrícula', pattern: /^\d{5,20}$/, patternMsg: 'A matrícula deve ter apenas números (5 a 20 dígitos).' },
      senha: { min: 1, max: 200, label: 'Senha', raw: true },
      aceite: { type: 'bool', label: 'Aceite dos termos' },
    });
    b.email = b.email.toLowerCase();
    if (b.nome.split(' ').filter(Boolean).length < 2) throw new HttpError(422, 'Confira os campos destacados.', { campos: { nome: 'Informe nome e sobrenome.' } });
    if (!emailInstitucional(b.email, config.allowedDomains))
      throw new HttpError(422, 'Confira os campos destacados.', { campos: { email: 'Use seu e-mail institucional da UEPA (ex.: @aluno.uepa.br).' } });
    const erroSenha = validarSenha(b.senha, b.email);
    if (erroSenha) throw new HttpError(422, 'Confira os campos destacados.', { campos: { senha: erroSenha } });
    if (!b.aceite) throw new HttpError(422, 'Confira os campos destacados.', { campos: { aceite: 'É preciso aceitar os termos.' } });

    const existente = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(b.email);
    const resposta = { mensagem: 'Enviamos um link de confirmação para o seu e-mail. Ele vale por 24 horas.' };
    if (existente) {
      // Resposta idêntica: não revela se o e-mail já existe.
      if (!existente.verificado_em) await enviarToken(existente, 'verificacao', 24 * HORA, 'verificar', 'Confirme seu e-mail — Achados e Perdidos UEPA', 'Confirme seu e-mail para ativar a conta:');
      else await mailer.enviar({ to: existente.email, subject: 'Tentativa de cadastro — Achados e Perdidos UEPA', text: 'Alguém tentou criar uma conta com este e-mail, mas ele já está cadastrado. Se foi você, use "Esqueci minha senha" na tela de entrada.' });
      ctx.status = 202;
      return resposta;
    }
    const hash = await hashSenha(b.senha);
    const info = db.prepare('INSERT INTO usuarios (nome, email, matricula, senha_hash, aceite_termos_em) VALUES (?,?,?,?,?)')
      .run(b.nome, b.email, b.matricula ?? null, hash, nowIso());
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid);
    d.auditar(ctx, 'usuario.cadastro', `usuario:${u.id}`, '', u.id);
    await enviarToken(u, 'verificacao', 24 * HORA, 'verificar', 'Confirme seu e-mail — Achados e Perdidos UEPA', 'Confirme seu e-mail para ativar a conta:');
    ctx.status = 202;
    return resposta;
  });

  r.add('POST', '/api/auth/verificar', async (ctx) => {
    limitador.usar(`ver:${ctx.ip}`, 20, 15 * MIN);
    const { token } = validar(await ctx.json(), { token: { min: 20, max: 100, raw: true, label: 'Token' } });
    const t = db.prepare("SELECT * FROM tokens_email WHERE token_hash = ? AND tipo = 'verificacao'").get(sha256(token));
    if (!t || t.usado_em || t.expira_em < nowIso()) throw new HttpError(400, 'Link inválido ou expirado. Peça um novo cadastro.');
    db.prepare('UPDATE tokens_email SET usado_em = ? WHERE id = ?').run(nowIso(), t.id);
    db.prepare('UPDATE usuarios SET verificado_em = COALESCE(verificado_em, ?) WHERE id = ?').run(nowIso(), t.usuario_id);
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(t.usuario_id);
    promoverAdmin(u);
    d.auditar(ctx, 'usuario.verificado', `usuario:${u.id}`, '', u.id);
    return { mensagem: 'E-mail confirmado! Agora é só entrar.' };
  });

  r.add('POST', '/api/auth/entrar', async (ctx) => {
    const b = validar(await ctx.json(), {
      email: { max: 120, label: 'E-mail' },
      senha: { min: 1, max: 200, label: 'Senha', raw: true },
    });
    const email = b.email.toLowerCase();
    limitador.usar(`login-ip:${ctx.ip}`, 20, 15 * MIN);
    limitador.usar(`login-em:${email}`, 10, 15 * MIN);
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
    const generico = new HttpError(401, 'E-mail ou senha incorretos.');
    if (!u) { await gastarTempo(b.senha); throw generico; }
    if (u.bloqueado_ate && u.bloqueado_ate > nowIso()) throw new HttpError(429, 'Muitas tentativas erradas. Tente novamente em alguns minutos.');
    const ok = await verificarSenha(b.senha, u.senha_hash);
    if (!ok) {
      const falhas = u.falhas_login + 1;
      if (falhas >= 5) db.prepare('UPDATE usuarios SET falhas_login = 0, bloqueado_ate = ? WHERE id = ?').run(new Date(Date.now() + 15 * MIN).toISOString(), u.id);
      else db.prepare('UPDATE usuarios SET falhas_login = ? WHERE id = ?').run(falhas, u.id);
      throw generico;
    }
    if (u.bloqueado) throw new HttpError(403, 'Conta suspensa. Procure o Protocolo.', { codigo: 'suspensa' });
    if (!u.verificado_em) throw new HttpError(403, 'Confirme seu e-mail antes de entrar (veja a caixa de entrada e o spam).', { codigo: 'nao_verificado' });
    db.prepare('UPDATE usuarios SET falhas_login = 0, bloqueado_ate = NULL WHERE id = ?').run(u.id);
    if (ctx.sessao) db.prepare('DELETE FROM sessoes WHERE id = ?').run(ctx.sessao.id);
    const csrf = criarSessao(ctx, u.id);
    d.auditar(ctx, 'usuario.login', `usuario:${u.id}`, '', u.id);
    return { usuario: usuarioPublico(u), csrf };
  });

  r.add('POST', '/api/auth/sair', async (ctx) => {
    if (ctx.sessao) db.prepare('DELETE FROM sessoes WHERE id = ?').run(ctx.sessao.id);
    setCookie(ctx.res, nomeCookie(config), '', { maxAge: 0, secure: config.production });
    return { ok: true };
  });

  r.add('GET', '/api/auth/eu', async (ctx) =>
    ctx.usuario ? { usuario: usuarioPublico(ctx.usuario), csrf: ctx.sessao.csrf } : { usuario: null });

  r.add('POST', '/api/auth/esqueci', async (ctx) => {
    limitador.usar(`esq:${ctx.ip}`, 5, HORA);
    const { email } = validar(await ctx.json(), { email: { max: 120, label: 'E-mail' } });
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email.toLowerCase());
    if (u && u.verificado_em && !u.bloqueado)
      await enviarToken(u, 'redefinicao', HORA, 'redefinir', 'Redefinir senha — Achados e Perdidos UEPA', 'Use o link abaixo para criar uma nova senha (vale por 1 hora):');
    ctx.status = 202;
    return { mensagem: 'Se o e-mail estiver cadastrado, enviamos as instruções.' };
  });

  r.add('POST', '/api/auth/redefinir', async (ctx) => {
    limitador.usar(`red:${ctx.ip}`, 10, 15 * MIN);
    const b = validar(await ctx.json(), {
      token: { min: 20, max: 100, raw: true, label: 'Token' },
      senha: { min: 1, max: 200, raw: true, label: 'Senha' },
    });
    const t = db.prepare("SELECT * FROM tokens_email WHERE token_hash = ? AND tipo = 'redefinicao'").get(sha256(b.token));
    if (!t || t.usado_em || t.expira_em < nowIso()) throw new HttpError(400, 'Link inválido ou expirado.');
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(t.usuario_id);
    const erro = validarSenha(b.senha, u.email);
    if (erro) throw new HttpError(422, 'Confira os campos destacados.', { campos: { senha: erro } });
    const hash = await hashSenha(b.senha);
    db.prepare('UPDATE usuarios SET senha_hash=?, falhas_login=0, bloqueado_ate=NULL WHERE id=?').run(hash, u.id);
    db.prepare('UPDATE tokens_email SET usado_em=? WHERE id=?').run(nowIso(), t.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(u.id);
    d.auditar(ctx, 'usuario.senha_redefinida', `usuario:${u.id}`, '', u.id);
    return { mensagem: 'Senha alterada. Entre com a nova senha.' };
  });

  r.add('POST', '/api/auth/senha', async (ctx) => {
    limitador.usar(`senha:${ctx.usuario.id}`, 10, 15 * MIN);
    if (String(ctx.usuario.senha_hash).startsWith('google$')) throw new HttpError(409, 'Sua conta usa o login do Google; não há senha para alterar.');
    const b = validar(await ctx.json(), {
      atual: { min: 1, max: 200, raw: true, label: 'Senha atual' },
      nova: { min: 1, max: 200, raw: true, label: 'Nova senha' },
    });
    const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(ctx.usuario.id);
    if (!(await verificarSenha(b.atual, u.senha_hash))) throw new HttpError(422, 'Confira os campos destacados.', { campos: { atual: 'Senha atual incorreta.' } });
    const erro = validarSenha(b.nova, u.email);
    if (erro) throw new HttpError(422, 'Confira os campos destacados.', { campos: { nova: erro } });
    db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(await hashSenha(b.nova), u.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id=? AND id<>?').run(u.id, ctx.sessao.id);
    d.auditar(ctx, 'usuario.senha_alterada', `usuario:${u.id}`);
    return { mensagem: 'Senha alterada.' };
  }, { auth: true });

  // LGPD: exclusão da conta (anonimiza; itens e histórico permanecem sem dados pessoais).
  r.add('POST', '/api/auth/excluir-conta', async (ctx) => {
    limitador.usar(`exc:${ctx.usuario.id}`, 5, HORA);
    const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(ctx.usuario.id);
    if (u.senha_hash.startsWith('google$')) {
      const { confirmacao } = validar(await ctx.json(), { confirmacao: { min: 1, max: 20, label: 'Confirmação' } });
      if (confirmacao !== 'EXCLUIR') throw new HttpError(422, 'Confira os campos destacados.', { campos: { confirmacao: 'Digite EXCLUIR para confirmar.' } });
    } else {
      const { senha } = validar(await ctx.json(), { senha: { min: 1, max: 200, raw: true, label: 'Senha' } });
      if (!(await verificarSenha(senha, u.senha_hash))) throw new HttpError(422, 'Confira os campos destacados.', { campos: { senha: 'Senha incorreta.' } });
    }
    if (u.papel === 'admin' && db.prepare("SELECT count(*) n FROM usuarios WHERE papel='admin' AND bloqueado=0").get().n <= 1)
      throw new HttpError(409, 'Você é o único administrador. Promova outra pessoa antes de excluir a conta.');
    if (u.avatar) await d.apagarArquivo(u.avatar);
    db.prepare("UPDATE usuarios SET nome='Usuário removido', avatar=NULL, email=?, matricula=NULL, senha_hash=?, bloqueado=1, papel='aluno' WHERE id=?")
      .run(`removido-${u.id}@excluido.invalid`, 'scrypt$0$0$0$x$x', u.id);
    db.prepare('UPDATE reivindicacoes SET status=\'cancelada\' WHERE usuario_id=? AND status=\'pendente\'').run(u.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(u.id);
    d.auditar(ctx, 'usuario.excluido', `usuario:${u.id}`, '', u.id);
    setCookie(ctx.res, nomeCookie(config), '', { maxAge: 0, secure: config.production });
    return { ok: true };
  }, { auth: true });
}

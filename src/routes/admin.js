import { HttpError, validar } from '../lib/validate.js';
import { transacao } from '../db.js';
import { nowIso } from '../lib/dates.js';

const ADMIN = { auth: ['admin'] };

export default function adminRoutes(r, d) {
  const { db } = d;

  r.add('GET', '/api/admin/usuarios', async (ctx) => {
    const q = (ctx.query.get('q') || '').trim().slice(0, 60);
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return { usuarios: db.prepare(`SELECT id, nome, email, matricula, papel, bloqueado, verificado_em, criado_em FROM usuarios
      WHERE (nome LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY id DESC LIMIT 100`).all(like, like) };
  }, ADMIN);

  r.add('PATCH', '/api/admin/usuarios/:id', async (ctx) => {
    const alvo = db.prepare('SELECT * FROM usuarios WHERE id=?').get(Number(ctx.params.id) || 0);
    if (!alvo) throw new HttpError(404, 'Usuário não encontrado.');
    const b = validar(await ctx.json(), {
      papel: { optional: true, enum: ['aluno', 'protocolo', 'admin'], label: 'Papel' },
      bloqueado: { optional: true, type: 'bool', label: 'Bloqueio' },
    });
    const ehEuMesmo = alvo.id === ctx.usuario.id;
    if (ehEuMesmo && ((b.papel && b.papel !== 'admin') || b.bloqueado)) throw new HttpError(409, 'Você não pode rebaixar ou bloquear a si mesmo.');
    transacao(db, () => {
      if (b.papel) db.prepare('UPDATE usuarios SET papel=? WHERE id=?').run(b.papel, alvo.id);
      if (b.bloqueado !== undefined) {
        db.prepare('UPDATE usuarios SET bloqueado=? WHERE id=?').run(b.bloqueado ? 1 : 0, alvo.id);
        if (b.bloqueado) db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(alvo.id);
      }
      if (b.papel) db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(alvo.id); // força novo login com o novo papel
    });
    d.auditar(ctx, 'admin.usuario_alterado', `usuario:${alvo.id}`, JSON.stringify(b));
    return { ok: true };
  }, ADMIN);

  r.add('GET', '/api/admin/denuncias', async (ctx) => {
    const status = ['aberta', 'procedente', 'improcedente'].includes(ctx.query.get('status')) ? ctx.query.get('status') : 'aberta';
    return { denuncias: db.prepare(`SELECT dn.id, dn.motivo, dn.status, dn.criado_em, i.id item_id, i.codigo, i.titulo, i.status item_status, u.nome denunciante
      FROM denuncias dn JOIN itens i ON i.id=dn.item_id JOIN usuarios u ON u.id=dn.usuario_id WHERE dn.status=? ORDER BY dn.id DESC LIMIT 100`).all(status) };
  }, ADMIN);

  r.add('POST', '/api/admin/denuncias/:id/resolver', async (ctx) => {
    const dn = db.prepare('SELECT * FROM denuncias WHERE id=?').get(Number(ctx.params.id) || 0);
    if (!dn) throw new HttpError(404, 'Denúncia não encontrada.');
    if (dn.status !== 'aberta') throw new HttpError(409, 'Denúncia já resolvida.');
    const b = validar(await ctx.json(), {
      acao: { enum: ['remover', 'descartar'], label: 'Ação' },
      nota: { optional: true, max: 300, label: 'Nota' },
    });
    transacao(db, () => {
      db.prepare('UPDATE denuncias SET status=?, resolvido_por=?, resolvido_em=? WHERE id=?').run(b.acao === 'remover' ? 'procedente' : 'improcedente', ctx.usuario.id, nowIso(), dn.id);
      if (b.acao === 'remover') removerItem(d.carregar(dn.item_id), ctx.usuario, b.nota || 'Removido pela moderação');
    });
    d.auditar(ctx, `denuncia.${b.acao}`, `denuncia:${dn.id}`);
    return { ok: true };
  }, ADMIN);

  function removerItem(item, usuario, nota) {
    if (item.status === 'removido') return;
    const permitidas = ['aguardando_entrega', 'no_protocolo', 'em_reclamacao', 'aberto'];
    if (!permitidas.includes(item.status)) throw new HttpError(409, 'Item já encerrado; não é possível remover.');
    d.mudarStatus(item, 'removido', usuario, nota);
    db.prepare("UPDATE reivindicacoes SET status='cancelada', decidido_em=? WHERE item_id=? AND status='pendente'").run(nowIso(), item.id);
  }

  r.add('POST', '/api/admin/itens/:id/remover', async (ctx) => {
    const { motivo } = validar(await ctx.json(), { motivo: { min: 5, max: 300, label: 'Motivo' } });
    transacao(db, () => removerItem(d.carregar(Number(ctx.params.id) || 0), ctx.usuario, motivo));
    d.auditar(ctx, 'admin.item_removido', `item:${ctx.params.id}`, motivo);
    return { ok: true };
  }, ADMIN);

  r.add('GET', '/api/admin/auditoria', async (ctx) => {
    const pagina = Math.max(Number(ctx.query.get('pagina')) || 1, 1);
    return { registros: db.prepare(`SELECT a.id, a.acao, a.alvo, a.detalhe, a.ip, a.criado_em, u.nome usuario
      FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.id DESC LIMIT 50 OFFSET ?`).all((pagina - 1) * 50) };
  }, ADMIN);

  const catalogo = (tabela, rota, validarNome) => {
    r.add('POST', `/api/admin/${rota}`, async (ctx) => {
      const { nome } = validar(await ctx.json(), { nome: { min: 2, max: 60, label: 'Nome' } });
      try { db.prepare(`INSERT INTO ${tabela} (nome) VALUES (?)`).run(nome); }
      catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Já existe.'); throw e; }
      d.auditar(ctx, `admin.${tabela}_criado`, nome);
      ctx.status = 201;
      return { ok: true };
    }, ADMIN);
    r.add('PATCH', `/api/admin/${rota}/:id`, async (ctx) => {
      const { ativo } = validar(await ctx.json(), { ativo: { type: 'bool', label: 'Ativo' } });
      const up = db.prepare(`UPDATE ${tabela} SET ativo=? WHERE id=?`).run(ativo ? 1 : 0, Number(ctx.params.id) || 0);
      if (!up.changes) throw new HttpError(404, 'Não encontrado.');
      d.auditar(ctx, `admin.${tabela}_alterado`, ctx.params.id);
      return { ok: true };
    }, ADMIN);
  };
  catalogo('locais', 'locais');
  catalogo('categorias', 'categorias');
}

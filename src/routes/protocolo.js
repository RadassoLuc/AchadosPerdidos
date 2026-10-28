import { diasEntre, nowIso } from '../lib/dates.js';
import { HttpError, validar } from '../lib/validate.js';
import { transacao } from '../db.js';

const EQUIPE = { auth: ['protocolo', 'admin'] };

export default function protocoloRoutes(r, d) {
  const { db, config, mailer } = d;

  r.add('GET', '/api/protocolo/painel', async () => {
    const base = `SELECT i.id, i.codigo, i.titulo, i.tipo, i.status, i.ocorrido_em, i.local_guarda, c.nome categoria, l.nome local,
      (SELECT arquivo FROM item_fotos f WHERE f.item_id=i.id ORDER BY f.ordem, f.id LIMIT 1) capa
      FROM itens i JOIN categorias c ON c.id=i.categoria_id JOIN locais l ON l.id=i.local_id`;
    const dar = (i) => ({ ...i, capa: i.capa ? `/uploads/${i.capa}` : null, dias: diasEntre(i.ocorrido_em) });
    const aguardando = db.prepare(`${base} WHERE i.status='aguardando_entrega' ORDER BY i.ocorrido_em ASC LIMIT 100`).all().map(dar);
    const guardados = db.prepare(`${base} WHERE i.status IN ('no_protocolo','em_reclamacao') ORDER BY i.ocorrido_em ASC LIMIT 200`).all()
      .map(dar).map((i) => ({ ...i, elegivel_destino: i.status === 'no_protocolo' && i.dias >= config.retentionDays }));
    const reivindicacoes = db.prepare(`SELECT rv.id, rv.prova, rv.status, rv.criado_em, i.id item_id, i.codigo, i.titulo, u.nome, u.matricula, u.email, u.avatar
      FROM reivindicacoes rv JOIN itens i ON i.id=rv.item_id JOIN usuarios u ON u.id=rv.usuario_id
      WHERE rv.status IN ('pendente','aprovada') ORDER BY rv.id ASC LIMIT 100`).all();
    for (const rv of reivindicacoes) { rv.avatar = rv.avatar ? `/uploads/${rv.avatar}` : null; }
    return { aguardando, guardados, reivindicacoes, retencao_dias: config.retentionDays };
  }, EQUIPE);

  r.add('POST', '/api/itens/:id/recebido', async (ctx) => {
    const i = d.carregar(Number(ctx.params.id) || 0);
    if (i.tipo !== 'achado') throw new HttpError(409, 'Apenas itens achados são recebidos no Protocolo.');
    const { local_guarda } = validar(await ctx.json(), { local_guarda: { optional: true, max: 60, label: 'Local de guarda' } });
    transacao(db, () => {
      d.mudarStatus(i, 'no_protocolo', ctx.usuario, 'Recebimento confirmado pelo Protocolo');
      db.prepare('UPDATE itens SET local_guarda=? WHERE id=?').run(local_guarda ?? '', i.id);
    });
    d.auditar(ctx, 'item.recebido', `item:${i.id}`);
    return { ok: true };
  }, EQUIPE);

  r.add('POST', '/api/reivindicacoes/:id/decidir', async (ctx) => {
    const rv = db.prepare('SELECT * FROM reivindicacoes WHERE id=?').get(Number(ctx.params.id) || 0);
    if (!rv) throw new HttpError(404, 'Reivindicação não encontrada.');
    if (rv.status !== 'pendente') throw new HttpError(409, 'Esta reivindicação já foi decidida.');
    const b = validar(await ctx.json(), {
      decisao: { enum: ['aprovar', 'rejeitar'], label: 'Decisão' },
      nota: { optional: true, max: 300, label: 'Nota' },
    });
    const novo = b.decisao === 'aprovar' ? 'aprovada' : 'rejeitada';
    transacao(db, () => {
      db.prepare('UPDATE reivindicacoes SET status=?, decidido_por=?, decidido_em=?, nota_decisao=? WHERE id=?').run(novo, ctx.usuario.id, nowIso(), b.nota ?? '', rv.id);
      if (novo === 'rejeitada') d.voltarSeSemReivindicacao(rv.item_id, ctx.usuario);
    });
    const alvo = db.prepare('SELECT nome, email FROM usuarios WHERE id=?').get(rv.usuario_id);
    const item = d.carregar(rv.item_id);
    if (!alvo.email.endsWith('@excluido.invalid'))
      await mailer.enviar({
        to: alvo.email,
        subject: `Reivindicação ${novo === 'aprovada' ? 'aprovada' : 'não aprovada'}: ${item.titulo}`,
        text: novo === 'aprovada'
          ? `Olá, ${alvo.nome.split(' ')[0]}! Sua reivindicação do item "${item.titulo}" (${item.codigo}) foi aprovada. Vá ao Protocolo com um documento com foto para retirar o item.${b.nota ? `\n\nObservação: ${b.nota}` : ''}`
          : `Olá, ${alvo.nome.split(' ')[0]}. Sua reivindicação do item "${item.titulo}" (${item.codigo}) não foi aprovada.${b.nota ? `\n\nMotivo: ${b.nota}` : ''}\n\nEm caso de dúvida, procure o Protocolo.`,
      });
    d.auditar(ctx, `reivindicacao.${novo}`, `reivindicacao:${rv.id}`);
    return { ok: true };
  }, EQUIPE);

  r.add('POST', '/api/itens/:id/entregar', async (ctx) => {
    const i = d.carregar(Number(ctx.params.id) || 0);
    if (i.tipo !== 'achado') throw new HttpError(409, 'Apenas itens achados são entregues pelo Protocolo.');
    const b = validar(await ctx.json(), {
      recebedor_nome: { min: 3, max: 100, label: 'Nome de quem retirou' },
      recebedor_documento: { min: 3, max: 30, label: 'Documento/matrícula' },
      reivindicacao_id: { type: 'int', min: 1, optional: true, label: 'Reivindicação' },
      nota: { optional: true, max: 300, label: 'Nota' },
    });
    if (b.reivindicacao_id) {
      const rv = db.prepare('SELECT * FROM reivindicacoes WHERE id=? AND item_id=?').get(b.reivindicacao_id, i.id);
      if (!rv || !['pendente', 'aprovada'].includes(rv.status)) throw new HttpError(422, 'Confira os campos destacados.', { campos: { reivindicacao_id: 'Reivindicação inválida para este item.' } });
    }
    transacao(db, () => {
      db.prepare('INSERT INTO entregas (item_id, reivindicacao_id, recebedor_nome, recebedor_documento, registrado_por, nota) VALUES (?,?,?,?,?,?)')
        .run(i.id, b.reivindicacao_id ?? null, b.recebedor_nome, b.recebedor_documento, ctx.usuario.id, b.nota ?? '');
      if (b.reivindicacao_id) db.prepare("UPDATE reivindicacoes SET status='aprovada', decidido_por=?, decidido_em=? WHERE id=? AND status='pendente'").run(ctx.usuario.id, nowIso(), b.reivindicacao_id);
      db.prepare("UPDATE reivindicacoes SET status='rejeitada', decidido_por=?, decidido_em=?, nota_decisao='Item entregue a outra pessoa' WHERE item_id=? AND status='pendente' AND id IS NOT ?")
        .run(ctx.usuario.id, nowIso(), i.id, b.reivindicacao_id ?? null);
      d.mudarStatus(i, 'devolvido', ctx.usuario, `Entregue a ${b.recebedor_nome}`);
    });
    d.auditar(ctx, 'item.entregue', `item:${i.id}`);
    return { ok: true };
  }, EQUIPE);

  r.add('POST', '/api/itens/:id/destinar', async (ctx) => {
    const i = d.carregar(Number(ctx.params.id) || 0);
    if (i.tipo !== 'achado') throw new HttpError(409, 'Apenas itens achados podem ser destinados.');
    const b = validar(await ctx.json(), {
      destino: { enum: ['doacao', 'descarte', 'guarda_institucional'], label: 'Destino' },
      nota: { min: 5, max: 300, label: 'Justificativa' },
    });
    if (diasEntre(i.ocorrido_em) < config.retentionDays) throw new HttpError(409, `O item só pode ser destinado após ${config.retentionDays} dias.`);
    transacao(db, () => d.mudarStatus(i, 'destinado', ctx.usuario, `${b.destino}: ${b.nota}`));
    d.auditar(ctx, 'item.destinado', `item:${i.id}`, b.destino);
    return { ok: true };
  }, EQUIPE);
}

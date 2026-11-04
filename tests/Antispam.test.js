import test from 'node:test';
import assert from 'node:assert/strict';
import { agoraBelem, iniciar, jpegDeTeste, usuarioLogado } from './helpers.js';

const ctx = await iniciar();
test.after(() => ctx.fechar());

async function novoAchado(c, titulo = 'Garrafa azul') {
    const up = await c.req('POST', '/api/uploads', undefined, { raw: jpegDeTeste(), headers: { 'content-type': 'image/jpeg' } });
    assert.equal(up.status, 201, JSON.stringify(up.dados));
    return c.post('/api/itens', {
        tipo: 'achado', titulo, descricao: 'Encontrada perto da biblioteca', categoria_id: 1, local_id: 2,
        ocorrido_em: agoraBelem(0), fotos: [up.dados.id],
    });
}

test('antispam: aluno publica no máximo 3 itens por dia; Protocolo não tem limite', async () => {
    const aluno = await usuarioLogado(ctx, { nome: 'Aluno Spammer' });
    const outro = await usuarioLogado(ctx, { nome: 'Outro Aluno' });
    const protocolo = await usuarioLogado(ctx, { nome: 'Servidor Livre', papel: 'protocolo', dominio: 'uepa.br' });

    for (let i = 1; i <= 3; i++) {
        const r = await novoAchado(aluno, `Item ${i}`);
        assert.equal(r.status, 201, `publicação ${i}: ${JSON.stringify(r.dados)}`);
    }
    const quarta = await novoAchado(aluno, 'Item 4');
    assert.equal(quarta.status, 429);
    assert.match(JSON.stringify(quarta.dados), /limite de 3 publicações por dia/);

    // o limite é por usuário
    assert.equal((await novoAchado(outro)).status, 201);
    // Protocolo e admin não são limitados
    for (let i = 0; i < 4; i++) assert.equal((await novoAchado(protocolo)).status, 201);
});

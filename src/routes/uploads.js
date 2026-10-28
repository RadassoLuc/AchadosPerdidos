import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lerCorpo } from '../lib/http.js';
import { limparJpeg } from '../lib/jpeg.js';
import { HttpError } from '../lib/validate.js';
import { ehEquipe } from './items.js';

export default function uploadRoutes(r, d) {
  const { db, config, limitador } = d;

  r.add('POST', '/api/uploads', async (ctx) => {
    limitador.usar(`up:${ctx.usuario.id}`, 30, 3_600_000);
    if (String(ctx.req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'image/jpeg')
      throw new HttpError(415, 'Envie a foto em formato JPEG.');
    const soltas = db.prepare('SELECT count(*) n FROM item_fotos WHERE autor_id=? AND item_id IS NULL').get(ctx.usuario.id).n;
    if (soltas >= 12) throw new HttpError(429, 'Muitas fotos pendentes. Publique ou aguarde a limpeza automática.');
    const bruto = await lerCorpo(ctx.req, config.maxUploadBytes);
    const { buffer } = limparJpeg(bruto); // valida estrutura e remove EXIF/GPS
    const arquivo = `${randomBytes(16).toString('hex')}.jpg`;
    await mkdir(config.uploadDir, { recursive: true });
    await writeFile(path.join(config.uploadDir, arquivo), buffer, { mode: 0o640 });
    const info = db.prepare('INSERT INTO item_fotos (autor_id, arquivo) VALUES (?,?)').run(ctx.usuario.id, arquivo);
    ctx.status = 201;
    return { id: Number(info.lastInsertRowid), url: `/uploads/${arquivo}` };
  }, { auth: true });

  // Servir fotos: exige login; fotos de itens removidos só para dono/equipe.
  r.add('GET', '/uploads/:arquivo', async (ctx) => {
    if (!/^[0-9a-f]{32}\.jpg$/.test(ctx.params.arquivo)) throw new HttpError(404, 'Não encontrado.');
    const f = db.prepare(`SELECT f.autor_id, i.status FROM item_fotos f LEFT JOIN itens i ON i.id=f.item_id WHERE f.arquivo=?`).get(ctx.params.arquivo);
    if (!f) throw new HttpError(404, 'Não encontrado.');
    const privada = f.status === null || f.status === 'removido';
    if (privada && f.autor_id !== ctx.usuario.id && !ehEquipe(ctx.usuario)) throw new HttpError(404, 'Não encontrado.');
    const buf = await readFile(path.join(config.uploadDir, ctx.params.arquivo)).catch(() => { throw new HttpError(404, 'Não encontrado.'); });
    ctx.res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline' });
    ctx.res.end(buf);
    return ctx.handled;
  }, { auth: true });
}

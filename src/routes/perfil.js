import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { lerCorpo } from '../lib/http.js';
import { limparJpeg } from '../lib/jpeg.js';
import { HttpError } from '../lib/validate.js';
import { avatarUrl } from './auth.js';

/** Foto de perfil: opcional, JPEG reduzido no navegador e sanitizado aqui; visível só para quem está logado. */
export default function perfilRoutes(r, d) {
  const { db, config, limitador } = d;

  r.add('POST', '/api/eu/avatar', async (ctx) => {
    limitador.usar(`av:${ctx.usuario.id}`, 10, 3_600_000);
    if (String(ctx.req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'image/jpeg')
      throw new HttpError(415, 'Envie a foto em formato JPEG.');
    const bruto = await lerCorpo(ctx.req, 600 * 1024);
    const { buffer } = limparJpeg(bruto);
    const arquivo = `${randomBytes(16).toString('hex')}.jpg`;
    await mkdir(config.uploadDir, { recursive: true });
    await writeFile(path.join(config.uploadDir, arquivo), buffer, { mode: 0o640 });
    const antigo = db.prepare('SELECT avatar FROM usuarios WHERE id=?').get(ctx.usuario.id).avatar;
    db.prepare('UPDATE usuarios SET avatar=? WHERE id=?').run(arquivo, ctx.usuario.id);
    if (antigo) await d.apagarArquivo(antigo);
    d.auditar(ctx, 'usuario.avatar_alterado', `usuario:${ctx.usuario.id}`);
    return { avatar: avatarUrl(arquivo) };
  }, { auth: true });

  r.add('DELETE', '/api/eu/avatar', async (ctx) => {
    const antigo = db.prepare('SELECT avatar FROM usuarios WHERE id=?').get(ctx.usuario.id).avatar;
    db.prepare('UPDATE usuarios SET avatar=NULL WHERE id=?').run(ctx.usuario.id);
    if (antigo) await d.apagarArquivo(antigo);
    return { ok: true };
  }, { auth: true });
}

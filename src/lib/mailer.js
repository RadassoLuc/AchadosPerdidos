import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';

const semQuebra = (s) => String(s).replace(/[\r\n]+/g, ' ').trim();
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

function montar({ from, to, subject, text }) {
  const corpo = b64(text).replace(/(.{76})/g, '$1\r\n');
  return [
    `From: ${semQuebra(from)}`,
    `To: ${semQuebra(to)}`,
    `Subject: =?UTF-8?B?${b64(semQuebra(subject))}?=`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    corpo,
  ].join('\r\n');
}

/** Cliente SMTP mínimo (AUTH LOGIN), com TLS implícito, STARTTLS ou sem criptografia (só testes). */
function enviarSmtp(cfg, { from, to, subject, text }) {
  const enderecoDe = from.match(/<([^>]+)>/)?.[1] || from;
  return new Promise((resolve, reject) => {
    let socket;
    let buffer = '';
    let fila = [];
    const falhar = (e) => { socket?.destroy(); reject(e instanceof Error ? e : new Error(String(e))); };
    const ligar = (s) => {
      socket = s;
      socket.setTimeout(15000, () => falhar(new Error('SMTP: tempo esgotado')));
      socket.on('error', falhar);
      socket.on('data', (d) => {
        buffer += d.toString('utf8');
        let i;
        while ((i = buffer.indexOf('\r\n')) >= 0) {
          const linha = buffer.slice(0, i);
          buffer = buffer.slice(i + 2);
          if (/^\d{3} /.test(linha)) { const w = fila.shift(); w?.(linha); }
        }
      });
    };
    const esperar = () => new Promise((res) => fila.push(res));
    const cmd = async (c, esperado) => {
      if (c !== null) socket.write(c + '\r\n');
      const r = await esperar();
      if (!esperado.includes(r.slice(0, 3))) throw new Error(`SMTP: resposta inesperada (${r.slice(0, 3)})`);
      return r;
    };
    (async () => {
      const conectar = (secure) => new Promise((res, rej) => {
        const s = secure
          ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, () => res(s))
          : net.connect({ host: cfg.host, port: cfg.port }, () => res(s));
        s.once('error', rej);
      });
      ligar(await conectar(cfg.secure === 'tls'));
      await cmd(null, ['220']);
      await cmd('EHLO achados.local', ['250']);
      if (cfg.secure === 'starttls') {
        await cmd('STARTTLS', ['220']);
        socket.removeAllListeners('data');
        const s2 = tls.connect({ socket, servername: cfg.host });
        await new Promise((res, rej) => { s2.once('secureConnect', res); s2.once('error', rej); });
        buffer = ''; fila = [];
        ligar(s2);
        await cmd('EHLO achados.local', ['250']);
      }
      if (cfg.user) {
        await cmd('AUTH LOGIN', ['334']);
        await cmd(b64(cfg.user), ['334']);
        await cmd(b64(cfg.pass), ['235']);
      }
      await cmd(`MAIL FROM:<${semQuebra(enderecoDe)}>`, ['250']);
      await cmd(`RCPT TO:<${semQuebra(to)}>`, ['250', '251']);
      await cmd('DATA', ['354']);
      const dados = montar({ from, to, subject, text }).replace(/^\./gm, '..');
      await cmd(dados + '\r\n.', ['250']);
      await cmd('QUIT', ['221']).catch(() => {});
      socket.end();
      resolve();
    })().catch(falhar);
  });
}

export function criarMailer(config, log = console) {
  return {
    async enviar({ to, subject, text }) {
      const msg = { from: config.mailFrom, to, subject, text };
      try {
        if (config.smtp) {
          await enviarSmtp(config.smtp, msg);
        } else {
          await mkdir(config.outboxDir, { recursive: true });
          const nome = `${Date.now()}-${semQuebra(to).replace(/[^a-z0-9@._-]/gi, '_')}.txt`;
          await writeFile(path.join(config.outboxDir, nome), `Para: ${to}\nAssunto: ${subject}\n\n${text}\n`);
          log.info?.(`[e-mail simulado] para ${to}: ${subject}\n${text}\n`);
        }
        return true;
      } catch (e) {
        // Falha de e-mail nunca derruba a requisição; fica registrada no log.
        log.error?.('[e-mail] falha ao enviar:', e.message);
        return false;
      }
    },
  };
}

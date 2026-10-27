import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashSenha(senha) {
  const salt = randomBytes(16);
  const key = await scryptAsync(senha.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verificarSenha(senha, armazenado) {
  const [alg, n, r, p, salt, hash] = String(armazenado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'base64');
  const key = await scryptAsync(senha.normalize('NFKC'), Buffer.from(salt, 'base64'), esperado.length, {
    N: Number(n), r: Number(r), p: Number(p),
  });
  return timingSafeEqual(key, esperado);
}

// Hash descartável: usado para gastar o mesmo tempo quando o e-mail não existe.
let dummy;
export async function gastarTempo(senha) {
  dummy ??= await hashSenha('dummy-password-for-timing');
  await verificarSenha(senha, dummy);
}

export const novoToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const iguais = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

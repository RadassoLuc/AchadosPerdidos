export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Texto limpo: NFC, sem caracteres de controle/invisíveis, espaços aparados. */
export function limpar(v, { multiline = false } = {}) {
  let s = String(v).normalize('NFC').replace(CTRL, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.replace(/[ ]{2,}/g, ' ').trim();
}

/**
 * Valida um objeto contra regras. Campos fora das regras são descartados.
 * regra: { type:'string'|'int'|'bool', min, max, optional, multiline, pattern, enum, label }
 */
export function validar(corpo, regras) {
  const erros = {};
  const ok = {};
  const src = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
  for (const [campo, r] of Object.entries(regras)) {
    const bruto = src[campo];
    const vazio = bruto === undefined || bruto === null || bruto === '';
    const nome = r.label || campo;
    if (vazio) {
      if (!r.optional) erros[campo] = `${nome} é obrigatório.`;
      continue;
    }
    if (r.type === 'int') {
      const n = typeof bruto === 'number' ? bruto : /^-?\d+$/.test(String(bruto)) ? Number(bruto) : NaN;
      if (!Number.isSafeInteger(n)) erros[campo] = `${nome} inválido.`;
      else if (r.min !== undefined && n < r.min) erros[campo] = `${nome} inválido.`;
      else if (r.max !== undefined && n > r.max) erros[campo] = `${nome} inválido.`;
      else ok[campo] = n;
    } else if (r.type === 'bool') {
      if (typeof bruto !== 'boolean') erros[campo] = `${nome} inválido.`;
      else ok[campo] = bruto;
    } else {
      if (typeof bruto !== 'string') { erros[campo] = `${nome} inválido.`; continue; }
      const s = r.raw ? bruto : limpar(bruto, { multiline: r.multiline });
      if (r.min !== undefined && s.length < r.min) erros[campo] = `${nome} precisa ter pelo menos ${r.min} caracteres.`;
      else if (r.max !== undefined && s.length > r.max) erros[campo] = `${nome} pode ter no máximo ${r.max} caracteres.`;
      else if (r.pattern && !r.pattern.test(s)) erros[campo] = r.patternMsg || `${nome} inválido.`;
      else if (r.enum && !r.enum.includes(s)) erros[campo] = `${nome} inválido.`;
      else ok[campo] = s;
    }
  }
  if (Object.keys(erros).length) throw new HttpError(422, 'Confira os campos destacados.', { campos: erros });
  return ok;
}

export const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function emailInstitucional(email, dominios) {
  const dom = email.split('@')[1] || '';
  return dominios.some((d) => dom === d || dom.endsWith(`.${d}`));
}

const COMUNS = new Set(['1234567890', '12345678910', 'senha12345', 'password123', 'qwertyuiop', '0123456789', 'abcdefghij', 'uepa123456', 'senhasenha']);
export function validarSenha(senha, email = '') {
  if (typeof senha !== 'string' || senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  const baixa = senha.toLowerCase();
  if (COMUNS.has(baixa) || /^(.)\1+$/.test(senha)) return 'Escolha uma senha menos previsível.';
  if (email && (baixa === email || baixa.includes(email.split('@')[0]) && email.split('@')[0].length >= 5)) return 'A senha não pode conter o seu e-mail.';
  if (!/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) return 'Use letras e números na senha.';
  return null;
}

/** Minúsculas e sem acentos, para busca ("óculos" encontra "Oculos"). */
export const normalizarBusca = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

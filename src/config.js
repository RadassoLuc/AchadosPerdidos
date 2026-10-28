import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const list = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const int = (v, d) => (Number.isInteger(Number(v)) && v !== undefined && v !== '' ? Number(v) : d);

export function loadConfig(overrides = {}) {
  const e = { ...process.env, ...overrides };
  if (e.NODE_ENV === 'production' && e.GOOGLE_TOKEN_URL && !e.GOOGLE_TOKEN_URL.startsWith('https://'))
    throw new Error('GOOGLE_TOKEN_URL deve usar https em produção.');
  const dataDir = path.resolve(ROOT, e.DATA_DIR || 'data');
  return {
    root: ROOT,
    production: e.NODE_ENV === 'production',
    port: int(e.PORT, 3000),
    appUrl: (e.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
    dataDir,
    dbPath: e.DB_PATH ? path.resolve(ROOT, e.DB_PATH) : path.join(dataDir, 'achados.db'),
    uploadDir: path.join(dataDir, 'uploads'),
    outboxDir: path.join(ROOT, 'outbox'),
    publicDir: path.join(ROOT, 'public'),
    allowedDomains: list(e.ALLOWED_EMAIL_DOMAINS || 'uepa.br'),
    adminEmails: list(e.ADMIN_EMAILS),
    retentionDays: int(e.RETENTION_DAYS, 90),
    perdidoExpiraDias: int(e.PERDIDO_EXPIRA_DIAS, 180),
    sessionDays: int(e.SESSION_DAYS, 7),
    trustProxy: e.TRUST_PROXY === 'true',
    maxUploadBytes: 2.5 * 1024 * 1024,
    smtp: e.SMTP_HOST
      ? {
          host: e.SMTP_HOST,
          port: int(e.SMTP_PORT, 465),
          secure: e.SMTP_SECURE || 'tls',
          user: e.SMTP_USER || '',
          pass: e.SMTP_PASS || '',
        }
      : null,
    mailFrom: e.MAIL_FROM || 'Achados e Perdidos UEPA <no-reply@localhost>',
    vlibras: e.VLIBRAS !== 'false',
    host: e.HOST || undefined,
    senhaAtiva: e.PASSWORD_AUTH !== 'false',
    vlibrasCspEstrita: e.VLIBRAS_CSP === 'estrita',
    cspExtraScript: (e.CSP_EXTRA_SCRIPT_SRC || '').replace(/[;\r\n]/g, ' ').trim(),
    google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? {
          clientId: e.GOOGLE_CLIENT_ID,
          clientSecret: e.GOOGLE_CLIENT_SECRET,
          redirectUri: e.GOOGLE_REDIRECT_URI || `${(e.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/auth/google/callback`,
          authUrl: e.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: e.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
        }
      : null,
    // limites de taxa (podem ser relaxados nos testes)
    rateLimit: e.RATE_LIMIT_OFF === 'true' ? false : true,
  };
}

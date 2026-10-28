// Backup consistente do banco (VACUUM INTO) + cópia das fotos. Mantém os últimos 14 backups.
// Uso: npm run backup     |  agendado (cron): 0 3 * * * cd /opt/achados-perdidos && node scripts/backup.js
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config.js';

const config = loadConfig();
const destinoRaiz = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(config.dataDir, 'backups');
const pasta = path.join(destinoRaiz, new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(pasta, { recursive: true });

const db = new DatabaseSync(config.dbPath);
db.exec(`VACUUM INTO '${path.join(pasta, 'achados.db').replace(/'/g, "''")}'`);
db.close();
if (existsSync(config.uploadDir)) cpSync(config.uploadDir, path.join(pasta, 'uploads'), { recursive: true });

const todos = readdirSync(destinoRaiz).filter((n) => /^\d{4}-/.test(n)).sort();
for (const antigo of todos.slice(0, -14)) rmSync(path.join(destinoRaiz, antigo), { recursive: true, force: true });
console.log(`Backup criado em ${pasta} (${Math.min(todos.length, 14)} guardados).`);
console.log('Dica: copie esta pasta para fora do servidor (ex.: rclone para o Google Drive).');

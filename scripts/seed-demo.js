// Cria dados de demonstração (contas, itens com fotos e status variados) para apresentar o sistema.
// Uso: npm run seed:demo      (recusa rodar com NODE_ENV=production, a menos que use --force)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { abrirBanco } from '../src/db.js';
import { hashSenha } from '../src/lib/crypto.js';
import { limparJpeg } from '../src/lib/jpeg.js';
import { normalizarBusca } from '../src/lib/validate.js';

const config = loadConfig();
if (config.production && !process.argv.includes('--force')) {
  console.error('Recusado: NODE_ENV=production. Dados de demonstração não devem ir para o ambiente real (use --force se tiver certeza).');
  process.exit(1);
}
const db = abrirBanco(config.dbPath);
if (db.prepare("SELECT 1 FROM usuarios WHERE email LIKE 'demo.%'").get()) {
  console.log('Os dados de demonstração já existem. Para recomeçar, apague a pasta data/ e rode de novo.');
  process.exit(0);
}
const aqui = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(config.uploadDir, { recursive: true });
const agora = Date.now();
const iso = (diasAtras, hora = 10) => { const d = new Date(agora - diasAtras * 86_400_000); d.setUTCHours(hora + 3, 0, 0, 0); return d.toISOString(); };

const senha = () => randomBytes(9).toString('base64url') + 'a1';
const contas = [
  ['Aluno Demonstração', 'demo.aluno@aluno.uepa.br', 'aluno', senha()],
  ['Maria Visitante', 'demo.maria@aluno.uepa.br', 'aluno', senha()],
  ['Servidor Protocolo', 'demo.protocolo@uepa.br', 'protocolo', senha()],
  ['Administrador Demo', 'demo.admin@uepa.br', 'admin', senha()],
];
const ids = {};
for (const [nome, email, papel, pw] of contas) {
  const r = db.prepare('INSERT INTO usuarios (nome, email, senha_hash, papel, verificado_em, aceite_termos_em) VALUES (?,?,?,?,?,?)')
    .run(nome, email, await hashSenha(pw), papel, new Date().toISOString(), new Date().toISOString());
  ids[papel === 'aluno' ? email : papel] = Number(r.lastInsertRowid);
}
const aluno = ids['demo.aluno@aluno.uepa.br'], maria = ids['demo.maria@aluno.uepa.br'], prot = ids.protocolo;
const cat = (n) => db.prepare('SELECT id FROM categorias WHERE nome LIKE ?').get(`${n}%`).id;
const loc = (n) => db.prepare('SELECT id FROM locais WHERE nome LIKE ?').get(`${n}%`).id;

function foto(itemId, autor, arquivoDemo) {
  const { buffer } = limparJpeg(readFileSync(path.join(aqui, 'demo-fotos', `${arquivoDemo}.jpg`)));
  const nome = `${randomBytes(16).toString('hex')}.jpg`;
  writeFileSync(path.join(config.uploadDir, nome), buffer);
  db.prepare('INSERT INTO item_fotos (item_id, autor_id, arquivo) VALUES (?,?,?)').run(itemId, autor, nome);
}
function item({ tipo, titulo, descricao, categoria, local, detalhe = '', dias, status, autor, imagem, guarda = '', historico }) {
  const ocorrido = iso(dias);
  const r = db.prepare(`INSERT INTO itens (tipo, titulo, descricao, categoria_id, local_id, local_detalhe, ocorrido_em, status, autor_id, local_guarda, resolvido_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(tipo, titulo, descricao, cat(categoria), loc(local), detalhe, ocorrido, status, autor, guarda,
    ['devolvido', 'encontrado'].includes(status) ? iso(Math.max(0, dias - 2)) : null);
  const id = Number(r.lastInsertRowid);
  const codigo = `AP-${new Date().getUTCFullYear()}-${String(id).padStart(4, '0')}`;
  db.prepare('UPDATE itens SET codigo=?, busca=? WHERE id=?').run(codigo, normalizarBusca(`${titulo} ${descricao} ${codigo}`), id);
  if (imagem) foto(id, autor, imagem);
  let de = null;
  for (const [para, papel, nota] of historico || [[status, 'aluno', 'Publicado']]) {
    db.prepare('INSERT INTO item_historico (item_id, de_status, para_status, usuario_id, papel, nota) VALUES (?,?,?,?,?,?)').run(id, de, para, papel === 'protocolo' ? prot : autor, papel, nota);
    de = para;
  }
  return id;
}

item({ tipo: 'achado', titulo: 'Garrafa azul com adesivo', descricao: 'Garrafa térmica azul de inox, com uma faixa amarela.', categoria: 'Garrafa', local: 'Biblioteca', detalhe: 'Mesa de estudo perto da janela', dias: 2, status: 'no_protocolo', autor: aluno, imagem: 'garrafa', guarda: 'Armário 1',
  historico: [['aguardando_entrega', 'aluno', 'Publicado'], ['no_protocolo', 'protocolo', 'Recebimento confirmado pelo Protocolo']] });
item({ tipo: 'achado', titulo: 'Chaveiro com três chaves', descricao: 'Argola prateada com duas chaves douradas e uma prateada.', categoria: 'Chaves', local: 'Laboratórios', dias: 12, status: 'no_protocolo', autor: maria, imagem: 'chaves', guarda: 'Gaveta 3',
  historico: [['aguardando_entrega', 'aluno', 'Publicado'], ['no_protocolo', 'protocolo', 'Recebimento confirmado pelo Protocolo']] });
const emReclamacao = item({ tipo: 'achado', titulo: 'Carteira preta', descricao: 'Carteira de couro preta, fechada com elástico.', categoria: 'Carteira', local: 'Pátio', dias: 35, status: 'em_reclamacao', autor: aluno, imagem: 'carteira', guarda: 'Armário 2',
  historico: [['aguardando_entrega', 'aluno', 'Publicado'], ['no_protocolo', 'protocolo', 'Recebimento confirmado pelo Protocolo'], ['em_reclamacao', 'aluno', 'Reivindicação aberta']] });
db.prepare("INSERT INTO reivindicacoes (item_id, usuario_id, prova) VALUES (?,?,?)").run(emReclamacao, maria, 'Dentro tem um cartão de biblioteca no meu nome e uma foto 3x4.');
item({ tipo: 'achado', titulo: 'Mochila vermelha', descricao: 'Mochila vermelha com bolso frontal.', categoria: 'Mochila', local: 'Salas', dias: 75, status: 'no_protocolo', autor: maria, imagem: 'mochila', guarda: 'Armário 4',
  historico: [['aguardando_entrega', 'aluno', 'Publicado'], ['no_protocolo', 'protocolo', 'Recebimento confirmado pelo Protocolo']] });
item({ tipo: 'achado', titulo: 'Carregador de celular branco', descricao: 'Carregador de parede com cabo, entrada USB.', categoria: 'Eletr', local: 'Auditório', dias: 0, status: 'aguardando_entrega', autor: aluno, imagem: 'carregador' });
const devolvido = item({ tipo: 'achado', titulo: 'Óculos de grau marrom', descricao: 'Armação redonda marrom com lentes transparentes.', categoria: 'Óculos', local: 'Biblioteca', dias: 20, status: 'devolvido', autor: maria, imagem: 'oculos',
  historico: [['aguardando_entrega', 'aluno', 'Publicado'], ['no_protocolo', 'protocolo', 'Recebimento confirmado pelo Protocolo'], ['devolvido', 'protocolo', 'Entregue a Aluno Demonstração']] });
db.prepare('INSERT INTO entregas (item_id, recebedor_nome, recebedor_documento, registrado_por, nota) VALUES (?,?,?,?,?)').run(devolvido, 'Aluno Demonstração', '202012345', prot, 'Conferido documento com foto');
item({ tipo: 'perdido', titulo: 'Fone de ouvido preto sem fio', descricao: 'Perdi meu fone com estojo preto, acho que na sala 4 ou no corredor.', categoria: 'Eletr', local: 'Salas', dias: 3, status: 'aberto', autor: aluno });
item({ tipo: 'perdido', titulo: 'Caderno de Cálculo II', descricao: 'Caderno espiral de capa azul com o nome Maria na frente.', categoria: 'Material', local: 'Biblioteca', dias: 20, status: 'aberto', autor: maria });

console.log('\nDados de demonstração criados. Contas (anote agora, as senhas não são salvas em texto):\n');
for (const [nome, email, papel, pw] of contas) console.log(`  ${papel.padEnd(10)} ${email.padEnd(28)} senha: ${pw}`);
console.log('\nSe quiser, use ADMIN_EMAILS no .env para ter o seu próprio administrador.\n');

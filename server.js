const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'achados.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('perdido','achado')),
    titulo TEXT NOT NULL,
    descricao TEXT,
    local TEXT,
    data TEXT,
    contato TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','devolvido')),
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Listar (filtros opcionais: tipo, status, q)
app.get('/api/itens', (req, res) => {
  const { tipo, status, q } = req.query;
  let sql = 'SELECT * FROM itens WHERE 1=1';
  const params = [];
  if (tipo) { sql += ' AND tipo = ?'; params.push(tipo); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (titulo LIKE ? OR descricao LIKE ? OR local LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY id DESC';
  res.json(db.prepare(sql).all(...params));
});

// Buscar um
app.get('/api/itens/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM itens WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  res.json(item);
});

// Cadastrar
app.post('/api/itens', (req, res) => {
  const { tipo, titulo, descricao, local, data, contato } = req.body;
  if (!['perdido', 'achado'].includes(tipo)) return res.status(400).json({ erro: 'Tipo deve ser "perdido" ou "achado"' });
  if (!titulo || !titulo.trim()) return res.status(400).json({ erro: 'Informe o que foi perdido/achado' });
  if (!contato || !contato.trim()) return res.status(400).json({ erro: 'Informe um contato' });

  const info = db.prepare(
    'INSERT INTO itens (tipo, titulo, descricao, local, data, contato) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(tipo, titulo.trim(), descricao || '', local || '', data || '', contato.trim());
  res.status(201).json(db.prepare('SELECT * FROM itens WHERE id = ?').get(info.lastInsertRowid));
});

// Marcar como devolvido
app.patch('/api/itens/:id/devolvido', (req, res) => {
  const info = db.prepare("UPDATE itens SET status = 'devolvido' WHERE id = ?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Item não encontrado' });
  res.json(db.prepare('SELECT * FROM itens WHERE id = ?').get(req.params.id));
});

// Excluir
app.delete('/api/itens/:id', (req, res) => {
  const info = db.prepare('DELETE FROM itens WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Item não encontrado' });
  res.status(204).end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));

# Achados e Perdidos

Mini projeto: cadastro e busca de itens perdidos e achados.

**Stack:** Node.js 22.13+ (SQLite embutido), Express, HTML/CSS/JS puro.

## Como rodar
```bash
npm install
npm start
```
Abra http://localhost:3000

## API
| Método | Rota | Descrição |
|---|---|---|
| GET | /api/itens?tipo=&status=&q= | Lista com filtros |
| GET | /api/itens/:id | Busca um item |
| POST | /api/itens | Cadastra (tipo, titulo, contato obrigatórios) |
| PATCH | /api/itens/:id/devolvido | Marca como devolvido |
| DELETE | /api/itens/:id | Exclui |

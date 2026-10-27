# Tasks: Achados e Perdidos

Sugestão: cada tarefa vira um card no mural. Estimativa em horas (h).

## Backlog / A fazer

**1. Definir escopo e requisitos** (1h)
- [ ] Listar requisitos funcionais (cadastrar, listar, buscar, devolver, excluir)
- [ ] Definir quem usa o sistema (aluno que perdeu / aluno que achou)

**2. Modelar o banco de dados** (1h)
- [ ] Definir campos da tabela `itens` (tipo, título, descrição, local, data, contato, status)
- [ ] Desenhar o diagrama (DER ou tabela simples)

**3. Configurar o projeto** (1h)
- [ ] Criar repositório no GitHub e adicionar os colegas
- [ ] Rodar `npm install` e testar `npm start`

**4. Backend: criar e listar itens** (2h)
- [ ] Rota POST /api/itens com validação
- [ ] Rota GET /api/itens com filtros (tipo, status, busca)

**5. Backend: devolver e excluir itens** (1h)
- [ ] Rota PATCH /api/itens/:id/devolvido
- [ ] Rota DELETE /api/itens/:id

**6. Frontend: formulário de cadastro** (2h)
- [ ] Campos e validação
- [ ] Mostrar mensagem de erro vinda da API

**7. Frontend: lista de itens e filtros** (2h)
- [ ] Cards com tipo, local, data e contato
- [ ] Busca por texto e filtros por tipo/status
- [ ] Estado vazio e erro de conexão

**8. Frontend: ações nos cards** (1h)
- [ ] Botão "Marcar como devolvido"
- [ ] Botão "Excluir" com confirmação

**9. Testar o sistema** (2h)
- [ ] Testar as rotas no Postman/Insomnia
- [ ] Testar fluxo completo no navegador (celular e computador)
- [ ] Registrar bugs encontrados e corrigir

**10. Documentação** (1h)
- [ ] Completar o README (como rodar, rotas, prints de tela)

**11. Preparar apresentação** (2h)
- [ ] Montar slides (problema, solução, tecnologias, demo)
- [ ] Ensaiar a demonstração

## Ideias extras (se der tempo)
- [ ] Upload de foto do item
- [ ] Login para só o dono excluir o próprio item
- [ ] Deploy online (Render ou Railway)

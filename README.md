# Achados e Perdidos UEPA (campus Parauapebas)

Sistema web para registrar itens **perdidos** e **achados** na universidade. Quem acha deixa o item no **Protocolo**; o dono reivindica pelo site e o Protocolo confere, entrega e dá baixa. Substitui o grupo de WhatsApp.

## Rodando

Requisito: **Node.js 22.13 ou mais novo** (`node -v`). Não há dependências para instalar.

```bash
cp .env.example .env      # Windows (PowerShell): Copy-Item .env.example .env
# edite o .env e coloque seu e-mail institucional em ADMIN_EMAILS
npm start                 # abre em http://localhost:3000
npm test                  # roda os testes automatizados
```

Sem `SMTP_HOST` no `.env`, os e-mails (confirmação de conta, recuperação de senha) **aparecem no terminal** e na pasta `outbox/`. Copie o link de lá para confirmar a conta em desenvolvimento.

O primeiro administrador é quem se cadastra com um e-mail listado em `ADMIN_EMAILS`. Depois, o admin promove o pessoal do Protocolo em **Admin → Usuários** (papel `protocolo`).

## Papéis

| Papel | Pode |
| --- | --- |
| aluno | Publicar perdido/achado, editar/cancelar o próprio, reivindicar ("É meu!"), avisar que achou, denunciar |
| protocolo | Confirmar recebimento, decidir reivindicações, registrar devolução, destinar itens antigos |
| admin | Tudo do Protocolo + usuários, denúncias, remoção, categorias/locais, auditoria |

## Ciclo do item

- **Achado:** aguardando entrega → no Protocolo → em reclamação → devolvido (ou destinado após o prazo de retenção; cancelado/removido).
- **Perdido:** aberto → encontrado (ou cancelado, expirado, removido).
- O contador de **dias** usa o calendário de Belém (America/Belem) e congela quando o item é encerrado.

## Estrutura

```
server.js            inicia o servidor
src/app.js           servidor HTTP, sessão, CSRF, rotas, manutenção
src/db.js            esquema SQLite (STRICT, CHECK, FK, triggers) e migrações
src/routes/          auth, items, uploads, protocolo, admin
src/lib/             validação, crypto (scrypt), jpeg (remove EXIF), mailer SMTP, datas
public/              site (HTML/CSS/JS sem build)
tests/               testes (node:test)
docs/                decisões e backlog
```

## Segurança (resumo)

Senhas com scrypt; sessão em cookie `HttpOnly` + `SameSite` com token CSRF e checagem de `Origin`; bloqueio após 5 senhas erradas; limites de taxa; validação de todo corpo de requisição no servidor e restrições no próprio banco; consultas parametrizadas; CSP restritiva sem scripts/estilos inline; fotos aceitas só como JPEG, validadas e **sem EXIF/GPS**; contato dos usuários não é público; log de auditoria imutável; exclusão de conta anonimiza (LGPD). Detalhes e pendências em `docs/DECISOES.md`.

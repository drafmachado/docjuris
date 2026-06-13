# ⚖️ DocJuris — Sistema de Documentos Jurídicos

Sistema completo para geração automática de contratos, procurações, declarações e outros documentos jurídicos com preenchimento inteligente via IA.

---

## ✨ Funcionalidades

- **Extração automática de dados** — envie foto do RG/CPF e a IA preenche os campos do cliente
- **Geração de documentos** — templates .docx preenchidos automaticamente + convertidos para PDF
- **Campos manuais dinâmicos** — honorários, valores e datas são solicitados no momento da geração
- **Envio por email** — PDF enviado automaticamente ao cliente
- **Pasta por cliente** — histórico de documentos e arquivos organizado por cliente
- **Login e permissões** — Admin + colaboradores com controle de acesso
- **Funciona no celular** — interface responsiva acessível por qualquer dispositivo

---

## 🏗️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js + Express |
| Banco de dados | SQLite (via better-sqlite3) |
| IA | Claude API (Anthropic) |
| Templates | Docxtemplater (preenchimento .docx) |
| PDF | LibreOffice headless |
| Email | Nodemailer |
| Frontend | React + Vite |
| Autenticação | JWT |

---

## 🚀 Instalação

### Pré-requisitos

- Node.js 18+
- LibreOffice (para geração de PDF)

```bash
# Ubuntu/Debian
sudo apt install libreoffice

# macOS
brew install libreoffice
```

### 1. Clone o projeto

```bash
git clone <seu-repo>
cd docjuris
```

### 2. Configure o backend

```bash
cd backend
npm install
cp .env.example .env
# Edite .env e preencha ANTHROPIC_API_KEY
nano .env
```

### 3. Configure o frontend

```bash
cd ../frontend
npm install
```

### 4. Execute em desenvolvimento

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Acesse: **http://localhost:5173**

Login padrão: `admin@escritorio.com` / `admin123`

> ⚠️ **Troque a senha** após o primeiro login em Usuários → Editar

---

## 📋 Como usar

### Adicionar um template

1. Prepare seu documento .docx com campos no formato `{{NOME_CAMPO}}`
   - Campos automáticos (dados do cliente): `{{NOME_CLIENTE}}`, `{{CPF}}`, `{{RG}}`, `{{Endereço completo}}`
   - Campos manuais (dados do contrato): `{{Valor}}`, `{{Data}}`, `{{Forma de Pagamento}}`
2. Acesse **Templates → Adicionar template**
3. A IA classifica automaticamente quais campos são automáticos e quais manuais

### Cadastrar cliente

1. Acesse **Clientes → Novo Cliente**
2. Arraste ou envie foto do RG, CPF ou comprovante
3. Clique em **Extrair dados com IA** — os campos são preenchidos automaticamente
4. Confira e ajuste se necessário, depois salve

### Gerar documento

1. Clique em **Gerar Documento** (no Dashboard, na lista de clientes ou na pasta do cliente)
2. Selecione o cliente e o tipo de documento
3. Preencha os campos manuais (valores, datas, forma de pagamento)
4. Escolha se envia por email automaticamente
5. Clique em **Gerar documento**

---

## 🌐 Deploy (produção com R$100/mês)

### Railway (recomendado)

```bash
# Instale o CLI do Railway
npm install -g @railway/cli

# Login e deploy
railway login
railway init
railway up
```

Configure as variáveis de ambiente no painel do Railway:
- `ANTHROPIC_API_KEY`
- `JWT_SECRET` (gere uma chave aleatória)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (para email real)
- `FRONTEND_URL` (URL do seu app)

### Custos estimados

| Serviço | Custo |
|---------|-------|
| Railway (servidor) | ~R$50/mês |
| Claude API (50 docs/mês) | ~R$15/mês |
| Domínio próprio | ~R$3/mês |
| Email (Brevo gratuito) | R$0 |
| **Total** | **~R$68/mês** |

---

## 📱 Uso pelo celular

O sistema funciona totalmente pelo navegador do celular. Para uma experiência ainda melhor:

1. Abra o sistema no Chrome/Safari
2. Clique em "Adicionar à tela inicial"
3. Use como um app nativo

---

## 🔒 Segurança

- Senhas com hash bcrypt
- JWT com expiração de 12h
- Apenas admins gerenciam templates e usuários
- Arquivos servidos com caminhos seguros (sem path traversal)

---

## 📁 Estrutura do projeto

```
docjuris/
├── backend/
│   ├── server.js          # Servidor Express
│   ├── db.js              # Banco de dados SQLite
│   ├── middleware/auth.js  # JWT
│   ├── routes/
│   │   ├── auth.js        # Login
│   │   ├── clients.js     # Clientes + extração IA
│   │   ├── documents.js   # Geração de documentos
│   │   ├── templates.js   # Templates .docx
│   │   └── users.js       # Usuários
│   └── services/
│       ├── ai.js          # Claude API (extração + análise)
│       ├── docgen.js      # Preenchimento .docx + PDF
│       └── email.js       # Nodemailer
├── frontend/
│   └── src/
│       ├── pages/         # Dashboard, Clientes, Documentos, etc.
│       ├── components/    # UI reutilizável + modais
│       ├── hooks/         # useAuth
│       └── utils/api.js   # Axios configurado
└── storage/               # Criado automaticamente
    ├── templates/         # Templates .docx
    ├── pdfs/              # Documentos gerados
    └── client_files/      # Arquivos dos clientes
```

<!-- redeploy Sat Jun 13 14:13:25 UTC 2026 -->
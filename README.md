# Verificador de Fatos com IA (Fake News Verifier)

![Cabeçalho do Projeto](https://exemplo.com/banner-do-projeto.png) <!-- Substitua por um banner ou screenshot do seu projeto -->

Um sistema full-stack para verificação de fatos em imagens usando IA. Usuários podem se cadastrar, fazer login e enviar imagens (como capturas de tela de notícias, memes ou montagens) para análise. A aplicação utiliza a API do Google Gemini para avaliar a veracidade do conteúdo, retornando um percentual de confiabilidade, um resumo e fontes confiáveis.

## ✨ Funcionalidades

- **Autenticação de Usuários:** Sistema completo de cadastro e login.
- **Sistema de Créditos e Fallback:**
  - Cada usuário começa com créditos para as APIs primárias (Gemini, Grok).
  - Sistema de fallback multinível: se a API do Gemini falhar, tenta a do Grok. Se ambas falharem, utiliza automaticamente modelos de visão gratuitos via OpenRouter, garantindo alta disponibilidade.
- **Upload de Imagens:** Interface intuitiva para arrastar e soltar ou selecionar arquivos de imagem (PNG, JPG, WEBP).
- **Análise com IA:** Utiliza o modelo `gemini-flash-latest` do Google como provedor principal, com fallbacks inteligentes.
- **Relatório Detalhado:** Exibe o resultado da análise com:
  - Percentual de veracidade.
  - Resumo conciso da análise.
  - Links para fontes confiáveis que corroboram a verificação.
- **Interface Reativa:** Frontend moderno e responsivo construído com Vue.js e Tailwind CSS.
- **Backend Serverless:** API robusta e escalável construída com Hono e implantada na plataforma Cloudflare Workers.

## 🚀 Tecnologias Utilizadas

O projeto é um monorepo dividido em `frontend` e `backend`:

### Frontend

- **Framework:** Vue.js 3 (com Composition API e `<script setup>`)
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS
- **Ícones:** Lucide Vue Next

### Backend

- **Framework:** Hono
- **Ambiente:** Cloudflare Workers
- **Linguagem:** TypeScript
- **Inteligência Artificial:**
  - Google Gemini API (provedor principal)
  - Grok API e OpenRouter API (provedores de fallback)
- **Banco de Dados:** Cloudflare D1 (SQL)
- **Armazenamento de Arquivos:** Cloudflare R2

## 🔧 Configuração e Instalação

Siga os passos abaixo para configurar e executar o projeto localmente.

### Pré-requisitos

- Node.js (versão 18 ou superior)
- Wrangler CLI - A ferramenta de linha de comando para Cloudflare Workers.

### 1. Clonar o Repositório

```bash
git clone https://github.com/seu-usuario/fakenews-verify.git
cd fakenews-verify
```

### 2. Configuração do Backend

O backend depende de serviços da Cloudflare (D1, R2) e da API do Google Gemini.

1.  **Navegue até a pasta do backend:**
    ```bash
    cd backend
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure o Cloudflare Wrangler:**
    Faça o login na sua conta Cloudflare:
    ```bash
    wrangler login
    ```

4.  **Crie o Banco de Dados D1 e o Bucket R2:**
    Você precisará criar um banco de dados D1 e um bucket R2 pelo painel da Cloudflare ou via Wrangler.

    ```bash
    # Exemplo para criar o banco de dados
    wrangler d1 create fakenews-verify-db

    # Exemplo para criar o bucket R2
    wrangler r2 bucket create fakenews-verify-bucket
    ```

5.  **Configure o `wrangler.toml`:**
    Renomeie ou crie um arquivo `wrangler.toml` na pasta `backend` e adicione as configurações para seus serviços, substituindo os valores de exemplo.

    ```toml
    name = "fakenews-verify-backend"
    main = "src/index.ts"
    compatibility_date = "2023-12-01"

    [[d1_databases]]
    binding = "DB"
    database_name = "fakenews-verify-db"
    database_id = "<SEU_DATABASE_ID>"

    [[r2_buckets]]
    binding = "BUCKET"
    bucket_name = "fakenews-verify-bucket"
    ```

6.  **Configure as Chaves de API:**
    Obtenha suas chaves de API do Google AI Studio, Grok e OpenRouter e adicione-as como segredos no Wrangler.

    ```bash
    wrangler secret put GEMINI_API_KEY
    wrangler secret put XAI_API_KEY
    wrangler secret put OPENROUTER_API_KEY
    ```
    *O OpenRouter atua como um agregador para modelos gratuitos, garantindo um fallback robusto.*

7.  **Crie a Tabela de Usuários:**
    Execute o schema SQL para criar as tabelas necessárias no seu banco D1.
    ```sql
    -- schema.sql
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      credits TEXT DEFAULT '{"gemini": 5, "grok": 5, "openrouter": 10}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      authenticity_score INTEGER,
      summary TEXT,
      sources TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    ```
    Execute o comando:
    ```bash
    wrangler d1 execute fakenews-verify-db --file=./schema.sql
    ```

8.  **Execute o Backend Localmente:**
    ```bash
    wrangler dev
    ```
    A API estará disponível em `http://localhost:8787`.

### 3. Configuração do Frontend

1.  **Abra um novo terminal e navegue até a pasta do frontend:**
    ```bash
    cd frontend
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Execute o Frontend Localmente:**
    ```bash
    npm run dev
    ```
    A aplicação estará acessível em `http://localhost:5173` (ou outra porta indicada no terminal).

## 📖 Endpoints da API

A API do backend expõe as seguintes rotas:

- `POST /api/register`: Cria um novo usuário.
  - **Body:** `{ "name": "Seu Nome", "email": "seu@email.com", "password": "sua_senha" }`
- `POST /api/login`: Autentica um usuário existente.
  - **Body:** `{ "email": "seu@email.com", "password": "sua_senha" }`
- `POST /api/verify`: Recebe uma imagem para análise.
  - **Body:** `FormData` com os campos `image` (arquivo) e `userId` (string).

## ✒️ Autor

**Leonardo Bezerra**

- GitHub: @thesouthamerica
- LinkedIn: Leonardo Bezerra

---

*Este projeto é um portfólio e não deve ser utilizado para decisões críticas baseadas em suas análises. A precisão da IA pode variar.*
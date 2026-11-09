# Desafio Manutenção Sandbox

Monorepo de triagem autônoma de issues do GitHub baseado em **Clean Architecture**, **DDD Puro**, **.NET 10** e **Angular 17+** (Standalone Components e Signals).

---

## 🏗️ Estrutura do Monorepo

```
desafio-manutencao-sandbox/
├── docker-compose.yml              # PostgreSQL 16 Alpine e Redis 7 Alpine
├── .env.example                    # Template de variáveis de ambiente locais
├── desafio-api/                    # Backend .NET 10
│   ├── SoftwareTriage.slnx         # Solution .NET moderna
│   └── src/
│       ├── Core.Domain/            # C# puro (0 dependências externas)
│       │   ├── Common/             # Entity<TId>
│       │   ├── Entities/           # TriageJob (Aggregate Root), ProjectCatalogItem
│       │   ├── ValueObjects/       # TriageJobId, TriageStatus, IssueCategory, TriageProposal
│       │   └── Ports/              # ITriageJobRepository, IIssuePublisher, IProjectCatalog, IAiTriageEngine
│       ├── Core.Application/       # Casos de uso e orquestração
│       │   ├── DTOs/               # IncomingIssueEventDto, TriageResultDto, GitHubRepoDto, GitHubIssueDto
│       │   ├── Ports/              # ITriageJobQueue, IGitHubService
│       │   ├── Queues/             # ChannelTriageJobQueue (fila assíncrona em memória)
│       │   └── UseCases/           # ReceiveEventUseCase, ProcessTriageJobUseCase, GetTriageResultUseCase
│       ├── Infra.Data/             # EF Core + Npgsql (PostgreSQL)
│       │   ├── Context/            # TriageDbContext
│       │   ├── Mappings/           # TriageJobConfiguration (Fluent API, índices de idempotência)
│       │   └── Repositories/       # EfTriageJobRepository
│       ├── Infra.GitHub/           # Adapters e Serviços do GitHub
│       │   ├── Common/             # EnvLoader (.env loader nativo)
│       │   ├── Octokit/            # OctokitPublisherAdapter (comentários em issues)
│       │   ├── Services/           # OctokitGitHubService (listagem de repos e issues reais)
│       │   ├── Webhooks/           # GitHubWebhookPayloads & GitHubWebhookSecurity (HMAC SHA-256)
│       │   ├── Catalog/            # JsonProjectCatalogAdapter & project-catalog.json
│       │   └── Ai/                 # AiHarnessEngine (Especialistas de Bug e Melhoria anti-alucinação)
│       ├── Api/                    # Host HTTP Minimal API (POST /webhooks/github, GET /github/...)
│       └── Worker/                 # Host de Background (TriageJobQueueConsumer desacoplado)
└── desafio-app/                    # Frontend Angular 17+
    └── src/
        ├── main.ts                 # Bootstrap standalone
        └── app/
            ├── app.config.ts       # provideHttpClient(withFetch()), provideRouter(routes)
            ├── app.routes.ts       # Rotas /dashboard, /simulator, /issues/:owner/:repo/:number
            ├── models/             # triage.model.ts (contratos de Triage e GitHub)
            ├── services/           # triage-api.service.ts (Signals + HttpClient)
            └── features/
                ├── dashboard/      # Painel de métricas, integração GitHub e lista de jobs
                ├── simulator/      # Formulário com cenários de teste pré-definidos
                └── issue-viewer/   # Consulta detalhada da análise e status
```

---

## 🚀 Como Executar

### 1. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env` e certifique-se de configurar seu `GITHUB_TOKEN`:
```bash
cp .env.example .env
```
O backend carrega o token automaticamente do `.env` na inicialização via `EnvLoader`.

### 2. Iniciar Banco de Dados e Cache
```bash
docker compose up -d
```

### 3. Executar o Backend .NET
Compilar a solução:
```bash
cd desafio-api
dotnet build SoftwareTriage.slnx
```

Rodar a API HTTP:
```bash
dotnet run --project src/Api
```

Rodar o Worker de Background (em outro terminal):
```bash
dotnet run --project src/Worker
```

### 4. Executar o Frontend Angular
```bash
cd desafio-app
npm start
```
Acesse a aplicação no navegador em `http://localhost:4200`.

---

## 🔗 Configuração do Webhook no GitHub

Para conectar o GitHub em tempo real à sua aplicação:

1. Acesse seu repositório no GitHub: **Settings → Webhooks → Add webhook**
2. Preencha as configurações:
   - **Payload URL**: `https://<seu-dominio-ou-ngrok>/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: *(opcional, defina em `GitHub:WebhookSecret` no `appsettings.Development.json`)*
   - **Which events would you like to trigger this webhook?**: Escolha *"Let me select individual events"* e marque **Issues**.
3. Clique em **Add webhook**. Toda nova issue aberta ou editada disparará o pipeline de triagem automática e publicará os apontamentos de IA diretamente na issue.

---

## 📡 Endpoints da API

- `POST /webhooks/github`: Recebe webhooks oficiais de issues do GitHub.
- `GET /github/repos`: Lista repositórios reais do usuário autenticado no GitHub.
- `GET /github/repos/{owner}/{repo}/issues`: Lista issues abertas de um repositório real.
- `POST /github/repos/{owner}/{repo}/issues/{number}/triage`: Inicia triagem de uma issue real existente sob demanda.
- `POST /events`: Ingestão direta de eventos normalizados.
- `GET /issues/{owner}/{repo}/{issueNumber}`: Consulta o status e a proposta de triagem de uma issue.
- `GET /jobs`: Lista histórico de jobs de triagem.
- `GET /health`: Healthcheck da API.

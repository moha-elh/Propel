# Propel

> **Formerly CV Generator** — a full-stack, AI-powered platform for generating tailored CVs, tracking job applications, and managing a career portfolio. Originally built as .NET microservices; **now consolidated into a single monolith** with a YARP gateway, an Angular frontend, and a set of Python AI agents.

## Features

- **AI CV Generation** — submit a job description and get a tailored CV via a pipeline of AI agents (job extraction, profile matching, template rendering, ATS optimization, delivery)
- **Job Application Tracking** — dashboard, list, kanban, calendar, and analytics views
- **Portfolio Management** — projects, skills, experience, education, certifications, languages, social links, and more
- **Mailbox & Contacts** — contact import, AI-assisted draft/reply, email scheduling
- **AI Autofill** — populate forms from a pasted description via a centralized direct-AI proxy
- **No login** — single-user personal tool; auth was removed, every request maps to one owner account

## Architecture

A single .NET monolith serves every domain. The gateway (YARP) proxies all `/api/*` traffic to the monolith. There is no authentication — the app is a single-user personal tool, so every request resolves to a fixed owner account. The Python AI agents run as standalone HTTP services the monolith calls by hostname.

```mermaid
flowchart TB
    Browser["Browser :4200"]
    Nginx["Frontend — Nginx (Angular SPA)<br/>serves static + proxies /api"]
    Gateway["API Gateway :8080<br/>YARP reverse proxy<br/>all /api/* → monolith:5000"]
    Monolith["Monolith :5000<br/>.NET / ASP.NET Core · EF Core<br/>all domains (users, applications,<br/>CVs, portfolio, mailbox, workflows)"]
    PG[("PostgreSQL :5432<br/>cv_monolith")]
    MinIO["MinIO :9000/9001"]

    subgraph Agents["AI Agents (Python / FastAPI)"]
        JE["job-extractor :8001"]
        SA["search-agent :8002"]
        TA["template-agent :8003"]
        CO["cv-optimizer :8004"]
        CA["contact-agent :8005"]
        JC["job-crawler :8006"]
    end

    Browser --> Nginx -->|/api/*| Gateway --> Monolith
    Monolith --- PG
    Monolith --- MinIO
    Monolith -->|HTTP| JE & SA & TA & CO & CA & JC
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Angular 21, TypeScript, RxJS, Signals, SCSS |
| **Backend** | .NET / ASP.NET Core, EF Core, YARP reverse proxy |
| **AI Agents** | Python 3.11, FastAPI, LangChain (OpenRouter-first with provider fallback) |
| **Database** | PostgreSQL 17 (single `cv_monolith` DB; pgvector for search) |
| **Storage** | MinIO (S3-compatible, for CV PDFs) |
| **Container** | Docker, Docker Compose, Nginx |

## Prerequisites

- Docker & Docker Compose
- (Local dev only) .NET SDK, Node.js 20+, Python 3.11+

## Quick Start (Docker — full stack)

```bash
git clone <repo-url>
cd propel/monolith

# The AI agents read LLM keys from one file — copy the example and add a key:
#   cp monolith/agents/.env.example monolith/agents/.env
#   (set OPENROUTER_API_KEY or another provider key)
# Optional stack settings (owner name, ports):
#   cp monolith/.env.example monolith/.env

docker compose up --build -d
```

First boot takes a minute or two (image builds + DB migrations). Then open **http://localhost:4200** — it lands straight on the dashboard; there is no login.

Check status / logs:

```bash
docker compose ps
docker compose logs -f monolith
```

Stop:

```bash
docker compose down          # keep data
docker compose down -v       # also wipe volumes (resets DB)
```

### Owner identity

There is no login. The app runs as a single owner account, seeded on first boot.
Optionally set your name/email via `OWNER_FIRST_NAME`, `OWNER_LAST_NAME`, `OWNER_EMAIL`
(see [Environment Variables](#environment-variables)).

## Services & Ports

All defined in `monolith/docker-compose.yml`. Ports are overridable via `.env` (see variables below).

| Service | Container | Host Port | Notes |
|---|---|---|---|
| Frontend (Nginx) | `cv-frontend` | 4200 | Angular SPA, proxies `/api` → gateway |
| API Gateway | `cv-api-gateway` | 8080 | YARP reverse proxy → monolith |
| Monolith | `cv-monolith` | 5000 | .NET app, all domains; `/health` |
| PostgreSQL | `cv-monolith-db` | 5432 | database `cv_monolith` |
| MinIO | `cv-minio` | 9000 / 9001 | S3 storage + console |
| Job Extractor | `cv-job-extractor` | 8001 | extract requirements from a job description |
| Search Agent | `cv-search-agent` | 8002 | RAG profile matching |
| Template Agent | `cv-template-agent` | 8003 | render CV templates |
| CV Optimizer | `cv-optimizer` | 8004 | ATS validation + keyword optimization |
| Contact Agent | `cv-contact-agent` | 8005 | delivery / contact handling |
| Job Crawler | `cv-job-crawler` | 8006 | job board crawling |

## Local Development (without Docker)

`monolith/dev.sh` starts the infra + AI agents in Docker and leaves the monolith, gateway, and frontend to run natively.

```bash
cd monolith
./dev.sh            # brings up postgres, minio, and the AI agent sidecar

# then, in separate terminals:
cd monolith/backend && dotnet run       # monolith :5000
cd monolith/gateway && dotnet run       # gateway :8080
cd frontend && npm install && ng serve  # frontend :4200 (proxies /api → :8080)
```

The monolith's connection string comes from `CONNECTION_STRING` / `ConnectionStrings:DefaultConnection`; the gateway resolves the monolith address from `MONOLITH_HOST` / `MONOLITH_PORT`.

## Project Structure

```
propel/
├── monolith/
│   ├── docker-compose.yml     # full stack: db, monolith, gateway, agents, minio, frontend
│   ├── dev.sh                 # bring up infra + agents for native dev
│   ├── Dockerfile             # monolith image
│   ├── backend/               # the .NET monolith (all Controllers, Data, Models, Services, Migrations)
│   ├── gateway/               # YARP reverse proxy → monolith
│   └── agents/                # unified Python AI sidecar (all agents, one FastAPI app on :8000)
│       ├── main.py            # mounts every agent router
│       ├── agents/            # one package per agent (job_extractor, template, …)
│       ├── shared/            # shared LLM/config/tools
│       └── Dockerfile         # agents image (~2 GB, service: agents)
│
└── frontend/                  # Angular SPA (pages, services, guards, interceptors, nginx.conf)
```

> All AI agents live in the single `monolith/agents` sidecar (built by
> `monolith/docker-compose.yml` as the `agents` service, reached by the monolith
> via `AGENTS_URL`). The old per-service `ai_agents/` tree has been removed.
>
> **Note:** CV-PDF generation compiles LaTeX by shelling out to a dockerized
> `texlive` image (`shared/tools/latex_compile.py`); that path works in native
> dev but not from inside the containerized sidecar. All other AI features
> (draft/autofill, extraction, search, optimizer, contact, crawler) run in Docker.

## Environment Variables

Set in `monolith/.env` (compose reads it) or the shell. Defaults shown are the compose fallbacks.

| Variable | Default | Purpose |
|---|---|---|
| `MONOLITH_PORT` | `5000` | monolith host port |
| `MONOLITH_DB_PORT` | `5432` | Postgres host port |
| `GATEWAY_PORT` | `8080` | gateway host port |
| `FRONTEND_PORT` | `4200` | frontend host port |
| `MINIO_ROOT_USER` / `_PASSWORD` | `minioadmin` / `minioadmin` | MinIO credentials |
| `CONNECTION_STRING` | `Host=postgres;…;Database=cv_monolith` | monolith DB connection (Docker) |
| `OWNER_FIRST_NAME` / `OWNER_LAST_NAME` / `OWNER_EMAIL` | `Me` / _(empty)_ / `me@localhost` | owner account identity (no auth) |
| `AGENTS_PORT` | `8000` | AI agent sidecar host port |

Stack settings live in `monolith/.env` (see `monolith/.env.example`). LLM/provider
keys for the AI agents live in `monolith/agents/.env` (see `monolith/agents/.env.example`).

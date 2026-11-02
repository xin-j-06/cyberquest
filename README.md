# CyberQuest 2.0

AI-assisted, safety-first CTF learning platform with a Vue 3 client and NestJS/Prisma API. It intentionally limits terminal commands to a small audited allow-list and models labs as private, time-limited instances; it never executes arbitrary host commands.

## Current implementation

The default development path is a self-contained local CTF learning platform. It uses the JSON data store in `apps/server/data/` to provide authentication, challenge state, scoring, skills, hints, audit activities, time-limited targets, leaderboards, an independent knowledge base, a related-competitions catalog, an official CTF tools directory, and a safe Mock AI tutor. Each active challenge opens a separate `/targets/:instanceId` page. Learners exploit a synthetic Web/Pwn target or analyze session-generated Crypto/Network/Reverse material, recover a session-bound Flag, and return to the workspace to submit it. Targets are local and do not reach external systems.

The top-level “常用工具” page is available at `/tools`. It groups official download and documentation links by CTF workflow, supports search and category filters, and keeps `/range` as a compatibility redirect. No third-party mirrors or bundled executables are served by the platform.

The PostgreSQL, Redis and Docker definitions remain in the repository as the next production-architecture phase. They are not required to run the current verified local demonstration loop.

Only challenges that genuinely require a file advertise attachments: `crypto-101` provides an encoded text payload, `network-101` a synthetic traffic CSV, `reverse-101` a harmless strings listing, and `pwn-101` a review-only C source sample. The two Web challenges are completed through their interactive sandbox pages and intentionally have no attachment. Downloads are authenticated and resolved from a server-side allow-list.

## Quick start

1. Copy `.env.example` to `.env`.
2. Install Node dependencies with `corepack pnpm install`.
3. Build once with `corepack pnpm build`.
4. Run locally with `corepack pnpm dev`, then open `http://localhost:5173`.

The server reads and updates `apps/server/data/cyberquest.local.json`. It is local learning state, not a production database; do not commit personal or shared deployment data from that file. If it is absent, the server creates a clean local copy from `apps/server/data/cyberquest.seed.json`.

Docker Compose is retained as a production-architecture scaffold and will be verified after the JSON-to-Prisma repository migration.

## Prisma preparation (Docker can wait)

The production schema is ready to be checked without starting Docker. Copy `apps/server/.env.example` to `apps/server/.env`, then run `corepack pnpm db:validate` and `corepack pnpm db:generate`. `db:push` and `db:seed` require a reachable PostgreSQL instance and are deliberately deferred to the Docker/production stage.

The Prisma seed contains only Argon2id flag-verification hashes. It is not an authoring source for plaintext flags, and no challenge endpoint exposes either plaintext flags or their hashes.

When PostgreSQL is available, set `DATA_BACKEND=prisma` in the server environment. The server loads `apps/server/.env` before choosing its repository, defaults to `local`, and rejects any other value. In production Prisma mode it also requires distinct `JWT_ACCESS_SECRET` and `ATTEMPT_HASH_SECRET` values. `corepack pnpm db:check` type-checks the TypeScript Prisma seed without connecting to a database.

`DATA_BACKEND=prisma` selects the transactional `PrismaLearningRepository`; `DATA_BACKEND=local` selects the JSON demonstration store. The PostgreSQL connection, migration execution, and integration tests still require a database and remain deferred with Docker.

## Demo identities

| User | Email | Password | Role |
| --- | --- | --- | --- |
| demo | `demo@cyberquest.local` | `CyberQuest123!` | USER |
| admin | `admin@cyberquest.local` | `CyberQuest123!` | ADMIN |

## Verification

Run `corepack pnpm build`. With the API running, `corepack pnpm verify:demo` checks demo login plus seeded challenges and skills. The local API also supports challenge workspaces, hint unlocks, server-side hash validation, score/skill updates, audit activities, time-limited guided sessions, and authenticated realtime notifications.

`corepack pnpm verify:local` is the repeatable local acceptance check: it builds the workspace, temporarily starts an isolated server on port `3100`, verifies REST contracts, DTO rejection, learning data, Socket JWT handling, private lab events, the separate sandbox target, dynamic Flag generation and Flag submission, then stops the server. The API contract is in [`docs/openapi.json`](docs/openapi.json); errors and client behavior are documented in [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md). The current Chinese handoff is in [`docs/WORK_HANDOFF.md`](docs/WORK_HANDOFF.md).

## API and realtime

REST endpoints are prefixed with `/api`: auth, challenges, dashboard, skills, labs, lab targets, AI, courses and leaderboard. The authenticated Socket.IO namespace is `/events`; it emits `session.ready`, `challenge.solved`, `leaderboard.updated`, and private `lab.status` events. Socket.IO never accepts learning mutations, and event payloads exclude flags, hashes, access tokens, and cross-user lab details. Redis-backed fan-out and Docker-backed labs remain deferred.

Static seed Flags are stored only as server-side hashes and are never returned by challenge endpoints. Each active, user-owned CTF target derives a per-session Flag with HMAC-SHA-256. Web and Pwn targets reveal it only after a successful local interaction; Crypto, Network, and Reverse targets embed it in recoverable encoded material. Dynamic Flags are accepted only for the associated unexpired session and are never persisted in plaintext. The production database path uses Argon2id for seed Flags.

## 国产大模型学习问答

独立的 `/agent` 页面可连接 DeepSeek 或兼容 OpenAI Chat Completions 格式的国产模型。复制 `.env.example` 为 `.env`，设置 `AI_API_KEY` 后重启后端；默认配置为 `AI_PROVIDER=deepseek`、`AI_API_BASE_URL=https://api.deepseek.com` 和 `AI_MODEL=deepseek-flash`。也可使用 `AI_PROVIDER=openai-compatible` 配合服务商提供的 `AI_API_BASE_URL` 与 `AI_MODEL`。

API Key 只由后端读取，不会发送到浏览器、写入学习记录或出现在接口响应中。智能体不配置任何执行工具，并在请求前、系统提示词和响应后三层限制操作性渗透内容；只允许知识解释、课程答疑、普通报错排查、防御修复和学习规划。`AI_THINKING_ENABLED=true` 与 `AI_REASONING_EFFORT=high` 会启用深度思考，但只向学员展示最终回答，不展示模型内部推理。配置 Key 后严格使用远程模型；模型调用失败时明确返回错误，避免误把本地模板当作大模型回答。未配置 Key 时才使用本地安全问答。

## 无 Docker 本地运行模式

当前开发版本默认提供单机持久化后端，不需要安装 Docker、PostgreSQL 或 Redis：

```powershell
corepack pnpm --filter @cyberquest/server build
node apps/server/dist/main.js
corepack pnpm --filter @cyberquest/web dev
```

打开 `http://127.0.0.1:5173` 后可注册账户或使用 `demo@cyberquest.local` 登录。用户、题目提交、积分、排行榜、技能与本地学习会话会真实保存到 `apps/server/data/cyberquest.local.json`。该文件只保存 Flag 哈希和提交哈希，不保存明文答案或明文密码。

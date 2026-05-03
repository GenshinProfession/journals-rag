# 实施任务规划与交接记录

## 一、当前产品目标

本项目已经按“服务器部署优先”的论文代写/RAG 工作台方向推进。核心约束保持不变：

- 部署以 PostgreSQL + pgvector + Redis 为基础。
- 固定两类角色：admin 管理员、writer 代写用户。
- 前台和后台拆成两个 React 应用，通过两个 Nginx 入口代理。
- AI 调用统一走中转站，基于 token usage 写入内部用量记录并扣费。
- RAG 入库前必须完成标准参考论文质量审核。
- 模型目录、可用场景和价格由管理员维护，writer 按场景选择/调用。

## 二、已经完成的模块

### 1. 后端基础与配置

已完成：

- `backend/app/main.py`
  - FastAPI 应用入口。
  - `/health` 健康检查。
  - CORS 配置。
  - 启动时执行 schema bootstrap、bootstrap admin、demo model bootstrap。
  - 增加 `InsufficientBalanceError` 全局异常处理，余额不足返回 `402`。
- `backend/app/config.py`
  - 数据库、Redis、JWT、中转站、上传目录配置。
  - `BILLING_RESERVE_CEILING_CENTS` 单次 AI 调用冻结额度上限。
  - `EMBEDDING_MODEL`、`EMBEDDING_DIMENSIONS`。
  - `AI_GATEWAY_CHAT_API_KEY`：对话/润色可单独使用 chat key，未配置则回落到 `AI_GATEWAY_API_KEY`。
  - `AI_GATEWAY_NAMED_API_KEYS`：JSON 对象，多 key 预留，模型可通过 `api_key_name` 选择。
  - `AI_GATEWAY_BALANCE_QUERY_URLS`：API key 额度查询地址，默认包含 `https://chaxun.wlai.vip/` 和 `https://cx.tpkcur.click/`。
  - `UPLOAD_MAX_BYTES`、`UPLOAD_ALLOWED_EXTENSIONS`：上传大小和类型限制。
  - `LOGIN_RATE_LIMIT_ATTEMPTS`、`LOGIN_RATE_LIMIT_WINDOW_SECONDS`：登录限流。
  - `BOOTSTRAP_CREATE_SCHEMA`：开发环境可 `create_all`，生产可关闭后只走 Alembic。
  - `BOOTSTRAP_DEMO_MODEL`：本地烟测时自动创建零成本开发模型。
- `backend/app/db.py`
  - SQLAlchemy engine / session。
- `backend/app/bootstrap.py`
  - `CREATE EXTENSION IF NOT EXISTS vector`。
  - 可选创建首个 admin。
  - 可选创建覆盖所有 AI 场景的 demo model。

### 2. 数据模型

已完成：

- `backend/app/models/user.py`
  - `User`：admin / writer，启用状态，创建人。
- `backend/app/models/billing.py`
  - `AccountWallet`：余额、冻结金额、累计充值、累计消费。
  - `RechargeRecord`：管理员充值记录。
  - `WalletLedger`：钱包流水，支持关联 AI usage。
- `backend/app/models/model_catalog.py`
  - 模型展示名、中转模型名、端点类型、api key alias、上下文窗口、输入/输出价格、启用状态、场景列表。
- `backend/app/models/ai_usage.py`
  - AI 调用记录：用户、项目、模型、agent、场景、request id、tokens、成本、状态、错误。
- `backend/app/models/project.py`
  - `Project`：论文项目、题目/主题、默认模型、大纲、状态。
  - `Chapter`：章节标题、顺序、内容、字数、反馈、版本。
- `backend/app/models/school.py`
  - `SchoolTemplate`：学校/专业模板、层次、引用格式、字数范围、格式规则、启用状态。
- `backend/app/models/rag.py`
  - `Literature`：文献元信息、文件路径、RAG 状态。
  - `ReferenceReview`：参考论文审核分数、报告、通过状态、关联用量。
  - `RAGDocument`：RAG 文档、hash、切块状态。
  - `RAGChunk`：chunk 内容、pgvector embedding、状态、页码/关键词等。

### 3. 登录、JWT 与 RBAC

已完成：

- `backend/app/security.py`
  - 密码 hash / verify。
  - JWT 只存 `sub` + `exp`，不把 role/username 写进 token。
- `backend/app/deps.py`
  - DB session 依赖。
  - `require_user`、`require_admin`、`require_writer`。
  - 注入 `ProviderGatewayService`、`LLMService`、`EmbeddingService`。
- `backend/app/api/auth.py`
  - 登录。
  - `/me`。
  - 登录频率限制。
- 两端前端都已接 token：
  - `frontend-admin/src/api/client.ts`
  - `frontend-writer/src/api/client.ts`
  - 登录后写入 `jr_access_token`。
  - 请求自动加 Bearer。
  - admin/writer route guard 校验角色。

### 4. Admin 后台

后端已完成：

- `backend/app/api/admin_overview.py`
  - writer 数量、启用 writer、启用模型、AI 调用数、总余额、冻结、累计充值、累计消费。
- `backend/app/api/admin_users.py`
  - 用户列表。
  - 创建 writer。
  - 启用/停用 writer。
  - 重置密码。
- `backend/app/api/admin_billing.py`
  - 钱包列表。
  - 管理员人工充值。
  - 管理员账务正负调整。
  - AI usage 对账 dry-run / 写回。
  - API Key 额度查询：可查询已配置 key，也可临时输入 key 查询。
  - 钱包流水列表。
  - AI usage 列表。
- `backend/app/api/admin_models.py`
  - 模型 CRUD。
  - 支持维护 `endpoint_type`，区分 OpenAI chat、OpenAI responses、Gemini generateContent、Anthropic messages。
  - 支持维护 `api_key_name`，以后可按模型绑定不同中转站 key。
  - 禁止删除已被项目/usage 引用的模型。
- `backend/app/api/admin_schools.py`
  - 学校模板列表。
  - 创建学校模板。
  - 编辑学校模板。
  - 启用/禁用学校模板。
  - 删除学校模板。

前端已完成：

- `frontend-admin/src/pages/Login.tsx`
  - 管理员登录页。
- `frontend-admin/src/pages/Dashboard.tsx`
  - 当前用户。
  - 后台 overview 指标卡。
- `frontend-admin/src/pages/Users.tsx`
  - 创建 writer。
  - 用户列表。
  - 启用/停用 writer。
  - 重置密码。
- `frontend-admin/src/pages/Billing.tsx`
  - 人工充值。
  - 账务调整（正负金额，必须备注）。
  - usage 对账预览与写回。
  - 云雾/中转站 API Key 额度查询。
  - 钱包快照。
  - 钱包流水。
  - AI 调用记录。
- `frontend-admin/src/pages/Models.tsx`
  - 新增模型。
  - 编辑模型。
  - 启用/禁用模型。
  - 删除模型。
  - 维护输入/输出价格和场景标签。
  - 维护模型端点类型 `endpoint_type`。
  - 维护模型 key alias `api_key_name`。
- `frontend-admin/src/pages/Schools.tsx`
  - 新增/编辑学校模板。
  - 维护层次、专业、引用格式、字数范围和格式规则。
  - 启用/禁用/删除模板。

### 5. Writer 前台

后端已完成：

- `backend/app/api/wallet.py`
  - 当前 writer 钱包。
  - 当前 writer 流水。
- `backend/app/api/models.py`
  - writer 可用模型列表。
  - 支持按 scenario 过滤，空场景列表表示通用模型。
- `backend/app/api/schools.py`
  - writer 可见学校模板列表。
  - 支持按 degree_level / discipline 过滤。
- `backend/app/api/projects.py`
  - 项目列表/创建。
  - 创建项目时校验学校模板存在且启用。
  - 大纲生成时注入学校模板规则。
  - 章节生成时注入学校模板规则。
  - Markdown / LaTeX 导出时写入学校模板说明。
  - Markdown / LaTeX / Word 导出包含封面信息、摘要、目录提示和参考文献列表。
  - 标准参考论文 AI 审核。
  - 大纲生成。
  - 章节列表。
  - 章节内容保存。
  - 章节正文生成。
  - 章节审校。
  - 章节降重/改写。
  - Markdown / LaTeX 导出。
  - Word/docx 导出。
- `backend/app/api/literature.py`
  - 手工创建文献。
  - 上传文件创建文献。
  - 上传文件类型白名单和大小限制。
  - 文献列表。
- `backend/app/api/rag.py`
  - 参考论文审核通过后才允许预切块。
  - 预切块。
  - chunk 列表。
  - 人工确认入库。
  - 项目内 RAG 检索。

前端已完成：

- `frontend-writer/src/pages/Login.tsx`
  - writer 登录。
- `frontend-writer/src/pages/Projects.tsx`
  - 创建项目。
  - 新建项目时可选择学校模板。
  - 项目列表。
  - 进入向导。
- `frontend-writer/src/pages/Wallet.tsx`
  - 钱包余额。
  - 冻结金额。
  - 累计充值/消费。
  - 流水。
- `frontend-writer/src/pages/Wizard.tsx`
  - 选择项目。
  - 保存标准参考论文文本。
  - 上传 PDF / 文本文件并创建文献。
  - AI 审核参考论文。
  - 审核通过后预切块。
  - 预览 chunk。
  - 勾选需要入库的 chunk。
  - 仅确认选中 chunk 并生成 embedding。
  - RAG 检索。
  - 生成大纲。
  - 生成章节正文。
  - 手工编辑并保存章节。
  - 审校章节。
  - 降重改写。
  - 导出 Markdown / LaTeX / Word。

### 6. AI 中转站与计费

已完成：

- `backend/app/services/provider_gateway.py`
  - Yunwu/OpenAI-compatible `/v1/chat/completions`。
  - OpenAI-compatible `/v1/responses`。
  - Gemini `/v1beta/models/{model}:generateContent`。
  - Anthropic `/v1/messages`。
  - OpenAI-compatible `/v1/embeddings`。
  - 当 chat 响应没有 usage 时，fallback 查询 `/v1/usage/{request_id}`。
  - 本地开发无 `AI_GATEWAY_BASE_URL` 时返回零成本空内容/零向量。
  - Gemini image/multimodal helper。
  - Seedream/Doubao image generation helper：`/v1/images/generations`。
  - 支持按模型 `api_key_name` 选择 `AI_GATEWAY_NAMED_API_KEYS` 中的命名 key；未命中则回落到 chat/api 默认 key。
- `backend/app/services/gateway_balance_service.py`
  - 适配免费 API Key 额度查询页面。
  - 对每个查询地址依次尝试 JSON POST、form POST、query GET。
  - 尝试从 JSON/文本中提取余额/额度字段。
- `backend/app/services/llm_service.py`
  - 创建 `AIUsageRecord`。
  - 付费模型余额为 0 时，不调用外部中转站，直接 `billing_failed`。
  - 调用前按余额和上限冻结金额。
  - 按模型目录 `endpoint_type` 路由到不同中转站端点。
  - 调用后根据 usage 和模型价格计算成本。
  - 结算冻结金额。
  - 写入成功/失败/计费失败状态。
- `backend/app/services/billing_service.py`
  - 充值。
  - 直接扣费。
  - 冻结余额。
  - 取消冻结。
  - 结算冻结扣费。
  - 成本按输入/输出 token 分别向上取整。

### 7. RAG 与文献处理

已完成：

- `backend/app/services/literature_text.py`
  - 读取上传文本文件。
  - 读取 PDF（依赖 `pypdf`）。
  - 无文件时用标题/摘要 fallback。
- `backend/app/services/text_chunk.py`
  - 基础文本切块。
  - 支持 overlap。
- `backend/app/services/rag_service.py`
  - 清理同文献 draft chunk。
  - 创建 `RAGDocument`。
  - 创建 draft chunks。
  - 确认时生成 embedding 并标记 confirmed。
- `backend/app/services/embedding_service.py`
  - 通过中转站 embeddings API 生成向量。
- `backend/app/services/vector_store.py`
  - 项目内 pgvector cosine search。

### 8. 数据库迁移

已完成：

- `backend/alembic/env.py`
  - 已加载 SQLAlchemy metadata。
- `backend/alembic/versions/0001_initial_schema.py`
  - 初始 schema。
  - `CREATE EXTENSION IF NOT EXISTS vector`。
  - users / wallets / billing / model_catalog / projects / chapters / literature / reviews / rag_documents / rag_chunks / usage。
- `deploy/docker-compose.yml`
  - backend 启动时执行 `alembic upgrade head`。

### 9. 部署

已完成：

- `deploy/docker-compose.yml`
  - postgres: `pgvector/pgvector:pg16`。
  - redis。
  - backend。
  - admin-web。
  - writer-web。
- `deploy/Dockerfile.backend`
  - 构建 FastAPI backend 镜像。
  - CMD 执行 Alembic + Uvicorn。
- `deploy/Dockerfile.frontend-admin`
  - 构建 admin Vite 应用。
  - Nginx 托管静态文件。
- `deploy/Dockerfile.frontend-writer`
  - 构建 writer Vite 应用。
  - Nginx 托管静态文件。
- `deploy/nginx-admin.conf`
  - admin 入口。
  - `/api/` 代理到 backend。
- `deploy/nginx-writer.conf`
  - writer 入口。
  - `/api/` 代理到 backend。
- `.dockerignore`
  - 忽略 node_modules、dist、pycache、上传目录、`.env` 等。

### 10. 测试与验证

已完成：

- `backend/tests/test_text_chunk.py`
  - 短文本保持原样。
  - 长文本 overlap 切块。
  - 空文本返回空列表。
- `backend/tests/test_billing_service.py`
  - token 成本向上取整。
  - 零 token 零成本。
- `backend/tests/test_api_routes.py`
  - 核心 API route 注册检查。
- `backend/tests/test_project_helpers.py`
  - LLM JSON 输出解析 helper 测试。
- `backend/tests/test_provider_gateway.py`
  - ProviderGateway 多 key 选择测试。
- `backend/tests/test_gateway_balance_service.py`
  - API Key 额度查询结果提取测试。
  - 配置 key 过滤测试。

### 11. 任务队列骨架

已完成：

- `backend/app/models/job.py`
  - `BackgroundJob`：记录 user/project/job_type/status/celery_task_id/input/result/error。
- `backend/app/schemas/jobs.py`
  - job 响应 schema。
- `backend/app/services/job_service.py`
  - 创建 job。
  - 标记 running/succeeded/failed。
- `backend/app/worker.py`
  - Celery app。
  - Redis broker/backend。
- `backend/app/tasks.py`
  - `jobs.noop` 烟测任务。
  - `rag.rebuild_document` 占位任务。
  - `project.generate_chapter` 占位任务。
- `backend/app/api/jobs.py`
  - writer 查询自己的 job。
  - writer 查询单个 job。
  - writer enqueue noop job。
- `backend/alembic/versions/0002_background_jobs.py`
  - background_jobs 迁移。
- `backend/alembic/versions/0003_school_templates.py`
  - school_templates 迁移。
  - 为 projects.school_id 增加到 school_templates 的外键。
- `backend/alembic/versions/0004_model_endpoint_type.py`
  - 为 `model_catalog` 增加 `endpoint_type`。
- `backend/alembic/versions/0005_model_api_key_name.py`
  - 为 `model_catalog` 增加 `api_key_name`。
- `deploy/docker-compose.yml`
  - 增加 `worker` 服务。

已运行：

- `python -m compileall backend`：通过。
- ReadLints：无错误。
- `docker compose -f deploy/docker-compose.yml config`：通过。
- `scripts/smoke.ps1`：通过（Python compile + compose config）。

未能运行：

- `python -m pytest backend/tests`：当前系统 Python 环境未安装 `pytest`，报 `No module named pytest`。
- 前端 `npm run build`：当前 shell 环境识别不到 `npm`，需安装 Node 或在有 Node 的环境执行。
- `docker compose -f deploy/docker-compose.yml build`：当前 Docker Desktop/Linux engine 未启动，报找不到 `dockerDesktopLinuxEngine` pipe。

## 三、当前已更新文件清单

### 根目录

- `.env.example`
  - 增加计费冻结额度。
  - 增加 embedding 配置。
  - 增加 bootstrap schema/demo model 配置。
- `.dockerignore`
  - 新增 Docker 构建忽略规则。
- `README.md`
  - 更新启动方式、端口、已实现流程、生产注意事项、检查命令。
- `implementation-task-plan.md`
  - 本文档，持续记录完成状态和未完成工作。
- `scripts/smoke.ps1`
  - 本地烟测脚本：Python compile + Docker compose config；可选 `-Build` 构建镜像。
- `scripts/start.ps1`
  - Windows 一键启动 compose stack。

### 后端

- `backend/pyproject.toml`
  - 增加 `pypdf`。
- `backend/app/main.py`
- `backend/app/config.py`
- `backend/app/bootstrap.py`
- `backend/app/db.py`
- `backend/app/deps.py`
- `backend/app/security.py`
- `backend/app/models/*`
- `backend/app/schemas/*`
- `backend/app/api/*`
- `backend/app/services/*`
- `backend/alembic/*`
- `backend/tests/*`

### 前端 admin

- `frontend-admin/src/api/client.ts`
- `frontend-admin/src/main.tsx`
- `frontend-admin/src/pages/Login.tsx`
- `frontend-admin/src/pages/Dashboard.tsx`
- `frontend-admin/src/pages/Users.tsx`
- `frontend-admin/src/pages/Billing.tsx`
- `frontend-admin/src/pages/Models.tsx`
- `frontend-admin/src/styles.css`

### 前端 writer

- `frontend-writer/src/api/client.ts`
- `frontend-writer/src/main.tsx`
- `frontend-writer/src/pages/Login.tsx`
- `frontend-writer/src/pages/Projects.tsx`
- `frontend-writer/src/pages/Wallet.tsx`
- `frontend-writer/src/pages/Wizard.tsx`
- `frontend-writer/src/styles.css`

### 部署

- `deploy/docker-compose.yml`
- `deploy/Dockerfile.backend`
- `deploy/Dockerfile.frontend-admin`
- `deploy/Dockerfile.frontend-writer`
- `deploy/nginx-admin.conf`
- `deploy/nginx-writer.conf`

## 四、尚未完成或仍需加强的工作

### 必须继续做

1. 前端构建验证
   - 在安装 Node/npm 的环境中跑：
     - `cd frontend-admin && npm install && npm run build`
     - `cd frontend-writer && npm install && npm run build`
   - 修复 TypeScript build 可能暴露的问题。

2. 后端测试环境
   - 安装 dev 依赖后跑：
     - `cd backend && python -m pytest`
   - 增加 API 级测试：auth、admin、writer、billing、RAG、project flow。

3. Docker 真实启动验证
   - 创建 `.env`。
   - 运行 `docker compose -f deploy/docker-compose.yml config`。
   - 运行 `docker compose -f deploy/docker-compose.yml up --build`。
   - 检查 backend migration、bootstrap admin、demo model、两个 Nginx 入口。

4. Alembic 与模型默认值校验
   - 当前迁移手写了初始 schema，需要用真实 Postgres 跑一次。
   - 确认 SQLAlchemy default 与数据库 nullable/default 是否完全一致。
   - 若发现缺默认值，需要补迁移。

5. 中转站真实协议适配
   - 当前按 OpenAI-compatible 假设实现。
   - 需要用实际中转站返回值校验：
     - chat completion 响应结构。
     - usage 响应结构。
     - embedding 响应结构。
   - 如真实中转站有自定义 usage endpoint，需要在 `ProviderGatewayService` 补 adapter。

6. 文件上传体验
   - 后端已有 `/literature/upload`。
   - writer 向导目前主要走文本粘贴，需要补文件上传 UI。
   - PDF 抽取失败时要给用户明确提示。

7. Word 导出
   - 已完成 Markdown / LaTeX / Word(docx)。
   - docx 依赖 `python-docx`。

8. 查重
   - 已完成审校和降重改写。
   - 未接入真实查重服务。
   - 需要定义查重供应商、报告字段、扣费规则。

9. 学校模板/格式规范
   - 已完成 `school_templates` 表、admin 管理页、writer 选择模板、项目外键。
   - 已把模板规则注入：
     - 大纲 prompt。
     - 章节生成 prompt。
     - Markdown / LaTeX 导出格式说明。
   - 已在 Markdown / LaTeX / Word 导出中加入封面信息、摘要、目录提示、参考文献列表。
   - 仍需继续实现更精细的学校格式：
     - Word 样式（字体、字号、行距、页边距、标题层级）。
     - LaTeX 模板按学校切换。
     - 自动目录域更新。

10. 任务队列落地
    - 任务队列骨架已完成。
    - 当前 AI 审核、embedding、章节生成仍主要在 request 内同步执行。
    - 需要继续把以下路径迁到 Celery job：
      - 参考审核 job。
      - 大文档切块/embedding job。
      - 章节生成 job。
      - 章节审校/改写 job。
      - 导出 job。

11. 权限和入口硬化
    - 后端已有 RBAC。
    - 仍需在 Nginx/部署层确保：
      - admin 域名只服务 admin 前端。
      - writer 域名只服务 writer 前端。
      - 后端 admin API 不暴露到 writer 域名，或增加网关层限制。

12. 账务对账
    - 已有 usage、ledger、wallet。
    - 已有管理员账务正负调整接口和 UI，会写入 `WalletLedger(type="adjustment")`。
    - 已有 usage reconcile 接口和 UI：按 `provider_request_id` 回查中转站 usage，支持 dry-run 或写回 `AIUsageRecord`。
    - 仍需：
      - 中转站账单同步。
      - billing_failed 后的人工处理页面。

13. 安全与生产配置
    - 强制更换 `JWT_SECRET_KEY`。
    - CORS 按域名收紧。
    - 已有上传文件大小限制。
    - 已有上传类型白名单。
    - 已有单进程内存登录频率限制；多实例生产建议替换为 Redis 限流。
    - 密码重置策略。

14. UI 产品化
    - 当前 UI 是可联调的基础样式。
    - 仍需：
      - 更完整的 loading/error 空状态。
      - 分页。
      - 搜索过滤。
      - 表单校验。
      - 章节编辑器体验。
      - RAG chunk 人工勾选/剔除，而不是默认确认全部预览。

## 五、下一步继续执行顺序

1. 将参考审核、RAG embedding、章节生成、章节审校/改写逐步迁移到 Celery job。
2. 补中转站账单同步（按日期/账号拉外部账单汇总）。
3. 用真实 Docker + Postgres + pgvector 跑一遍迁移和完整 smoke flow。
4. 用真实 AI 中转站校验 provider adapter。
5. 前端安装 Node 后执行两个 Vite build 并修复类型问题。
6. 后端安装 dev 依赖后执行 pytest 并补 API 集成测试。
7. 生产安全收口。

# Journals RAG — 系统架构与链路文档

> 最后更新：2026-05-05  
> 本文覆盖后端、前端、数据模型、服务层、完整 API 路由表，以及每条业务链路的当前完成度。

---

## 一、项目总览

| 层级 | 目录 | 技术栈 |
|---|---|---|
| **后端** | `backend/` | Python 3.12 · FastAPI · SQLAlchemy 2 (async-compat) · Alembic · PostgreSQL + pgvector · Redis (Celery skeleton) |
| **前端-Writer** | `frontend-writer/` | React 18 · TypeScript · Vite · Ant Design 5 · TanStack React Query · React Router 6 |
| **前端-Admin** | `frontend-admin/` | 同上 |
| **部署** | `deploy/` | Docker Compose · Nginx 反向代理 |
| **辅助** | `document-reader-mcp/` | MCP 文档阅读器服务（独立） |

### 入口文件

- **后端**: `backend/app/main.py` → `create_app()` → FastAPI 实例，挂载全部 router 到 `/api` 前缀
- **Writer**: `frontend-writer/src/main.tsx` → React Router，认证后 Shell 布局 + 各页面
- **Admin**: `frontend-admin/src/main.tsx` → React Router，RequireAdmin 守卫 + Shell 布局

---

## 二、数据模型（Database Schema）

### 2.1 用户与权限

| 表 | 模型 | 说明 |
|---|---|---|
| `users` | `User` | 统一用户表，`role` ∈ {`admin`, `writer`}；`manage_all_schools` 标记超级管理；`created_by` 记录创建者 |
| `admin_school_assignments` | `AdminSchoolAssignment` | 子管理员 ↔ 学校 多对多权限表，`(admin_id, school_id)` 唯一约束 |

**认证方式**：
- Admin: 用户名 + 密码 → JWT Bearer Token
- Writer: 用户名 + 密钥（secret_key，创建时一次性展示，存 bcrypt hash）→ JWT Bearer Token

### 2.2 学校模板体系

| 表 | 模型 | 说明 |
|---|---|---|
| `schools` | `School` | 学校实体，`is_pinned` / `pinned_at` 支持置顶排序 |
| `school_template_groups` | `SchoolTemplateGroup` | 二级维度：学校 × 学位层次 × 学科 × 年份，唯一约束 |
| `template_structures` | `TemplateStructure` | 论文结构 DSL（JSON），如封面、目录、摘要、正文章节顺序 |
| `template_format_rules` | `TemplateFormatRules` | 排版格式 DSL（JSON），字体、间距、页边距、编号体系 |
| `template_citation_rules` | `TemplateCitationRules` | 引用格式 DSL（JSON + 纯文本），GB/T 7714、APA 等 |

**关系链**：`School → [SchoolTemplateGroup] → TemplateStructure + TemplateFormatRules + TemplateCitationRules`（1对1 子表）

### 2.3 项目与章节

| 表 | 模型 | 说明 |
|---|---|---|
| `projects` | `Project` | 论文项目，绑定 `user_id` + 可选 `school_id`（指向 template group）；存 `outline` JSON、`status`、`abstract` |
| `chapters` | `Chapter` | 章节，`order_index` 排序，`level`（1=章/2=节/3=小节/4=段）+ `parent_id`（自引用）支持层级大纲；`content`/`word_count`/`version`/`feedback`/`status` |

**Chapter status 状态机**：`draft → generated → pending_accept → generated/rejected → reviewed → rewritten`

### 2.4 文献与 RAG

| 表 | 模型 | 说明 |
|---|---|---|
| `literature` | `Literature` | 参考文献元数据（标题/作者/年份/DOI/摘要），`rag_status` 跟踪索引进度，`source` ∈ {`manual`, `upload`, `search`} |
| `reference_reviews` | `ReferenceReview` | AI 质量审核结果（主题相关性/结构/学术质量/总分），含通过/不通过判定 |
| `rag_documents` | `RAGDocument` | 切块文档（1 文献 → 1+ 文档），记录 text hash 去重，`chunking_status` ∈ {`draft`, `confirmed`} |
| `rag_chunks` | `RAGChunk` | 文本块，`embedding` 字段存 pgvector（1536 维），`status` ∈ {`draft`, `confirmed`} |
| `generation_rag_hits` | `GenerationRAGHit` | **溯源审计表**：记录每次章节生成使用了哪些 RAG 块，含相似度分数、generation_version、accepted 标记 |

### 2.5 计费与钱包

| 表 | 模型 | 说明 |
|---|---|---|
| `account_wallets` | `AccountWallet` | 每用户钱包：`balance_cents` / `frozen_cents` / 累计充值 / 累计消费 |
| `recharge_records` | `RechargeRecord` | 充值记录（管理员操作） |
| `wallet_ledger` | `WalletLedger` | 流水明细，type ∈ {`recharge`, `consume`, `reserve`, `release`} |
| `ai_usage_records` | `AIUsageRecord` | AI 调用明细：模型、agent、scenario、token 数、成本、状态 |

### 2.6 其他

| 表 | 模型 | 说明 |
|---|---|---|
| `model_catalog` | `ModelCatalog` | 模型目录：provider/model/endpoint_type/api_key_name/价格/允许场景 |
| `background_jobs` | `BackgroundJob` | 后台任务队列（Celery skeleton） |

---

## 三、服务层（Services）

| 服务 | 文件 | 职责 |
|---|---|---|
| `ProviderGatewayService` | `provider_gateway.py` | 统一 AI 网关适配器，支持 `openai_chat` / `openai_responses` / `gemini_generate_content` / `anthropic_messages` 四种 endpoint type；图片生成（Gemini/Seedream）；embedding 调用 |
| `LLMService` | `llm_service.py` | LLM 调用封装：预扣余额 → 调用网关 → 记录 token/cost → 结算/释放冻结，全程写 `AIUsageRecord` |
| `EmbeddingService` | `embedding_service.py` | 批量 embedding 生成，委托 `ProviderGatewayService.embed_texts()` |
| `VectorStore` | `vector_store.py` | pgvector 检索封装：cosine distance 排序，返回 `(chunk, similarity)` 对；支持按 ID 精确取块 |
| `RAGService` | `rag_service.py` | RAG 全链路：纯文本切块 → 创建 draft 文档/块 → embed → confirm 写入向量索引 |
| `BillingService` | `billing_service.py` | 钱包操作：充值、预扣(reserve)、结算(settle)、释放(cancel_reserve)、消费记录 |
| `CitationService` | `citation_service.py` | 引用格式化（规则引擎，非 LLM）：将 `[lit_xxx]` 标记替换为目标引用格式 + 生成参考文献列表 |
| `DocxService` | `docx_service.py` | DOCX 生成引擎：读取 TemplateFormatRules DSL，用 python-docx 生成排版正确的 Word 论文 |
| `LatexService` | `latex_service.py` | LaTeX 生成引擎：读取 DSL，输出 XeLaTeX 可编译 .tex 文件 |
| `GatewayBalanceService` | `gateway_balance_service.py` | AI 网关余额查询（外部 API key 额度查询） |

---

## 四、完整 API 路由表

### 4.1 认证（`/api/auth`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| POST | `/login` | 用户名+密码/密钥 → JWT | ✅ |
| GET | `/me` | 当前用户信息 | ✅ |

### 4.2 Writer 项目（`/api/projects`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/` | 列出当前用户所有项目 | ✅ |
| POST | `/` | 创建项目（绑定学校模板组） | ✅ |
| PATCH | `/{project_id}` | 更新项目标题/主题/摘要 | ✅ 新增 |
| GET | `/{project_id}/writing-readiness` | 预检：文献数量是否满足开写条件 | ✅ |
| POST | `/{project_id}/outline/generate` | LLM 生成大纲 → 创建 Chapter 记录 | ✅ |
| GET | `/{project_id}/chapters` | 列出章节（按 order_index 排序） | ✅ |
| POST | `/{project_id}/chapters` | 手动添加章节（支持 level/parent_id） | ✅ 新增 |
| DELETE | `/{project_id}/chapters/{chapter_id}` | 删除章节及其 RAG hits | ✅ 新增 |
| PUT | `/{project_id}/chapters/reorder` | 批量重排章节顺序 | ✅ 新增 |
| PATCH | `/{project_id}/chapters/{chapter_id}` | 更新章节内容/标题/状态/层级 | ✅ |
| POST | `/{project_id}/chapters/{chapter_id}/generate` | RAG 检索 + LLM 生成章节正文 | ✅ |
| POST | `/{project_id}/chapters/{chapter_id}/review` | LLM 审校章节 | ✅ |
| POST | `/{project_id}/chapters/{chapter_id}/rewrite` | LLM 降重润色 | ✅ |
| GET | `/{project_id}/chapters/{chapter_id}/rag-hits` | 查看章节使用的 RAG 块溯源 | ✅ |
| POST | `/{project_id}/chapters/{chapter_id}/accept` | 质量门：接受/拒绝生成内容 | ✅ |
| GET | `/{project_id}/export` | 导出 Markdown / LaTeX / DOCX | ✅ |
| POST | `/{project_id}/reference/review` | AI 审核参考文献质量 | ✅ |

### 4.3 Writer 文献（`/api/projects/{project_id}/literature`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/` | 列出项目文献 | ✅ |
| POST | `/` | 手动创建文献 | ✅ |
| POST | `/upload` | 文件上传文献（PDF/TXT/MD） | ✅ |
| DELETE | `/{literature_id}` | 删除文献 | ✅ |
| POST | `/relevance-check` | AI 相关性检测 | ✅ |
| POST | `/search` | 文献搜索（付费/外部 API） | ✅ |

### 4.4 Writer RAG（`/api/projects/{project_id}/rag`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| POST | `/documents/{literature_id}/chunk` | 文献切块（生成 draft 块 + 预览） | ✅ |
| POST | `/documents/{document_id}/confirm` | 确认切块 → embed → 写入向量索引 | ✅ |
| POST | `/search` | 项目向量检索 | ✅ |

### 4.5 公共（`/api/models`, `/api/school-templates`, `/api/wallet`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/models` | Writer 可见模型列表 | ✅ |
| GET | `/school-templates` | Writer 可用的学校模板组 | ✅ |
| GET | `/wallet` | 查看钱包余额 | ✅ |
| GET | `/wallet/ledger` | 钱包流水 | ✅ |

### 4.6 Admin 概览（`/api/admin/overview`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/stats` | 平台统计（用户数/项目数/调用数/收入） | ✅ |

### 4.7 Admin 用户管理（`/api/admin/users`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/` | 列出全部 writer 用户 | ✅ |
| POST | `/` | 创建 writer 账号（返回一次性密钥） | ✅ |
| PATCH | `/{user_id}` | 更新用户 nickname/is_active | ✅ |
| POST | `/{user_id}/regenerate-key` | 重新生成 writer 密钥 | ✅ 新增 |
| GET | `/admins` | 列出管理员（子账号） | ✅ |
| POST | `/admins` | 创建子管理员 | ✅ |
| PATCH | `/admins/{user_id}` | 更新子管理员 | ✅ |
| PUT | `/admins/{user_id}/schools` | 设置子管理员学校权限 | ✅ |

### 4.8 Admin 计费（`/api/admin/billing`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| POST | `/recharge` | 给用户充值 | ✅ |
| POST | `/adjust` | 调账 | ✅ |
| GET | `/recharges` | 充值记录 | ✅ |
| GET | `/ledger` | 全局流水 | ✅ |
| GET | `/ai-usage` | AI 调用记录 | ✅ |
| GET | `/gateway-balance` | 外部 AI 网关余额查询 | ✅ |

### 4.9 Admin 模型目录（`/api/admin/models`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/` | 全部模型 | ✅ |
| POST | `/` | 新增模型 | ✅ |
| PATCH | `/{model_id}` | 更新模型 | ✅ |
| DELETE | `/{model_id}` | 删除模型 | ✅ |

### 4.10 Admin 学校模板（`/api/admin/schools`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/schools` | 列出学校（置顶优先） | ✅ |
| POST | `/schools` | 创建学校 | ✅ |
| PATCH | `/schools/{id}` | 更新学校 | ✅ |
| DELETE | `/schools/{id}` | 删除学校 | ✅ |
| POST | `/schools/{id}/pin` | 置顶/取消置顶 | ✅ 新增 |
| GET | `/groups` | 模板组列表（按学校筛选） | ✅ |
| POST | `/groups` | 创建模板组 | ✅ |
| PATCH | `/groups/{id}` | 更新模板组 | ✅ |
| DELETE | `/groups/{id}` | 删除模板组 | ✅ |
| GET | `/groups/{id}/detail` | 模板组详情（含子表） | ✅ |
| PUT | `/groups/{id}/structure` | 保存结构 DSL | ✅ |
| PUT | `/groups/{id}/format-rules` | 保存格式规则 DSL | ✅ |
| PUT | `/groups/{id}/citation-rules` | 保存引用规则 DSL | ✅ |

### 4.11 后台任务（`/api/jobs`）

| 方法 | 路径 | 说明 | 完成度 |
|---|---|---|---|
| GET | `/{job_id}` | 查询任务状态 | ✅ (skeleton) |

---

## 五、前端页面清单

### 5.1 Writer 端（`:5173`）

| 路由 | 文件 | 功能 | 完成度 |
|---|---|---|---|
| `/` | `Workspace.tsx` | 工作台：项目列表 + 搜索/筛选 + 打开/创建 | ✅ |
| `/work/new` | `NewProject.tsx` | 新建论文项目：选学校模板、学位、学科、标题 | ✅ |
| `/work/:projectId` | `Wizard.tsx` | **核心写作工作台**：分屏布局（左=编辑器/文献 Tab，右=大纲树）；文献管理/上传/AI 审核/切块/确认；大纲生成/手动添加/删除/拖拽排序；章节 AI 生成/编辑/保存/审校/改写；导出 MD/LaTeX/DOCX | ✅ 重写 |
| `/wallet` | `Wallet.tsx` | 余额 + 充值记录 + 流水 | ✅ |
| `/guide` | `Guide.tsx` | 使用教程 | ✅ |
| 未登录 | `Landing.tsx` | 首页 + 登录入口 | ✅ |

### 5.2 Admin 端（`:5174`）

| 路由 | 文件 | 功能 | 完成度 |
|---|---|---|---|
| `/` | `Dashboard.tsx` | 概览面板：用户/项目/调用/收入统计 | ✅ |
| `/users` | `Users.tsx` | 代写账号管理：创建/启停/充值/调账/密钥重生成 | ✅ 更新 |
| `/billing` | `Billing.tsx` | 计费流水：充值记录 + 全局 ledger | ✅ |
| `/usage` | `Usage.tsx` | AI 调用记录查看 | ✅ |
| `/models` | `Models.tsx` | 模型目录 CRUD | ✅ |
| `/schools` | `Schools.tsx` | 学校模板管理：学校 CRUD + 置顶 + 模板组管理 | ✅ 更新 |
| `/schools/edit/:groupId` | `TemplateEditor.tsx` | 模板编辑器：结构/格式/引用三个 DSL 可视化编辑 | ✅ |
| `/members` | `Members.tsx` | 管理员子账号：创建/启停/学校权限分配 | ✅ 新增 |
| `/login` | `Login.tsx` | Admin 登录页 | ✅ |

---

## 六、核心业务链路（E2E）

### 链路 1：管理员创建 Writer + 充值

```
Admin Login → POST /api/admin/users (创建 writer, 返回一次性密钥)
           → POST /api/admin/billing/recharge (充值)
           → Writer 使用密钥登录
```
**完成度**: ✅ 完整可用，含密钥重生成

### 链路 2：管理员配置学校模板

```
Admin → POST /api/admin/schools/schools (创建学校)
     → POST /api/admin/schools/groups (创建模板组)
     → PUT .../structure + .../format-rules + .../citation-rules (三个 DSL)
     → TemplateEditor.tsx 可视化编辑所有 DSL
```
**完成度**: ✅ 完整可用，含置顶、子管理员权限隔离

### 链路 3：Writer 创建项目 → 文献管理

```
Writer → POST /api/projects (创建项目, 选模板组)
      → POST .../literature 或 .../literature/upload (添加文献)
      → POST .../literature/relevance-check (AI 相关性检测)
      → POST .../reference/review (AI 质量审核)
```
**完成度**: ✅ 完整可用

### 链路 4：RAG 切块 → 向量索引

```
Writer → POST .../rag/documents/{lit_id}/chunk (切块, 预览)
      → 前端选择/取消部分块
      → POST .../rag/documents/{doc_id}/confirm (embed + 写入 pgvector)
```
**完成度**: ✅ 完整可用

### 链路 5：大纲生成 → 章节写作

```
Writer → POST .../outline/generate (LLM 生成大纲 JSON → 创建 Chapter 记录)
      → POST .../chapters (手动添加章节, 支持层级)
      → DELETE .../chapters/{id} (删除)
      → PUT .../chapters/reorder (重排)
      → POST .../chapters/{id}/generate (RAG 检索 + LLM 生成正文)
      → POST .../chapters/{id}/accept (质量门: 接受/拒绝)
      → PATCH .../chapters/{id} (手动编辑/保存)
      → POST .../chapters/{id}/review (AI 审校)
      → POST .../chapters/{id}/rewrite (AI 降重润色)
```
**完成度**: ✅ 完整可用；层级大纲 (level/parent_id) 已支持

### 链路 6：导出

```
Writer → GET .../export?format=markdown|latex|docx
      → 后端读取 school template DSL → CitationService 格式化引用
      → DocxService / LatexService / Markdown 渲染
      → 按章节 level 生成层级标题
```
**完成度**: ✅ 完整可用，三种格式均已实现

### 链路 7：计费闭环

```
LLMService.call() 内部:
  1. 创建 AIUsageRecord (pending)
  2. 检查钱包余额
  3. reserve_balance (冻结)
  4. 调用 ProviderGatewayService
  5. 获取 token 用量（从响应或二次查询）
  6. calculate_cost_cents
  7. settle_reserved_consumption (扣款 + 释放冻结差额)
  8. 记录流水到 WalletLedger
```
**完成度**: ✅ 完整可用

---

## 七、Alembic 数据库迁移清单

| 版本 | 文件 | 内容 |
|---|---|---|
| 0001 | `0001_initial_schema.py` | 初始表结构（users, projects, chapters, literature, rag_*, billing, model_catalog 等） |
| 0002 | `0002_background_jobs.py` | background_jobs 表 |
| 0003 | `0003_school_templates.py` | school_template_groups + 三个子表 |
| 0004 | `0004_model_endpoint_type.py` | model_catalog 添加 endpoint_type |
| 0005 | `0005_model_api_key_name.py` | model_catalog 添加 api_key_name |
| 0006 | `0006_user_nickname_schools_dict.py` | user.nickname + schools 表补充 |
| 0007 | `0007_school_template_tree.py` | 学校模板三层树结构（重构） |
| 0008 | `0008_rag_traceability.py` | generation_rag_hits 溯源审计表 |
| 0009 | `0009_admin_enhancements.py` | admin_school_assignments 表 + user.manage_all_schools + school.is_pinned/pinned_at + chapter.level/parent_id |

---

## 八、已知待办 / 未完成项

| # | 事项 | 优先级 | 说明 |
|---|---|---|---|
| 1 | **前端 `npm install`** | 高 | 当前机器未安装 Node.js，前端 TS lint 全报 `Cannot find module`。代码本身无误，安装依赖即可。 |
| 2 | **`generate_outline` 设置 chapter level** | 中 | LLM 生成大纲后创建的 Chapter 全部 `level=1`（默认值）。若 LLM 返回多级大纲 JSON，需要解析并设置 `level`/`parent_id`。当前用户可在前端手动调整。 |
| 3 | **DocxService / LatexService 对 level 的处理** | 中 | 目前传入了 `level` 字段到 `ch_dicts`；Markdown 导出已使用 `#` 数量区分层级。Docx/LaTeX 服务内部是否区分层级标题样式，需要根据具体学校模板 DSL 确认。 |
| 4 | **Celery Worker 集成** | 低 | `tasks.py` / `worker.py` 是 skeleton，长耗时 AI 任务（如章节生成、审校）目前在 HTTP 请求内同步/async 完成，未走后台队列。生产环境高并发时需要迁移。 |
| 5 | **文献全文搜索（外部 API）** | 低 | `literature/search` endpoint 已实现，但依赖外部学术搜索 API 配置。 |
| 6 | **前端 E2E 测试** | 低 | 暂无自动化前端测试。 |

---

## 九、环境变量参考

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 连接串（需 pgvector 扩展） |
| `REDIS_URL` | Redis（Celery broker） |
| `JWT_SECRET_KEY` | JWT 签名密钥 |
| `AI_GATEWAY_BASE_URL` | OpenAI 兼容网关地址 |
| `AI_GATEWAY_API_KEY` | 主 API Key |
| `AI_GATEWAY_CHAT_API_KEY` | Chat 专用 Key（可选，回退到主 Key） |
| `AI_GATEWAY_NAMED_API_KEYS` | JSON 对象，按名称选 Key |
| `EMBEDDING_MODEL` | Embedding 模型名（默认 `text-embedding-3-small`） |
| `BOOTSTRAP_ADMIN_USERNAME/PASSWORD` | 首次启动自动创建管理员 |
| `BOOTSTRAP_CREATE_SCHEMA` | 启动时自动建表（开发用，生产用 Alembic） |
| `BOOTSTRAP_DEMO_MODEL` | 创建零成本演示模型行 |

---

## 十、运行与检查

```bash
# 后端编译检查
python -m compileall backend

# 后端单文件检查
python -m py_compile backend/app/api/projects.py

# Docker 一键启动
docker compose -f deploy/docker-compose.yml up

# 前端开发（需 Node.js）
cd frontend-writer && npm install && npm run dev
cd frontend-admin && npm install && npm run dev
```

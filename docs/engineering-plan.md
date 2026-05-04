# 硕博论文自动生成系统 — 工程规划

## 一、系统总览

### 1.1 核心定位

服务器部署优先的 Web 系统，AI 多 Agent 驱动。系统固定两类角色：**管理员**负责后台配置、账号、充值和运营管理；**代写用户**使用前台完成论文项目、文献审核、RAG 入库、模型选择和成文生成。

系统不做多租户隔离，所有用户属于同一平台。前台和后台需要作为两个入口部署，并通过 Nginx 拆分代理：后台入口面向管理员，前台入口面向代写用户。

### 1.2 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    前端 (React Web)                               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              代写前台 — 线性向导 (Step 1 → 6)              │  │
│  │                                                           │  │
│  │  Step1        Step2         Step3        Step4    Step5   │  │
│  │ ┌──────┐   ┌──────────┐  ┌────────┐  ┌────────┐ ┌──────┐ │  │
│  │ │新建   │ → │选学校/专业│→│确定主题 │→ │参考论文 │→│ 生成  │ │  │
│  │ │项目   │   │ /学位层次 │  │+模型选择│  │审核+RAG│ │ 大纲  │ │  │
│  │ └──────┘   └──────────┘  └────────┘  └────────┘ └──────┘ │  │
│  │                                           │               │  │
│  │                                           ↓               │  │
│  │                              Step5.5  用户审阅编辑大纲     │  │
│  │                                           │               │  │
│  │                                           ↓               │  │
│  │                          ┌──────────────────────────┐     │  │
│  │                          │  Step6  成文生成 + 可视化  │     │  │
│  │                          │  在线预览 → 下载 .docx/.tex│     │  │
│  │                          │  (按学校格式:字体/行距等)  │     │  │
│  │                          └──────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              管理端 (独立入口 /admin)                       │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │  │
│  │  │学校模板管理│  │ 用户管理  │  │ 操作日志  │                 │  │
│  │  └──────────┘  └──────────┘  └──────────┘                 │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    后端 (Python FastAPI)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 鉴权模块  │ │ 模板引擎  │ │ Agent调度 │ │ PDF解析  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                    数据层 (PostgreSQL + pgvector + 文件存储)      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ 论文项目  │ │ 文献PDF  │ │ 学校模板  │ │ 用户账户  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                    外部服务（按需联网）                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ AI中转站 │ │ Google检索│ │ 查重服务  │ │ 翻译服务  │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 二、技术选型

### 2.1 前端技术栈

| 层 | 技术 | 选型理由 |
| --- | --- | --- |
| **前端形态** | React Web + TypeScript | 直接面向服务器部署，不再考虑本地桌面优先 |
| **构建工具** | Vite | 开发启动快，适合拆分前台与后台两个构建入口 |
| **前端应用** | `frontend-admin` + `frontend-writer` | 管理员后台和代写前台分离，便于 Nginx 拆分入口、权限隔离和独立发版 |
| **路由** | React Router | 后台 `/admin/*`，前台 `/app/*` 或独立域名根路径 |
| **UI 组件** | Tailwind CSS + shadcn/ui + Radix UI | 快速搭建一致的表单、弹窗、导航、表格和管理端页面 |
| **状态管理** | Zustand + TanStack Query | Zustand 管前端向导状态；TanStack Query 管 API 缓存、轮询和异步任务状态 |
| **表单校验** | React Hook Form + Zod | 模板配置、用户管理、登录表单都需要强校验和类型推导 |
| **富文本/大纲编辑** | TipTap(ProseMirror) + dnd-kit | 支持章节树拖拽、段落编辑、批注、后续人工调整 RAG chunk |
| **PDF/文档预览** | PDF.js/react-pdf + Markdown renderer + CSS print preview | 文献预览、学校格式预览、论文 A4 分页模拟 |
| **前端测试** | Vitest + React Testing Library + Playwright | 组件单测和关键向导流程端到端验证 |

### 2.2 后端技术栈

| 层 | 技术 | 选型理由 |
| --- | --- | --- |
| **API 服务** | Python FastAPI + Uvicorn | AI、统计、文档处理生态最好，异步接口和 OpenAPI 生成方便 |
| **数据模型** | Pydantic v2 | API 入参/出参、Agent 状态、RAG chunk schema 统一校验 |
| **ORM/迁移** | SQLAlchemy 2.x + Alembic | 直接以 PostgreSQL 为主库设计，迁移和索引管理清晰 |
| **鉴权与权限** | JWT + bcrypt/passlib + RBAC | 固定 `admin` 和 `writer` 两类角色，后台/前台入口分别拦截 |
| **数据库** | PostgreSQL | 服务器部署必选，支撑账号、项目、余额、流水、任务状态和运营后台 |
| **向量库** | PostgreSQL + pgvector | RAG 向量和业务数据放在同一数据库，便于按项目/用户过滤、备份和审计 |
| **缓存/任务队列** | Redis + Celery/RQ | AI 调用、PDF 解析、RAG 切割、向量入库和扣费都需要异步任务与状态查询 |
| **文件存储** | 服务器文件存储或对象存储（MinIO/S3 兼容） | PDF、导出文档、图表、LaTeX 资源统一保存，路径绑定 `user_id/project_id` |
| **Embedding** | EmbeddingProvider 抽象 | 可接入 AI 中转站或自有 embedding 服务，费用进入统一计费链路 |
| **AI中转站** | ProviderGatewayService | 所有模型调用走统一中转站 API，调用后查询 token 消耗并回写计费系统 |
| **LLM 编排** | LangGraph + 轻量 LangChain adapter | 状态机、人工确认节点、失败恢复和多 Agent 串联 |
| **异步任务** | Celery/RQ + Redis | PDF 解析、AI 切割、向量入库、长文生成、token 查询和扣费都需要可靠任务 |
| **文档生成** | python-docx + Jinja2(LaTeX) + XeLaTeX 可选 | Word 和 LaTeX 双输出 |
| **数据分析** | pandas + scipy + statsmodels + matplotlib/seaborn | SPSS/Stata 平替，图表和统计解释链路完整 |
| **文献解析/检索** | PyMuPDF/pdfplumber + Semantic Scholar API + Google Custom Search | PDF 全文提取、表格提取和联网检索组合 |
| **查重** | scikit-learn TF-IDF + 向量相似度 + 可选联网检索 | 先在项目文献库内查重，联网查重作为增强能力 |
| **后端测试** | pytest + httpx + pytest-asyncio | API、Service、Agent 节点和 RAG 入库流程测试 |

### 2.3 部署入口

前台和后台需要走两个 Nginx 代理入口，避免管理员能力暴露在代写前台导航中。

```nginx
# 后台入口：admin.example.com → frontend-admin + /api/admin/*
# 前台入口：app.example.com   → frontend-writer + /api/*
```

后端可以是同一个 FastAPI 服务，通过路由前缀和 RBAC 控制权限；前端建议拆成两个构建产物，分别部署到不同静态目录。

## 三、模块设计

### 3.0 用户角色、余额与权限

系统固定两种角色，同一后端服务、两个前端入口：

```
┌─────────────────────────────────────────────────────────┐
│                      登录页                              │
│         用户名 + 密码 → 鉴权 → 按角色进入对应入口          │
└────────────────────────┬────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
    ┌─────────────────┐   ┌─────────────────┐
    │   管理员 (admin)  │   │   代写 (writer)  │
    │                 │   │                 │
    │ • 学校模板CRUD   │   │ • 论文项目管理    │
    │ • PDF上传解析    │   │ • 文献检索/管理   │
    │ • 模板版本管理   │   │ • Agent写作工作台 │
    │ • 用户账号管理   │   │ • 数据分析       │
    │ • 账户充值       │   │ • 余额消费       │
    │ • 模型价格维护   │   │ • 自选模型       │
    │ • 操作日志查看   │   │ • 查重降重       │
    │ • 学科知识图谱   │   │ • 导出Word/LaTeX │
    └─────────────────┘   └─────────────────┘
```

| 角色 | 入口 | 可见页面 | 核心职责 |
| --- | --- | --- | --- |
| **admin** | 后台入口 | 学校模板、用户管理、充值、模型价格、操作日志、知识图谱配置 | 维护系统配置，给代写账号充值，查看消费和调用日志 |
| **writer** | 前台入口 | 项目列表、写作工作台、文献管理、模型选择、余额流水、数据分析、导出 | 完成论文生成流程，并按模型实际消耗扣费 |

**鉴权方式**：JWT token + RBAC。管理员可创建 `writer` 账号、重置密码、启用/禁用账号、人工充值；代写用户只能访问自己的项目、文献、余额和消费记录。

#### 3.0.1 充值与扣费闭环

充值不接第三方支付，先由管理员在后台给指定代写账号人工充值。AI 调用扣费走平台内部账本：

```
管理员后台充值
      ↓
写入 recharge_records + account_wallets
      ↓
代写用户选择模型并发起 AI 任务
      ↓
ProviderGateway 调用 AI 中转站
      ↓
任务结束后调用中转站 token usage API
      ↓
BillingService 按模型价格计算费用
      ↓
写入 ai_usage_records + wallet_ledger，并扣减余额
```

规则：

- 余额采用整数最小货币单位存储，如 `balance_cents`，避免浮点误差。
- 每次 AI 调用必须记录 `model_id`、`provider_request_id`、输入/输出 token、单价、扣费金额和调用状态。
- 余额不足时禁止发起新的付费 AI 任务；长任务可先做预估冻结额度，完成后按实际 token 多退少补。
- 管理员可以查看每个账号的充值记录、消费流水、模型使用统计和失败补偿记录。

#### 3.0.2 代写用户自选模型

平台维护模型目录，代写用户在关键 Agent 调用前选择模型。模型选择不仅影响质量，也影响扣费。

- 管理员后台维护模型：展示名、供应商、中转站模型编码、上下文长度、输入单价、输出单价、是否启用、适用场景。
- 前台按 Agent 场景筛选模型，例如“参考论文质量审核”“RAG 切割”“生成大纲”“章节写作”“审校降重”。
- 项目可设置默认模型，也允许在单次任务前覆盖。
- 所有模型调用都走 `ProviderGatewayService`，不在业务代码里直接写死模型供应商。

### 3.1 项目管理模块

```
Project
├── project_id          UUID
├── user_id             UUID
├── school_id           FK → SchoolTemplate
├── degree_level        enum: bachelor | master | doctor
├── discipline          enum: art | philosophy | history | journalism | management | economics
├── title               str
├── abstract            str
├── outline             JSON (章节树)
├── status              enum: planning | writing | reviewing | done
├── created_at
├── updated_at
└── word_count          int
```

### 3.2 学校模板知识库

每一所学校 = 一份结构化配置文件，包含该校学位论文的全部规范。

```
SchoolTemplate
├── school_id           UUID
├── name                str          # 学校名（中/英/本地语）
├── country             enum: MY | TH | MO | KR
├── language            str          # 默认撰写语言
├── page_config         JSON         # 纸张大小、页边距
├── font_config         JSON         # 中英文字体、字号层级
├── line_spacing        float        # 行距
├── chapter_structure   JSON         # 必选/可选章节树
├── citation_style      enum: APA | Harvard | Chicago | GB7714 | MLA
├── word_count_min      JSON         # {"bachelor": 100000, "master": 200000, "doctor": 300000}
├── format_example_url  str          # 学校官方格式样例链接
├── school_website      str          # 学校研究生院/教务处官网
└── last_verified       datetime     # 最后验证时间
```

**模板采集方式**：

1. 手动录入 — 系统内置已知学校的格式模板
2. 用户自定义 — 用户上传学校格式手册PDF，Agent自动解析为结构化配置
3. 联网抓取 — Agent访问学校官网，自动提取论文格式要求

### 3.2 补充：学校格式配置JSON结构示例

```json
{
  "page": { "size": "A4", "margin_top": 2.5, "margin_bottom": 2.5, "margin_left": 3.0, "margin_right": 2.5 },
  "font": {
    "title": { "family": "SimHei", "size": 16, "bold": true },
    "heading1": { "family": "SimHei", "size": 14, "bold": true },
    "heading2": { "family": "SimHei", "size": 13, "bold": true },
    "body": { "family": "SimSun", "size": 12 },
    "body_en": { "family": "Times New Roman", "size": 12 },
    "caption": { "family": "SimHei", "size": 10.5 }
  },
  "chapters": {
    "required": ["声明", "中文摘要", "英文摘要", "目录", "绪论", "文献综述", "研究方法", "正文", "结论", "参考文献", "致谢"],
    "optional": ["附录", "攻读学位期间发表的学术论文"]
  },
  "table_format": "三线表",
  "citation": "GB7714-2015",
  "page_number": { "position": "bottom_center", "format": "arabic" }
}
```

### 3.3 文献管理与参考论文质量审核

**主路径：先确定论文主题，再上传一份“标准参考论文/高质量参考文献”做质量门槛审核，审核通过后才允许批量文献进入 RAG。联网检索为补充能力。**

```
LiteratureManager
├── 标准参考论文审核（RAG前置门槛）
│   ├── 用户先填写论文主题、学校、专业、学位层次
│   ├── 上传 1 份对应方向的标准参考论文/高质量参考文献
│   ├── 用户选择审核模型（模型目录中启用 quality_review 场景的模型）
│   ├── AI 判断:
│   │   ├── 是否与论文主题相关
│   │   ├── 是否符合类似学位论文/学术论文形式
│   │   ├── 结构是否完整（摘要、引言、综述、方法、分析、结论、参考文献等）
│   │   ├── 学术质量是否足够作为写作和RAG标准
│   │   └── 是否存在明显低质量、拼凑、广告、非论文文本
│   ├── 输出质量评分、问题清单、是否通过
│   └── 未通过时禁止进入 RAG 入库，要求用户重新上传
│
├── PDF 上传与解析
│   ├── 拖拽/选择上传 → 存入文件存储 (uploads/{user_id}/{project_id}/literature/)
│   ├── PyMuPDF 提取全文文本
│   ├── LLM 自动提取元数据:
│   │   ├── 标题、作者、年份、期刊/会议
│   │   ├── DOI、摘要、关键词
│   │   └── 生成 BibTeX citation key
│   └── 解析结果回填表单，用户可修正
│
├── RAG 入库（AI辅助切割 + 人工确认）
│   ├── 文本清洗：页眉页脚、目录噪声、参考文献区段标记
│   ├── AI 预切割：按语义边界、章节标题、段落主题生成 chunk 建议
│   ├── 元数据标注：user_id、project_id、literature_id、页码、章节、关键词、引用信息
│   ├── 人工确认：用户可拆分、合并、删除、改标题、改标签、调整 chunk 顺序
│   ├── 确认后 embedding：仅 confirmed chunk 写入 PostgreSQL pgvector
│   └── 版本追踪：原文 hash + chunk version，用户修改后重新 embedding
│
├── 文件夹分类
│   ├── 用户在 Step 4 界面中新建文件夹
│   │   (如「理论框架」「实证研究」「方法论」「政策背景」)
│   ├── PDF 拖入对应文件夹
│   ├── 文件夹可重命名、删除、嵌套
│   └── 同一 PDF 可标记多个分类标签
│
├── 文献列表
│   ├── 表格/卡片视图切换
│   ├── 按文件夹筛选、按标题/作者搜索
│   ├── 单篇文献详情 (元数据 + 全文预览)
│   └── 删除 / 移动到其他文件夹
│
├── 联网检索 (补充，Google)
│   ├── Google Scholar → 标题、作者、引用数、摘要
│   ├── Semantic Scholar API → 免费学术API，有引用图谱
│   ├── 检索结果 → 勾选 → 自动下载PDF (如有) → 加入文献库
│   └── 速率控制: 请求间隔≥3s，失败重试+指数退避
│
└── 大纲匹配
    └── 选题Agent在 Step5 生成大纲时，自动将文献匹配到对应章节
        (基于文献摘要 vs 章节主题的语义相似度)
```

**Google检索的实现方案对比**：

| 方案                     | 优点                       | 缺点                       | 推荐场景       |
| ------------------------ | -------------------------- | -------------------------- | -------------- |
| scholarly (Python库)     | 免费，直接调Google Scholar | 可能被限流，需代理         | 小批量文献检索 |
| Google Custom Search API | 官方API，稳定              | 每日100次免费，付费$5/千次 | 正式使用       |
| Semantic Scholar API     | 完全免费，无速率限制       | 覆盖面不如Google           | 首选学术检索   |
| SerpAPI / ScraperAPI     | 稳定，自动处理代理         | 付费($50+/月)              | 生产环境备选   |

**推荐策略**：Semantic Scholar(主力) + Google Custom Search(补充) + scholarly(兜底)

### 3.4 写作Agent调度

使用LangGraph构建有状态的多Agent流水线：

```
                    ┌─────────────┐
                    │  用户输入    │
                    │ (专业+idea)  │
                    └──────┬──────┘
                           ↓
              ┌────────────────────────┐
              │  Orchestrator (主控)    │
              │  管理状态图，协调各Agent  │
              └───────────┬────────────┘
                          ↓
    ┌─────────────────────────────────────────────┐
    ┌──────────────────────────────────────────────────┐
    │                                                 │
    ↓        ↓               ↓               ↓               ↓
┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│选题Agent│ │ 文献Agent │ │ 写作Agent │ │ 数据Agent │ │ 图表Agent │
│        │ │          │ │          │ │          │ │          │
│开题报告 │ │ 文献综述  │ │ 逐章撰写  │ │ 统计计算  │ │ Python    │
│大纲生成 │ │ 文献匹配  │ │ 表格/引用 │ │ 数据生成  │ │ 图表代码  │
└────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
    │            │              │              │              │
    └───────────────┴──────────────┴──────────────┘
                          ↓
    ┌──────────────────────────────────────────────────┐
    │     审校Agent + 引用Service + 排版引擎              │
    │  查重 / 降重 / 一致性 / 引用格式化 / 图表嵌入       │
    └──────────────────────────────────────────────────┘
                          ↓
    ┌──────────────────────────────────────────────────┐
    │  最终输出: .docx / .tex                           │
    │  含图表 + 参考文献列表 + 学校格式渲染              │
    └──────────────────────────────────────────────────┘
```

**LangGraph状态机设计**：

```python
class ThesisState(TypedDict):
    project_id: str
    school_config: dict          # 当前学校的格式配置
    discipline: str              # 学科
    degree_level: str            # 学位层次
    word_count_target: int
    research_idea: str           # 用户研究思路
    outline: list[dict]          # 大纲
    chapters: dict[str, str]     # {chapter_id: markdown_content}
    chapter_summaries: dict[str, str]  # 摘要接力
    literature: list[dict]       # 文献列表
    figures: list[dict]          # [{id, chapter_id, type, title, code, path}]
    tables: list[dict]           # [{id, chapter_id, title, data_json, markdown}]
    analysis_results: dict       # 数据分析结果
    plagiarism_report: dict
    citation_errors: list[dict]
    current_stage: str
    feedback: list[dict]
    error: str | None
```

### 3.5 数据分析模块

```
DataAnalysisService
├── 文科路径（质性分析）
│   ├── 访谈文本编码 → 主题聚类 → 理论构建
│   ├── 田野调查笔记 → 结构化提取 → 模式识别
│   └── 历史文本 → 史料比对 → 证据链构建
│
├── 社科路径（量化分析）
│   ├── 量表生成引擎
│   │   ├── 维度定义 → 题项生成 → 专家审核Prompt
│   │   └── 输出: 结构化量表JSON
│   ├── 模拟数据生成
│   │   ├── 基于假设施加效应量
│   │   ├── 正态分布采样 + 噪声
│   │   └── 输出: CSV文件
│   └── 统计计算（pandas + scipy + statsmodels）
│       ├── 描述统计
│       ├── 信度 Cronbach's α
│       ├── 效度 KMO + Bartlett
│       ├── 相关分析 Pearson/Spearman
│       ├── t检验 / 方差分析
│       ├── 线性回归 / 多元回归
│       ├── 中介效应 Bootstrap
│       ├── 调节效应 交互项
│       └── 输出: APA格式统计表格 + 解读文字
│
└── 输出 (对接图表Agent和写作Agent)
    ├── structured_tables.json   # 结构化表格数据 (供写作Agent引用)
    │   ├── table_id, title, headers, rows, footnote
    │   └── 示例: {"id": "tab_5_1", "title": "表5-1 样本描述统计 (N=384)",
    │        "headers": ["变量", "M", "SD", "Min", "Max"],
    │        "rows": [["工作满意度", 3.82, 0.75, 1.0, 5.0], ...]}
    ├── chart_inputs.json        # 图表生成指令 (供图表Agent)
    │   ├── chart_type, title, data, style
    │   └── 示例: {"chart_type": "scatter_plot", "title": "图5-1 回归分析",
    │        "data": {"x": [...], "y": [...]}, "style": "spss"}
    └── interpretation.md        # 统计结果的文字解读 (供写作Agent嵌入)
```
```

### 3.6 查重与降重模块

```
PlagiarismCheck
├── 本地查重（离线）
│   ├── 分句 → TF-IDF向量 → 余弦相似度
│   ├── 与本地文献库对比
│   └── 标注重复段落 + 相似度百分比
├── 联网查重（可选）
│   ├── Google片段检索 → 比对
│   └── 知网/万方API（待接入）
├── AI降重
│   ├── 同义替换 + 句式变换
│   ├── 语序调整 + 主动/被动转换
│   ├── 保持学术语气不降级
│   └── 降重后 → 再次查重验证
└── 输出: 查重报告 + 降重版论文
```

### 3.7 在线预览 & 输出渲染模块

**Step6 成文后，论文在前端实时可视化，按学校格式渲染。用户确认后才下载。**

```
OnlinePreview (前端)
├── 渲染引擎: 将 Markdown 内容 → 按学校模板CSS实时渲染
│   ├── 字体族 (中文SimSun/SimHei, 英文Times New Roman)
│   ├── 字号层级 (标题16pt/14pt/13pt, 正文12pt, 脚注10pt)
│   ├── 行距 (1.5倍 / 固定值22pt)
│   ├── 页边距模拟 (A4比例预览)
│   ├── 三线表渲染
│   └── 页眉页脚 / 页码
├── 分页预览 (模拟A4纸张，可滚动翻页)
├── 目录导航 (侧边栏点击跳转)
└── 确认无误 → 触发下载

DownloadEngine (后端)
├── 引用格式化 (前置步骤)
│   ├── citeproc-py + CSL 样式文件 (APA 7th / Harvard / GB7714-2015 / Chicago)
│   ├── 正文引用标记 [lit_001] → 目标格式 (如 "(张三, 2023)" 或 "[1]")
│   ├── 自动生成参考文献列表 (按样式排序: 字母序 / 出现序)
│   └── 引用一致性校验 (正文引用↔文献列表 双向比对)
│
├── 图表嵌入 (前置步骤)
│   ├── 图表Agent 生成的 PNG/PDF → 嵌入文档对应位置
│   ├── Mermaid 概念图 → 渲染为 PNG → 嵌入
│   └── 自动编排图表编号和目录索引
│
├── Word (.docx)
│   ├── python-docx 按学校模板生成
│   ├── 字体/行距/页边距 按学校配置
│   ├── 三线表样式自动应用
│   ├── 自动生成: 目录(TOC字段) / 图表索引
│   ├── 参考文献格式化
│   └── 封面 + 声明页
│
├── LaTeX (.tex)
│   ├── Jinja2模板渲染
│   ├── documentclass / geometry / font / booktabs 按学校配置
│   ├── BibTeX引用管理
│   └── 支持XeLaTeX编译 (中文支持)
│
└── 课程PPT (博士专用)
    ├── python-pptx 生成
    └── 自动提取论文关键页面
```

### 3.8 后台管理模块

**定位**：管理员专用，负责维护学校模板库、代写账号、充值、模型目录、价格和调用日志。

```
AdminModule
├── 登录与鉴权
│   ├── 默认 admin 账号首次启动自动创建
│   ├── 密码本地 bcrypt 哈希存储
│   └── JWT token + 角色中间件拦截
│
├── 学校模板管理（核心）
│   ├── 模板列表 (按国家/学校名筛选和搜索)
│   ├── 手动录入
│   │   ├── 表单填写: 学校名、国家、学位层次
│   │   ├── 格式配置: 页边距、字体、行距、章节结构（可视化编辑）
│   │   └── 实时预览
│   ├── PDF上传解析
│   │   ├── 上传学校格式手册 PDF
│   │   ├── PDF → 文本提取 (PyMuPDF / pdfplumber)
│   │   ├── LLM 提取结构化字段 → JSON
│   │   ├── 人工校验 + 修正后保存
│   │   └── 原始 PDF 存档备查
│   ├── 模板版本
│   │   ├── 每次修改记录版本号
│   │   ├── 回滚到历史版本
│   │   └── 模板状态: draft | published | deprecated
│   ├── 复制模板
│   │   └── 基于已有模板快速创建类似学校
│   └── 导出/导入
│       └── JSON 格式导出备份，支持跨设备迁移
│
├── 用户管理
│   ├── 用户列表 (搜索、按角色筛选)
│   ├── 创建代写账号
│   │   ├── 用户名、初始密码
│   │   └── 批量导入 (CSV)
│   ├── 编辑用户 (重置密码、修改角色)
│   ├── 启用/禁用账号
│   └── 查看账号余额、充值记录和消费流水
│
├── 充值与计费
│   ├── 给指定代写账号人工充值
│   ├── 充值备注和管理员操作留痕
│   ├── 查看 AI 调用扣费流水
│   ├── 失败任务退款/补偿
│   └── 导出账单
│
├── 模型目录与价格
│   ├── 模型列表：展示名、中转站模型编码、上下文长度、启用状态
│   ├── 价格配置：输入 token 单价、输出 token 单价、倍率
│   ├── 场景配置：quality_review / chunking / outline / writing / review
│   └── 前台展示：按价格和适用场景给代写用户选择
│
├── 知识图谱配置
│   ├── 专业 → 研究方向 → 技能 的映射维护
│   ├── 研究方法模板库 (文科质性 / 社科量化)
│   └── 引用格式规则 (APA / Harvard / GB7714 参数)
│
└── 操作日志
    ├── 查看管理员操作记录 (谁在什么时间做了什么)
    ├── 按时间/操作人/操作类型筛选
    └── 日志保留策略: 默认90天
```

**后台页面结构**：

```
/admin                          # 管理端入口
├── /admin/login                # 独立登录页
├── /admin/dashboard            # 概览 (模板数、用户数、近期操作)
├── /admin/schools              # 学校模板列表
│   ├── /admin/schools/new      # 手动新建
│   └── /admin/schools/{id}     # 编辑/查看详情
│       ├── /admin/schools/{id}/versions  # 版本历史
│       └── /admin/schools/{id}/import    # PDF导入解析
├── /admin/users                # 用户管理
│   ├── /admin/users/new        # 创建用户
│   └── /admin/users/{id}       # 编辑用户
├── /admin/billing              # 充值、余额、消费流水
│   ├── /admin/billing/recharge # 给代写账号充值
│   └── /admin/billing/usage    # AI调用扣费记录
├── /admin/models               # 模型目录和价格配置
├── /admin/knowledge            # 知识图谱配置
└── /admin/logs                 # 操作日志
```

**PDF解析流程**：

```
用户上传PDF格式手册
       ↓
PyMuPDF 提取文本 + 表格
       ↓
分段 → LLM逐段提取字段:
  • 页边距: 上下左右各多少cm
  • 字体: 正文/标题/注释分别的字体和字号
  • 行距: 固定值还是倍数
  • 章节: 必选/可选章节列表
  • 引用格式: APA/Harvard/...
       ↓
结构化 JSON → 回填表单
       ↓
管理员校验 + 修正 → 保存 → 发布
```

## 四、用户旅程（代写前台核心流程）

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1           Step 2           Step 3           Step 4           │
│ 新建项目         选学校/专业       确定论文主题      上传标准参考论文   │
│                 /学位层次                                            │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 4.5                     Step 5                     Step 5.5    │
│ 批量文献入库 + RAG确认         生成大纲                   审阅编辑大纲  │
│ (AI切割+人工确认)              (选题+文献Agent)            用户确认     │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 6                                                            │
│ 选择模型 → 成文生成 → 在线可视化预览 → 下载 .docx / .tex           │
└─────────────────────────────────────────────────────────────────────┘
```

### Step 1: 新建项目

- 输入项目名称（如「马来亚大学管理学硕士论文」）
- 系统创建项目记录，进入 Step 2

### Step 2: 选择学校 / 专业 / 学位层次

- **学校**：下拉选择（数据来源：admin 发布的学校模板），支持搜索
- **专业**：选择后自动匹配研究方法技能（知识图谱）
- **学位层次**：本科 / 硕士 / 博士 → 确定字数和理论深度基准
- 选择完毕 → 系统加载该校的格式配置（页边距、字体、章节结构等），进入 Step 3

### Step 3: 确定论文主题

- 自由文本框，用户描述研究问题、研究方向、初步假设等
- 非结构化输入，给参考论文质量审核、选题Agent提供原始素材
- 进入 Step 4

### Step 4: 上传标准参考论文并审核

- 用户必须先上传 1 份对应主题的标准参考论文/高质量参考文献
- 用户从可用模型列表中选择“参考论文质量审核模型”
- AI 检查该参考论文是否与主题相关、结构是否像合格学位论文/学术论文、质量是否足够作为 RAG 和写作标准
- 审核通过后进入批量文献上传；未通过则要求用户重新上传

### Step 4.5: 上传文献 PDF + RAG 确认

- **文件夹分类**：用户可新建文件夹（如「理论框架」「实证研究」「方法论」），将 PDF 拖入对应文件夹
- PDF 上传后：
  - 系统自动提取文本 (PyMuPDF)
  - LLM 提取元数据：标题、作者、年份、摘要 → 存入文献库
  - 生成 BibTeX key
- RAG 入库前必须经过确认：
  - AI 根据语义边界、页码、标题层级生成 chunk 建议
  - 前端展示「原文片段 + chunk 卡片」，用户可拆分、合并、删除和改标签
  - 用户点击确认后才生成 embedding 并写入 PostgreSQL pgvector
- 文献列表可视化，支持增删改、移动文件夹
- 进入 Step 5

### Step 5: 生成大纲

- 用户点击「生成大纲」
- 系统调用选题Agent + 文献Agent：
  - 选题Agent：综合学校模板的章节结构 + 用户研究思路 → 生成论文大纲（含每章预计字数）
  - 文献Agent：将上传的文献匹配到对应章节
- 返回结构化大纲树

### Step 5.5: 审阅 & 编辑大纲

- 大纲以树形结构展示（可展开/折叠）
- 用户可：
  - **增**：添加章节/子章节
  - **删**：删除不需要的章节
  - **改**：编辑章节标题、调整顺序（拖拽）、修改字数分配
  - **确认**：锁定大纲，进入成文阶段
- 大纲确认后可回退修改（但成文后的章节需重新生成）

### Step 6: 生成成文

- 用户可为写作Agent选择模型；系统展示模型价格、上下文长度和推荐场景
- 发起生成前检查账号余额，余额不足则提示联系管理员充值
- 用户点击「开始生成」
- 写作Agent按大纲逐章生成，每章完成后：
  - 推送到可视化预览区（所见即所得）
  - 用户可实时查看生成进度
- 每次 AI 调用完成后查询中转站 token 消耗并扣费
- **全篇生成完成**后进入可视化预览页

### Step 6 续: 可视化 & 下载

- **预览区**：展示完整论文，按学校格式实时渲染（字体、行距、页边距、三线表等）
- 用户可做最终检查
- **下载**：
  - 下载 Word (.docx)：python-docx 按学校模板渲染
  - 下载 LaTeX (.tex)：Jinja2 模板渲染，支持 XeLaTeX 编译
  - 下载时自动应用学校配置：字体族、字号层级、行距、页边距、章节标题格式、引用格式

### 用户反馈闭环（成文后）

```
用户在预览区标注某段落需修改
        ↓
审校Agent分析影响范围
        ├── 仅当前段落 → 直接重新生成该段落
        ├── 影响同章其他节 → 列出受影响部分 → 用户确认 → 批量重写
        └── 影响核心论点 → 回退到 Step 5.5（大纲编辑） → 调整后重新生成
```

## 五、数据库设计

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════ 用户与鉴权 ═══════════════

-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,        -- bcrypt
    role TEXT NOT NULL DEFAULT 'writer', -- admin | writer
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id), -- 创建者 (admin) 的 user_id
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 账户余额
CREATE TABLE account_wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    balance_cents BIGINT NOT NULL DEFAULT 0,
    frozen_cents BIGINT NOT NULL DEFAULT 0,
    total_recharged_cents BIGINT NOT NULL DEFAULT 0,
    total_consumed_cents BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 管理员人工充值记录
CREATE TABLE recharge_records (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    admin_id UUID NOT NULL REFERENCES users(id),
    amount_cents BIGINT NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 钱包流水：充值、扣费、冻结、解冻、退款
CREATE TABLE wallet_ledger (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,                  -- recharge | freeze | unfreeze | consume | refund | adjust
    amount_cents BIGINT NOT NULL,
    balance_after_cents BIGINT NOT NULL,
    related_usage_id UUID,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 模型目录和价格
CREATE TABLE model_catalog (
    id UUID PRIMARY KEY,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,              -- ai_gateway | openai | anthropic | ...
    provider_model TEXT NOT NULL,        -- 中转站模型编码
    context_window INTEGER,
    input_price_per_1k_cents BIGINT NOT NULL,
    output_price_per_1k_cents BIGINT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    allowed_scenarios JSONB,             -- ["quality_review", "chunking", "outline", "writing", "review"]
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AI 调用与扣费记录
CREATE TABLE ai_usage_records (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID,
    model_id UUID REFERENCES model_catalog(id),
    agent_name TEXT NOT NULL,
    scenario TEXT NOT NULL,              -- quality_review | chunking | outline | writing | review | embedding
    provider_request_id TEXT,            -- 中转站返回的请求ID
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_cents BIGINT DEFAULT 0,
    status TEXT DEFAULT 'pending',       -- pending | succeeded | failed | refunded
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- 操作日志
CREATE TABLE operation_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,               -- create_school | update_school | delete_school | create_user | ...
    target_type TEXT,                   -- school_template | user | knowledge_graph
    target_id TEXT,                     -- 操作对象ID
    detail TEXT,                        -- 变更摘要 (JSON)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════ 学校模板 ═══════════════

CREATE TABLE school_templates (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,              -- MY | TH | MO | KR
    language TEXT DEFAULT 'zh',
    page_config JSON,
    font_config JSON,
    line_spacing REAL,
    chapter_structure JSON,
    citation_style TEXT,
    word_count_min JSON,
    status TEXT DEFAULT 'draft',        -- draft | published | deprecated
    version INTEGER DEFAULT 1,
    source_pdf_path TEXT,               -- 原始PDF存档路径
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 模板版本历史
CREATE TABLE school_template_versions (
    id UUID PRIMARY KEY,
    template_id UUID REFERENCES school_templates(id),
    version INTEGER NOT NULL,
    config_snapshot JSON NOT NULL,      -- 该版本的完整配置快照
    change_note TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════ 论文项目 ═══════════════

-- 论文项目
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    school_id UUID REFERENCES school_templates(id),
    degree_level TEXT NOT NULL,     -- bachelor | master | doctor
    discipline TEXT NOT NULL,
    title TEXT,
    abstract TEXT,
    topic TEXT,
    default_model_id UUID REFERENCES model_catalog(id),
    outline JSON,                   -- 章节树 [{id, title, word_count_target, status}]
    status TEXT DEFAULT 'planning', -- planning | writing | reviewing | done
    word_count_total INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 章节内容
CREATE TABLE chapters (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title TEXT NOT NULL,
    order_index INTEGER,
    content TEXT,                   -- Markdown格式
    word_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',    -- draft | review | approved
    feedback TEXT,                  -- 用户反馈
    version INTEGER DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 文献库
CREATE TABLE literature (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    title TEXT NOT NULL,
    authors TEXT,
    year INTEGER,
    journal TEXT,
    doi TEXT,
    abstract TEXT,
    citation_key TEXT,              -- BibTeX key
    file_path TEXT,
    source TEXT,                    -- google_scholar | semantic_scholar | manual
    folder TEXT,                    -- 用户分类文件夹
    rag_status TEXT DEFAULT 'pending', -- pending | chunking | needs_review | indexed | failed
    is_cited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 标准参考论文审核
CREATE TABLE reference_reviews (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id),
    user_id UUID NOT NULL REFERENCES users(id),
    literature_id UUID REFERENCES literature(id),
    model_id UUID REFERENCES model_catalog(id),
    topic_relevance_score INTEGER,
    structure_score INTEGER,
    academic_quality_score INTEGER,
    overall_score INTEGER,
    passed BOOLEAN DEFAULT FALSE,
    issues JSONB,
    report TEXT,
    usage_record_id UUID REFERENCES ai_usage_records(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAG 文档入库任务
CREATE TABLE rag_documents (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    literature_id UUID REFERENCES literature(id),
    source_type TEXT NOT NULL,          -- literature_pdf | school_manual | user_note
    source_path TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    chunking_status TEXT DEFAULT 'draft', -- draft | ai_chunked | confirmed | indexed | failed
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RAG chunk 元数据和向量；向量本体存入 PostgreSQL pgvector
CREATE TABLE rag_chunks (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES rag_documents(id),
    project_id UUID REFERENCES projects(id),
    literature_id UUID REFERENCES literature(id),
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536),             -- pgvector，实际维度按 embedding 模型配置
    title TEXT,
    page_start INTEGER,
    page_end INTEGER,
    token_count INTEGER,
    keywords JSON,
    status TEXT DEFAULT 'draft',        -- draft | confirmed | embedded | archived
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 引用映射（文献 ↔ 章节段落）
CREATE TABLE citation_map (
    id UUID PRIMARY KEY,
    literature_id UUID REFERENCES literature(id),
    chapter_id UUID REFERENCES chapters(id),
    paragraph_index INTEGER,
    context TEXT                    -- 引用该文献的段落摘要
);

-- 数据分析结果
CREATE TABLE analysis_results (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    analysis_type TEXT,             -- descriptive | reliability | correlation | regression | ...
    input_data_path TEXT,           -- 本地CSV路径
    output_tables JSON,             -- 结构化统计表格
    output_figures JSON,            -- 图表路径列表
    interpretation TEXT,            -- AI对结果的文字解读
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent执行日志
CREATE TABLE agent_logs (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES users(id),
    model_id UUID REFERENCES model_catalog(id),
    usage_record_id UUID REFERENCES ai_usage_records(id),
    agent_name TEXT,                -- topic | literature | writing | data | review | render
    action TEXT,                    -- 具体操作
    input_summary TEXT,             -- 输入摘要
    output_summary TEXT,            -- 输出摘要
    tokens_used INTEGER,
    duration_ms INTEGER,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 六、API设计

```yaml
# ═══════════════ 鉴权 ═══════════════
POST   /api/auth/login                         # 用户名 + 密码 → JWT token
GET    /api/auth/me                             # 当前用户信息 + 角色

# ═══════════════ 管理端 (admin only) ═══════════════

# 学校模板管理
GET    /api/admin/schools                       # 模板列表 (分页、搜索、按国家/状态筛选)
POST   /api/admin/schools                       # 手动创建模板
GET    /api/admin/schools/{id}                  # 模板详情
PUT    /api/admin/schools/{id}                  # 编辑模板
DELETE /api/admin/schools/{id}                  # 删除模板
POST   /api/admin/schools/{id}/publish          # 发布模板 (draft → published)
POST   /api/admin/schools/{id}/deprecate        # 弃用模板
POST   /api/admin/schools/{id}/import-pdf       # 上传PDF格式手册 → LLM解析 → 回填JSON
GET    /api/admin/schools/{id}/versions         # 模板版本历史
POST   /api/admin/schools/{id}/rollback/{v}     # 回滚到指定版本

# 用户管理
GET    /api/admin/users                         # 用户列表
POST   /api/admin/users                         # 创建用户
PUT    /api/admin/users/{id}                    # 编辑用户 (重置密码、启用/禁用)
DELETE /api/admin/users/{id}                    # 删除用户
POST   /api/admin/users/batch-import            # CSV批量导入

# 充值与计费
GET    /api/admin/billing/wallets               # 账号余额列表
POST   /api/admin/billing/recharge              # 管理员给代写账号充值
GET    /api/admin/billing/ledger                # 钱包流水
GET    /api/admin/billing/usage                 # AI调用扣费记录
POST   /api/admin/billing/usage/{id}/refund     # 失败任务退款/补偿

# 模型目录
GET    /api/admin/models                        # 模型列表
POST   /api/admin/models                        # 新增模型
PUT    /api/admin/models/{id}                   # 编辑模型价格、场景、启用状态
DELETE /api/admin/models/{id}                   # 下架模型

# 知识图谱
GET    /api/admin/knowledge/disciplines         # 学科-技能映射列表
PUT    /api/admin/knowledge/disciplines/{id}    # 编辑映射

# 操作日志
GET    /api/admin/logs                          # 日志列表 (分页、筛选)

# ═══════════════ 代写前台 ═══════════════

# 余额和模型
GET    /api/wallet                              # 当前账号余额
GET    /api/wallet/ledger                       # 当前账号消费流水
GET    /api/models?scenario={scenario}          # 当前场景可选模型和价格

# 项目管理
POST   /api/projects                            # 创建新项目
GET    /api/projects                            # 我的项目列表
GET    /api/projects/{id}                       # 获取项目详情
PUT    /api/projects/{id}                       # 更新项目
DELETE /api/projects/{id}                       # 删除项目
POST   /api/projects/{id}/outline/generate      # AI生成大纲

# 学校模板（只读）
GET    /api/schools                             # 学校列表（按国家筛选，仅published）
GET    /api/schools/{id}/template               # 获取学校模板详情

# 文献管理
POST   /api/projects/{id}/literature/search   # 联网检索文献
POST   /api/projects/{id}/literature/import   # 手动导入文献
GET    /api/projects/{id}/literature          # 获取文献列表
PUT    /api/projects/{id}/literature/{lid}    # 更新文献信息
DELETE /api/projects/{id}/literature/{lid}    # 删除文献
POST   /api/projects/{id}/reference/review    # 选择模型，审核标准参考论文质量

# RAG 入库
POST   /api/projects/{id}/rag/documents/{lid}/chunk        # 对文献发起 AI 预切割
GET    /api/projects/{id}/rag/documents/{doc_id}/chunks    # 获取 chunk 建议
PUT    /api/projects/{id}/rag/chunks/{chunk_id}            # 人工编辑 chunk
POST   /api/projects/{id}/rag/documents/{doc_id}/confirm   # 确认 chunk 并写入 pgvector
POST   /api/projects/{id}/rag/search                       # 项目内 RAG 检索

# 写作Agent
POST   /api/projects/{id}/write/chapter       # 生成/重写指定章节
POST   /api/projects/{id}/write/all           # 全篇生成
POST   /api/projects/{id}/chapter/{cid}/feedback  # 提交修改意见 → 触发一致性检查

# 数据分析
POST   /api/projects/{id}/analysis/scale      # 生成量表
POST   /api/projects/{id}/analysis/data       # 生成模拟CSV数据
POST   /api/projects/{id}/analysis/run        # 执行统计分析

# 审校
POST   /api/projects/{id}/check/plagiarism    # 查重
POST   /api/projects/{id}/check/reduce        # AI降重
POST   /api/projects/{id}/check/consistency   # 逻辑一致性检查

# 输出
POST   /api/projects/{id}/export/docx         # 导出Word
POST   /api/projects/{id}/export/latex        # 导出LaTeX
POST   /api/projects/{id}/export/ppt          # 导出PPT (博士)

# 翻译（独立功能）
POST   /api/translate                         # 全文翻译（中→英/英→中）
```

## 七、目录结构

```
thesis-generator/
├── frontend-admin/              # 管理员后台（独立Nginx入口）
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx                 # 管理员登录
│   │   │   ├── AdminDashboard.tsx        # 概览页
│   │   │   ├── SchoolList.tsx            # 学校模板列表
│   │   │   ├── SchoolEditor.tsx          # 模板编辑器（含PDF导入）
│   │   │   ├── UserList.tsx              # 代写账号管理
│   │   │   ├── UserEditor.tsx            # 用户编辑
│   │   │   ├── Billing.tsx               # 充值/余额/流水
│   │   │   ├── ModelCatalog.tsx          # 模型目录和价格
│   │   │   ├── KnowledgeGraph.tsx        # 知识图谱配置
│   │   │   └── OperationLogs.tsx         # 操作日志
│   │   ├── api/
│   │   │   ├── auth.ts
│   │   │   ├── admin.ts
│   │   │   ├── billing.ts
│   │   │   └── models.ts
│   │   └── guards/
│   │       └── AdminGuard.tsx
│   └── package.json
│
├── frontend-writer/             # 代写前台（独立Nginx入口）
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx                 # 代写登录
│   │   │   ├── Dashboard.tsx             # 项目列表
│   │   │   ├── ProjectWizard.tsx         # 核心: 向导式论文工作台
│   │   │   │   ├── Step1_CreateProject.tsx
│   │   │   │   ├── Step2_SelectSchool.tsx
│   │   │   │   ├── Step3_Topic.tsx
│   │   │   │   ├── Step4_ReferenceReview.tsx # 标准参考论文审核
│   │   │   │   ├── Step45_LiteratureUpload.tsx
│   │   │   │   ├── Step45_RagChunkReview.tsx
│   │   │   │   ├── Step5_Outline.tsx
│   │   │   │   └── Step6_Preview.tsx
│   │   │   ├── ModelSelector.tsx         # 场景模型选择
│   │   │   ├── Wallet.tsx                # 余额和消费流水
│   │   │   └── ThesisPreview.tsx
│   │   ├── components/
│   │   │   ├── Editor/                   # 富文本编辑器（基于TipTap/ProseMirror）
│   │   │   ├── OutlineTree.tsx           # 可拖拽编辑的大纲树
│   │   │   ├── FolderTree.tsx            # 文献文件夹树 (Step4)
│   │   │   ├── PdfUploader.tsx           # PDF拖拽上传 + 解析进度
│   │   │   ├── RagChunkEditor.tsx        # chunk拆分/合并/改标签/确认入库
│   │   │   ├── ThesisRenderer.tsx        # 论文预览渲染器 (按学校CSS)
│   │   │   ├── WizardStepper.tsx         # Step1~6 步骤条导航
│   │   │   └── DataTable.tsx             # 统计结果展示
│   │   ├── stores/                       # Zustand状态管理
│   │   │   ├── authStore.ts              # 鉴权状态
│   │   │   ├── wizardStore.ts            # 向导步骤状态 + 项目数据
│   │   │   └── modelStore.ts             # 模型选择状态
│   │   ├── hooks/
│   │   ├── api/                          # API调用层
│   │   │   ├── auth.ts
│   │   │   ├── projects.ts
│   │   │   ├── rag.ts
│   │   │   ├── models.ts
│   │   │   └── wallet.ts
│   │   └── guards/
│   │       └── AuthGuard.tsx             # 登录鉴权路由守卫
│   └── package.json
│
├── backend/                     # Python后端
│   ├── app/
│   │   ├── main.py                    # FastAPI入口
│   │   ├── config.py                  # 配置
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── admin_schools.py
│   │   │   ├── admin_users.py
│   │   │   ├── admin_billing.py
│   │   │   ├── admin_models.py
│   │   │   ├── admin_knowledge.py
│   │   │   ├── admin_logs.py
│   │   │   ├── projects.py
│   │   │   ├── schools.py
│   │   │   ├── literature.py
│   │   │   ├── rag.py
│   │   │   ├── wallet.py
│   │   │   ├── models.py
│   │   │   ├── writing.py
│   │   │   ├── analysis.py
│   │   │   ├── review.py
│   │   │   └── export.py
│   │   ├── agents/                    # Agent实现
│   │   │   ├── orchestrator.py       # LangGraph主状态机
│   │   │   ├── topic_agent.py        # 选题Agent
│   │   │   ├── literature_agent.py   # 文献Agent
│   │   │   ├── chunk_agent.py        # RAG切割Agent
│   │   │   ├── writing_agent.py      # 写作Agent
│   │   │   ├── data_agent.py         # 数据Agent
│   │   │   ├── review_agent.py       # 审校Agent
│   │   │   └── render_agent.py       # 排版Agent
│   │   ├── services/
│   │   │   ├── llm_service.py        # LLM调用封装
│   │   │   ├── provider_gateway.py   # AI中转站调用 + token usage 查询
│   │   │   ├── billing_service.py    # 余额冻结、扣费、退款、流水
│   │   │   ├── model_service.py      # 模型目录、场景过滤和价格
│   │   │   ├── search_service.py     # Google/Semantic Scholar检索
│   │   │   ├── rag_service.py        # AI切割、人工确认、向量入库流程
│   │   │   ├── vector_store.py       # PostgreSQL pgvector 检索封装
│   │   │   ├── embedding_service.py  # embedding provider 统一封装
│   │   │   ├── analysis_service.py   # 统计计算(pandas+scipy)
│   │   │   ├── chart_service.py      # 图表代码沙箱执行(matplotlib)
│   │   │   ├── citation_service.py   # 引用格式化(citeproc-py)
│   │   │   ├── plagiarism_service.py # 查重服务
│   │   │   ├── docx_service.py       # Word生成
│   │   │   ├── latex_service.py      # LaTeX生成
│   │   │   └── pdf_parser.py         # PDF格式手册解析
│   │   ├── resources/
│   │   │   └── csl/                   # CSL引用样式文件
│   │   ├── middleware/
│   │   │   ├── auth.py               # JWT鉴权中间件
│   │   │   └── role_guard.py         # 角色权限拦截
│   │   ├── models/                   # SQLAlchemy ORM
│   │   ├── schemas/                  # Pydantic
│   │   └── db.py                     # 数据库连接
│   ├── templates/                    # LaTeX模板
│   │   ├── default/
│   │   ├── um_malaya/                # 马来亚大学
│   │   ├── chula/                    # 朱拉隆功大学
│   │   └── ...
│   ├── school_configs/               # 学校格式配置JSON
│   │   ├── MY/                       # 马来西亚院校
│   │   ├── TH/                       # 泰国院校
│   │   ├── MO/                       # 澳门院校
│   │   └── KR/                       # 韩国院校
│   └── requirements.txt
│
├── shared/                      # 前后端共享类型定义
│   └── types.ts
│
├── scripts/                     # 工具脚本
│   ├── seed_schools.py          # 初始化学校模板数据
│   └── migratrate.py
│
├── deploy/
│   ├── nginx-admin.conf          # 后台入口代理
│   ├── nginx-writer.conf         # 前台入口代理
│   └── docker-compose.yml        # PostgreSQL + Redis + Backend + Frontends
│
└── docs/                        # 文档

```

## 八、学校格式获取流程

```
                    ┌──────────────────────────┐
                    │ 用户选择学校              │
                    └───────────┬──────────────┘
                                ↓
              ┌─────────────────────────────────┐
              │ 本地模板库匹配                    │
              │ /school_configs/{COUNTRY}/{SCHOOL}.json │
              └───────────┬─────────────────────┘
                          ↓
           ┌──────────────┴──────────────┐
           ↓                             ↓
      模板已存在                       模板不存在
           ↓                             ↓
   直接加载配置               ┌────────────────────┐
           ↓                  │ Agent启动联网采集流程 │
           ↓                  │ 1. Google: [学校名]  │
           ↓                  │   + "学位论文格式规范" │
           ↓                  │ 2. 抓取学校研究生院官网│
           ↓                  │ 3. 下载格式手册PDF    │
           ↓                  │ 4. LLM解析 → JSON    │
           ↓                  │ 5. 存入本地模板库     │
           ↓                  └────────┬───────────┘
           ↓                           ↓
           └──────────────┬────────────┘
                          ↓
              ┌────────────────────────┐
              │ 用户确认/手动调整       │
              │ → 模板版本锁定          │
              └────────────────────────┘
```

## 九、关键技术风险与对策

| 风险                                | 影响                   | 对策                                                            |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------- |
| **Google Scholar限流/封IP**   | 文献检索不可用         | 多数据源备用(Semantic/google Scholar优先)；请求间隔控制；代理池 |
| **LLM幻觉（编造引用、数据）** | 论文学术诚信问题       | 每个引用必须与文献库实体对应；数据Agent用代码生成而非LLM生成    |
| **低质量参考文献进入RAG**      | 检索基础差，导致成文质量和引用可靠性下降 | 标准参考论文先过质量审核，未通过不允许批量入库 |
| **长文本上下文溢出**          | 博士30万字无法单次生成 | 分章生成 + 章节间摘要接力 + RAG检索上下文                       |
| **余额扣费不准确**            | 账号余额争议           | 调用中转站 usage API 后按实际 token 计费；钱包流水不可变更，退款走反向流水 |
| **模型价格变化**              | 前后任务成本不一致     | 每次调用快照记录当时模型单价，不回溯修改历史消费 |
| **RAG切割质量不稳定**         | 检索召回差或引用错位   | AI 只做预切割；人工确认后才 embedding；保留 chunk 版本和原文 hash |
| **学校格式更新**              | 用户按旧模板提交被打回 | 模板版本管理 + 联网定期校验更新                                 |
| **服务器数据安全**            | 论文数据泄露           | 后台/前台入口隔离、RBAC、对象存储私有化、数据库备份和访问审计 |

## 十、开发阶段规划

### Phase 1: MVP（最小可行产品）

- PostgreSQL + pgvector + Redis 基础设施
- 后台/前台两个 Nginx 入口
- 内置3-5所学校模板
- admin/writer 鉴权和基础 RBAC
- 管理员创建代写账号、人工充值
- 模型目录和前台模型选择
- 标准参考论文质量审核
- 选题Agent + 大纲生成
- 单章写作（第一章绪论）
- 基础Word输出

### Phase 2: 核心闭环

- 全部8个Agent就位
- 文献检索 + 管理
- RAG 入库闭环：PDF 解析 → AI 预切割 → 人工确认 → pgvector 写入 → 写作检索
- AI中转站 token usage 查询 + 实际扣费流水
- 查重 + 降重
- 完整论文Word + LaTeX输出

### Phase 3: 分析深化

- 量表生成 + 模拟数据
- 统计计算（SPSS平替）
- 图表自动生成

### Phase 4: 体验优化

- 导师反馈闭环
- 翻译功能
- 课程PPT生成
- 更多学校模板

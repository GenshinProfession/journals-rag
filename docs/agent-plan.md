# Agent 开发规划

## 一、Agent 总览

### 1.1 哪些环节需要 Agent

对照用户旅程，并非每个 Step 都需要 Agent。以下是有/无 Agent 的环节：

| 步骤 | 用户操作 | Agent 介入 |
|------|----------|-----------|
| Step 1 | 新建项目 | ❌ 纯前端表单 |
| Step 2 | 选学校/专业/学位 | ❌ 数据库查询 + 知识图谱匹配 |
| Step 3 | 确定论文主题 | ❌ 纯文本输入 |
| Step 4 | 上传标准参考论文 | ✅ **参考论文质量审核Agent** — 判断主题相关性、论文形式和学术质量 |
| Step 4.5 | 上传文献 PDF | ✅ **文献解析Agent** — 提取元数据；✅ **RAG切割Agent** — AI预切割 + 人工确认后入库 |
| Step 5 | 生成大纲 | ✅ **选题Agent** + **文献Agent** — 生成大纲 + 文献匹配 |
| Step 5.5 | 审阅编辑大纲 | ❌ 纯前端操作 |
| Step 6 | 生成成文 | ✅ **写作Agent** — 逐章生成 |
| Step 6 | 可视化预览 | ❌ 前端渲染 |
| Step 6 | 下载 | ❌ **排版Service** — Word/LaTeX 模板渲染 |
| 后续 | 用户修改反馈 | ✅ **审校Agent** — 一致性检测 + 联动修改 |
| 后续 | 查重降重 | ✅ **审校Agent** — 查重 + 降重改写 |

**结论：需要 8 个 Agent** — 参考论文质量审核Agent、文献解析Agent、RAG切割Agent、选题Agent、文献Agent、写作Agent、**图表Agent**、审校Agent。排版属于模板引擎，引用格式化属于独立 Service，不依赖 LLM 推理。

### 1.2 Agent 协作拓扑

```
                    ┌─────────────┐
                    │ Orchestrator│  (LangGraph 状态机，非LLM Agent)
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┬────────────────┐
        ↓                  ↓                   ↓                ↓
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  选题Agent     │  │  文献Agent     │  │  写作Agent     │  │  图表Agent     │
│               │  │               │  │               │  │               │
│ 输入:         │  │ 输入:         │  │ 输入:         │  │ 输入:         │
│  研究思路     │  │  文献库全文    │  │  大纲 + 文献   │  │  数据JSON     │
│  学校章节结构 │  │  大纲章节树    │  │  当前章节      │  │  图表类型      │
│  学位层次     │  │               │  │  前文摘要      │  │               │
│               │  │ 输出:         │  │               │  │ 输出:         │
│ 输出:         │  │  章节-文献映射 │  │ 输出:         │  │  PNG/PDF图表  │
│  结构化大纲   │  │  文献综述草稿  │  │  章节正文      │  │               │
└───────┬───────┘  └───────┬───────┘  │  (含表格+引用) │  └───────┬───────┘
        │                  │          └───────┬───────┘          │
        └──────────────────┼──────────────────┼─────────────────┘
                           │                  │
                    ┌──────┴──────┐    ┌──────┴──────┐
                    │  审校Agent   │    │ 独立 Service │
                    │  查重/降重   │    │              │
                    │  一致性检测  │    │ 引用格式化    │
                    │              │    │ 图表渲染     │
                    └─────────────┘    └──────────────┘
```

Step 4 先由参考论文质量审核Agent把关：用户上传一份标准参考论文，并选择审核模型，审核通过后才允许进入批量文献 RAG 入库。Step 4.5 的文献解析Agent与 RAG切割Agent属于入库链路：PDF 上传后先提取元数据和全文，再由 AI 生成 chunk 建议，用户确认后写入 pgvector；后续文献Agent和写作Agent只检索 confirmed chunks。

---

## 二、LangGraph 状态机设计

### 2.1 核心状态

```python
from typing import TypedDict, Literal, Annotated
from langgraph.graph import StateGraph, END
import operator

class ThesisState(TypedDict):
    # ── 用户与计费上下文 ──
    user_id: str
    selected_models: dict[str, str]  # {quality_review|chunking|outline|writing|review: model_id}
    usage_records: list[dict]        # [{agent, model_id, input_tokens, output_tokens, cost_cents}]

    # ── 不可变：Step2 选定后锁定 ──
    project_id: str
    school_id: str
    school_config: dict          # 学校格式配置 (完整JSON)
    discipline: str              # art | philosophy | history | journalism | management | economics
    degree_level: str            # bachelor | master | doctor
    word_count_target: int       # 100000 | 200000 | 300000

    # ── Step 3 用户输入 ──
    research_idea: str           # 用户研究思路（自由文本）
    thesis_topic: str            # 论文主题（质量审核和大纲生成前置）

    # ── Step 4 标准参考论文审核 ──
    reference_literature_id: str | None
    reference_review: dict | None # {passed, overall_score, issues, report}

    # ── Step 4.5 文献 ──
    literature: list[dict]       # [{id, title, authors, year, abstract, full_text, folder}]
    rag_documents: list[dict]    # [{id, literature_id, chunking_status, text_hash}]
    rag_chunks: list[dict]       # [{id, literature_id, content, metadata, status, vector_id}]
    vector_index_ready: bool     # 仅 confirmed chunks 入库后为 true

    # ── Step 5 大纲 ──
    outline: list[dict]          # [{id, title, word_count_target, literature_ids, status}]
    outline_confirmed: bool

    # ── Step 6 成文 ──
    chapters: dict[str, str]     # {chapter_id: markdown_content}
    current_chapter_index: int
    chapter_summaries: dict[str, str]  # {chapter_id: 100字摘要}（用于跨章上下文）

    # ── 图表 ──
    figures: list[dict]          # [{id, chapter_id, type, title, python_code, output_path}]
    tables: list[dict]           # [{id, chapter_id, title, data_json, output_markdown}]

    # ── 审校 ──
    plagiarism_report: dict
    feedback_queue: list[dict]   # [{chapter_id, paragraph_index, comment}]
    citation_errors: list[dict]  # [{chapter_id, citation_key, error}]

    # ── 流程控制 ──
    stage: str                   # topic_setup | reference_review | literature_ingestion | chunk_review | outline_generation | outline_review | writing | review | done
    error: str | None
```

### 2.2 状态图

```python
def build_thesis_graph() -> StateGraph:
    graph = StateGraph(ThesisState)

    # 节点
    graph.add_node("review_reference", reference_quality_agent_run) # 参考论文质量审核Agent
    graph.add_node("parse_literature", parser_agent_run)      # 文献解析Agent
    graph.add_node("chunk_for_rag", rag_chunk_agent_run)      # RAG切割Agent
    graph.add_node("wait_chunk_review", wait_for_user)        # 等待用户确认chunk (人工节点)
    graph.add_node("generate_outline", topic_agent_run)      # 选题Agent
    graph.add_node("match_literature", literature_agent_run)  # 文献Agent
    graph.add_node("wait_outline_review", wait_for_user)      # 等待用户审阅大纲 (人工节点)
    graph.add_node("write_chapter", writing_agent_run)        # 写作Agent
    graph.add_node("generate_charts", chart_agent_run)        # 图表Agent (数据分析章之后)
    graph.add_node("format_citations", citation_format_run)   # 引用格式化 Service
    graph.add_node("review_consistency", review_agent_run)    # 审校Agent
    graph.add_node("plagiarism_check", plagiarism_run)        # 查重
    graph.add_node("reduce_plagiarism", reduce_run)           # 降重

    # 边
    graph.set_entry_point("review_reference")
    graph.add_conditional_edges("review_reference", after_reference_review, {
        "approved": "parse_literature",
        "rejected": END
    })
    graph.add_edge("parse_literature", "chunk_for_rag")
    graph.add_edge("chunk_for_rag", "wait_chunk_review")
    graph.add_conditional_edges("wait_chunk_review", after_chunk_review, {
        "approved": "generate_outline",
        "revised": "chunk_for_rag",
        "rejected": END
    })
    graph.add_edge("generate_outline", "match_literature")
    graph.add_edge("match_literature", "wait_outline_review")

    # 大纲审阅分支
    graph.add_conditional_edges("wait_outline_review", after_review, {
        "approved": "write_chapter",
        "revised": "generate_outline",
        "rejected": END
    })

    # 写作循环：逐章生成
    graph.add_conditional_edges("write_chapter", after_chapter, {
        "next_chapter": "write_chapter",
        "all_done": "generate_charts"      # 全章写完 → 生成图表
    })

    graph.add_edge("generate_charts", "format_citations")
    graph.add_edge("format_citations", "review_consistency")
    graph.add_edge("review_consistency", "plagiarism_check")
    graph.add_conditional_edges("plagiarism_check", after_plagiarism, {
        "clean": END,
        "needs_reduce": "reduce_plagiarism"
    })
    graph.add_edge("reduce_plagiarism", "plagiarism_check")

    return graph.compile()
```

### 2.3 状态持久化

```python
# 每次节点执行后，将 ThesisState 序列化到 PostgreSQL
# 支持长任务中断恢复：任务失败或用户关闭页面后，从上次 checkpoint 继续

class StatePersistence:
    @staticmethod
    def save(project_id: str, state: ThesisState):
        """序列化 state → chapters 表 + project 表 + checkpoint 表"""

    @staticmethod
    def load(project_id: str) -> ThesisState:
        """从数据库恢复 state"""

    @staticmethod
    def checkpoint(project_id: str, node_name: str, state: ThesisState):
        """每次节点入口/出口打 checkpoint，支持回退"""
```

---

## 三、各 Agent 详细设计

> **关于数据分析**：社科量化分析（描述统计、信效度、相关、回归、中介/调节、SEM）不单独设立 Agent，而是由 `analysis_service.py` 执行。该 Service 运行时加载 `analysis-skills.md` 作为系统知识，包含完整的 SPSS 语法、Stata 语法、Python 等价实现、APA 结果解读模板和图表规范。以下 Agent 设计聚焦于需要 LLM 推理的环节。

### 3.0 参考论文质量审核Agent（Step 4）

**触发时机**：代写用户确定论文主题后，上传一份标准参考论文/高质量参考文献，并选择用于审核的模型。

**目的**：在 RAG 入库前设置质量门槛，避免用户上传低质量、非论文、拼凑或与主题不相关的材料，导致后续检索和写作基础失真。

**输入**：
- 论文主题、学校、专业、学位层次
- 标准参考论文全文文本
- 用户选择的审核模型 `model_id`

**输出**：
```json
{
  "passed": true,
  "overall_score": 86,
  "topic_relevance_score": 90,
  "structure_score": 84,
  "academic_quality_score": 82,
  "issues": [],
  "report": "该文献与主题高度相关，结构完整，适合作为后续RAG入库和论文形式参考。"
}
```

**Prompt 设计思路**：
```
你是学术论文质量审核专家。请判断用户上传的标准参考论文是否适合作为后续RAG入库和论文写作的质量基准。

论文主题：{thesis_topic}
学校/专业/学位：{school_config} / {discipline} / {degree_level}
参考论文全文：{full_text}

请从以下维度评分：
1. 与论文主题是否相关
2. 是否符合学位论文或高质量学术论文形式
3. 结构是否完整：摘要、引言、文献综述、研究方法、分析、结论、参考文献等
4. 学术表达是否规范，是否存在明显拼凑、广告、低质量内容
5. 是否适合作为后续RAG和写作标准

输出纯JSON，不要额外解释。
```

**模型选择**：用户选择。前台只展示管理员配置为 `quality_review` 场景可用的模型，并显示价格、上下文长度和推荐说明。

**计费**：调用完成后通过 AI 中转站 usage API 获取 token 消耗，由 `BillingService` 按该模型当时价格扣费。

**失败策略**：未通过时不进入 RAG 入库，用户必须重新上传参考论文或调整论文主题。

---

### 3.1 文献解析Agent（Step 4.5）

**触发时机**：用户上传一篇 PDF 后立即异步执行

**输入**：PDF 全文文本 (PyMuPDF 提取)

**输出**：
```json
{
  "title": "文献标题",
  "authors": ["作者1", "作者2"],
  "year": 2023,
  "journal": "期刊名",
  "volume": 15,
  "issue": 3,
  "pages": "100-120",
  "doi": "10.xxxx/xxxxx",
  "abstract": "摘要全文...",
  "keywords": ["关键词1", "关键词2"]
}
```

**Prompt 设计思路**：
```
你是一个学术文献元数据提取器。
从以下PDF文本中提取：标题、作者、年份、期刊、DOI、摘要。

规则：
- 标题通常出现在第一页最上方，字体最大
- 摘要通常在标题和作者之后，以"Abstract"或"摘要"开头
- DOI 是 "10." 开头的字符串
- 如果无法确定某字段，填 null，不要编造

PDF文本：
{full_text}
```

**模型选择**：可由后台配置默认低价模型；如开放给前台选择，只展示 `parser` 场景可用模型。

**容错**：解析失败时保留原始 PDF，标记 `needs_manual_review`，不阻塞后续流程

---

### 3.1.1 RAG切割Agent（Step 4.5 入库前）

**触发时机**：文献解析Agent完成全文提取后立即异步执行；也可由用户在文献详情页手动重新切割。

**定位**：AI 只负责给出语义 chunk 建议，不直接写入向量库。用户确认后，`RagService` 才生成 embedding 并写入向量库。

**输入**：
- 用户与项目上下文：`user_id`、`project_id`、`literature_id`
- PDF 全文文本、页码映射、标题层级
- 文献元数据：标题、作者、年份、摘要、关键词
- 用户已有文件夹/标签
- 用户选择的切割模型 `model_id`

**输出**：
```json
{
  "document_id": "rag_doc_001",
  "chunks": [
    {
      "title": "研究背景与问题提出",
      "content": "清洗后的片段文本...",
      "page_start": 3,
      "page_end": 4,
      "keywords": ["研究背景", "问题提出"],
      "suggested_tags": ["理论框架"],
      "reason": "该片段围绕研究问题展开，语义完整，适合作为独立检索单元"
    }
  ]
}
```

**人工确认节点**：
```
AI预切割
   ↓
前端 RagChunkEditor 展示 chunk 卡片
   ↓
用户可拆分 / 合并 / 删除 / 改标题 / 改标签 / 调整顺序
   ↓
确认后 status = confirmed
   ↓
EmbeddingService 生成向量
   ↓
VectorStore 写入 PostgreSQL pgvector
```

**Prompt 设计思路**：
```
你是一个学术文献RAG切割助手。
请根据语义边界切割以下文献全文，目标是支持后续论文写作检索。

要求：
1. 每个 chunk 保持语义完整，不跨越明显主题
2. 优先按标题、小节、段落群组织，而不是固定字数硬切
3. 每个 chunk 建议 500-1200 中文字，过长需拆分，过短需合并
4. 保留页码范围、关键词、建议标签
5. 不改写原文事实，只做必要的噪声清理
6. 输出纯 JSON

文献元数据：{metadata}
全文：{full_text_with_pages}
```

**模型选择**：用户选择。前台只展示管理员配置为 `chunking` 场景可用的模型，并显示价格和适用说明。

**入库约束**：
- 只有 `confirmed` chunk 可以 embedding
- pgvector 写入必须携带 `user_id`、`project_id`、`literature_id`、`page_start/page_end`
- 用户编辑 chunk 后更新 `version` 并重新 embedding
- 文献Agent和写作Agent检索时必须带 `user_id/project_id` filter，避免不同代写账号项目互相召回
- AI 切割和 embedding 调用都进入 `ai_usage_records`，按中转站返回的 token usage 扣费

---

### 3.2 选题Agent（Step 5 前半）

**触发时机**：用户点击「生成大纲」

**输入**：
- 用户研究思路（自由文本）
- 学校模板的章节结构（必选/可选章节列表）
- 学位层次（确定理论深度）
- 学科（确定研究方法路径）
- 文献列表摘要（供参考）

**输出**：结构化大纲
```json
[
  {
    "id": "ch_1",
    "title": "绪论",
    "subsections": [
      {"id": "ch_1_1", "title": "研究背景", "word_count_target": 3000},
      {"id": "ch_1_2", "title": "研究意义", "word_count_target": 2000}
    ],
    "word_count_target": 15000
  },
  {
    "id": "ch_2",
    "title": "文献综述",
    "word_count_target": 25000,
    "subsections": []
  }
]
```

**Prompt 设计思路**：
```
你是一位{discipline}领域的资深导师，正在指导一名{degree_level}生撰写毕业论文。

## 学校要求的章节结构
必选章节：{required_chapters}
可选章节：{optional_chapters}

## 学生的研究思路
{research_idea}

## 学位层次
{degree_level} — 要求理论深度：{depth_description}

## 任务
1. 按学校要求的章节结构，为学生的研究思路生成详细大纲
2. 每章分配字数，总字数目标 {word_count_target} 字
3. 每章下列出 2-5 个子章节，每个子章节一句话说明内容
4. 研究方法章需匹配学科特点（{methodology_type}）
5. 输出纯JSON，不要额外解释
```

**模型选择**：用户选择。前台展示 `outline` 场景可用模型，并提示“大纲质量决定全篇结构”。

---

### 3.3 文献Agent（Step 5 后半）

**触发时机**：选题Agent生成大纲后，紧接着执行

**输入**：
- 大纲章节树（选题Agent输出）
- 文献库（元数据 + 摘要 + 全文）
- RAG 检索结果（confirmed chunks，按 `user_id + project_id` 过滤）

**输出**：
```json
{
  "chapter_literature_map": {
    "ch_2": ["lit_001", "lit_003", "lit_007"],
    "ch_2_1": ["lit_001", "lit_003"],
    "ch_2_2": ["lit_007"]
  },
  "literature_review_draft": "## 文献综述\n\n### 2.1 xxx理论\n...",
  "unmatched_literature": ["lit_012"]
}
```

**Prompt 设计思路**：
```
你是一个文献管理专家。给定论文大纲和用户上传的文献，完成：

1. **文献匹配**：将每篇文献匹配到最相关的大纲章节（基于摘要 vs 章节主题语义）
2. **RAG证据召回**：针对每个章节主题检索 confirmed chunks，返回可引用的原文片段和页码
3. **文献综述草稿**：为"文献综述"章生成初稿，组织逻辑：
   - 按主题聚类（不是逐篇罗列）
   - 指出研究缺口（为后续研究问题做铺垫）
4. **标记未匹配文献**：与任何章节都不相关的文献单独列出

大纲：{outline}
文献列表：{literature_summaries}
RAG检索片段：{retrieved_chunks}
```

**模型选择**：用户选择。前台展示 `literature` 场景可用模型，兼顾价格和综述质量。

---

### 3.4 写作Agent（Step 6 核心）

**触发时机**：大纲确认后，逐章调用

**这是整个系统最关键的 Agent**，决定论文质量。

**输入**（每次调用）：
- 当前章节标题、子章节结构
- 当前章节字数目标
- 该章节匹配的文献（摘要 + RAG召回的 confirmed chunks + 必要时的全文段落）
- 前文摘要（已生成章节的 100 字摘要，解决长文本上下文溢出）
- 学校格式配置（字体要求等仅作参考，写作Agent不负责排版）
- 学科 + 学位层次
- 用户研究思路

**输出**：Markdown 格式的章节正文

**分章策略**：

```
┌─────────────────────────────────────────────────────┐
│ 写作Agent 上下文管理策略                               │
│                                                     │
│ 每次只生成一章。传递给 LLM 的上下文 =                  │
│                                                     │
│ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐  │
│ │ 用户研究   │ │ 当前章节  │ │ 前文摘要接力           │  │
│ │ 思路      │ │ 大纲+文献 │ │ (前面各章的100字摘要)   │  │
│ │ (固定)    │ │ (动态)   │ │ (累积，博士30章≈3000字) │  │
│ └──────────┘ └──────────┘ └──────────────────────┘  │
│                                                     │
│ 博士论文30万字 → 分约30章 → 每章单独调用写作Agent     │
│ 单次调用上下文控制在 ~8000 token 以内                 │
└─────────────────────────────────────────────────────┘
```

**各章节的写作 Prompt 差异化**：

| 章节类型 | Prompt 侧重 | 特殊指令 | 表格/图表要求 |
|----------|------------|---------|-------------|
| **绪论** | 研究背景宏大叙事 → 聚焦到具体问题 | 从社会/行业背景层层收窄到研究问题 | — |
| **文献综述** | 主题聚类，批判分析，指出缺口 | 不要逐篇罗列！按主题组织，每段有评价 | 生成「文献归纳表」`[表2-1]` |
| **理论框架** | 概念界定 + 理论溯源 + 框架构建 | 学位越高理论深度越高 | 生成「假设汇总表」`[表3-1]` + Mermaid概念框架图 `[图3-1]` |
| **研究方法** | 方法选择理由 + 具体步骤 + 伦理考量 | 文科质性/社科量化路径 | 生成「变量测量表」`[表4-1]` |
| **数据分析** | 先描述统计 → 推断统计 → 解读 | 引用数据Agent生成的统计表格和图表 | 6-8张表 + 2-4张图（由图表Agent生成后插入） |
| **讨论** | 结果与文献对话、理论贡献、实践启示 | 与文献综述呼应 | — |
| **结论** | 总结发现、研究局限、未来方向 | 简洁有力，不提新观点 | — |

**Prompt 模板（通用框架）**：
```
你是一位{discipline}领域的教授，正在撰写一篇{degree_level}毕业论文。

## 论文题目
基于用户研究思路：{research_idea}

## 当前任务
撰写第{chapter_number}章「{chapter_title}」
子章节：{subsections}
目标字数：{word_count_target} 字

## 本章可用的文献
{chapter_literature_with_abstracts}

## RAG召回的原文证据
{retrieved_chunks_with_page_refs}

## 前文摘要（已完成章节的核心论点）
{previous_chapter_summaries}

## 写作要求
1. 学术语言，逻辑严密，论证充分
2. 每个观点需要有文献支撑，使用学校规定的引用格式标注：
   - 引用格式：{citation_style}
   - 正文引用写法示例：{citation_example}
3. 段落之间逻辑连贯，有过渡句
4. 表格要求：
   - 需要表格的地方，用 Markdown 表格语法直接写出完整表格
   - 表格编号: [表{chapter_number}-{table_seq}]，如 [表2-1 文献归纳表]
   - 统计结果表引用数据Agent输出的数值
5. 图表/图片占位符: [图{chapter_number}-{fig_seq} 此处插入xxx图]
   - 概念框架图需同时输出 Mermaid 代码块（graph TD 语法）
6. 字数控制在目标字数的 ±10% 以内
7. 输出纯 Markdown，章节标题用 ## 和 ###
8. {methodology_instruction}（按章节类型注入特化指令）
9. {table_figure_instruction}（本章应生成哪些表和图的特化指令）

## 写作风格
- 语气：{degree_level_tone}
- 理论深度：{depth_level}
- 引用格式：{citation_style}
```

**模型选择**：用户选择。前台展示 `writing` 场景可用模型，按价格、上下文长度和推荐说明排序。

**生成策略**：
- 非流式调用（需要完整章节做上下文接力）
- 每章生成后自动计算字数，不足/超出则追加调整调用
- 单章失败重试 2 次

---

### 3.5 审校Agent

**三个子功能**：

#### 3.5.1 一致性检测

```
输入:
  - 全文章节内容
  - 大纲结构
  - 文献引用映射

检测项:
  1. 前后术语一致（同一概念不能用不同名称）
  2. 引用一致（引用的文献确实在文献库中存在）
  3. 论点一致（结论章的发现 = 数据分析章的结果）
  4. 章节衔接（每章开头是否承接上一章结尾）

输出:
  [{chapter_id, paragraph_index, issue_type, description, suggestion}]
```

#### 3.5.2 查重检测

```
技术路径:
  1. 分句 → TF-IDF 向量
  2. 与项目文献库全文逐句比对 → 余弦相似度
  3. 阈值 > 0.7 标记为重复
  4. 联网可选：Google 片段检索验证
  
输出:
  {overall_rate: 12.5%, details: [{chapter_id, sentence, similarity, source}]}
```

#### 3.5.3 AI 降重

```
输入: 被标记为重复的段落 + 原始来源

Prompt:
  你是学术润色专家。以下段落被检测与其他文献高度相似。
  请重写该段落，保持原意但改变表达方式：
  - 同义替换关键术语
  - 调整句式结构（主动↔被动，长句↔短句组合）
  - 合并或拆分句子
  - 不得改变学术含义和引用归属
  - 降重后学术质量不得下降

  原段落: {paragraph}
  参考来源: {source_text}
  
输出: 降重后的段落
```

**模型选择**：一致性检测和降重使用用户选择的 `review` 场景模型；查重算法本身不调用 LLM。

---

### 3.6 图表Agent（Step 6 数据分析章之后）

**定位**：将数据Agent输出的统计结果 JSON 转为 matplotlib/seaborn 代码 → 执行 → 输出 PNG/PDF。LLM 只负责**代码生成**，不负责图表渲染。

**触发时机**：写作Agent完成「数据分析」章后，Orchestrator 调用

**输入**：
```json
{
  "chart_type": "regression_scatter",  // 图表类型
  "title": "图5-1 工作满意度与离职倾向的回归分析",
  "data": {
    "x": [3.2, 4.1, 2.8, ...],
    "y": [2.1, 3.5, 1.9, ...],
    "x_label": "工作满意度",
    "y_label": "离职倾向"
  },
  "style": "spss",              // 风格: spss | apa | minimal
  "format": "png",              // png | pdf
  "dpi": 300
}
```

**支持的图表类型**（社科论文全量）：

| 类型 | 用途 | 出现章节 |
|------|------|----------|
| `histogram` | 带正态曲线的直方图 | 数据分析 |
| `bar_chart` | 组间比较 (带误差线) | 数据分析 |
| `scatter_plot` | 散点图 + 回归线 | 数据分析 |
| `heatmap` | 相关系数热力图 | 数据分析 |
| `path_diagram` | 路径系数图 (中介/调节) | 数据分析 |
| `interaction_plot` | 调节效应交互图 | 数据分析 |
| `box_plot` | 箱线图 | 数据分析 |
| `mermaid` | 概念框架图/流程图 (LLM→Mermaid→渲染) | 理论框架/研究方法 |

**Prompt 设计思路**：
```
你是一个Python matplotlib/seaborn 代码生成器。
根据以下图表需求生成可执行的Python代码：

- 图表类型: {chart_type}
- 标题: {title}
- 数据: {data}
- 风格要求: {style} (SPSS风格: 白底灰网格线，无顶框右框)
- 输出格式: {format}, DPI: {dpi}

## 代码规范
1. 使用 matplotlib + seaborn，中文用 SimHei 字体
2. 图表尺寸: 8×6 inches
3. 颜色用 Seaborn colorblind 调色板
4. 保存为 `{output_path}`
5. 不要 plt.show()
6. 必须包含完整的 import 语句
7. 仅输出Python代码，不要任何解释文字

输出代码:
```

**执行流程**：
```python
def chart_agent_run(state: ThesisState) -> ThesisState:
    for table in state["tables"]:
        if table["needs_chart"]:  # 数据分析章的表需要配套图
            code = llm.call(agent="chart", messages=build_chart_prompt(table), model="haiku")
            result = execute_python_code(code, timeout=10)  # subprocess 沙箱执行
            if result.success:
                table["chart_path"] = result.output_path
            else:
                # 代码报错 → 错误信息回传 LLM → 修正重试 (最多2次)
                code = retry_with_error(code, result.stderr)
    return state
```

**模型选择**：用户选择或后台指定 `chart` 场景低价模型；代码生成任务通常不需要最高价模型。

**容错**：代码执行失败时，将 stderr 回传 LLM 修正，最多重试 2 次，仍失败则标记「图表需手动制作」

---

### 3.7 引用格式化 Service（非 Agent）

**定位**：纯逻辑 Service，不调用 LLM。基于 `citeproc-py` + CSL 样式文件实现。

```
CiteprocService
├── 输入:
│   ├── 文献库 (BibTeX/CSL-JSON 格式)
│   ├── 正文引用标记 ([lit_001] 格式)
│   └── 引用样式 (APA / Harvard / GB7714 / Chicago / MLA)
│
├── 处理:
│   ├── 正文内引用转换:
│   │   [lit_001] → (张三, 2023)         [APA]
│   │   [lit_001] → 张三 (2023)          [APA, 叙述式]
│   │   [lit_001, lit_002] → (张三, 2023; 李四, 2024)  [APA, 多文献]
│   │   [lit_001] → [1]                  [GB7714, 顺序编码]
│   ├── 参考文献列表生成:
│   │   citeproc-py 按样式自动排列
│   │   APA: 作者姓氏字母序
│   │   GB7714: 引用出现顺序
│   └── 引用一致性校验:
│       ├── 正文引用的文献是否在参考文献列表中存在
│       └── 参考文献列表中的文献是否被正文引用
│
├── CSL 样式文件来源:
│   └── https://github.com/citation-style-language/styles
│       (内置 APA 7th / Harvard / GB7714-2015 / Chicago author-date)
│
└── 输出:
    ├── 替换后的正文 (引用标记已转换)
    └── 参考文献列表 (Markdown)
```

**为什么是 Service 不是 Agent**：引用格式化是规则引擎，输入确定 → 输出确定，不需要 LLM。`citeproc-py` 是成熟的 CSL 处理器，直接调用即可。

---

## 四、Agent 间通信机制

```
                    Orchestrator (LangGraph)
                         │
            ┌────────────┼────────────┐
            ↓            ↓            ↓
        选题Agent     文献Agent    写作Agent
            │            │            │
            └────────────┼────────────┘
                         │
                    共享 State
                  (ThesisState)
```

- **不采用 Agent 间直接对话**，所有通信通过 Orchestrator 和共享 State
- 每个 Agent 是无状态的纯函数：`(input) → output`
- Orchestrator 负责：读取 State → 构造 Agent 输入 → 调用 Agent → 写回 State

```python
# Orchestrator 中的典型调用模式

def topic_agent_run(state: ThesisState) -> ThesisState:
    input_data = {
        "research_idea": state["research_idea"],
        "required_chapters": state["school_config"]["chapters"]["required"],
        "degree_level": state["degree_level"],
        "discipline": state["discipline"],
        "word_count_target": state["word_count_target"],
        "literature_abstracts": [lit["abstract"] for lit in state["literature"]]
    }
    outline = llm_service.call(
        user_id=state["user_id"],
        project_id=state["project_id"],
        agent="topic",
        scenario="outline",
        model_id=state["selected_models"]["outline"],
        messages=build_topic_prompt(input_data),
        response_format="json"
    )
    state["outline"] = outline
    state["stage"] = "outline_generated"
    return state
```

---

## 五、LLM 调用封装

```python
# backend/app/services/llm_service.py

class LLMService:
    """
    统一封装 LLM 调用，支持:
    - 从 model_catalog 读取用户选择的模型
    - 统一调用 AI 中转站
    - 调用后查询 token usage
    - BillingService 按实际 token 扣费
    - 重试 + 指数退避
    """

    def __init__(self, provider_gateway, billing_service, model_service):
        self.provider_gateway = provider_gateway
        self.billing_service = billing_service
        self.model_service = model_service
        self.max_retries = 2

    def call(self, user_id: str, project_id: str, agent: str, scenario: str,
             model_id: str, messages: list[dict], response_format: str = None) -> str:
        """
        agent: reference_quality | parser | chunk | topic | literature | writing | review
        scenario: quality_review | chunking | outline | writing | review | embedding
        model_id: 用户在前台选择，必须属于该 scenario 可用模型
        """
        # 1. 校验模型是否可用于当前 scenario
        # 2. 可选：预估费用并冻结余额
        # 3. 通过 AI 中转站发起调用
        # 4. 调用 usage API 获取 input/output token
        # 5. BillingService 按模型价格扣费并写入 ai_usage_records
        pass

    def estimate_tokens(self, text: str) -> int:
        """估算 token 数，用于上下文窗口控制"""
        pass
```

### 模型选择策略

不再固定 Opus/Sonnet/Haiku。管理员在后台维护大量模型和价格，代写用户按场景自行选择。

| 场景 | 可选模型来源 | 说明 |
|------|-------------|------|
| 参考论文质量审核 | `allowed_scenarios` 包含 `quality_review` 的模型 | 用户上传标准参考论文时选择，审核通过才进入RAG |
| 文献解析 | 可配置默认低价模型，也允许后台固定 | 结构化提取，量大，通常无需高价模型 |
| RAG切割 | `chunking` 模型 | 需要识别语义边界和标题层级 |
| 生成大纲 | `outline` 模型 | 大纲质量决定后续结构，前台展示推荐强模型 |
| 文献匹配/综述 | `literature` 模型 | 匹配章节、召回证据、生成综述 |
| 章节写作 | `writing` 模型 | 核心产出，用户可在价格和效果之间权衡 |
| 审校/降重 | `review` 模型 | 一致性检测、降重改写 |

每次调用都快照记录当时模型价格，避免管理员后续调价影响历史账单。

**不调用 LLM 的组件**：排版引擎 (docx/latex)、引用格式化 (citeproc-py)、查重算法 (TF-IDF)、Mermaid 渲染

---

## 六、上下文窗口管理

博士论文 30 万字 ≈ 75 万 token，远超任何模型的上下文窗口。

### 策略

```
┌────────────────────────────────────────────┐
│              上下文窗口 (~200K token)        │
│  ┌──────────────────────────────────────┐  │
│  │ System Prompt (固定，约 500 token)     │  │
│  ├──────────────────────────────────────┤  │
│  │ 用户研究思路 (固定，约 500 token)       │  │
│  ├──────────────────────────────────────┤  │
│  │ 当前章节大纲 + 文献 (约 3000 token)     │  │
│  ├──────────────────────────────────────┤  │
│  │ 前文摘要接力 (累积，约 2000~5000 token) │  │  ← 关键
│  ├──────────────────────────────────────┤  │
│  │ 当前章节输出 (约 5000~15000 token)      │  │
│  └──────────────────────────────────────┘  │
│              剩余空间 (~170K token)          │
└────────────────────────────────────────────┘
```

### 摘要接力实现

```python
def compress_chapter(state: ThesisState, chapter_content: str, model_id: str) -> str:
    """用项目配置的 review/summary 模型将已生成的章节压缩为 100 字摘要"""
    prompt = f"将以下论文章节压缩为 100 字以内的摘要，只保留核心论点和关键发现：\n\n{chapter_content}"
    return llm.call(user_id=state["user_id"], project_id=state["project_id"], agent="review", scenario="review", model_id=model_id, messages=[{"role": "user", "content": prompt}])

# Orchestrator 在每章写完后调用
state["chapter_summaries"][chapter_id] = compress_chapter(state, chapter_content, state["selected_models"]["review"])
```

---

## 七、错误处理与恢复

```
                    Agent 调用
                        │
                        ↓
              ┌─────────────────┐
              │   第 1 次尝试     │
              └────────┬────────┘
                       ↓
                  ┌─────────┐
                  │ 成功？   │
                  └────┬────┘
                  是 ↓     ↓ 否
               ┌───┘  ┌───────────────────┐
               ↓      │ 第 2 次尝试 (重试)  │
             继续     └────────┬──────────┘
                               ↓
                          ┌─────────┐
                          │ 成功？   │
                          └────┬────┘
                          是 ↓     ↓ 否
                       ┌───┘  ┌──────────────────────────┐
                       ↓      │ 写入 error 到 state        │
                      继续    │ 通知用户:                   │
                              │ "第X章生成失败，是否重试？" │
                              │ 用户可选择:                 │
                              │  1. 手动重试                │
                              │  2. 编辑输入后重试          │
                              │  3. 跳过 (留空手动填写)     │
                              └──────────────────────────┘
```

关键原则：**Agent 失败不丢数据，不静默降级，必须告知用户并给选项。**

---

## 八、开发顺序

### Phase 1: 基础设施
- `llm_service.py` — LLM 调用封装 + 重试
- `StatePersistence` — 状态读写 PostgreSQL
- `RagService + VectorStore` — AI切割确认后入库，所有检索携带 user/project filter
- LangGraph 空状态机跑通（节点打桩）

### Phase 2: 核心 Agent
- **文献解析Agent** — 最简单，快速验证
- **RAG切割Agent** — PDF全文 → AI预切割 → 人工确认 → embedding
- **选题Agent + 文献Agent** — Step 5 完整跑通
- **写作Agent** — 先生成一章，再扩展到全篇

### Phase 3: 审校
- 一致性检测
- 查重算法 + AI 降重

### Phase 4: 优化
- 摘要接力优化
- 各 Agent 的 prompt 调优
- 长文本生成的稳定性

---

## 九、目录结构

```
backend/app/
├── agents/
│   ├── __init__.py
│   ├── orchestrator.py            # LangGraph 图定义 + 状态持久化
│   ├── base.py                    # Agent 基类 (输入构造/输出解析/错误处理)
│   ├── reference_quality_agent.py # 标准参考论文质量审核Agent
│   ├── parser_agent.py            # 文献解析Agent (PDF → 元数据)
│   ├── chunk_agent.py             # RAG切割Agent (全文 → chunk建议)
│   ├── topic_agent.py             # 选题Agent (思路 → 大纲)
│   ├── literature_agent.py        # 文献Agent (大纲 ↔ 文献匹配 + 综述)
│   ├── writing_agent.py           # 写作Agent (大纲 → 逐章正文)
│   ├── chart_agent.py             # 图表Agent (数据JSON → matplotlib代码)
│   ├── review_agent.py            # 审校Agent (一致性 + 查重 + 降重)
│   ├── prompts/                   # Prompt 模板目录
│   │   ├── reference_quality.py
│   │   ├── parser.py
│   │   ├── topic.py
│   │   ├── literature.py
│   │   ├── writing/
│   │   │   ├── introduction.py
│   │   │   ├── literature_review.py
│   │   │   ├── theory.py
│   │   │   ├── methodology.py
│   │   │   ├── data_analysis.py
│   │   │   ├── discussion.py
│   │   │   └── conclusion.py
│   │   ├── chart.py
│   │   └── review.py
│   └── utils.py                   # 摘要压缩、字数统计
│
├── services/
│   ├── llm_service.py             # LLM 调用封装
│   ├── provider_gateway.py        # AI中转站调用 + usage查询
│   ├── billing_service.py         # 余额冻结、扣费、退款、流水
│   ├── model_service.py           # 模型目录和场景过滤
│   ├── search_service.py          # Google/Semantic Scholar 检索
│   ├── rag_service.py             # chunk确认、版本管理、RAG检索
│   ├── vector_store.py            # PostgreSQL pgvector 检索封装
│   ├── embedding_service.py       # Embedding provider 封装
│   ├── analysis_service.py        # 统计计算 (pandas+scipy+statsmodels)
│   ├── plagiarism_service.py      # 查重服务 (TF-IDF)
│   ├── chart_service.py           # 图表代码执行沙箱 (subprocess)
│   ├── citation_service.py        # 引用格式化 (citeproc-py + CSL)
│   ├── docx_service.py            # Word 生成 (python-docx)
│   ├── latex_service.py           # LaTeX 生成 (Jinja2)
│   └── pdf_parser.py              # PDF 文本提取 (PyMuPDF)
│
├── resources/
│   └── csl/                       # CSL 引用样式文件
│       ├── apa-7th.csl
│       ├── harvard.csl
│       ├── gb7714-2015.csl
│       └── chicago-author-date.csl
│
└── middleware/
    ├── auth.py
    └── role_guard.py
```

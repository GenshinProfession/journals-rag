---
name: 社科数据分析
description: >
  This skill should be used when the user needs to perform quantitative analysis for social science thesis papers.
  It covers the complete pipeline: scale design, simulated data generation, descriptive statistics, reliability
  (Cronbach's α, CR, AVE), validity (KMO, Bartlett, EFA, CFA, Fornell-Larcker), correlation (Pearson/Spearman),
  t-test, ANOVA, hierarchical regression, mediation (Bootstrap), moderation (simple slope), SEM fit indices,
  and APA-formatted output. It provides SPSS syntax, Stata commands, and Python equivalents (pandas, scipy,
  statsmodels, pingouin, factor_analyzer, semopy) for every test. Trigger when the user asks for SPSS analysis,
  Stata analysis, quantitative论文分析, 信效度检验, 回归分析, 中介调节, or any social science statistical method.
  支持中文和英文输出.
allowed-tools: [Bash, Read, Write, Edit, NotebookEdit, WebSearch]
---

# 社科量化分析技能 (Social Science Quantitative Analysis)

## 概述

此技能为社科硕博论文提供完整的量化数据分析能力，覆盖从量表设计到 APA 格式输出的全流程。包含 SPSS、Stata、Python 三种实现路径，以及标准化学术解读话术。

## 知识文件索引

本技能包含以下知识模块，按需加载：

| 文件 | 内容 | 行数 |
|------|------|------|
| `spss-reference.md` | 全部 SPSS 语法 + PROCESS 宏 | ~350 行 |
| `stata-reference.md` | 全部 Stata 命令 + do-file 模板 | ~300 行 |
| `python-stats.md` | Python 等价实现 + 一站式脚本 | ~400 行 |
| `apa-templates.md` | APA 格式表格/图表/话术模板 | ~250 行 |
| `templates/` | 输出模板 (CSV 结构、回归表、中介表等) | 6 个文件 |

## 分析决策树

当用户提出数据分析需求时，按以下决策树确定方法：

```
用户研究问题
    │
    ├── 描述样本特征？ ────────────────────→ 频数分析 + 描述统计
    │
    ├── 检验量表质量？
    │   ├── 内部一致性 ───────────────────→ Cronbach's α + CR + AVE
    │   └── 结构效度 ─────────────────────→ KMO + Bartlett + EFA / CFA
    │
    ├── 检验变量间关系？
    │   ├── 两个连续变量 ─────────────────→ Pearson/Spearman 相关
    │   ├── 多个自变量 → 一个因变量 ──────→ 多元线性回归 (层次回归)
    │   ├── X → M → Y 路径 ──────────────→ Bootstrap 中介效应
    │   └── Z 调节 X → Y ────────────────→ 层次回归 + 简单斜率检验
    │
    ├── 比较组间差异？
    │   ├── 两组比较 ─────────────────────→ 独立样本 t 检验 + Cohen's d
    │   └── 三组及以上 ───────────────────→ 单因素 ANOVA + Tukey HSD
    │
    └── 潜变量建模？ ──────────────────────→ SEM (拟合指标报告)
```

## 执行流程

### Phase 1: 量表生成

当用户需要量表时，生成结构化量表 JSON：

```json
{
  "scale_name": "工作满意度",
  "source": "Spector (1985); 中文版由 Zhang et al. (2019) 修订",
  "dimensions": ["内在满意度", "外在满意度"],
  "items": [
    {"id": "JS1", "text": "我对目前的工作感到满意", "dimension": "内在满意度", "reverse": false},
    {"id": "JS2", "text": "我经常想离开这份工作", "dimension": "内在满意度", "reverse": true}
  ],
  "response_format": "Likert 5级 (1=非常不同意, 5=非常同意)"
}
```

### Phase 2: 模拟数据生成

基于研究假设构造模拟 CSV：

```python
import numpy as np
import pandas as pd

np.random.seed(42)
n = 384  # 样本量

df = pd.DataFrame({
    'gender': np.random.choice([1, 2], n, p=[0.41, 0.59]),
    'age': np.random.normal(32, 8, n).astype(int).clip(22, 60),
    'education': np.random.choice([1,2,3,4], n, p=[0.05, 0.20, 0.45, 0.30]),
})

# 按假设效应量生成潜变量数据
# X → M (β=0.45), M → Y (β=-0.40), X → Y (β=-0.30)
X = np.random.normal(0, 1, n)
M = 0.45 * X + np.random.normal(0, np.sqrt(1 - 0.45**2), n)
Y = -0.30 * X - 0.40 * M + np.random.normal(0, np.sqrt(1 - 0.30**2 - 0.40**2), n)

# 5点量表化
df['JS'] = 3.5 + 0.7 * X + np.random.normal(0, 0.3, n)
df['OC'] = 3.8 + 0.6 * M + np.random.normal(0, 0.3, n)
df['TI'] = 3.0 - 0.5 * Y + np.random.normal(0, 0.3, n)
```

### Phase 3: 统计分析

按分析决策树依次执行：

1. **描述统计** → `FREQUENCIES` / `DESCRIPTIVES` / `summarize` / `describe()`
2. **共同方法偏差** → Harman 单因子检验
3. **信度** → Cronbach's α + CR + AVE
4. **效度** → KMO + Bartlett + EFA + Fornell-Larcker
5. **相关** → Pearson 相关系数矩阵
6. **主检验** → 回归 / 中介 / 调节 (取决于假设)
7. **图表** → 按 `chart-input-spec.md` 格式输出给图表Agent

### Phase 4: 结果输出

每个分析步骤输出三个文件：
- `{analysis}_result.json` — 结构化数据 (供图表Agent)
- `{analysis}_table.md` — Markdown 格式的 APA 表格
- `{analysis}_interpretation.md` — 标准学术解读文字

## 关键阈值速查

| 指标 | 良好标准 | 可接受标准 | 引用来源 |
|------|---------|-----------|---------|
| Cronbach's α | > 0.80 | > 0.70 (探索性 > 0.60) | Nunnally (1978) |
| CR | > 0.70 | > 0.60 | Fornell & Larcker (1981) |
| AVE | > 0.50 | > 0.40 | Fornell & Larcker (1981) |
| KMO | > 0.80 | > 0.70 | Kaiser (1974) |
| 因子载荷 | > 0.70 | > 0.50 | Hair et al. (2010) |
| VIF | < 5 | < 10 | Hair et al. (2010) |
| Durbin-Watson | 1.5-2.5 | — | — |
| χ²/df | < 3 | < 5 | Hu & Bentler (1999) |
| CFI | > 0.95 | > 0.90 | Hu & Bentler (1999) |
| TLI | > 0.95 | > 0.90 | Hu & Bentler (1999) |
| RMSEA | < 0.06 | < 0.08 | Hu & Bentler (1999) |
| SRMR | < 0.05 | < 0.08 | Hu & Bentler (1999) |
| Cohen's d | 0.80 (大) | 0.50 (中) / 0.20 (小) | Cohen (1988) |
| Pearson r | 0.50 (大) | 0.30 (中) / 0.10 (小) | Cohen (1988) |
| Bootstrap | 5000 次 | 1000 次 (最小) | Preacher & Hayes (2008) |
| CMB 阈值 | < 40% | < 50% | Podsakoff et al. (2003) |

## 使用示例

### 示例1: 用户说「帮我做信效度检验」

```
用户: 帮我对工作满意度量表做信效度检验

Skill 执行:
1. 加载 spss-reference.md 中 RELIABILITY 语法段
2. 执行 Cronbach's α (SPSS/Python)
3. 执行 KMO + Bartlett + EFA
4. 按 apa-templates.md 输出三线表
5. 按话术模板生成标准解读
```

### 示例2: 用户说「检验一下中介效应」

```
用户: 检验组织承诺是否在工作满意度和离职倾向之间起中介作用

Skill 执行:
1. 识别: X=工作满意度, M=组织承诺, Y=离职倾向 → PROCESS Model 4
2. 加载 PROCESS 宏语法 (spss-reference.md)
3. 执行 Bootstrap 5000 次
4. 生成中介效应表 (apa-templates.md)
5. 输出总效应、直接效应、间接效应 + Bootstrap CI + 中介占比
6. 按话术库输出标准解读
```

### 示例3: 用户说「给我一份完整分析」

```
用户: 生成完整的数据分析

Skill 执行:
1. 按 Phase 2 生成模拟CSV数据
2. 按 Phase 3 依次执行六步检验
3. 每步输出三个文件 (json + table.md + interpretation.md)
4. 生成 chart_inputs.json 供图表Agent使用
5. 汇总为完整的数据分析章 Markdown
```

## 质量检查清单

数据分析完成后，自动校验：
- [ ] 每个量表的 Cronbach's α 是否 > 0.70
- [ ] KMO 是否 > 0.70，Bartlett 是否 p < 0.05
- [ ] EFA 累计方差解释率是否 > 60%
- [ ] 回归 VIF 是否 < 10
- [ ] 中介 Bootstrap CI 是否不包含 0
- [ ] 所有 p 值是否精确到 3 位小数
- [ ] APA 表格是否含表号和标题
- [ ] 图表是否按 SPSS 风格 (白底灰网格线、无顶框右框)

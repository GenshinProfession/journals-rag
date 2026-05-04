# 社科量化分析技能库 — Data Agent 知识模块

> 运行时作为 system prompt 注入数据Agent，指导统计方法选择、代码生成和结果解读。

---

## 零、分析方法选择决策树

```
用户研究问题
    │
    ├── 描述样本特征？ ────────────────→ 频数分析 + 描述统计
    │
    ├── 检验量表质量？ ────────────────→ 信度 (Cronbach's α) + 效度 (EFA/CFA)
    │
    ├── 检验变量间关系？
    │   ├── 两个连续变量 ────────────→ Pearson/Spearman 相关
    │   ├── 多个自变量 → 一个因变量 ──→ 多元线性回归
    │   ├── 含中介路径 ──────────────→ Bootstrap 中介效应
    │   └── 含调节变量 ──────────────→ 层次回归 + 简单斜率
    │
    ├── 比较组间差异？
    │   ├── 两组比较 ────────────────→ 独立样本 t 检验
    │   └── 三组及以上 ──────────────→ 单因素方差分析 (ANOVA)
    │
    └── 潜变量建模？ ─────────────────→ SEM (AMOS/LISREL/SmartPLS)
```

---

## 一、描述统计与样本特征

### 1.1 频数分布（人口统计学变量）

**目的**：展示样本的性别、年龄、学历、收入等分类变量的分布。

**SPSS**：
```spss
FREQUENCIES VARIABLES=gender age_group education income_level
  /ORDER=ANALYSIS.
```

**Stata**：
```stata
tab gender
tab age_group
tab education
summarize age, detail
```

**Python**：
```python
import pandas as pd
df['gender'].value_counts()
df['age'].describe()
df.groupby('education').size()
```

**输出格式**：频数 + 百分比，置于「表5-1 样本描述统计 (N=xxx)」

### 1.2 变量描述统计

**目的**：报告各研究变量的均值(M)、标准差(SD)、最小值、最大值、偏度、峰度。

**SPSS**：
```spss
DESCRIPTIVES VARIABLES=JS OC TI WI
  /STATISTICS=MEAN STDDEV MIN MAX KURTOSIS SKEWNESS.
```

**Stata**：
```stata
summarize JS OC TI WI, detail
```

**Python**：
```python
desc = df[['JS','OC','TI','WI']].describe()
skew = df[['JS','OC','TI','WI']].skew()
kurt = df[['JS','OC','TI','WI']].kurtosis()
```

**输出格式** (APA)：
| 变量 | M | SD | Min | Max | 偏度 | 峰度 |
|------|---|---|-----|-----|------|------|
| 工作满意度 | 3.82 | 0.75 | 1.00 | 5.00 | -0.32 | 0.15 |

**判断标准**：偏度绝对值 < 2、峰度绝对值 < 7 → 数据近似正态分布 (Kline, 2016)

---

## 二、共同方法偏差检验 (CMB)

### 2.1 Harman 单因子检验

**目的**：检验自报告问卷是否存在严重的共同方法偏差。

**SPSS**：
```spss
FACTOR /VARIABLES JS1 JS2 JS3 JS4 JS5 OC1 OC2 OC3 OC4 OC5
  TI1 TI2 TI3 TI4 TI5 WI1 WI2 WI3 WI4 WI5
  /MISSING LISTWISE
  /ANALYSIS JS1 JS2 JS3 JS4 JS5 OC1 OC2 OC3 OC4 OC5
  TI1 TI2 TI3 TI4 TI5 WI1 WI2 WI3 WI4 WI5
  /EXTRACTION PC
  /ROTATION NOROTATE.
```

**解读**：未旋转的第一个因子方差解释率 < 40% → 无严重 CMB (Podsakoff et al., 2003)

**输出格式**：「Harman单因子检验显示，第一个未旋转因子解释了 XX% 的方差，低于40%的临界值，表明本研究不存在严重的共同方法偏差。」

---

## 三、信度检验

### 3.1 Cronbach's α

**目的**：检验量表内部一致性信度。

**标准**：α > 0.70 (Nunnally, 1978)；α > 0.60 可接受 (探索性研究)

**SPSS**：
```spss
RELIABILITY /VARIABLES=JS1 JS2 JS3 JS4 JS5
  /SCALE('工作满意度') ALL
  /MODEL=ALPHA
  /SUMMARY=TOTAL.
```

**Stata**：
```stata
alpha JS1 JS2 JS3 JS4 JS5
```

**Python**：
```python
import pingouin as pg
alpha_js = pg.cronbach_alpha(df[['JS1','JS2','JS3','JS4','JS5']])
# 输出: (0.87, [0.84, 0.90] 95%CI)
```

### 3.2 组合信度 (CR) 与 平均方差萃取量 (AVE)

**适用场景**：结构方程模型 (SEM) 中的信效度检验。

**计算方式**（基于标准化因子载荷）：
```
CR = (Σλ)² / [(Σλ)² + Σ(1-λ²)]
AVE = Σλ² / [Σλ² + Σ(1-λ²)]

λ = 标准化因子载荷
```

**Python**：
```python
import numpy as np
loadings = np.array([0.78, 0.82, 0.75, 0.80, 0.71])

# CR
sum_l = loadings.sum()
sum_l2 = (loadings**2).sum()
CR = (sum_l**2) / (sum_l**2 + (5 - sum_l2))

# AVE
AVE = sum_l2 / 5

# 标准: CR > 0.70, AVE > 0.50 (Fornell & Larcker, 1981)
```

**输出格式** (APA)：
| 变量 | 题项数 | Cronbach's α | CR | AVE |
|------|--------|-------------|-----|-----|
| 工作满意度 | 5 | 0.87 | 0.89 | 0.62 |
| 组织承诺 | 5 | 0.91 | 0.92 | 0.70 |

---

## 四、效度检验

### 4.1 KMO 与 Bartlett 球形检验

**目的**：检验数据是否适合做因子分析。

**标准**：KMO > 0.70（良好），> 0.80（很好）；Bartlett 检验 p < 0.05

**SPSS**：
```spss
FACTOR /VARIABLES=JS1 TO WI5
  /MISSING LISTWISE
  /ANALYSIS JS1 TO WI5
  /PRINT KMO
  /EXTRACTION PC.
```

**Python**：
```python
from factor_analyzer import FactorAnalyzer, calculate_kmo, calculate_bartlett_sphericity

kmo_all, kmo_model = calculate_kmo(df[items])
chi2, p_value = calculate_bartlett_sphericity(df[items])
```

### 4.2 探索性因子分析 (EFA)

**SPSS**：
```spss
FACTOR /VARIABLES=JS1 TO WI5
  /MISSING LISTWISE
  /ANALYSIS JS1 TO WI5
  /PRINT EXTRACTION ROTATION
  /CRITERIA MINEIGEN(1) ITERATE(25)
  /EXTRACTION PC
  /CRITERIA ITERATE(25)
  /ROTATION VARIMAX.
```

**关键判定**：
- 因子载荷 > 0.50 → 题项归属该因子
- 交叉载荷 > 0.40 → 考虑删除
- 累计方差解释率 > 60% (社科标准)

**输出格式** (APA)：
| 题项 | 因子1 | 因子2 | 因子3 | 因子4 |
|------|-------|-------|-------|-------|
| JS1 | **0.82** | 0.12 | 0.08 | 0.15 |
| JS2 | **0.78** | 0.09 | 0.11 | 0.10 |
| 特征值 | 3.45 | 3.12 | 2.89 | 2.67 |
| 方差解释率% | 17.25 | 15.60 | 14.45 | 13.35 |
| 累计% | 17.25 | 32.85 | 47.30 | 60.65 |

### 4.3 区分效度 — Fornell-Larcker 准则

**判定标准**：每个变量的 AVE 平方根 > 该变量与其他变量的相关系数。

**输出格式** (APA)：
| 变量 | 1 | 2 | 3 | 4 |
|------|---|---|---|---|
| 1. 工作满意度 | **0.79** | | | |
| 2. 组织承诺 | 0.45** | **0.84** | | |
| 3. 离职倾向 | -0.52** | -0.48** | **0.82** | |
| 4. 工作投入 | 0.38** | 0.41** | -0.35** | **0.77** |

> 注：对角粗体 = √AVE，\*\*p < 0.01；对角值应大于同行同列所有值

---

## 五、相关分析

### 5.1 Pearson 相关系数

**前提条件**：双变量正态分布、线性关系、无极端异常值

**SPSS**：
```spss
CORRELATIONS /VARIABLES=JS OC TI WI
  /PRINT=TWOTAIL NOSIG
  /MISSING=PAIRWISE.
```

**Stata**：
```stata
pwcorr JS OC TI WI, sig
```

**Python**：
```python
corr_matrix = df[['JS','OC','TI','WI']].corr()
p_values = df[['JS','OC','TI','WI']].rcorr().P  # pingouin
```

**效应量判断** (Cohen, 1988)：r = 0.10 小, 0.30 中, 0.50 大

### 5.2 Spearman 秩相关

**适用场景**：数据非正态、有序分类变量、存在异常值。

```python
from scipy.stats import spearmanr
rho, p = spearmanr(df['JS'], df['OC'])
```

---

## 六、回归分析

### 6.1 多元线性回归

**前提检验**：线性、正态性、同方差性、独立性 (Durbin-Watson: 1.5-2.5)、多重共线性 (VIF < 10)

**SPSS**：
```spss
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL CHANGE
  /DEPENDENT TI
  /METHOD=ENTER age gender edu
  /METHOD=ENTER JS OC WI
  /RESIDUALS DURBIN.
```

**Stata**：
```stata
reg TI JS OC WI age gender edu
estat vif
estat dwatson
```

**Python**：
```python
import statsmodels.api as sm

# Step 1: 控制变量
X1 = sm.add_constant(df[['age','gender','edu']])
model1 = sm.OLS(df['TI'], X1).fit()

# Step 2: 加入自变量
X2 = sm.add_constant(df[['age','gender','edu','JS','OC','WI']])
model2 = sm.OLS(df['TI'], X2).fit()

print(model2.summary())
# VIF
from statsmodels.stats.outliers_influence import variance_inflation_factor
vif = [variance_inflation_factor(X2.values, i) for i in range(X2.shape[1])]
```

**输出格式** (APA 层次回归表)：

| 变量 | 模型1 β | 模型2 β | VIF |
|------|---------|---------|-----|
| 年龄 | 0.05 | 0.03 | 1.21 |
| 性别 | -0.08 | -0.06 | 1.10 |
| 学历 | 0.12* | 0.08 | 1.35 |
| 工作满意度 | — | -0.35*** | 2.45 |
| 组织承诺 | — | -0.28*** | 2.31 |
| 工作投入 | — | -0.15* | 1.89 |
| R² | 0.03 | 0.42 | |
| ΔR² | — | 0.39*** | |
| F | 3.21* | 42.56*** | |

> \*p < 0.05, \*\*p < 0.01, \*\*\*p < 0.001; β = 标准化回归系数

### 6.2 回归方程解读模板

```
以离职倾向为因变量的层次回归分析结果如表X所示。
模型1仅包含控制变量，解释了3%的方差 (R²=0.03, F=3.21, p<0.05)。
模型2加入工作满意度、组织承诺和工作投入后，
方差解释率显著提升至42% (ΔR²=0.39, p<0.001)。
工作满意度 (β=-0.35, p<0.001)、组织承诺 (β=-0.28, p<0.001)
和工作投入 (β=-0.15, p<0.05) 均负向预测离职倾向。
假设H1、H2、H3得到支持。
```

---

## 七、t 检验与方差分析

### 7.1 独立样本 t 检验

**SPSS**：
```spss
T-TEST GROUPS=gender(1 2) /VARIABLES=JS OC TI WI.
```

**Python**：
```python
from scipy.stats import ttest_ind
male = df[df['gender']==1]['JS']
female = df[df['gender']==2]['JS']
t, p = ttest_ind(male, female)
# Cohen's d
d = (male.mean() - female.mean()) / np.sqrt(((len(male)-1)*male.var() + (len(female)-1)*female.var()) / (len(male)+len(female)-2))
```

**输出格式** (APA)：
| 变量 | 男性 (n=156) M±SD | 女性 (n=228) M±SD | t | p | Cohen's d |
|------|-------------------|---------------------|---|---|----------|
| 工作满意度 | 3.75±0.78 | 3.87±0.72 | -1.52 | 0.13 | 0.16 |

### 7.2 单因素方差分析 (One-way ANOVA)

**SPSS**：
```spss
ONEWAY JS BY education /STATISTICS DESCRIPTIVES /POSTHOC=TUKEY ALPHA(0.05).
```

**Python**：
```python
from scipy.stats import f_oneway
g1 = df[df['education']==1]['JS']
g2 = df[df['education']==2]['JS']
g3 = df[df['education']==3]['JS']
F, p = f_oneway(g1, g2, g3)
# 效应量 eta²
from pingouin import anova
pg.anova(data=df, dv='JS', between='education')
```

**事后方差事后比较 (Post-hoc)**：
```python
from statsmodels.stats.multicomp import pairwise_tukeyhsd
tukey = pairwise_tukeyhsd(df['JS'], df['education'])
```

---

## 八、中介效应分析

### 8.1 Bootstrap 中介效应 (Preacher & Hayes, 2004/2008)

**核心检验**：间接效应 (a×b) 的 Bootstrap 95% CI 是否包含 0。

**SPSS** (需安装 PROCESS 宏)：
```spss
PROCESS Y=TI /X=JS /M=OC /MODEL=4 /BOOT=5000 /CI=95.
```

**Python**：
```python
# 方法1: statsmodels 手动实现
from sklearn.utils import resample
import numpy as np

def bootstrap_mediation(X, M, Y, n_boot=5000):
    n = len(X)
    indirect_effects = []
    for _ in range(n_boot):
        idx = resample(range(n), n_samples=n)
        # 路径 a: X → M
        a = np.polyfit(X[idx], M[idx], 1)[0]
        # 路径 b + c': M + X → Y
        XM = np.column_stack([M[idx], X[idx]])
        coeffs = np.linalg.lstsq(np.column_stack([np.ones(n), XM]), Y[idx], rcond=None)[0]
        b = coeffs[1]  # M → Y
        indirect_effects.append(a * b)
    # 95% CI
    ci_lower = np.percentile(indirect_effects, 2.5)
    ci_upper = np.percentile(indirect_effects, 97.5)
    return np.mean(indirect_effects), ci_lower, ci_upper
```

**输出格式** (APA 中介效应表)：

| 路径 | Effect | Boot SE | Bootstrap 95% CI | 结果 |
|------|--------|---------|------------------|------|
| 总效应 (c) | -0.52*** | 0.08 | [-0.68, -0.36] | — |
| 直接效应 (c') | -0.31** | 0.09 | [-0.49, -0.13] | — |
| 间接效应 (a×b) | -0.21 | 0.05 | [-0.32, -0.12] | 中介显著 |
| 中介占比 | 40.4% | — | — | 部分中介 |

**解读模板**：
```
Bootstrap中介效应分析（5000次重抽样）显示：
工作满意度→组织承诺→离职倾向的间接效应为-0.21，
95%置信区间为[-0.32, -0.12]，不包含0，说明中介效应显著。
总效应为-0.52，直接效应为-0.31 (p<0.01)，
表明组织承诺在工作满意度与离职倾向之间起部分中介作用，
中介效应占比40.4%。假设H4得到支持。
```

### 8.2 常用 PROCESS 模型速查

| Model | 含义 | 路径 |
|-------|------|------|
| Model 4 | 简单中介 | X → M → Y |
| Model 6 | 链式中介 | X → M1 → M2 → Y |
| Model 7 | 有调节的中介 (第一阶段) | W 调节 X→M |
| Model 14 | 有调节的中介 (第二阶段) | W 调节 M→Y |
| Model 1 | 简单调节 | X×W → Y |

---

## 九、调节效应分析

### 9.1 层次回归法

**SPSS**：
```spss
* Step 1: 中心化自变量和调节变量
COMPUTE JS_c = JS - 3.82.
COMPUTE OC_c = OC - 4.15.
* Step 2: 构建交互项
COMPUTE JSxOC = JS_c * OC_c.
* Step 3: 层次回归
REGRESSION /DEPENDENT TI /METHOD=ENTER JS_c OC_c /METHOD=ENTER JSxOC.
```

**Python**：
```python
# 中心化
df['JS_c'] = df['JS'] - df['JS'].mean()
df['OC_c'] = df['OC'] - df['OC'].mean()
df['JSxOC'] = df['JS_c'] * df['OC_c']

# 层次回归
import statsmodels.api as sm
model1 = sm.OLS(df['TI'], sm.add_constant(df[['JS_c','OC_c']])).fit()
model2 = sm.OLS(df['TI'], sm.add_constant(df[['JS_c','OC_c','JSxOC']])).fit()
```

**判定**：交互项 β 显著 (p < 0.05) 且 ΔR² 显著 → 调节效应存在

**输出格式**：见回归表，重点报告交互项 β 和 ΔR²

### 9.2 简单斜率检验 (Simple Slope Test)

**目的**：当调节效应显著时，检验在调节变量的不同水平下，X→Y 的关系。

**Python**：
```python
# 计算 ±1 SD 的简单斜率
sd_OC = df['OC'].std()
low_OC = df['OC'].mean() - sd_OC
high_OC = df['OC'].mean() + sd_OC

# 低水平下的 X→Y
df_low = df.copy()
df_low['OC_c'] = df['OC_c'] - (low_OC - df['OC'].mean())
# 高水平下的 X→Y (同样处理)
```

**输出格式** (APA)：
| 调节变量水平 | β | se | t | p | 95% CI |
|-------------|----|----|----|----|--------|
| 低 (-1 SD) | -0.15 | 0.08 | -1.88 | 0.06 | [-0.31, 0.01] |
| 中 (Mean)  | -0.35*** | 0.07 | -5.00 | 0.00 | [-0.49, -0.21] |
| 高 (+1 SD) | -0.55*** | 0.09 | -6.11 | 0.00 | [-0.73, -0.37] |

### 9.3 交互效应图

**图表Agent 指令**：
```json
{
  "chart_type": "interaction_plot",
  "title": "图X 组织承诺在工满意度与离职倾向间的调节效应",
  "data": {
    "x_label": "工作满意度",
    "y_label": "离职倾向",
    "lines": [
      {"label": "低组织承诺 (-1 SD)", "x": [1,2,3,4,5], "y": [4.2,3.8,3.4,3.0,2.6]},
      {"label": "高组织承诺 (+1 SD)", "x": [1,2,3,4,5], "y": [3.5,3.3,3.1,2.9,2.7]}
    ]
  }
}
```

---

## 十、结构方程模型 (SEM) — 高阶

### 10.1 适用条件

- AMOS/LISREL/SmartPLS 输出读取
- 或 Python semopy 包

### 10.2 模型拟合指标 (报告标准)

| 指标 | 良好标准 | 可接受标准 |
|------|---------|-----------|
| χ²/df | < 3 | < 5 |
| CFI | > 0.95 | > 0.90 |
| TLI | > 0.95 | > 0.90 |
| RMSEA | < 0.06 | < 0.08 |
| SRMR | < 0.05 | < 0.08 |
| GFI | > 0.90 | > 0.85 |

### 10.3 输出格式 (APA)

```
验证性因子分析(CFA)结果显示模型拟合良好：
χ²/df=2.34, CFI=0.96, TLI=0.95, RMSEA=0.059 [90% CI: 0.052, 0.066], SRMR=0.041。
所有标准化因子载荷在0.71~0.89之间(p<0.001)，
CR在0.85~0.93之间，AVE在0.57~0.72之间，量表具有良好的聚合效度。
```

---

## 十一、Python 统计一站式代码模板

数据Agent 生成给用户的完整分析脚本：

```python
# ============================================
# 社科论文统计一站式分析模板
# 数据源: {csv_path}
# 分析日期: {date}
# ============================================

import pandas as pd
import numpy as np
import pingouin as pg
import statsmodels.api as sm
from scipy import stats
from sklearn.utils import resample
import warnings
warnings.filterwarnings('ignore')

df = pd.read_csv('{csv_path}')

# ── 1. 样本特征 ──
print("=" * 50)
print("1. 样本描述统计")
print("=" * 50)
print(df[['gender','age_group','education','income']].apply(pd.value_counts))

# ── 2. 变量描述统计 ──
print("\n" + "=" * 50)
print("2. 变量描述统计")
print("=" * 50)
items = ['JS1','JS2','JS3','JS4','JS5','OC1','OC2','OC3','OC4','OC5',
         'TI1','TI2','TI3','TI4','TI5','WI1','WI2','WI3','WI4','WI5']
desc = df[items].describe().T
desc['skew'] = df[items].skew()
desc['kurtosis'] = df[items].kurtosis()
print(desc[['mean','std','min','max','skew','kurtosis']].round(3))

# ── 3. 共同方法偏差 ──
from factor_analyzer import FactorAnalyzer
fa = FactorAnalyzer(n_factors=1, rotation=None)
fa.fit(df[items])
variance = fa.get_factor_variance()[0][0] * 100
print(f"\nHarman单因子检验: 第一个因子解释{variance:.1f}%方差")

# ── 4. 信度 ──
scales = {
    '工作满意度(JS)': ['JS1','JS2','JS3','JS4','JS5'],
    '组织承诺(OC)': ['OC1','OC2','OC3','OC4','OC5'],
    '离职倾向(TI)': ['TI1','TI2','TI3','TI4','TI5'],
    '工作投入(WI)': ['WI1','WI2','WI3','WI4','WI5']
}
print("\n" + "=" * 50)
print("4. 信度分析 (Cronbach's α)")
print("=" * 50)
for name, vars in scales.items():
    alpha, ci = pg.cronbach_alpha(df[vars])
    print(f"{name}: α={alpha:.3f}, 95%CI=[{ci[0]:.3f}, {ci[1]:.3f}]")

# ── 5. KMO & Bartlett ──
from factor_analyzer import calculate_kmo, calculate_bartlett_sphericity
kmo_all, kmo_model = calculate_kmo(df[items])
chi2, p = calculate_bartlett_sphericity(df[items])
print(f"\nKMO={kmo_model:.3f}, Bartlett χ²={chi2:.1f}, p={p:.4f}")

# ── 6. 相关分析 ──
print("\n" + "=" * 50)
print("6. Pearson相关系数矩阵")
print("=" * 50)
# 计算各量表均值
for name, vars in scales.items():
    df[name.split('(')[0].strip()] = df[vars].mean(axis=1)
corr = df[['JS','OC','TI','WI']].corr().round(3)
print(corr)

# ── 7. 层次回归 ──
print("\n" + "=" * 50)
print("7. 层次回归分析")
print("=" * 50)
y = df['TI']
# Model 1: 控制变量
X1 = sm.add_constant(df[['age','gender','education']])
m1 = sm.OLS(y, X1).fit()
print(f"模型1: R²={m1.rsquared:.3f}, F={m1.fvalue:.2f}")
# Model 2: +自变量
X2 = sm.add_constant(df[['age','gender','education','JS','OC','WI']])
m2 = sm.OLS(y, X2).fit()
print(f"模型2: R²={m2.rsquared:.3f}, ΔR²={m2.rsquared-m1.rsquared:.3f}")
print(m2.summary().tables[1])

# ── 8. 中介效应 (Bootstrap) ──
print("\n" + "=" * 50)
print("8. Bootstrap中介效应")
print("=" * 50)
X, M, Y_var = df['JS'].values, df['OC'].values, df['TI'].values
n = len(X)
indirect = []
for _ in range(5000):
    idx = resample(range(n), n_samples=n)
    b_a, _ = np.polyfit(X[idx], M[idx], 1)
    XM = np.column_stack([np.ones(n), M[idx], X[idx]])
    coeffs = np.linalg.lstsq(XM, Y_var[idx], rcond=None)[0]
    indirect.append(b_a * coeffs[1])
indirect = np.array(indirect)
ci_lo, ci_hi = np.percentile(indirect, [2.5, 97.5])
print(f"间接效应: {indirect.mean():.4f}")
print(f"95% Bootstrap CI: [{ci_lo:.4f}, {ci_hi:.4f}]")
print(f"中介显著: {'是' if ci_lo * ci_hi > 0 else '否'}")

# ── 9. 调节效应 ──
print("\n" + "=" * 50)
print("9. 调节效应分析")
print("=" * 50)
df['JS_c'] = df['JS'] - df['JS'].mean()
df['OC_c'] = df['OC'] - df['OC'].mean()
df['JSxOC'] = df['JS_c'] * df['OC_c']
X3 = sm.add_constant(df[['JS_c','OC_c']])
X4 = sm.add_constant(df[['JS_c','OC_c','JSxOC']])
m3 = sm.OLS(y, X3).fit()
m4 = sm.OLS(y, X4).fit()
delta_r2 = m4.rsquared - m3.rsquared
print(f"交互项 β={m4.params['JSxOC']:.4f}, p={m4.pvalues['JSxOC']:.4f}")
print(f"ΔR²={delta_r2:.4f}")

print("\n分析完成。")
```

---

## 十二、图表生成速查

### 12.1 社科论文常用图表

| 序号 | 图表类型 | 输出要求 | 图表Agent 参数 |
|------|---------|---------|---------------|
| 1 | 直方图+正态曲线 | 显示变量分布形态 | `chart_type: "histogram"` |
| 2 | 带误差线柱状图 | 组间比较 M±SD | `chart_type: "bar_chart", error_bar: "sd"` |
| 3 | 散点图+回归线 | 二元关系可视化 | `chart_type: "scatter_plot", add_regline: true` |
| 4 | 相关系数热力图 | 多变量相关矩阵 | `chart_type: "heatmap"` |
| 5 | 路径系数图 | 中介/调节效应路径 | `chart_type: "path_diagram"` |
| 6 | 交互效应图 | 简单斜率可视化 | `chart_type: "interaction_plot"` |
| 7 | 箱线图 | 组间分布比较 | `chart_type: "box_plot"` |
| 8 | 概念框架图 | 理论模型 | `chart_type: "mermaid"` |

### 12.2 SPSS 风格 matplotlib 模板

```python
# SPSS 风格：白底 + 灰色细网格线 + 无顶框右框
import matplotlib.pyplot as plt
import seaborn as sns

plt.rcParams.update({
    'font.family': 'SimHei',
    'font.size': 11,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.grid': True,
    'axes.grid.axis': 'y',
    'grid.alpha': 0.3,
    'figure.facecolor': 'white',
    'axes.facecolor': 'white',
    'figure.dpi': 300,
})
sns.set_style("whitegrid")
```

---

## 十三、结果解读话术库

数据Agent 在生成 `interpretation.md` 时使用的标准话术：

| 分析类型 | 话术模板 |
|---------|---------|
| **描述统计** | 「{变量}的均值为{M}，标准差为{SD}，表明样本在{变量}上{集中/分散}程度{高/中等/低}。」 |
| **信度** | 「{变量}量表的Cronbach's α系数为{α}，{大于/小于}0.70的推荐标准，表明量表具有{良好/不足}的内部一致性信度。」 |
| **相关** | 「{X}与{Y}呈{显著/不显著}{正/负}相关 (r={r}, p{</>}0.05)，效应量{小/中/大}。」 |
| **回归** | 「{X}对{Y}具有{显著/不显著}的{正向/负向}预测作用 (β={β}, t={t}, p{</>}0.05)。」 |
| **中介** | 「间接效应为{IE}，Bootstrap 95% CI={[lo, hi]}，{不}包含0，表明中介效应{显著/不显著}。」 |
| **调节** | 「交互项显著 (β={β}, p<0.05, ΔR²={Δ})，表明{Z}在{X}与{Y}的关系中起调节作用。简单斜率检验显示...」 |
| **假设检验** | 「假设{H#}{得到支持/未得到支持} ({统计量描述})。」 |

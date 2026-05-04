# Python 统计等价实现 (Python Statistical Equivalents)

> 本文件为 `社科数据分析` Skill 的知识模块，提供与 SPSS/Stata 等价的 Python 实现。

---

## 一、环境依赖

```python
# requirements.txt
numpy==1.26.0
pandas==2.1.0
scipy==1.11.0
statsmodels==0.14.0
pingouin==0.5.3
factor_analyzer==0.4.1
semopy==2.3.0
scikit-learn==1.3.0
matplotlib==3.8.0
seaborn==0.13.0
```

---

## 二、数据导入与准备

```python
import pandas as pd
import numpy as np

df = pd.read_csv('data.csv')

# 计算量表均值
df['JS'] = df[['JS1','JS2','JS3','JS4','JS5']].mean(axis=1)
df['OC'] = df[['OC1','OC2','OC3','OC4','OC5']].mean(axis=1)
df['TI'] = df[['TI1','TI2','TI3','TI4','TI5']].mean(axis=1)
df['WI'] = df[['WI1','WI2','WI3','WI4','WI5']].mean(axis=1)

# 中心化 (用于调节效应)
df['JS_c'] = df['JS'] - df['JS'].mean()
df['OC_c'] = df['OC'] - df['OC'].mean()
df['JSxOC'] = df['JS_c'] * df['OC_c']
```

---

## 三、描述统计

### 3.1 频数分布

```python
# 频数
print(df['gender'].value_counts())
print(df['education'].value_counts())

# 百分比
print(df['gender'].value_counts(normalize=True).mul(100).round(1))

# 交叉表
print(pd.crosstab(df['gender'], df['education'], normalize='columns'))
```

### 3.2 变量描述统计

```python
desc = df[['JS','OC','TI','WI']].describe().T
desc['skew'] = df[['JS','OC','TI','WI']].skew()
desc['kurtosis'] = df[['JS','OC','TI','WI']].kurtosis()
print(desc[['mean','std','min','max','skew','kurtosis']].round(3))
```

### 3.3 正态性检验

```python
from scipy.stats import shapiro, normaltest

for var in ['JS','OC','TI','WI']:
    stat, p = shapiro(df[var])      # Shapiro-Wilk
    stat2, p2 = normaltest(df[var]) # D'Agostino's K²
    print(f"{var}: Shapiro-Wilk p={p:.4f}, K² p={p2:.4f}")
```

---

## 四、信度检验

### 4.1 Cronbach's α

```python
import pingouin as pg

scales = {
    '工作满意度': ['JS1','JS2','JS3','JS4','JS5'],
    '组织承诺':   ['OC1','OC2','OC3','OC4','OC5'],
    '离职倾向':   ['TI1','TI2','TI3','TI4','TI5'],
    '工作投入':   ['WI1','WI2','WI3','WI4','WI5']
}

for name, items in scales.items():
    alpha, ci = pg.cronbach_alpha(df[items])
    print(f"{name}: α={alpha:.3f}, 95%CI=[{ci[0]:.3f}, {ci[1]:.3f}]")
```

### 4.2 CITC (项总计相关性)

```python
def citc(df, items):
    total = df[items].sum(axis=1)
    results = []
    for item in items:
        r = df[item].corr(total - df[item])
        results.append({'item': item, 'citc': r})
    return pd.DataFrame(results)

print(citc(df, ['JS1','JS2','JS3','JS4','JS5']))
```

### 4.3 CR 和 AVE (基于因子载荷)

```python
def calc_cr_ave(loadings):
    """loadings: list of standardized factor loadings"""
    loadings = np.array(loadings)
    sum_l = loadings.sum()
    sum_l2 = (loadings**2).sum()
    n = len(loadings)
    CR = (sum_l**2) / (sum_l**2 + (n - sum_l2))
    AVE = sum_l2 / n
    return CR, AVE

# 示例: 假设 EFA 输出因子载荷
js_loadings = [0.82, 0.78, 0.75, 0.80, 0.71]
cr, ave = calc_cr_ave(js_loadings)
print(f"CR={cr:.3f}, AVE={ave:.3f}")
```

---

## 五、效度检验

### 5.1 KMO 与 Bartlett

```python
from factor_analyzer import FactorAnalyzer, calculate_kmo, calculate_bartlett_sphericity

items = df[['JS1','JS2','JS3','JS4','JS5',
            'OC1','OC2','OC3','OC4','OC5',
            'TI1','TI2','TI3','TI4','TI5',
            'WI1','WI2','WI3','WI4','WI5']]

kmo_all, kmo_model = calculate_kmo(items)
chi2, p = calculate_bartlett_sphericity(items)
print(f"KMO={kmo_model:.3f}, Bartlett χ²={chi2:.2f}, p={p:.4f}")
```

### 5.2 探索性因子分析 (EFA)

```python
# 确定因子数 (平行分析)
fa = FactorAnalyzer(n_factors=20, rotation=None)
fa.fit(items)
eigenvalues, _ = fa.get_eigenvalues()
print("Eigenvalues:", eigenvalues[eigenvalues > 1])  # K1 准则

# EFA (4因子 + Varimax)
fa = FactorAnalyzer(n_factors=4, rotation='varimax')
fa.fit(items)
loadings = pd.DataFrame(
    fa.loadings_,
    index=items.columns,
    columns=[f'Factor{i+1}' for i in range(4)]
)
# 隐藏 < 0.40 的载荷
loadings_filtered = loadings.map(lambda x: round(x, 3) if abs(x) >= 0.40 else '')
print(loadings_filtered)
```

### 5.3 Harman 单因子检验

```python
fa = FactorAnalyzer(n_factors=1, rotation=None)
fa.fit(items)
variance = fa.get_factor_variance()[0][0] * 100
print(f"Harman单因子检验: 第一个因子解释 {variance:.1f}% 方差")
print(f"判定: {'通过' if variance < 40 else '存在CMB风险'}")
```

---

## 六、相关分析

### 6.1 Pearson 相关

```python
from scipy.stats import pearsonr

corr = df[['JS','OC','TI','WI']].corr()
print(corr.round(3))

# 带 p 值
n_vars = ['JS','OC','TI','WI']
n = len(n_vars)
for i in range(n):
    for j in range(i+1, n):
        r, p = pearsonr(df[n_vars[i]], df[n_vars[j]])
        print(f"{n_vars[i]} vs {n_vars[j]}: r={r:.3f}, p={p:.4f}")
```

### 6.2 Spearman 相关

```python
from scipy.stats import spearmanr

rho, p = spearmanr(df['JS'], df['OC'])
print(f"Spearman's ρ={rho:.3f}, p={p:.4f}")
```

---

## 七、差异检验

### 7.1 独立样本 t 检验

```python
from scipy.stats import ttest_ind

male = df[df['gender']==1]['JS']
female = df[df['gender']==2]['JS']
t, p = ttest_ind(male, female)

# Cohen's d
n1, n2 = len(male), len(female)
pooled_std = np.sqrt(((n1-1)*male.var() + (n2-1)*female.var()) / (n1+n2-2))
d = (male.mean() - female.mean()) / pooled_std
print(f"t({n1+n2-2})={t:.2f}, p={p:.4f}, Cohen's d={d:.2f}")
```

### 7.2 单因素 ANOVA

```python
from scipy.stats import f_oneway
import pingouin as pg

# ANOVA
groups = [group['JS'].values for name, group in df.groupby('education')]
F, p = f_oneway(*groups)
print(f"F={F:.2f}, p={p:.4f}")

# 效应量 + 事后比较
aov = pg.anova(data=df, dv='JS', between='education')
print(aov)

# Tukey HSD 事后检验
from statsmodels.stats.multicomp import pairwise_tukeyhsd
tukey = pairwise_tukeyhsd(df['JS'], df['education'])
print(tukey)
```

---

## 八、回归分析

### 8.1 多元回归

```python
import statsmodels.api as sm

y = df['TI']
X = sm.add_constant(df[['JS','OC','WI']])
model = sm.OLS(y, X).fit()
print(model.summary())

# 标准化回归系数 β
from scipy.stats import zscore
X_std = sm.add_constant(df[['JS','OC','WI']].apply(zscore))
model_std = sm.OLS(y.apply(zscore), X_std).fit()
print("标准化系数:\n", model_std.params)
```

### 8.2 层次回归

```python
# Model 1: 控制变量
X1 = sm.add_constant(df[['age','gender','education']])
m1 = sm.OLS(y, X1).fit()

# Model 2: + 自变量
X2 = sm.add_constant(df[['age','gender','education','JS','OC','WI']])
m2 = sm.OLS(y, X2).fit()

print(f"Model 1: R²={m1.rsquared:.3f}, adj R²={m1.rsquared_adj:.3f}")
print(f"Model 2: R²={m2.rsquared:.3f}, adj R²={m2.rsquared_adj:.3f}")
print(f"ΔR²={m2.rsquared - m1.rsquared:.3f}")

# ΔR² 显著性检验 (F 检验)
from statsmodels.stats.anova import anova_lm
print(anova_lm(m1, m2))
```

### 8.3 VIF 与 DW

```python
from statsmodels.stats.outliers_influence import variance_inflation_factor

# VIF
vif_data = pd.DataFrame({
    'Variable': X2.columns,
    'VIF': [variance_inflation_factor(X2.values, i) for i in range(X2.shape[1])]
})
print(vif_data)

# Durbin-Watson
from statsmodels.stats.stattools import durbin_watson
dw = durbin_watson(m2.resid)
print(f"Durbin-Watson = {dw:.3f}")
```

---

## 九、中介效应

### 9.1 Bootstrap 中介 (Preacher & Hayes, 2004)

```python
from sklearn.utils import resample

def bootstrap_mediation(X, M, Y, n_boot=5000, seed=42):
    """X→M→Y 简单中介效应 Bootstrap"""
    np.random.seed(seed)
    n = len(X)
    indirect_effects = []
    total_effects = []
    direct_effects = []
    
    for _ in range(n_boot):
        idx = resample(range(n), n_samples=n, random_state=np.random.randint(100000))
        Xi, Mi, Yi = X[idx], M[idx], Y[idx]
        
        # 路径 a: X → M
        b_a, _ = np.polyfit(Xi, Mi, 1)
        
        # 路径 b + c': M + X → Y
        XM = np.column_stack([np.ones(n), Mi, Xi])
        coeffs = np.linalg.lstsq(XM, Yi, rcond=None)[0]
        b_b, b_cp = coeffs[1], coeffs[2]
        
        indirect_effects.append(b_a * b_b)
        direct_effects.append(b_cp)
        total_effects.append(b_a * b_b + b_cp)
    
    ie = indirect_effects
    ci_lo, ci_hi = np.percentile(ie, [2.5, 97.5])
    
    return {
        'total_effect': np.mean(total_effects),
        'direct_effect': np.mean(direct_effects),
        'indirect_effect': np.mean(ie),
        'boot_se': np.std(ie),
        'ci_95_lower': ci_lo,
        'ci_95_upper': ci_hi,
        'mediation_ratio': np.mean(ie) / np.mean(total_effects) * 100,
        'significant': ci_lo * ci_hi > 0
    }

result = bootstrap_mediation(df['JS'].values, df['OC'].values, df['TI'].values)
print(f"间接效应: {result['indirect_effect']:.4f}")
print(f"95% Bootstrap CI: [{result['ci_95_lower']:.4f}, {result['ci_95_upper']:.4f}]")
print(f"中介占比: {result['mediation_ratio']:.1f}%")
print(f"中介显著: {'是' if result['significant'] else '否'}")
```

### 9.2 链式中介 (Model 6)

```python
# M1 = OC, M2 = WI
def bootstrap_chain_mediation(X, M1, M2, Y, n_boot=5000):
    n = len(X)
    results = {'ind1': [], 'ind2': [], 'ind3': []}
    
    for _ in range(n_boot):
        idx = resample(range(n), n_samples=n)
        Xi, M1i, M2i, Yi = X[idx], M1[idx], M2[idx], Y[idx]
        
        # X → M1
        a1, _ = np.polyfit(Xi, M1i, 1)
        # X → M2 (控制 M1)
        XM1 = np.column_stack([np.ones(n), M1i, Xi])
        coeffs = np.linalg.lstsq(XM1, M2i, rcond=None)[0]
        a2, d21 = coeffs[1], coeffs[2]
        # M1 + M2 + X → Y
        XM = np.column_stack([np.ones(n), M1i, M2i, Xi])
        coeffs = np.linalg.lstsq(XM, Yi, rcond=None)[0]
        b1, b2, c = coeffs[1], coeffs[2], coeffs[3]
        
        results['ind1'].append(a1 * b1)           # X→M1→Y
        results['ind2'].append(d21 * b2)           # X→M2→Y
        results['ind3'].append(a1 * a2 * b2)       # X→M1→M2→Y
    
    for k, v in results.items():
        v = np.array(v)
        ci = np.percentile(v, [2.5, 97.5])
        print(f"{k}: {v.mean():.4f}, 95%CI=[{ci[0]:.4f}, {ci[1]:.4f}], "
              f"显著={'是' if ci[0]*ci[1]>0 else '否'}")
```

---

## 十、调节效应

### 10.1 层次回归法

```python
# 中心化 (见二)
# 交互项
df['JSxOC'] = df['JS_c'] * df['OC_c']

# 层次回归
m1 = sm.OLS(y, sm.add_constant(df[['JS_c','OC_c']])).fit()
m2 = sm.OLS(y, sm.add_constant(df[['JS_c','OC_c','JSxOC']])).fit()

print(f"ΔR² = {m2.rsquared - m1.rsquared:.4f}")
print(f"交互项: β={m2.params['JSxOC']:.4f}, p={m2.pvalues['JSxOC']:.4f}")
```

### 10.2 简单斜率检验 (Simple Slope)

```python
def simple_slope(X, M, Y):
    sd_M = M.std()
    mean_M = M.mean()
    
    for level, label in [(-1, '低(-1 SD)'), (0, '中(Mean)'), (1, '高(+1 SD)')]:
        M_level = mean_M + level * sd_M
        # M_centered_at_level = M - M_level
        M_c = M - M_level
        XM = sm.add_constant(np.column_stack([X, M_c, X * M_c]))
        model = sm.OLS(Y, XM).fit()
        slope = model.params[1]  # X 的系数
        se = model.bse[1]
        t = slope / se
        p = model.pvalues[1]
        ci_low = slope - 1.96 * se
        ci_high = slope + 1.96 * se
        print(f"{label}: β={slope:.3f}, se={se:.3f}, t={t:.2f}, "
              f"p={p:.4f}, 95%CI=[{ci_low:.3f}, {ci_high:.3f}]")

simple_slope(df['JS_c'].values, df['OC_c'].values, df['TI'].values)
```

---

## 十一、结构方程模型 (SEM)

```python
import semopy as sem

# 模型定义
model_spec = """
    # 测量模型
    JS =~ JS1 + JS2 + JS3 + JS4 + JS5
    OC =~ OC1 + OC2 + OC3 + OC4 + OC5
    TI =~ TI1 + TI2 + TI3 + TI4 + TI5
    
    # 结构模型
    OC ~ JS
    TI ~ OC + JS
"""

model = sem.Model(model_spec)
model.fit(df)
print(model.inspect())
```

---

## 十二、一站式完整脚本

```python
# ============================================
# 社科论文 Python 完整分析脚本
# 输出: JSON + Markdown 表格 + 图表数据
# ============================================
import pandas as pd, numpy as np, pingouin as pg
import statsmodels.api as sm
from scipy import stats
from factor_analyzer import FactorAnalyzer, calculate_kmo, calculate_bartlett_sphericity
from sklearn.utils import resample
import json

df = pd.read_csv('data.csv')

# 计算量表均值
for name, items in {'JS':['JS1','JS2','JS3','JS4','JS5'],
                     'OC':['OC1','OC2','OC3','OC4','OC5'],
                     'TI':['TI1','TI2','TI3','TI4','TI5'],
                     'WI':['WI1','WI2','WI3','WI4','WI5']}.items():
    df[name] = df[items].mean(axis=1)

results = {}

# 1. 样本描述
results['sample_desc'] = {
    'N': len(df),
    'gender': df['gender'].value_counts().to_dict(),
    'age_summary': df['age'].describe().to_dict()
}

# 2. 变量描述
desc = df[['JS','OC','TI','WI']].describe()
results['desc_stats'] = {v: {'M': desc[v]['mean'], 'SD': desc[v]['std']} 
                         for v in ['JS','OC','TI','WI']}

# 3. 信度
results['reliability'] = {}
for name, items in {'JS':['JS1','JS2','JS3','JS4','JS5'],
                     'OC':['OC1','OC2','OC3','OC4','OC5'],
                     'TI':['TI1','TI2','TI3','TI4','TI5'],
                     'WI':['WI1','WI2','WI3','WI4','WI5']}.items():
    alpha, ci = pg.cronbach_alpha(df[items])
    results['reliability'][name] = {'alpha': round(alpha, 3), 'ci': [round(ci[0],3), round(ci[1],3)]}

# 4. 相关
corr = df[['JS','OC','TI','WI']].corr()
results['correlation'] = corr.round(3).to_dict()

# 5. 回归
y = df['TI']
X1 = sm.add_constant(df[['age','gender','education']])
X2 = sm.add_constant(df[['age','gender','education','JS','OC','WI']])
m1, m2 = sm.OLS(y, X1).fit(), sm.OLS(y, X2).fit()
results['regression'] = {
    'model1': {'R2': m1.rsquared, 'adjR2': m1.rsquared_adj},
    'model2': {'R2': m2.rsquared, 'adjR2': m2.rsquared_adj, 'deltaR2': m2.rsquared - m1.rsquared}
}

# 6. 中介
result = bootstrap_mediation(df['JS'].values, df['OC'].values, df['TI'].values)
results['mediation'] = {k: round(v, 4) if isinstance(v, float) else v 
                        for k, v in result.items()}

# 输出
with open('analysis_results.json', 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print("分析完成 → analysis_results.json")
```

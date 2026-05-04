# SPSS 语法参考 (SPSS Syntax Reference)

> 本文件为 `社科数据分析` Skill 的知识模块，按分析类型组织 SPSS 语法。
> 所有语法适用于 IBM SPSS Statistics 26+，PROCESS 宏使用 v4.2。

---

## 一、数据准备

### 1.1 计算量表均值 (COMPUTE)

```spss
* 计算各量表均值 (假设题项编号连续)
COMPUTE JS = MEAN(JS1, JS2, JS3, JS4, JS5).
COMPUTE OC = MEAN(OC1, OC2, OC3, OC4, OC5).
COMPUTE TI = MEAN(TI1, TI2, TI3, TI4, TI5).
COMPUTE WI = MEAN(WI1, WI2, WI3, WI4, WI5).
EXECUTE.
```

### 1.2 中心化 (用于调节效应)

```spss
* 计算变量均值后中心化
DESCRIPTIVES VARIABLES=JS OC /STATISTICS=MEAN.
* 假设 JS 均值 = 3.82, OC 均值 = 4.15
COMPUTE JS_c = JS - 3.82.
COMPUTE OC_c = OC - 4.15.
COMPUTE JSxOC = JS_c * OC_c.
EXECUTE.
```

### 1.3 分组变量

```spss
* 年龄分组
RECODE age (LO THRU 25=1) (26 THRU 35=2) (36 THRU 45=3) (46 THRU HI=4) INTO age_group.
VARIABLE LABELS age_group '年龄组'.
VALUE LABELS age_group 1 '25岁及以下' 2 '26-35岁' 3 '36-45岁' 4 '46岁及以上'.
EXECUTE.
```

---

## 二、描述统计与频数

### 2.1 频数分析

```spss
FREQUENCIES VARIABLES=gender age_group education income_level
  /ORDER=ANALYSIS.
```

### 2.2 变量描述统计 (含偏度峰度)

```spss
DESCRIPTIVES VARIABLES=JS OC TI WI
  /STATISTICS=MEAN STDDEV MIN MAX KURTOSIS SKEWNESS.
```

### 2.3 正态性检验

```spss
EXAMINE VARIABLES=JS OC TI WI
  /PLOT BOXPLOT HISTOGRAM NPPLOT
  /STATISTICS DESCRIPTIVES
  /CINTERVAL 95.
```

---

## 三、量表信效度

### 3.1 Cronbach's α 信度

```spss
RELIABILITY /VARIABLES=JS1 JS2 JS3 JS4 JS5
  /SCALE('工作满意度') ALL
  /MODEL=ALPHA
  /STATISTICS=DESCRIPTIVES SCALE CORR
  /SUMMARY=TOTAL.
```

### 3.2 项总计统计量 (CITC)

```spss
RELIABILITY /VARIABLES=JS1 JS2 JS3 JS4 JS5
  /SCALE('工作满意度') ALL
  /MODEL=ALPHA
  /STATISTICS=DESCRIPTIVES SCALE CORR
  /SUMMARY=TOTAL
  /ITEM=TOTAL.
* 检查 "Corrected Item-Total Correlation" 列
* CITC < 0.30 → 考虑删除该题项
* "Cronbach's Alpha if Item Deleted" > 总体α → 考虑删除
```

### 3.3 KMO 与 Bartlett

```spss
FACTOR /VARIABLES=JS1 TO WI5
  /MISSING LISTWISE
  /ANALYSIS JS1 TO WI5
  /PRINT INITIAL KMO EXTRACTION
  /CRITERIA MINEIGEN(1) ITERATE(25)
  /EXTRACTION PC
  /ROTATION NOROTATE.
```

### 3.4 探索性因子分析 (EFA) — 主成分 + 最大方差旋转

```spss
FACTOR /VARIABLES=JS1 TO WI5
  /MISSING LISTWISE
  /ANALYSIS JS1 TO WI5
  /PRINT INITIAL KMO EXTRACTION ROTATION
  /FORMAT SORT BLANK(0.40)
  /CRITERIA MINEIGEN(1) ITERATE(25)
  /EXTRACTION PC
  /CRITERIA ITERATE(25)
  /ROTATION VARIMAX.
* FORMAT SORT: 按因子载荷排序
* BLANK(0.40): 隐藏 < 0.40 的载荷
```

### 3.5 Harman 单因子检验 (CMB)

```spss
FACTOR /VARIABLES=JS1 JS2 JS3 JS4 JS5 
  OC1 OC2 OC3 OC4 OC5 
  TI1 TI2 TI3 TI4 TI5 
  WI1 WI2 WI3 WI4 WI5
  /MISSING LISTWISE
  /ANALYSIS JS1 JS2 JS3 JS4 JS5 
  OC1 OC2 OC3 OC4 OC5 
  TI1 TI2 TI3 TI4 TI5 
  WI1 WI2 WI3 WI4 WI5
  /CRITERIA FACTORS(1) ITERATE(25)
  /EXTRACTION PC
  /ROTATION NOROTATE.
* 查看 Total Variance Explained 表
* 第一个因子提取的方差 % < 40% → 无严重 CMB
```

---

## 四、相关分析

### 4.1 Pearson 相关

```spss
CORRELATIONS /VARIABLES=JS OC TI WI
  /PRINT=TWOTAIL NOSIG
  /MISSING=PAIRWISE.
```

### 4.2 Spearman 秩相关

```spss
NONPAR CORR /VARIABLES=JS OC TI WI
  /PRINT=SPEARMAN TWOTAIL NOSIG
  /MISSING=PAIRWISE.
```

---

## 五、差异检验

### 5.1 独立样本 t 检验

```spss
T-TEST GROUPS=gender(1 2)
  /MISSING=ANALYSIS
  /VARIABLES=JS OC TI WI
  /CRITERIA=CI(.95).
```

### 5.2 配对样本 t 检验

```spss
T-TEST PAIRS=JS_pre WITH JS_post (PAIRED)
  /CRITERIA=CI(.95)
  /MISSING=ANALYSIS.
```

### 5.3 单因素方差分析 (One-way ANOVA)

```spss
ONEWAY JS OC TI WI BY education
  /STATISTICS DESCRIPTIVES HOMOGENEITY
  /MISSING ANALYSIS
  /POSTHOC=TUKEY LSD ALPHA(0.05).
```

### 5.4 多因素方差分析

```spss
UNIANOVA TI BY gender education
  /METHOD=SSTYPE(3)
  /INTERCEPT=INCLUDE
  /POSTHOC=education(TUKEY)
  /EMMEANS=TABLES(gender*education)
  /PRINT ETASQ HOMOGENEITY
  /CRITERIA=ALPHA(.05)
  /DESIGN=gender education gender*education.
```

---

## 六、回归分析

### 6.1 简单线性回归

```spss
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA
  /DEPENDENT TI
  /METHOD=ENTER JS.
```

### 6.2 多元线性回归 (输入法)

```spss
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL
  /DEPENDENT TI
  /METHOD=ENTER JS OC WI.
* COLLIN TOL: 输出 VIF 和 Tolerance
```

### 6.3 层次回归

```spss
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL CHANGE
  /DEPENDENT TI
  /METHOD=ENTER age gender education
  /METHOD=ENTER JS OC WI.
* CHANGE: 输出 ΔR² 及其显著性检验
```

### 6.4 调节效应 (层次回归法)

```spss
* Step 1: 中心化 (见 1.2)
* Step 2: 构建交互项
COMPUTE JSxOC = JS_c * OC_c.
EXECUTE.

* Step 3: 层次回归
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL CHANGE
  /DEPENDENT TI
  /METHOD=ENTER JS_c OC_c
  /METHOD=ENTER JSxOC.
* 交互项显著 (p<0.05) 且 ΔR² 显著 → 调节效应存在
```

---

## 七、PROCESS 宏 (中介与调节)

### 7.1 安装 PROCESS

```spss
* 方法1: 扩展 → 实用程序 → 安装定制对话框 → 选择 process.spd
* 方法2: 语法直接调用
INSERT FILE='C:\Process_v4.2\process.sps'.
```

### 7.2 Model 4 — 简单中介

```spss
PROCESS Y=TI           /* 因变量 */
       /X=JS           /* 自变量 */
       /M=OC           /* 中介变量 */
       /MODEL=4
       /BOOT=5000
       /CI=95
       /TOTAL=1        /* 输出总效应 */
       /NORMAL=0.       /* Sobel 检验关闭,用 Bootstrap */
```

### 7.3 Model 6 — 链式中介

```spss
PROCESS Y=TI
       /X=JS
       /M=OC WI       /* M1=OC, M2=WI (按输入顺序) */
       /MODEL=6
       /BOOT=5000
       /CI=95.
```

### 7.4 Model 7 — 有调节的中介 (第一阶段调节)

```spss
PROCESS Y=TI
       /X=JS
       /M=OC
       /W=gender      /* 调节变量 */
       /MODEL=7
       /BOOT=5000
       /CI=95.
```

### 7.5 Model 14 — 有调节的中介 (第二阶段调节)

```spss
PROCESS Y=TI
       /X=JS
       /M=OC
       /V=gender      /* 第二阶段调节变量 */
       /MODEL=14
       /BOOT=5000
       /CI=95.
```

### 7.6 Model 1 — 简单调节

```spss
PROCESS Y=TI
       /X=JS
       /W=OC
       /MODEL=1
       /BOOT=5000
       /CI=95
       /JN=1.          /* Johnson-Neyman 技术 */
```

### 7.7 PROCESS 模型速查表

| Model | 名称 | 路径 |
|-------|------|------|
| 1 | 简单调节 | W 调节 X→Y |
| 4 | 简单中介 | X→M→Y |
| 5 | 有调节的中介 (直接路径调节) | W 调节 X→Y, X→M→Y |
| 6 | 链式中介 | X→M1→M2→Y |
| 7 | 有调节的中介 (第一阶段) | W 调节 X→M |
| 8 | 有调节的中介 (两阶段) | W 调节 X→M 和 M→Y |
| 14 | 有调节的中介 (第二阶段) | V 调节 M→Y |
| 15 | 有调节的中介 (直接+第二阶段) | W 调节 X→Y, V 调节 M→Y |
| 58 | 第二阶段调节的中介 | W 调节 M→Y |
| 59 | 有调节的中介 (双调节) | W 调节 X→M 和 X→Y |

---

## 八、SPSS 输出解读常用命令

### 8.1 保存标准化残差

```spss
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA
  /DEPENDENT TI /METHOD=ENTER JS OC WI
  /SAVE ZRESID.
```

### 8.2 异常值检测 (标准化残差)

```spss
* |ZRESID| > 3 → 异常值, 考虑剔除
FILTER BY ZRE_1(绝对值 < 3).
```

### 8.3 残差正态性检验

```spss
PPLOT /VARIABLES=ZRE_1
  /TYPE=P-P
  /DIST=NORMAL.
```

---

## 九、完整分析 Syntax 模板

```spss
* ============================================
* 社科论文完整 SPSS 分析 Syntax
* 项目: {project_name}
* 日期: {date}
* ============================================

* ── 1. 样本描述 ──
FREQUENCIES VARIABLES=gender age_group education.

* ── 2. 变量描述 ──
DESCRIPTIVES VARIABLES=JS OC TI WI
  /STATISTICS=MEAN STDDEV MIN MAX KURTOSIS SKEWNESS.

* ── 3. 共同方法偏差 ──
FACTOR /VARIABLES=JS1 TO WI5
  /CRITERIA FACTORS(1)
  /EXTRACTION PC /ROTATION NOROTATE.

* ── 4. 信度 ──
RELIABILITY /VARIABLES=JS1 TO JS5 /SCALE('工作满意度') ALL /MODEL=ALPHA /SUMMARY=TOTAL.
RELIABILITY /VARIABLES=OC1 TO OC5 /SCALE('组织承诺') ALL /MODEL=ALPHA /SUMMARY=TOTAL.
RELIABILITY /VARIABLES=TI1 TO TI5 /SCALE('离职倾向') ALL /MODEL=ALPHA /SUMMARY=TOTAL.
RELIABILITY /VARIABLES=WI1 TO WI5 /SCALE('工作投入') ALL /MODEL=ALPHA /SUMMARY=TOTAL.

* ── 5. 效度：KMO ──
FACTOR /VARIABLES=JS1 TO WI5
  /PRINT INITIAL KMO
  /EXTRACTION PC.

* ── 6. 效度：EFA ──
FACTOR /VARIABLES=JS1 TO WI5
  /PRINT INITIAL KMO EXTRACTION ROTATION
  /FORMAT SORT BLANK(0.40)
  /EXTRACTION PC /ROTATION VARIMAX.

* ── 7. 相关 ──
CORRELATIONS /VARIABLES=JS OC TI WI
  /PRINT=TWOTAIL NOSIG.

* ── 8. 层次回归 ──
REGRESSION /MISSING LISTWISE
  /STATISTICS COEFF OUTS R ANOVA COLLIN TOL CHANGE
  /DEPENDENT TI
  /METHOD=ENTER age gender education
  /METHOD=ENTER JS OC WI.

* ── 9. 中介效应 (PROCESS Model 4) ──
PROCESS Y=TI /X=JS /M=OC /MODEL=4 /BOOT=5000 /CI=95.
```

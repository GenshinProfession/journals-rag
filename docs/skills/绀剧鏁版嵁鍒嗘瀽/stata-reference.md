# Stata 命令参考 (Stata Command Reference)

> 本文件为 `社科数据分析` Skill 的知识模块，按分析类型组织 Stata 命令。
> 适用 Stata 15+，部分语法需安装外部包。

---

## 一、数据准备

### 1.1 导入数据

```stata
* CSV 导入
import delimited "data.csv", clear

* Excel 导入
import excel "data.xlsx", sheet("Sheet1") firstrow clear
```

### 1.2 变量计算

```stata
* 计算量表均值
gen JS = (JS1 + JS2 + JS3 + JS4 + JS5) / 5
gen OC = (OC1 + OC2 + OC3 + OC4 + OC5) / 5
gen TI = (TI1 + TI2 + TI3 + TI4 + TI5) / 5
gen WI = (WI1 + WI2 + WI3 + WI4 + WI5) / 5

* 中心化
summarize JS
gen JS_c = JS - r(mean)
summarize OC
gen OC_c = OC - r(mean)
gen JSxOC = JS_c * OC_c
```

### 1.3 变量标签

```stata
label variable JS "工作满意度"
label variable OC "组织承诺"
label variable TI "离职倾向"
label define gender_lbl 1 "男" 2 "女"
label values gender gender_lbl
```

---

## 二、描述统计

### 2.1 频数

```stata
tab gender
tab age_group
tab education
tab income
```

### 2.2 描述统计 (含偏度峰度)

```stata
summarize JS OC TI WI, detail
* detail: 输出 Percentiles, Variance, Skewness, Kurtosis
```

### 2.3 分组描述统计

```stata
bysort gender: summarize JS OC TI WI
table gender, stat(mean JS) stat(sd JS) stat(freq)
```

---

## 三、信效度

### 3.1 Cronbach's α

```stata
alpha JS1 JS2 JS3 JS4 JS5
alpha OC1 OC2 OC3 OC4 OC5
alpha TI1 TI2 TI3 TI4 TI5
alpha WI1 WI2 WI3 WI4 WI5

* 带选项
alpha JS1 JS2 JS3 JS4 JS5, item std detail
* item: 输出项-总计相关性 (CITC)
* std: 标准化 alpha
```

### 3.2 KMO (需安装包)

```stata
ssc install kmo
kmo JS1 JS2 JS3 JS4 JS5 OC1 OC2 OC3 OC4 OC5 ///
    TI1 TI2 TI3 TI4 TI5 WI1 WI2 WI3 WI4 WI5
```

### 3.3 探索性因子分析

```stata
factor JS1 JS2 JS3 JS4 JS5 OC1 OC2 OC3 OC4 OC5 ///
       TI1 TI2 TI3 TI4 TI5 WI1 WI2 WI3 WI4 WI5

* 确定因子数 (特征值 > 1)
screeplot

* 指定因子数 + 旋转
factor JS1-WI5, factors(4)
rotate, varimax
predict f1 f2 f3 f4  /* 保存因子得分 */
```

---

## 四、相关分析

### 4.1 Pearson 相关

```stata
pwcorr JS OC TI WI, sig
* sig: 显示 p 值

* 相关系数矩阵 (带星号标记)
pwcorr JS OC TI WI, sig star(0.05)
```

### 4.2 Spearman 秩相关

```stata
spearman JS OC TI WI
```

---

## 五、差异检验

### 5.1 独立样本 t 检验

```stata
ttest JS, by(gender)
ttest OC, by(gender)
ttest TI, by(gender)
ttest WI, by(gender)

* 效应量 Cohen's d (需安装)
ssc install esize
esize twosample JS, by(gender) cohensd
```

### 5.2 配对 t 检验

```stata
ttest JS_pre == JS_post
```

### 5.3 单因素 ANOVA

```stata
oneway JS education, tabulate
* tabulate: 输出描述统计表

* 事后比较 (Tukey HSD)
oneway JS education, bonferroni scheffe
```

### 5.4 多因素 ANOVA

```stata
anova TI gender##education
* ## 表示主效应 + 交互效应
```

---

## 六、回归分析

### 6.1 简单线性回归

```stata
regress TI JS
```

### 6.2 多元线性回归

```stata
regress TI JS OC WI
```

### 6.3 层次回归

```stata
* Model 1: 控制变量
regress TI age gender education
estimates store m1

* Model 2: +自变量
regress TI age gender education JS OC WI
estimates store m2

* 比较模型
estimates table m1 m2, star stats(N r2 r2_a F)
```

### 6.4 ΔR² 检验

```stata
* 运行嵌套模型后用 test 命令
test JS OC WI  /* 检验新增变量的联合显著性 */
```

### 6.5 VIF 诊断

```stata
regress TI JS OC WI
vif
* VIF > 10 → 严重多重共线性
```

### 6.6 异方差检验

```stata
regress TI JS OC WI
estat hettest
* p < 0.05 → 存在异方差 → 使用 robust 标准误
regress TI JS OC WI, robust
```

### 6.7 Durbin-Watson

```stata
regress TI JS OC WI
estat dwatson
* 1.5-2.5: 无严重自相关
```

### 6.8 标准化回归系数

```stata
regress TI JS OC WI, beta
* beta 选项输出标准化回归系数
```

---

## 七、中介与调节

### 7.1 Bootstrap 中介 (简单)

```stata
* 先安装
ssc install sgmediation

* Sobel-Goodman 检验
sgmediation TI, iv(JS) mv(OC)

* Bootstrap 中介
bootstrap r(ind_eff) r(dir_eff), reps(5000): ///
  sgmediation TI, iv(JS) mv(OC)
estat bootstrap, percentile bc
```

### 7.2 结构方程模型中介 (sem 命令)

```stata
sem (OC <- JS) (TI <- OC JS)
estat teffects
* 间接效应 = OC<-JS × TI<-OC

* Bootstrap
sem (OC <- JS) (TI <- OC JS), vce(bootstrap, reps(5000))
```

### 7.3 调节效应

```stata
* 中心化 + 交互项 (见 1.2)
regress TI JS_c OC_c JSxOC

* 简单斜率检验 (需安装)
ssc install margins
margins, dydx(JS) at(OC=(-1 0 1))
marginsplot
```

---

## 八、完整 do-file 模板

```stata
* ============================================
* 社科论文完整 Stata 分析 do-file
* 项目: {project_name}
* 日期: {date}
* ============================================

clear all
set more off
cd "{project_directory}"

* ── 导入数据 ──
import delimited "data.csv", clear

* ── 变量标签 ──
label variable JS "工作满意度"
label variable OC "组织承诺"
label variable TI "离职倾向"
label variable WI "工作投入"
label define gender_lbl 1 "男" 2 "女"
label values gender gender_lbl

* ── 1. 样本描述 ──
tab gender
tab age_group
tab education
summarize age, detail

* ── 2. 变量描述 ──
summarize JS OC TI WI, detail

* ── 3. 信度 ──
alpha JS1 JS2 JS3 JS4 JS5, item
alpha OC1 OC2 OC3 OC4 OC5, item
alpha TI1 TI2 TI3 TI4 TI5, item
alpha WI1 WI2 WI3 WI4 WI5, item

* ── 4. KMO ──
kmo JS1-WI5

* ── 5. EFA ──
factor JS1-WI5, factors(4)
rotate, varimax

* ── 6. 相关 ──
pwcorr JS OC TI WI, sig

* ── 7. 层次回归 ──
regress TI age gender education
estimates store m1
regress TI age gender education JS OC WI
estimates store m2
estimates table m1 m2, star stats(N r2 r2_a F)
vif

* ── 8. 中介 ──
sgmediation TI, iv(JS) mv(OC)
bootstrap r(ind_eff) r(dir_eff), reps(5000): sgmediation TI, iv(JS) mv(OC)

display "分析完成"
```

---

## 九、常用 Stata 外部包

```stata
ssc install estout      // 高质量回归表输出
ssc install outreg2     // Word/LaTeX 表格
ssc install asdoc       // 直接输出到 Word
ssc install coefplot    // 回归系数图
ssc install heatplot    // 热力图
ssc install sem         // 结构方程模型 (内置)
```

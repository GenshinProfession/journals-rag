"""
论文格式清单服务 v2

核心改进：每个元素都有独立的完整格式定义，不共用 spacing/margin
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class FormatField:
    """格式字段定义"""
    key: str
    label: str
    description: str
    category: str
    field_type: str
    required: bool = True
    default: Any = None
    options: list[str] | None = None
    unit: str | None = None
    placeholder: str = ""


# ============================================================
# 核心设计思想：
# 每个元素（封面、摘要、一级标题、二级标题、正文、参考文献...）
# 都有独立的完整格式定义，包括字体、字号、间距、对齐等
# ============================================================

FORMAT_FIELDS: list[FormatField] = [
    
    # ================================================================
    # 页面设置（全局）
    # ================================================================
    FormatField(key="page.size", label="纸张大小", description="论文使用的纸张大小",
                category="页面设置", field_type="select", options=["A4", "B5", "Letter"], default="A4"),
    FormatField(key="page.orientation", label="纸张方向", description="纸张方向",
                category="页面设置", field_type="select", options=["portrait", "landscape"], default="portrait"),
    FormatField(key="margin.top", label="上边距", description="页面上边距",
                category="页面设置", field_type="number", unit="cm", default=2.54, placeholder="如：2.54"),
    FormatField(key="margin.bottom", label="下边距", description="页面下边距",
                category="页面设置", field_type="number", unit="cm", default=2.54, placeholder="如：2.54"),
    FormatField(key="margin.left", label="左边距", description="页面左边距",
                category="页面设置", field_type="number", unit="cm", default=3.17, placeholder="如：3.17"),
    FormatField(key="margin.right", label="右边距", description="页面右边距",
                category="页面设置", field_type="number", unit="cm", default=3.17, placeholder="如：3.17"),
    FormatField(key="margin.binding", label="装订线距离", description="装订侧额外边距",
                category="页面设置", field_type="number", unit="cm", default=0, required=False, placeholder="如：0.5"),
    
    # ================================================================
    # 封面格式（独立的完整格式）
    # ================================================================
    FormatField(key="cover.title.font", label="封面题目字体", description="封面论文题目的字体",
                category="封面格式", field_type="text", default="宋体", placeholder="如：宋体、黑体"),
    FormatField(key="cover.title.size", label="封面题目字号", description="封面论文题目的字号",
                category="封面格式", field_type="text", default="小二号", placeholder="如：小二号、18pt"),
    FormatField(key="cover.title.bold", label="封面题目加粗", description="封面论文题目是否加粗",
                category="封面格式", field_type="boolean", default=True),
    FormatField(key="cover.title.align", label="封面题目对齐", description="封面论文题目的对齐方式",
                category="封面格式", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="cover.field.font", label="封面字段字体", description="封面其他字段的字体",
                category="封面格式", field_type="text", default="宋体", placeholder="如：宋体、仿宋"),
    FormatField(key="cover.field.size", label="封面字段字号", description="封面其他字段的字号",
                category="封面格式", field_type="text", default="四号", placeholder="如：四号、14pt"),
    FormatField(key="cover.date_format", label="封面日期格式", description="封面上日期的显示格式",
                category="封面格式", field_type="text", default="YYYY 年 M 月", placeholder="如：2024 年 6 月"),
    
    # ================================================================
    # 英文封面格式（独立的完整格式）
    # ================================================================
    FormatField(key="cover_en.title.font", label="英文标题字体", description="英文标题的字体",
                category="英文封面", field_type="text", default="Times New Roman", placeholder="如：Times New Roman"),
    FormatField(key="cover_en.title.size", label="英文标题字号", description="英文标题的字号",
                category="英文封面", field_type="text", default="二号", placeholder="如：二号、22pt"),
    FormatField(key="cover_en.title.bold", label="英文标题加粗", description="英文标题是否加粗",
                category="英文封面", field_type="boolean", default=False),
    FormatField(key="cover_en.title_case", label="英文大小写规则", description="英文标题的大小写规则",
                category="英文封面", field_type="select", 
                options=["实词首字母大写", "仅首字母大写", "全部大写"], default="实词首字母大写"),
    FormatField(key="cover_en.field.font", label="英文字段字体", description="英文封面字段的字体",
                category="英文封面", field_type="text", default="Times New Roman", placeholder="如：Times New Roman"),
    FormatField(key="cover_en.field.size", label="英文字段字号", description="英文封面字段的字号",
                category="英文封面", field_type="text", default="小四号", placeholder="如：小四号、12pt"),
    
    # ================================================================
    # 中文摘要格式（独立的完整格式）
    # ================================================================
    FormatField(key="abstract_cn.title.font", label="摘要标题字体", description="'摘要'两个字的字体",
                category="中文摘要", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="abstract_cn.title.size", label="摘要标题字号", description="'摘要'两个字的字号",
                category="中文摘要", field_type="text", default="小二号", placeholder="如：小二号"),
    FormatField(key="abstract_cn.title.bold", label="摘要标题加粗", description="'摘要'是否加粗",
                category="中文摘要", field_type="boolean", default=True),
    FormatField(key="abstract_cn.title.align", label="摘要标题对齐", description="'摘要'的对齐方式",
                category="中文摘要", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="abstract_cn.title.spacing_before", label="摘要标题段前", description="摘要标题段前间距",
                category="中文摘要", field_type="text", default="0行", placeholder="如：0行、2行"),
    FormatField(key="abstract_cn.title.spacing_after", label="摘要标题段后", description="摘要标题段后间距",
                category="中文摘要", field_type="text", default="0行", placeholder="如：0行、1行"),
    FormatField(key="abstract_cn.body.font", label="摘要正文字体", description="摘要正文的字体",
                category="中文摘要", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="abstract_cn.body.size", label="摘要正文字号", description="摘要正文的字号",
                category="中文摘要", field_type="text", default="小四号", placeholder="如：小四号"),
    FormatField(key="abstract_cn.body.line_spacing", label="摘要正文行距", description="摘要正文的行距",
                category="中文摘要", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    FormatField(key="abstract_cn.body.first_indent", label="摘要首行缩进", description="摘要正文首行缩进",
                category="中文摘要", field_type="text", default="2字符", placeholder="如：2字符"),
    FormatField(key="abstract_cn.max_words", label="摘要字数限制", description="摘要的最大字数（0=无限制）",
                category="中文摘要", field_type="number", default=0, required=False, placeholder="如：500"),
    
    # ================================================================
    # 英文摘要格式（独立的完整格式）
    # ================================================================
    FormatField(key="abstract_en.title.font", label="Abstract标题字体", description="'Abstract'的字体",
                category="英文摘要", field_type="text", default="Times New Roman", placeholder="如：Times New Roman"),
    FormatField(key="abstract_en.title.size", label="Abstract标题字号", description="'Abstract'的字号",
                category="英文摘要", field_type="text", default="小二号", placeholder="如：小二号"),
    FormatField(key="abstract_en.title.bold", label="Abstract标题加粗", description="'Abstract'是否加粗",
                category="英文摘要", field_type="boolean", default=True),
    FormatField(key="abstract_en.title.align", label="Abstract标题对齐", description="'Abstract'的对齐方式",
                category="英文摘要", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="abstract_en.body.font", label="英文摘要正文字体", description="英文摘要正文的字体",
                category="英文摘要", field_type="text", default="Times New Roman", placeholder="如：Times New Roman"),
    FormatField(key="abstract_en.body.size", label="英文摘要正文字号", description="英文摘要正文的字号",
                category="英文摘要", field_type="text", default="小四号", placeholder="如：小四号"),
    FormatField(key="abstract_en.body.line_spacing", label="英文摘要行距", description="英文摘要正文的行距",
                category="英文摘要", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    
    # ================================================================
    # 关键词格式
    # ================================================================
    FormatField(key="keywords_cn.font", label="中文字体", description="中文关键词的字体",
                category="关键词", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="keywords_cn.size", label="中文字号", description="中文关键词的字号",
                category="关键词", field_type="text", default="四号", placeholder="如：四号"),
    FormatField(key="keywords_cn.separator", label="中文分隔符", description="中文关键词的分隔符",
                category="关键词", field_type="text", default="；", placeholder="如：；"),
    FormatField(key="keywords_cn.count_min", label="最少数量", description="关键词最少数量",
                category="关键词", field_type="number", default=3, placeholder="如：3"),
    FormatField(key="keywords_cn.count_max", label="最多数量", description="关键词最多数量",
                category="关键词", field_type="number", default=5, placeholder="如：5"),
    FormatField(key="keywords_en.font", label="英文字体", description="英文关键词的字体",
                category="关键词", field_type="text", default="Times New Roman", placeholder="如：Times New Roman"),
    FormatField(key="keywords_en.size", label="英文字号", description="英文关键词的字号",
                category="关键词", field_type="text", default="四号", placeholder="如：四号"),
    FormatField(key="keywords_en.separator", label="英文分隔符", description="英文关键词的分隔符",
                category="关键词", field_type="text", default=";", placeholder="如：;"),
    
    # ================================================================
    # 目录格式（独立的完整格式）
    # ================================================================
    FormatField(key="toc.title.font", label="目录标题字体", description="'目录'两个字的字体",
                category="目录格式", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="toc.title.size", label="目录标题字号", description="'目录'两个字的字号",
                category="目录格式", field_type="text", default="小二号", placeholder="如：小二号"),
    FormatField(key="toc.title.bold", label="目录标题加粗", description="'目录'是否加粗",
                category="目录格式", field_type="boolean", default=True),
    FormatField(key="toc.title.align", label="目录标题对齐", description="'目录'的对齐方式",
                category="目录格式", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="toc.title.spacing_before", label="目录标题段前", description="目录标题段前间距",
                category="目录格式", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="toc.title.spacing_after", label="目录标题段后", description="目录标题段后间距",
                category="目录格式", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="toc.depth", label="目录深度", description="目录显示到几级标题",
                category="目录格式", field_type="select", options=["2级", "3级", "4级"], default="3级"),
    FormatField(key="toc.l1.font", label="一级条目字体", description="目录一级条目的字体",
                category="目录格式", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="toc.l1.size", label="一级条目字号", description="目录一级条目的字号",
                category="目录格式", field_type="text", default="小四号", placeholder="如：小四号"),
    FormatField(key="toc.l1.line_spacing", label="一级条目行距", description="目录一级条目的行距",
                category="目录格式", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    FormatField(key="toc.l2.font", label="二级条目字体", description="目录二级条目的字体",
                category="目录格式", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="toc.l2.size", label="二级条目字号", description="目录二级条目的字号",
                category="目录格式", field_type="text", default="小四号", placeholder="如：小四号"),
    FormatField(key="toc.l2.line_spacing", label="二级条目行距", description="目录二级条目的行距",
                category="目录格式", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    
    # ================================================================
    # 一级标题格式（独立的完整格式）
    # ================================================================
    FormatField(key="heading.l1.font", label="一级标题字体", description="一级标题的字体",
                category="一级标题", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="heading.l1.size", label="一级标题字号", description="一级标题的字号",
                category="一级标题", field_type="text", default="小二号", placeholder="如：小二号、18pt"),
    FormatField(key="heading.l1.bold", label="一级标题加粗", description="一级标题是否加粗",
                category="一级标题", field_type="boolean", default=True),
    FormatField(key="heading.l1.align", label="一级标题对齐", description="一级标题的对齐方式",
                category="一级标题", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="heading.l1.spacing_before", label="一级标题段前", description="一级标题段前间距",
                category="一级标题", field_type="text", default="2行", placeholder="如：2行、24磅"),
    FormatField(key="heading.l1.spacing_after", label="一级标题段后", description="一级标题段后间距",
                category="一级标题", field_type="text", default="1行", placeholder="如：1行、12磅"),
    FormatField(key="heading.l1.line_spacing", label="一级标题行距", description="一级标题的行距",
                category="一级标题", field_type="text", default="1.5倍", placeholder="如：1.5倍、固定值20磅"),
    FormatField(key="heading.l1.page_break_before", label="标题前分页", description="一级标题前是否分页",
                category="一级标题", field_type="boolean", default=True),
    FormatField(key="heading.l1.numbering", label="编号格式", description="一级标题的编号格式",
                category="一级标题", field_type="select", 
                options=["1", "第一章", "一、", "不编号"], default="1"),
    
    # ================================================================
    # 二级标题格式（独立的完整格式）
    # ================================================================
    FormatField(key="heading.l2.font", label="二级标题字体", description="二级标题的字体",
                category="二级标题", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="heading.l2.size", label="二级标题字号", description="二级标题的字号",
                category="二级标题", field_type="text", default="小三号", placeholder="如：小三号、15pt"),
    FormatField(key="heading.l2.bold", label="二级标题加粗", description="二级标题是否加粗",
                category="二级标题", field_type="boolean", default=True),
    FormatField(key="heading.l2.align", label="二级标题对齐", description="二级标题的对齐方式",
                category="二级标题", field_type="select", options=["居中", "左对齐"], default="左对齐"),
    FormatField(key="heading.l2.spacing_before", label="二级标题段前", description="二级标题段前间距",
                category="二级标题", field_type="text", default="1行", placeholder="如：1行、12磅"),
    FormatField(key="heading.l2.spacing_after", label="二级标题段后", description="二级标题段后间距",
                category="二级标题", field_type="text", default="0.5行", placeholder="如：0.5行、6磅"),
    FormatField(key="heading.l2.line_spacing", label="二级标题行距", description="二级标题的行距",
                category="二级标题", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    FormatField(key="heading.l2.numbering", label="编号格式", description="二级标题的编号格式",
                category="二级标题", field_type="select",
                options=["1.1", "（一）", "（1）", "不编号"], default="1.1"),
    
    # ================================================================
    # 三级标题格式（独立的完整格式）
    # ================================================================
    FormatField(key="heading.l3.font", label="三级标题字体", description="三级标题的字体",
                category="三级标题", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="heading.l3.size", label="三级标题字号", description="三级标题的字号",
                category="三级标题", field_type="text", default="四号", placeholder="如：四号、14pt"),
    FormatField(key="heading.l3.bold", label="三级标题加粗", description="三级标题是否加粗",
                category="三级标题", field_type="boolean", default=True),
    FormatField(key="heading.l3.align", label="三级标题对齐", description="三级标题的对齐方式",
                category="三级标题", field_type="select", options=["居中", "左对齐"], default="左对齐"),
    FormatField(key="heading.l3.spacing_before", label="三级标题段前", description="三级标题段前间距",
                category="三级标题", field_type="text", default="0.5行", placeholder="如：0.5行、6磅"),
    FormatField(key="heading.l3.spacing_after", label="三级标题段后", description="三级标题段后间距",
                category="三级标题", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="heading.l3.line_spacing", label="三级标题行距", description="三级标题的行距",
                category="三级标题", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    FormatField(key="heading.l3.numbering", label="编号格式", description="三级标题的编号格式",
                category="三级标题", field_type="select",
                options=["1.1.1", "1.", "（1）", "不编号"], default="1.1.1"),
    
    # ================================================================
    # 正文格式（独立的完整格式）
    # ================================================================
    FormatField(key="body.font", label="正文字体", description="正文的字体",
                category="正文格式", field_type="text", default="宋体", placeholder="如：宋体、仿宋"),
    FormatField(key="body.size", label="正文字号", description="正文的字号",
                category="正文格式", field_type="text", default="小四号", placeholder="如：小四号、12pt"),
    FormatField(key="body.line_spacing", label="正文行距", description="正文的行距",
                category="正文格式", field_type="text", default="1.5倍", placeholder="如：1.5倍、固定值20磅"),
    FormatField(key="body.first_indent", label="首行缩进", description="正文首行缩进",
                category="正文格式", field_type="text", default="2字符", placeholder="如：2字符、0.74cm"),
    FormatField(key="body.align", label="正文对齐", description="正文的对齐方式",
                category="正文格式", field_type="select", options=["两端对齐", "左对齐"], default="两端对齐"),
    FormatField(key="body.spacing_before", label="正文段前", description="正文段前间距",
                category="正文格式", field_type="text", default="0行", required=False, placeholder="如：0行"),
    FormatField(key="body.spacing_after", label="正文段后", description="正文段后间距",
                category="正文格式", field_type="text", default="0行", required=False, placeholder="如：0行"),
    
    # ================================================================
    # 图标题格式（独立的完整格式）
    # ================================================================
    FormatField(key="figure.caption.position", label="图标题位置", description="图标题放在图的哪个位置",
                category="图标题", field_type="select", options=["图下方", "图上方"], default="图下方"),
    FormatField(key="figure.caption.font", label="图标题字体", description="图标题的字体",
                category="图标题", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="figure.caption.size", label="图标题字号", description="图标题的字号",
                category="图标题", field_type="text", default="五号", placeholder="如：五号、10.5pt"),
    FormatField(key="figure.caption.align", label="图标题对齐", description="图标题的对齐方式",
                category="图标题", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="figure.caption.spacing_before", label="图标题段前", description="图标题段前间距",
                category="图标题", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="figure.caption.spacing_after", label="图标题段后", description="图标题段后间距",
                category="图标题", field_type="text", default="0.5行", placeholder="如：0.5行"),
    FormatField(key="figure.numbering", label="图编号方式", description="图的编号方式",
                category="图标题", field_type="select",
                options=["按章节编号（图2-1）", "连续编号（图1）"], default="按章节编号（图2-1）"),
    
    # ================================================================
    # 表标题格式（独立的完整格式）
    # ================================================================
    FormatField(key="table.caption.position", label="表标题位置", description="表标题放在表的哪个位置",
                category="表标题", field_type="select", options=["表上方", "表下方"], default="表上方"),
    FormatField(key="table.caption.font", label="表标题字体", description="表标题的字体",
                category="表标题", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="table.caption.size", label="表标题字号", description="表标题的字号",
                category="表标题", field_type="text", default="五号", placeholder="如：五号、10.5pt"),
    FormatField(key="table.caption.align", label="表标题对齐", description="表标题的对齐方式",
                category="表标题", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="table.caption.spacing_before", label="表标题段前", description="表标题段前间距",
                category="表标题", field_type="text", default="0.5行", placeholder="如：0.5行"),
    FormatField(key="table.caption.spacing_after", label="表标题段后", description="表标题段后间距",
                category="表标题", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="table.numbering", label="表编号方式", description="表的编号方式",
                category="表标题", field_type="select",
                options=["按章节编号（表2-1）", "连续编号（表1）"], default="按章节编号（表2-1）"),
    FormatField(key="table.content.font", label="表格内容字体", description="表格内容的字体",
                category="表标题", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="table.content.size", label="表格内容字号", description="表格内容的字号",
                category="表标题", field_type="text", default="五号", placeholder="如：五号、10.5pt"),
    
    # ================================================================
    # 公式格式（独立的完整格式）
    # ================================================================
    FormatField(key="formula.numbering", label="公式编号方式", description="公式的编号方式",
                category="公式格式", field_type="select",
                options=["按章节编号（(2-1)）", "连续编号（(1)）"], default="按章节编号（(2-1)）"),
    FormatField(key="formula.number_align", label="公式编号位置", description="公式编号的对齐方式",
                category="公式格式", field_type="select", options=["右对齐", "居中"], default="右对齐"),
    FormatField(key="formula.body.font", label="公式说明字体", description="公式说明文字的字体",
                category="公式格式", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="formula.body.size", label="公式说明字号", description="公式说明文字的字号",
                category="公式格式", field_type="text", default="小四号", placeholder="如：小四号"),
    FormatField(key="formula.spacing_before", label="公式段前", description="公式段前间距",
                category="公式格式", field_type="text", default="0.5行", placeholder="如：0.5行"),
    FormatField(key="formula.spacing_after", label="公式段后", description="公式段后间距",
                category="公式格式", field_type="text", default="0.5行", placeholder="如：0.5行"),
    
    # ================================================================
    # 参考文献格式（独立的完整格式）
    # ================================================================
    FormatField(key="references.title.font", label="参考文献标题字体", description="'参考文献'的字体",
                category="参考文献", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="references.title.size", label="参考文献标题字号", description="'参考文献'的字号",
                category="参考文献", field_type="text", default="小二号", placeholder="如：小二号"),
    FormatField(key="references.title.bold", label="参考文献标题加粗", description="'参考文献'是否加粗",
                category="参考文献", field_type="boolean", default=True),
    FormatField(key="references.title.align", label="参考文献标题对齐", description="'参考文献'的对齐方式",
                category="参考文献", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="references.title.spacing_before", label="参考文献标题段前", description="参考文献标题段前间距",
                category="参考文献", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="references.title.spacing_after", label="参考文献标题段后", description="参考文献标题段后间距",
                category="参考文献", field_type="text", default="0行", placeholder="如：0行"),
    FormatField(key="references.style", label="引用格式标准", description="使用的引用格式标准",
                category="参考文献", field_type="select",
                options=["GB/T 7714 顺序编码制", "GB/T 7714 著者-出版年制", "APA", "Harvard", "MLA", "Chicago"],
                default="GB/T 7714 顺序编码制"),
    FormatField(key="references.in_text_format", label="正文标注格式", description="正文中引用的标注格式",
                category="参考文献", field_type="text", default="[1]", placeholder="如：[1]、(Author, Year)"),
    FormatField(key="references.list.font", label="参考文献字体", description="参考文献条目的字体",
                category="参考文献", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="references.list.size", label="参考文献字号", description="参考文献条目的字号",
                category="参考文献", field_type="text", default="五号", placeholder="如：五号、10.5pt"),
    FormatField(key="references.list.line_spacing", label="参考文献行距", description="参考文献条目的行距",
                category="参考文献", field_type="text", default="1.25倍", placeholder="如：1.25倍"),
    FormatField(key="references.list.hanging_indent", label="悬挂缩进", description="参考文献的悬挂缩进",
                category="参考文献", field_type="text", default="2字符", placeholder="如：2字符"),
    FormatField(key="references.author_limit", label="作者显示数量", description="超过此数量后加'等'或'et al'",
                category="参考文献", field_type="number", default=3, placeholder="如：3"),
    
    # ================================================================
    # 致谢格式（独立的完整格式）
    # ================================================================
    FormatField(key="acknowledgments.title.font", label="致谢标题字体", description="'致谢'的字体",
                category="致谢格式", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="acknowledgments.title.size", label="致谢标题字号", description="'致谢'的字号",
                category="致谢格式", field_type="text", default="小二号", placeholder="如：小二号"),
    FormatField(key="acknowledgments.title.bold", label="致谢标题加粗", description="'致谢'是否加粗",
                category="致谢格式", field_type="boolean", default=True),
    FormatField(key="acknowledgments.title.align", label="致谢标题对齐", description="'致谢'的对齐方式",
                category="致谢格式", field_type="select", options=["居中", "左对齐"], default="居中"),
    FormatField(key="acknowledgments.body.font", label="致谢正文字体", description="致谢正文的字体",
                category="致谢格式", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="acknowledgments.body.size", label="致谢正文字号", description="致谢正文的字号",
                category="致谢格式", field_type="text", default="小四号", placeholder="如：小四号"),
    FormatField(key="acknowledgments.body.line_spacing", label="致谢正文行距", description="致谢正文的行距",
                category="致谢格式", field_type="text", default="1.5倍", placeholder="如：1.5倍"),
    
    # ================================================================
    # 附录格式（独立的完整格式）
    # ================================================================
    FormatField(key="appendix.title.font", label="附录标题字体", description="'附录'的字体",
                category="附录格式", field_type="text", default="黑体", placeholder="如：黑体"),
    FormatField(key="appendix.title.size", label="附录标题字号", description="'附录'的字号",
                category="附录格式", field_type="text", default="小二号", placeholder="如：小二号"),
    FormatField(key="appendix.body.font", label="附录正文字体", description="附录正文的字体",
                category="附录格式", field_type="text", default="宋体", placeholder="如：宋体"),
    FormatField(key="appendix.body.size", label="附录正文字号", description="附录正文的字号",
                category="附录格式", field_type="text", default="五号", placeholder="如：五号"),
    FormatField(key="appendix.body.line_spacing", label="附录正文行距", description="附录正文的行距",
                category="附录格式", field_type="text", default="1.25倍", placeholder="如：1.25倍"),
    FormatField(key="appendix.code.font", label="代码字体", description="附录代码的字体",
                category="附录格式", field_type="text", default="宋体", placeholder="如：宋体、Courier New"),
    FormatField(key="appendix.code.size", label="代码字号", description="附录代码的字号",
                category="附录格式", field_type="text", default="五号", placeholder="如：五号"),
    FormatField(key="appendix.code.line_spacing", label="代码行距", description="附录代码的行距",
                category="附录格式", field_type="text", default="单倍", placeholder="如：单倍"),
    
    # ================================================================
    # 页眉页脚格式
    # ================================================================
    FormatField(key="header.enabled", label="是否需要页眉", description="是否在页面顶部添加页眉",
                category="页眉页脚", field_type="boolean", default=False),
    FormatField(key="header.content", label="页眉内容", description="页眉显示的内容",
                category="页眉页脚", field_type="text", default="", required=False, placeholder="如：XX大学毕业论文"),
    FormatField(key="header.font", label="页眉字体", description="页眉的字体",
                category="页眉页脚", field_type="text", default="宋体", required=False, placeholder="如：宋体"),
    FormatField(key="header.size", label="页眉字号", description="页眉的字号",
                category="页眉页脚", field_type="text", default="小五号", required=False, placeholder="如：小五号"),
    FormatField(key="footer.page_number_position", label="页码位置", description="页码的显示位置",
                category="页眉页脚", field_type="select",
                options=["页面底部居中", "页面底部右侧", "页面底部外侧", "不显示"],
                default="页面底部居中"),
    FormatField(key="footer.page_number_format", label="页码格式", description="页码的数字格式",
                category="页眉页脚", field_type="select",
                options=["阿拉伯数字（1,2,3）", "罗马数字（I,II,III）"],
                default="阿拉伯数字（1,2,3）"),
    FormatField(key="footer.start_from", label="页码起始页", description="从哪一部分开始显示页码",
                category="页眉页脚", field_type="select",
                options=["从正文开始", "从摘要开始", "从目录开始"],
                default="从正文开始"),
]


def get_all_fields() -> list[FormatField]:
    """获取所有格式字段"""
    return FORMAT_FIELDS


def get_fields_by_category() -> dict[str, list[FormatField]]:
    """按分类获取格式字段"""
    categories: dict[str, list[FormatField]] = {}
    for field in FORMAT_FIELDS:
        if field.category not in categories:
            categories[field.category] = []
        categories[field.category].append(field)
    return categories


def get_required_fields() -> list[FormatField]:
    """获取所有必需字段"""
    return [f for f in FORMAT_FIELDS if f.required]


def get_default_values() -> dict:
    """获取所有默认值"""
    result = {}
    for field in FORMAT_FIELDS:
        _set_nested(result, field.key, field.default)
    return result


def validate_specification(spec: dict) -> tuple[bool, list[str]]:
    """验证规范是否完整"""
    missing = []
    for field in FORMAT_FIELDS:
        if not field.required:
            continue
        value = _get_nested(spec, field.key)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(f"{field.label} ({field.key})")
    return len(missing) == 0, missing


def fill_defaults(spec: dict) -> dict:
    """用默认值填充缺失字段"""
    result = spec.copy()
    for field in FORMAT_FIELDS:
        value = _get_nested(result, field.key)
        if value is None or (isinstance(value, str) and not value.strip()):
            _set_nested(result, field.key, field.default)
    return result


def _get_nested(d: dict, key: str) -> Any:
    """获取嵌套字典的值"""
    keys = key.split(".")
    current = d
    for k in keys:
        if not isinstance(current, dict):
            return None
        current = current.get(k)
    return current


def _set_nested(d: dict, key: str, value: Any):
    """设置嵌套字典的值"""
    keys = key.split(".")
    current = d
    for k in keys[:-1]:
        if k not in current:
            current[k] = {}
        current = current[k]
    current[keys[-1]] = value


def get_checklist_summary(spec: dict) -> dict:
    """获取清单完成情况摘要"""
    total = len(FORMAT_FIELDS)
    required = len([f for f in FORMAT_FIELDS if f.required])
    filled = 0
    filled_required = 0
    missing_required = []
    
    for field in FORMAT_FIELDS:
        value = _get_nested(spec, field.key)
        is_filled = value is not None and (not isinstance(value, str) or value.strip())
        if is_filled:
            filled += 1
            if field.required:
                filled_required += 1
        elif field.required:
            missing_required.append(field.label)
    
    return {
        "total": total,
        "required": required,
        "filled": filled,
        "filled_required": filled_required,
        "completion_rate": round(filled / total * 100) if total > 0 else 0,
        "required_completion_rate": round(filled_required / required * 100) if required > 0 else 0,
        "is_complete": filled_required == required,
        "missing_required": missing_required,
    }

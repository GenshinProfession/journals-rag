"""
论文格式清单服务

定义论文格式的所有必需字段，用户必须逐项确认/填写。
不依赖 AI 评分，而是确保每个字段都有明确值。
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class FormatField:
    """格式字段定义"""
    key: str                    # 字段路径，如 "fonts.body.family"
    label: str                  # 显示名称
    description: str            # 说明
    category: str               # 分类
    field_type: str             # 类型: text, number, select, boolean
    required: bool = True       # 是否必需
    default: Any = None         # 默认值
    options: list[str] | None = None  # 选项（用于 select 类型）
    unit: str | None = None     # 单位
    placeholder: str = ""       # 占位提示


# ============================================================
# 论文格式必需字段清单（固定的，不是 AI 决定的）
# ============================================================

FORMAT_FIELDS: list[FormatField] = [
    # ---- 页面设置 ----
    FormatField(
        key="page.size",
        label="纸张大小",
        description="论文使用的纸张大小",
        category="页面设置",
        field_type="select",
        options=["A4", "B5", "Letter"],
        default="A4",
    ),
    FormatField(
        key="page.orientation",
        label="纸张方向",
        description="纸张方向",
        category="页面设置",
        field_type="select",
        options=["portrait", "landscape"],
        default="portrait",
    ),
    FormatField(
        key="margin.top",
        label="上边距",
        description="页面上边距",
        category="页面设置",
        field_type="number",
        unit="cm",
        default=2.54,
        placeholder="如：2.54",
    ),
    FormatField(
        key="margin.bottom",
        label="下边距",
        description="页面下边距",
        category="页面设置",
        field_type="number",
        unit="cm",
        default=2.54,
        placeholder="如：2.54",
    ),
    FormatField(
        key="margin.left",
        label="左边距",
        description="页面左边距",
        category="页面设置",
        field_type="number",
        unit="cm",
        default=3.17,
        placeholder="如：3.17",
    ),
    FormatField(
        key="margin.right",
        label="右边距",
        description="页面右边距",
        category="页面设置",
        field_type="number",
        unit="cm",
        default=3.17,
        placeholder="如：3.17",
    ),
    FormatField(
        key="margin.binding",
        label="装订线距离",
        description="装订侧额外边距",
        category="页面设置",
        field_type="number",
        unit="cm",
        default=0,
        required=False,
        placeholder="如：0.5",
    ),
    
    # ---- 封面格式 ----
    FormatField(
        key="cover.title.font",
        label="封面题目字体",
        description="封面论文题目的字体",
        category="封面格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体、黑体",
    ),
    FormatField(
        key="cover.title.size",
        label="封面题目字号",
        description="封面论文题目的字号",
        category="封面格式",
        field_type="text",
        default="小二号",
        placeholder="如：小二号、18pt",
    ),
    FormatField(
        key="cover.title.bold",
        label="封面题目加粗",
        description="封面论文题目是否加粗",
        category="封面格式",
        field_type="boolean",
        default=True,
    ),
    FormatField(
        key="cover.field.font",
        label="封面字段字体",
        description="封面其他字段（学院、姓名等）的字体",
        category="封面格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体、仿宋",
    ),
    FormatField(
        key="cover.field.size",
        label="封面字段字号",
        description="封面其他字段的字号",
        category="封面格式",
        field_type="text",
        default="四号",
        placeholder="如：四号、14pt",
    ),
    
    # ---- 英文封面 ----
    FormatField(
        key="cover_en.title.font",
        label="英文字体",
        description="英文标题和内容使用的字体",
        category="英文格式",
        field_type="text",
        default="Times New Roman",
        placeholder="如：Times New Roman",
    ),
    FormatField(
        key="cover_en.title.size",
        label="英文标题字号",
        description="英文标题的字号",
        category="英文格式",
        field_type="text",
        default="二号",
        placeholder="如：二号、22pt",
    ),
    FormatField(
        key="cover_en.title.bold",
        label="英文标题加粗",
        description="英文标题是否加粗",
        category="英文格式",
        field_type="boolean",
        default=False,
    ),
    FormatField(
        key="cover_en.title_case",
        label="英文大小写规则",
        description="英文标题的大小写规则",
        category="英文格式",
        field_type="select",
        options=["实词首字母大写", "仅首字母大写", "全部大写"],
        default="实词首字母大写",
    ),
    
    # ---- 摘要格式 ----
    FormatField(
        key="abstract.title.font",
        label="摘要标题字体",
        description="'摘要'两个字的字体",
        category="摘要格式",
        field_type="text",
        default="黑体",
        placeholder="如：黑体、宋体",
    ),
    FormatField(
        key="abstract.title.size",
        label="摘要标题字号",
        description="'摘要'两个字的字号",
        category="摘要格式",
        field_type="text",
        default="小二号",
        placeholder="如：小二号、18pt",
    ),
    FormatField(
        key="abstract.body.font",
        label="摘要正文字体",
        description="摘要正文的字体",
        category="摘要格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体",
    ),
    FormatField(
        key="abstract.body.size",
        label="摘要正文字号",
        description="摘要正文的字号",
        category="摘要格式",
        field_type="text",
        default="小四号",
        placeholder="如：小四号、12pt",
    ),
    FormatField(
        key="abstract.max_words",
        label="摘要字数限制",
        description="摘要的最大字数（0表示无限制）",
        category="摘要格式",
        field_type="number",
        default=0,
        required=False,
        placeholder="如：500",
    ),
    
    # ---- 关键词格式 ----
    FormatField(
        key="keywords.count_min",
        label="关键词最少数量",
        description="关键词的最少数量",
        category="关键词格式",
        field_type="number",
        default=3,
        placeholder="如：3",
    ),
    FormatField(
        key="keywords.count_max",
        label="关键词最多数量",
        description="关键词的最多数量",
        category="关键词格式",
        field_type="number",
        default=5,
        placeholder="如：5",
    ),
    FormatField(
        key="keywords.separator",
        label="关键词分隔符",
        description="关键词之间的分隔符",
        category="关键词格式",
        field_type="text",
        default="；",
        placeholder="如：；、,",
    ),
    
    # ---- 正文标题格式 ----
    FormatField(
        key="heading.l1.font",
        label="一级标题字体",
        description="一级标题（章标题）的字体",
        category="标题格式",
        field_type="text",
        default="黑体",
        placeholder="如：黑体、宋体",
    ),
    FormatField(
        key="heading.l1.size",
        label="一级标题字号",
        description="一级标题的字号",
        category="标题格式",
        field_type="text",
        default="小二号",
        placeholder="如：小二号、18pt",
    ),
    FormatField(
        key="heading.l1.bold",
        label="一级标题加粗",
        description="一级标题是否加粗",
        category="标题格式",
        field_type="boolean",
        default=True,
    ),
    FormatField(
        key="heading.l1.align",
        label="一级标题对齐",
        description="一级标题的对齐方式",
        category="标题格式",
        field_type="select",
        options=["居中", "左对齐"],
        default="居中",
    ),
    FormatField(
        key="heading.l2.font",
        label="二级标题字体",
        description="二级标题的字体",
        category="标题格式",
        field_type="text",
        default="黑体",
        placeholder="如：黑体、宋体",
    ),
    FormatField(
        key="heading.l2.size",
        label="二级标题字号",
        description="二级标题的字号",
        category="标题格式",
        field_type="text",
        default="小三号",
        placeholder="如：小三号、15pt",
    ),
    FormatField(
        key="heading.l2.bold",
        label="二级标题加粗",
        description="二级标题是否加粗",
        category="标题格式",
        field_type="boolean",
        default=True,
    ),
    FormatField(
        key="heading.l3.font",
        label="三级标题字体",
        description="三级标题的字体",
        category="标题格式",
        field_type="text",
        default="黑体",
        placeholder="如：黑体、宋体",
    ),
    FormatField(
        key="heading.l3.size",
        label="三级标题字号",
        description="三级标题的字号",
        category="标题格式",
        field_type="text",
        default="四号",
        placeholder="如：四号、14pt",
    ),
    FormatField(
        key="heading.l3.bold",
        label="三级标题加粗",
        description="三级标题是否加粗",
        category="标题格式",
        field_type="boolean",
        default=True,
    ),
    FormatField(
        key="heading.numbering",
        label="标题编号格式",
        description="标题的编号方式",
        category="标题格式",
        field_type="select",
        options=["1.1.1", "第一章/1.1/1.1.1", "一、/（一）/1."],
        default="1.1.1",
    ),
    
    # ---- 正文格式 ----
    FormatField(
        key="body.font",
        label="正文字体",
        description="正文使用的字体",
        category="正文格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体、仿宋",
    ),
    FormatField(
        key="body.size",
        label="正文字号",
        description="正文的字号",
        category="正文格式",
        field_type="text",
        default="小四号",
        placeholder="如：小四号、12pt",
    ),
    FormatField(
        key="body.line_spacing",
        label="行距",
        description="正文的行距",
        category="正文格式",
        field_type="text",
        default="1.5倍",
        placeholder="如：1.5倍、1.25倍、固定值20磅",
    ),
    FormatField(
        key="body.first_indent",
        label="首行缩进",
        description="首行缩进字符数",
        category="正文格式",
        field_type="text",
        default="2字符",
        placeholder="如：2字符、0.74cm",
    ),
    FormatField(
        key="body.align",
        label="正文对齐",
        description="正文的对齐方式",
        category="正文格式",
        field_type="select",
        options=["两端对齐", "左对齐"],
        default="两端对齐",
    ),
    FormatField(
        key="body.para_before",
        label="段前间距",
        description="段落前的间距",
        category="正文格式",
        field_type="text",
        default="0行",
        required=False,
        placeholder="如：0行、0.5行",
    ),
    FormatField(
        key="body.para_after",
        label="段后间距",
        description="段落后的间距",
        category="正文格式",
        field_type="text",
        default="0行",
        required=False,
        placeholder="如：0行、0.5行",
    ),
    
    # ---- 图表格式 ----
    FormatField(
        key="figure.caption_position",
        label="图标题位置",
        description="图标题放在图的哪个位置",
        category="图表格式",
        field_type="select",
        options=["图下方", "图上方"],
        default="图下方",
    ),
    FormatField(
        key="figure.caption_font",
        label="图标题字体",
        description="图标题的字体",
        category="图表格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体",
    ),
    FormatField(
        key="figure.caption_size",
        label="图标题字号",
        description="图标题的字号",
        category="图表格式",
        field_type="text",
        default="五号",
        placeholder="如：五号、10.5pt",
    ),
    FormatField(
        key="figure.numbering",
        label="图编号方式",
        description="图的编号方式",
        category="图表格式",
        field_type="select",
        options=["按章节编号（如图2-1）", "连续编号（如图1）"],
        default="按章节编号（如图2-1）",
    ),
    FormatField(
        key="table.caption_position",
        label="表标题位置",
        description="表标题放在表的哪个位置",
        category="图表格式",
        field_type="select",
        options=["表上方", "表下方"],
        default="表上方",
    ),
    FormatField(
        key="table.caption_font",
        label="表标题字体",
        description="表标题的字体",
        category="图表格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体",
    ),
    FormatField(
        key="table.caption_size",
        label="表标题字号",
        description="表标题的字号",
        category="图表格式",
        field_type="text",
        default="五号",
        placeholder="如：五号、10.5pt",
    ),
    FormatField(
        key="table.numbering",
        label="表编号方式",
        description="表的编号方式",
        category="图表格式",
        field_type="select",
        options=["按章节编号（如表2-1）", "连续编号（如表1）"],
        default="按章节编号（如表2-1）",
    ),
    
    # ---- 公式格式 ----
    FormatField(
        key="formula.numbering",
        label="公式编号方式",
        description="公式的编号方式",
        category="公式格式",
        field_type="select",
        options=["按章节编号（如(2-1)）", "连续编号（如(1)）"],
        default="按章节编号（如(2-1)）",
    ),
    FormatField(
        key="formula.number_align",
        label="公式编号位置",
        description="公式编号的对齐方式",
        category="公式格式",
        field_type="select",
        options=["右对齐", "居中"],
        default="右对齐",
    ),
    
    # ---- 参考文献格式 ----
    FormatField(
        key="citation.style",
        label="引用格式标准",
        description="使用的引用格式标准",
        category="参考文献",
        field_type="select",
        options=["GB/T 7714 顺序编码制", "GB/T 7714 著者-出版年制", "APA", "Harvard", "MLA", "Chicago"],
        default="GB/T 7714 顺序编码制",
    ),
    FormatField(
        key="citation.in_text_format",
        label="正文标注格式",
        description="正文中引用的标注格式",
        category="参考文献",
        field_type="text",
        default="[1]",
        placeholder="如：[1]、(Author, Year)",
    ),
    FormatField(
        key="citation.list_font",
        label="参考文献字体",
        description="参考文献列表的字体",
        category="参考文献",
        field_type="text",
        default="宋体",
        placeholder="如：宋体",
    ),
    FormatField(
        key="citation.list_size",
        label="参考文献字号",
        description="参考文献列表的字号",
        category="参考文献",
        field_type="text",
        default="五号",
        placeholder="如：五号、10.5pt",
    ),
    FormatField(
        key="citation.list_spacing",
        label="参考文献行距",
        description="参考文献列表的行距",
        category="参考文献",
        field_type="text",
        default="1.25倍",
        placeholder="如：1.25倍、1.5倍",
    ),
    FormatField(
        key="citation.author_limit",
        label="作者显示数量",
        description="超过此数量后加'等'或'et al'",
        category="参考文献",
        field_type="number",
        default=3,
        placeholder="如：3",
    ),
    
    # ---- 页眉页脚 ----
    FormatField(
        key="header.enabled",
        label="是否需要页眉",
        description="是否在页面顶部添加页眉",
        category="页眉页脚",
        field_type="boolean",
        default=False,
    ),
    FormatField(
        key="header.content",
        label="页眉内容",
        description="页眉显示的内容",
        category="页眉页脚",
        field_type="text",
        default="",
        required=False,
        placeholder="如：XX大学毕业论文",
    ),
    FormatField(
        key="footer.page_number",
        label="页码位置",
        description="页码的显示位置",
        category="页眉页脚",
        field_type="select",
        options=["页面底部居中", "页面底部右侧", "页面底部外侧", "不显示"],
        default="页面底部居中",
    ),
    FormatField(
        key="footer.page_number_format",
        label="页码格式",
        description="页码的数字格式",
        category="页眉页脚",
        field_type="select",
        options=["阿拉伯数字（1,2,3）", "罗马数字（I,II,III）"],
        default="阿拉伯数字（1,2,3）",
    ),
    FormatField(
        key="footer.start_from",
        label="页码起始页",
        description="从哪一部分开始显示页码",
        category="页眉页脚",
        field_type="select",
        options=["从正文开始", "从摘要开始", "从目录开始"],
        default="从正文开始",
    ),
    
    # ---- 目录格式 ----
    FormatField(
        key="toc.title_font",
        label="目录标题字体",
        description="'目录'两个字的字体",
        category="目录格式",
        field_type="text",
        default="黑体",
        placeholder="如：黑体",
    ),
    FormatField(
        key="toc.title_size",
        label="目录标题字号",
        description="'目录'两个字的字号",
        category="目录格式",
        field_type="text",
        default="小二号",
        placeholder="如：小二号",
    ),
    FormatField(
        key="toc.depth",
        label="目录深度",
        description="目录显示到几级标题",
        category="目录格式",
        field_type="select",
        options=["2级", "3级", "4级"],
        default="3级",
    ),
    FormatField(
        key="toc.item_font",
        label="目录条目字体",
        description="目录条目的字体",
        category="目录格式",
        field_type="text",
        default="宋体",
        placeholder="如：宋体",
    ),
    FormatField(
        key="toc.item_size",
        label="目录条目字号",
        description="目录条目的字号",
        category="目录格式",
        field_type="text",
        default="小四号",
        placeholder="如：小四号",
    ),
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
    """
    验证规范是否完整
    
    Returns:
        (是否完整, 缺失字段列表)
    """
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
    """
    获取清单完成情况摘要
    """
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

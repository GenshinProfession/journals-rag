"""
模板完整性检查服务

检查学校模板是否包含足够的信息来生成格式规范。
如果模板不完整，引导用户补充材料。
"""

from dataclasses import dataclass
from enum import Enum


class CompletenessLevel(Enum):
    """完整性等级"""
    EXCELLENT = "excellent"  # 优秀：模板非常详细
    GOOD = "good"          # 良好：模板基本够用
    FAIR = "fair"          # 一般：需要补充材料
    POOR = "poor"          # 较差：必须补充材料
    INSUFFICIENT = "insufficient"  # 不足：无法使用


@dataclass
class CompletenessReport:
    """完整性报告"""
    level: CompletenessLevel
    score: int  # 0-100 分
    details: dict  # 各项检查详情
    missing_items: list[str]  # 缺失的项目
    suggestions: list[str]  # 补充建议
    can_proceed: bool  # 是否可以继续
    required_supplements: list[str]  # 必须补充的材料


# 规范必需字段定义
REQUIRED_FIELDS = {
    "fonts": {
        "body": {
            "label": "正文字体",
            "importance": "critical",
            "description": "正文使用的字体（如：宋体、仿宋）",
        },
        "heading_l1": {
            "label": "一级标题字体",
            "importance": "critical",
            "description": "一级标题使用的字体和字号",
        },
        "heading_l2": {
            "label": "二级标题字体",
            "importance": "important",
            "description": "二级标题使用的字体和字号",
        },
        "heading_l3": {
            "label": "三级标题字体",
            "importance": "optional",
            "description": "三级标题使用的字体和字号",
        },
        "en_body": {
            "label": "英文字体",
            "importance": "important",
            "description": "英文内容使用的字体（如：Times New Roman）",
        },
    },
    "spacing": {
        "line": {
            "label": "行距",
            "importance": "critical",
            "description": "正文行距（如：1.5倍、1.25倍、固定值20磅）",
        },
        "first_line_indent": {
            "label": "首行缩进",
            "importance": "important",
            "description": "首行缩进字符数（如：2字符）",
        },
    },
    "margin": {
        "top": {
            "label": "上边距",
            "importance": "important",
            "description": "页面上边距（单位：cm）",
        },
        "bottom": {
            "label": "下边距",
            "importance": "important",
            "description": "页面下边距（单位：cm）",
        },
        "left": {
            "label": "左边距",
            "importance": "important",
            "description": "页面左边距（单位：cm）",
        },
        "right": {
            "label": "右边距",
            "importance": "important",
            "description": "页面右边距（单位：cm）",
        },
    },
    "citation": {
        "type": {
            "label": "引用格式类型",
            "importance": "critical",
            "description": "引用格式标准（如：GB/T 7714、APA、Harvard）",
        },
    },
    "structure": {
        "sections": {
            "label": "文档结构",
            "importance": "critical",
            "description": "论文必须包含的章节（封面、摘要、目录、正文等）",
        },
    },
}

# 完整性评分权重
FIELD_WEIGHTS = {
    "critical": 20,    # 关键字段：20分
    "important": 10,   # 重要字段：10分
    "optional": 5,     # 可选字段：5分
}


def check_completeness(specification: dict) -> CompletenessReport:
    """
    检查规范的完整性
    
    Args:
        specification: 提取的规范配置
        
    Returns:
        完整性报告
    """
    details = {}
    missing_items = []
    suggestions = []
    total_score = 0
    max_score = 0
    
    # 检查每个必需字段
    for category, fields in REQUIRED_FIELDS.items():
        category_data = specification.get(category, {})
        category_details = {}
        
        for field_name, field_info in fields.items():
            field_path = f"{category}.{field_name}"
            importance = field_info["importance"]
            weight = FIELD_WEIGHTS[importance]
            max_score += weight
            
            # 检查字段是否存在且有效
            if _is_field_present(category_data, field_name):
                total_score += weight
                category_details[field_name] = {
                    "status": "present",
                    "importance": importance,
                    "value": _get_field_value(category_data, field_name),
                }
            else:
                category_details[field_name] = {
                    "status": "missing",
                    "importance": importance,
                }
                missing_items.append(f"{field_info['label']} ({field_path})")
                
                if importance == "critical":
                    suggestions.append(f"必须提供：{field_info['description']}")
                elif importance == "important":
                    suggestions.append(f"建议提供：{field_info['description']}")
        
        details[category] = category_details
    
    # 计算得分百分比
    score_percent = int((total_score / max_score) * 100) if max_score > 0 else 0
    
    # 确定完整性等级
    level = _determine_level(score_percent, missing_items)
    
    # 判断是否可以继续
    can_proceed = level in (CompletenessLevel.EXCELLENT, CompletenessLevel.GOOD)
    
    # 确定必须补充的材料
    required_supplements = _get_required_supplements(level, missing_items)
    
    return CompletenessReport(
        level=level,
        score=score_percent,
        details=details,
        missing_items=missing_items,
        suggestions=suggestions,
        can_proceed=can_proceed,
        required_supplements=required_supplements,
    )


def _is_field_present(data: dict, field_name: str) -> bool:
    """检查字段是否存在且有效"""
    if field_name not in data:
        return False
    
    value = data[field_name]
    
    # 检查值是否有效
    if value is None:
        return False
    if isinstance(value, str) and not value.strip():
        return False
    if isinstance(value, dict) and not value:
        return False
    if isinstance(value, list) and not value:
        return False
    
    return True


def _get_field_value(data: dict, field_name: str):
    """获取字段值"""
    return data.get(field_name)


def _determine_level(score: int, missing_items: list[str]) -> CompletenessLevel:
    """确定完整性等级"""
    # 检查是否有关键字段缺失
    critical_missing = any("critical" in item for item in missing_items)
    
    if score >= 90:
        return CompletenessLevel.EXCELLENT
    elif score >= 70:
        return CompletenessLevel.GOOD
    elif score >= 50:
        return CompletenessLevel.FAIR
    elif score >= 30:
        return CompletenessLevel.POOR
    else:
        return CompletenessLevel.INSUFFICIENT


def _get_required_supplements(level: CompletenessLevel, missing_items: list[str]) -> list[str]:
    """确定必须补充的材料"""
    supplements = []
    
    if level == CompletenessLevel.EXCELLENT:
        # 优秀：无需补充
        return supplements
    
    if level in (CompletenessLevel.GOOD, CompletenessLevel.FAIR):
        # 良好/一般：建议补充
        supplements.append("格式补充说明文档（可选）")
    
    if level in (CompletenessLevel.POOR, CompletenessLevel.INSUFFICIENT):
        # 较差/不足：必须补充
        supplements.extend([
            "毕业论文格式规范文档（必须）",
            "写作指南或排版要求（必须）",
            "参考文献格式要求（必须）",
        ])
        
        # 根据缺失项添加具体要求
        for item in missing_items:
            if "字体" in item:
                supplements.append("字体字号要求说明（必须）")
            if "行距" in item:
                supplements.append("段落间距要求说明（必须）")
            if "引用" in item:
                supplements.append("参考文献格式要求（必须）")
    
    return list(set(supplements))  # 去重


def generate_completeness_message(report: CompletenessReport) -> dict:
    """
    生成完整性检查结果消息
    
    Args:
        report: 完整性报告
        
    Returns:
        包含标题、内容、操作建议的消息
    """
    level_messages = {
        CompletenessLevel.EXCELLENT: {
            "title": "模板非常详细",
            "icon": "success",
            "color": "green",
            "message": "您的模板包含了所有必要的格式信息，可以直接用于生成规范。",
        },
        CompletenessLevel.GOOD: {
            "title": "模板基本完整",
            "icon": "success",
            "color": "green",
            "message": "您的模板包含了大部分格式信息，可以正常使用。建议补充一些细节以获得更精确的规范。",
        },
        CompletenessLevel.FAIR: {
            "title": "模板需要补充",
            "icon": "warning",
            "color": "orange",
            "message": "您的模板信息不够完整，建议补充格式说明文档以获得更准确的规范。",
        },
        CompletenessLevel.POOR: {
            "title": "模板信息不足",
            "icon": "warning",
            "color": "orange",
            "message": "您的模板缺少很多关键信息，必须补充详细的格式说明文档才能生成可用的规范。",
        },
        CompletenessLevel.INSUFFICIENT: {
            "title": "模板无法使用",
            "icon": "error",
            "color": "red",
            "message": "您的模板信息严重不足，无法生成有效的规范。请提供完整的格式规范文档。",
        },
    }
    
    level_info = level_messages[report.level]
    
    # 构建详细信息
    details = []
    if report.missing_items:
        details.append({
            "type": "missing",
            "title": "缺失的格式信息",
            "items": report.missing_items[:10],  # 最多显示10项
        })
    
    if report.suggestions:
        details.append({
            "type": "suggestion",
            "title": "补充建议",
            "items": report.suggestions[:5],  # 最多显示5项
        })
    
    if report.required_supplements:
        details.append({
            "type": "required",
            "title": "必须提供的材料",
            "items": report.required_supplements,
        })
    
    return {
        "level": report.level.value,
        "score": report.score,
        "can_proceed": report.can_proceed,
        "title": level_info["title"],
        "icon": level_info["icon"],
        "color": level_info["color"],
        "message": level_info["message"],
        "details": details,
    }


# 补充材料提示模板
SUPPLEMENT_PROMPTS = {
    "fonts": """
请提供学校关于字体字号的具体要求，包括：
1. 正文使用的字体和字号（如：宋体小四号）
2. 各级标题的字体和字号（如：一级标题黑体小二号）
3. 英文和数字使用的字体（如：Times New Roman）
4. 封面、摘要、参考文献等特殊部分的字体要求
""",
    "spacing": """
请提供学校关于段落间距的具体要求，包括：
1. 正文行距（如：1.5倍行距、固定值20磅）
2. 首行缩进要求（如：缩进2字符）
3. 段前段后间距
4. 摘要、参考文献等特殊部分的行距要求
""",
    "margin": """
请提供学校关于页面边距的具体要求，包括：
1. 上边距（单位：cm）
2. 下边距（单位：cm）
3. 左边距（单位：cm）
4. 右边距（单位：cm）
5. 装订线距离（如有）
""",
    "citation": """
请提供学校关于参考文献格式的具体要求，包括：
1. 使用的引用格式标准（如：GB/T 7714-2015、APA第7版）
2. 正文中的引用标注格式（如：[1]、(作者, 年份)）
3. 参考文献列表的格式要求
4. 各类文献（期刊、专著、学位论文等）的具体格式
""",
    "structure": """
请提供学校关于论文结构的具体要求，包括：
1. 必须包含的章节（封面、摘要、目录、正文、参考文献等）
2. 各章节的顺序
3. 摘要的字数要求
4. 关键词的数量要求
5. 目录的格式要求
""",
}


def get_supplement_prompt(missing_category: str) -> str:
    """获取补充材料提示"""
    return SUPPLEMENT_PROMPTS.get(missing_category, "请提供详细的格式说明。")

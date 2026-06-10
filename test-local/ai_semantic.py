"""
AI语义分析模块
用于分析论文结构、识别页面类型、匹配语义标签
"""

import json
import re
from pathlib import Path


# 加载配置文件
CONFIG_PATH = Path(__file__).parent.parent / "config" / "paper_structure.json"


def load_config():
    """加载配置文件"""
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def match_semantic_label(text, config=None, node_info=None):
    """
    匹配语义标签
    先尝试精确匹配，再尝试模糊匹配，最后根据结构识别
    """
    if config is None:
        config = load_config()

    semantic_labels = config.get("semanticLabels", {})
    normalized_text = text.strip().replace(" ", "").replace("　", "")

    # 精确匹配
    for label, info in semantic_labels.items():
        # 检查标签本身
        if normalized_text == label.replace(" ", ""):
            return {"semantic": label, "confidence": 1.0, "method": "exact"}

        # 检查别名
        for alias in info.get("aliases", []):
            if normalized_text == alias.replace(" ", ""):
                return {"semantic": label, "confidence": 1.0, "method": "alias"}

    # 模糊匹配
    for label, info in semantic_labels.items():
        for alias in info.get("aliases", []):
            # 检查是否包含
            if alias.replace(" ", "") in normalized_text or normalized_text in alias.replace(" ", ""):
                return {"semantic": label, "confidence": 0.8, "method": "fuzzy"}

    # 关键词匹配（只在文本较短时使用）
    if len(normalized_text) < 30:  # 只对短文本进行关键词匹配
        for label, info in semantic_labels.items():
            keywords = info.get("keywords", [])
            for keyword in keywords:
                if keyword.lower() in normalized_text.lower():
                    return {"semantic": label, "confidence": 0.6, "method": "keyword"}

    # 结构识别（根据节点信息判断）
    if node_info:
        zone = node_info.get("zone", "")
        role = node_info.get("role", "")

        # 正文区域：有标题层级的区域
        if zone == "body" or role in ("heading1", "heading2", "heading3", "paragraph"):
            return {"semantic": "正文", "confidence": 0.7, "method": "structure"}

        # 媒体区域
        if zone == "media":
            return {"semantic": "正文", "confidence": 0.7, "method": "structure"}

    return {"semantic": "正文", "confidence": 0.5, "method": "default"}


def identify_page_type(page_content, config=None):
    """
    识别页面类型
    根据页面内容识别其类型
    """
    if config is None:
        config = load_config()

    # 提取页面文本
    text = page_content.get("text", "")
    nodes = page_content.get("nodes", [])

    # 如果有多个节点，综合分析
    if nodes:
        # 收集所有节点的语义
        semantics = []
        for node in nodes[:5]:  # 只取前5个节点
            node_text = node.get("text", "")
            if node_text:
                semantic = match_semantic_label(node_text, config)
                semantics.append(semantic)

        # 统计语义标签
        semantic_counts = {}
        for semantic in semantics:
            label = semantic["semantic"]
            semantic_counts[label] = semantic_counts.get(label, 0) + 1

        # 选择出现最多的语义标签
        if semantic_counts:
            max_label = max(semantic_counts, key=semantic_counts.get)
            max_count = semantic_counts[max_label]
            confidence = max_count / len(semantics) if semantics else 0

            return {
                "type": max_label,
                "confidence": confidence,
                "semantic_counts": semantic_counts
            }

    # 如果只有一个节点或没有节点，使用文本分析
    semantic = match_semantic_label(text, config)
    return {
        "type": semantic["semantic"],
        "confidence": semantic["confidence"],
        "method": semantic["method"]
    }


def analyze_paper_structure(docx_manifest, config=None):
    """
    分析论文结构
    根据manifest中的节点信息，分析论文的整体结构
    """
    if config is None:
        config = load_config()

    nodes = docx_manifest.get("nodes", [])

    # 按照zone分组
    zone_groups = {}
    for node in nodes:
        zone = node.get("zone", "unknown")
        if zone not in zone_groups:
            zone_groups[zone] = []
        zone_groups[zone].append(node)

    # 分析每个zone
    structure = []
    for zone, zone_nodes in zone_groups.items():
        # 识别zone的语义
        zone_text = " ".join([n.get("text", "") for n in zone_nodes[:3]])
        semantic = match_semantic_label(zone_text, config)

        structure.append({
            "zone": zone,
            "semantic": semantic["semantic"],
            "confidence": semantic["confidence"],
            "nodeCount": len(zone_nodes),
            "nodes": zone_nodes
        })

    return structure


def generate_tag_config(structure, config=None):
    """
    生成标签配置
    根据分析结果生成标签配置
    """
    if config is None:
        config = load_config()

    tag_config = {
        "semanticLabels": {},
        "formatRules": {},
        "nodes": []
    }

    for item in structure:
        zone = item["zone"]
        semantic = item["semantic"]
        confidence = item["confidence"]

        # 获取语义标签配置
        semantic_label = config.get("semanticLabels", {}).get(semantic, {})

        # 生成标签配置
        tag_config["semanticLabels"][semantic] = {
            "aliases": semantic_label.get("aliases", []),
            "type": semantic_label.get("type", "section"),
            "format": semantic_label.get("format", {}),
            "confidence": confidence
        }

        # 生成格式规则
        format_rule = semantic_label.get("format", {})
        tag_config["formatRules"][semantic] = format_rule

        # 生成节点配置
        for node in item.get("nodes", []):
            tag_config["nodes"].append({
                "nodeId": node.get("nodeId"),
                "zone": zone,
                "role": node.get("role"),
                "semantic": semantic,
                "format": format_rule
            })

    return tag_config


def process_paper(docx_manifest, config=None):
    """
    处理论文
    完整的论文处理流程
    """
    if config is None:
        config = load_config()

    # 1. 分析论文结构
    structure = analyze_paper_structure(docx_manifest, config)

    # 2. 生成标签配置
    tag_config = generate_tag_config(structure, config)

    # 3. 返回结果
    return {
        "structure": structure,
        "tagConfig": tag_config,
        "config": config
    }

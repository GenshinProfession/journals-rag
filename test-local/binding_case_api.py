"""
DOCX node-binding proof API.

This is a small prototype for the route:
source DOCX -> manifest -> style rules bound to real OOXML nodes
-> mutate the working DOCX -> preview the updated working DOCX.
"""

import json
import re
import shutil
import time
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import quote

from lxml import etree


ROOT = Path(__file__).parent
CASE_DIR = ROOT / "_binding_cases"
CASE_DIR.mkdir(exist_ok=True)

DEFAULT_DOCX_CANDIDATES = [
    ROOT / "论文模板说明_converted.docx",
    ROOT / "论文模板说明_converted_cleaned.docx",
    ROOT / "基于STM32的智能温湿度监测系统设计.docx",
]

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
    "v": "urn:schemas-microsoft-com:vml",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}

SIZE_OPTIONS = [
    {"label": "三号", "pt": 16},
    {"label": "小三", "pt": 15},
    {"label": "四号", "pt": 14},
    {"label": "小四", "pt": 12},
    {"label": "五号", "pt": 10.5},
]

BODY_WRITE_ROLES = {"heading1", "heading2", "heading3", "paragraph", "custom"}


def _send_json(handler, code, data):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _send_docx(handler, path: Path):
    data = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(path.name)}")
    handler.end_headers()
    handler.wfile.write(data)


def _default_docx() -> Path:
    for path in DEFAULT_DOCX_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("No test DOCX found in test-local")


def _document_xml(docx_path: Path):
    with zipfile.ZipFile(docx_path, "r") as zf:
        raw = zf.read("word/document.xml")
    return etree.fromstring(raw)


def _write_document_xml(docx_path: Path, root):
    temp_path = docx_path.with_suffix(".tmp.docx")
    updated_xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone="yes")
    with zipfile.ZipFile(docx_path, "r") as zin:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "word/document.xml":
                    zout.writestr(item, updated_xml)
                else:
                    zout.writestr(item, zin.read(item.filename))
    temp_path.replace(docx_path)


def _p_text(p):
    return "".join(p.xpath(".//w:t/text()", namespaces=NS)).strip()


def _p_direct_text(p):
    return "".join(p.xpath("./w:r/w:t/text()", namespaces=NS)).strip()


def _clear_text_runs(p):
    for t in p.xpath(".//w:t", namespaces=NS):
        t.text = ""


def _clear_nested_text_runs(p):
    run_tag = f"{{{NS['w']}}}r"
    for t in p.xpath(".//w:t", namespaces=NS):
        run = t.getparent()
        if run is None or run.tag != run_tag or run.getparent() is not p:
            t.text = ""


def _compact_text(text: str):
    return re.sub(r"\s+", "", text or "")


def _p_meta(p):
    p_style = _first(p, "./w:pPr/w:pStyle")
    outline = _first(p, "./w:pPr/w:outlineLvl")
    numbering = _first(p, "./w:pPr/w:numPr")
    return {
        "paraId": p.get(f"{{{NS['w14']}}}paraId") or "",
        "styleId": p_style.get(f"{{{NS['w']}}}val") if p_style is not None else "",
        "outlineLevel": outline.get(f"{{{NS['w']}}}val") if outline is not None else "",
        "hasNumbering": numbering is not None,
    }


def _first(parent, xpath):
    found = parent.xpath(xpath, namespaces=NS)
    return found[0] if found else None


def _ensure(parent, tag, before_first_run=False):
    child = _first(parent, f"./{tag}")
    if child is not None:
        return child
    child = etree.Element(f"{{{NS['w']}}}{tag.split(':')[-1]}")
    if before_first_run:
        first_run = _first(parent, "./w:r")
        if first_run is not None:
            parent.insert(parent.index(first_run), child)
        else:
            parent.insert(0, child)
    else:
        parent.insert(0, child)
    return child


def _looks_english(text):
    letters = re.findall(r"[A-Za-z]", text)
    cjk = re.findall(r"[\u4e00-\u9fff]", text)
    return len(letters) >= 4 and len(letters) >= len(cjk) * 2


def _zone_and_role(text, current_zone):
    normalized = text.replace(" ", "")

    zone = current_zone
    role = "paragraph"

    if zone == "cover":
        if _looks_english(text) and (
            len(text) > 12 or text.rstrip().endswith(":") or text in ("College:", "Number:", "Name:", "Advisor:")
        ):
            zone = "cover_en"
            if text.rstrip().endswith(":"):
                return zone, "field_label"
            return zone, "title"
        if "摘要独立" in text or normalized == "摘要":
            return "abstract_cn", "title"
        if "英文摘要" in text or text == "Abstract":
            return "abstract_en", "title"
        if "目录" in normalized or re.match(r"^\d+引言", normalized):
            return "toc", "title"

    if zone == "cover_en":
        if "摘要独立" in text or normalized == "摘要":
            return "abstract_cn", "title"
        if "英文摘要" in text or text == "Abstract":
            return "abstract_en", "title"
        if text.rstrip().endswith(":"):
            return "cover_en", "field_label"
        if "英文标题" in text:
            return "cover_en", "note"
        if "（" in text and ("Professor" in text or "Associate Professor" in text or "Lecturer" in text):
            return "cover_en", "note"
        if _looks_english(text) or re.search(r"\d", text):
            return "cover_en", "field_value"
        return "cover_en", "paragraph"

    if zone in ("abstract_cn", "abstract_en"):
        if zone == "abstract_cn" and ("英文摘要" in text or text == "Abstract" or "Abstract" in text):
            return "abstract_en", "title"
        if "目录" in normalized or re.match(r"^\d+引言", normalized):
            return "toc", "title"

    if zone == "abstract_cn":
        if normalized.startswith("关键词"):
            return "abstract_cn", "keywords"
        if normalized.startswith("（") or normalized.startswith("(") or normalized.startswith("注："):
            return "abstract_cn", "note"
        return "abstract_cn", "paragraph" if text else "paragraph"

    if zone == "abstract_en":
        english_letters = len(re.findall(r"[A-Za-z]", text))
        if english_letters > 80 or "For the convenience" in text or "this paper" in text:
            return "abstract_en", "paragraph"
        if text == "Abstract" or "Abstract" in text:
            return "abstract_en", "title"
        if "英文摘要" in text or "Times New Roman" in text:
            return "abstract_en", "note"
        if re.match(r"^Key\s*words?\s*:", text, flags=re.I):
            return "abstract_en", "keywords"
        if normalized.startswith("（") or normalized.startswith("("):
            return "abstract_en", "note"
        return "abstract_en", "paragraph" if text else "paragraph"

    if zone == "toc":
        if "正文双面打印" in text or normalized.endswith("引言"):
            zone = "body"
            role = "heading1"
        else:
            return "toc", "entry" if text else "paragraph"

    if zone == "body":
        if normalized in ("参考文献", "参考文献9") or (normalized.startswith("参考文献") and len(normalized) <= 8):
            return "references", "title"
        if normalized in ("致谢", "致谢11") or (normalized.startswith("致谢") and len(normalized) <= 6):
            return "acknowledgement", "title"

    if zone == "references":
        if normalized in ("致谢", "致谢11") or (normalized.startswith("致谢") and len(normalized) <= 6):
            return "acknowledgement", "title"

    if zone == "cover":
        role = "field" if any(mark in text for mark in ["题", "学院", "专业", "学号", "姓名", "导师", "时间"]) else "paragraph"
    if zone == "body":
        heading1_names = ["引言", "主要器件和方案选择", "硬件电路设计", "软件设计", "系统调试与功能分析", "结束语"]
        heading2_names = ["课题设计的背景", "课题设计的目的和意义", "课题设计的预期成果", "单片机的选择", "土壤湿度传感器的选择", "主程序设计", "串口初始化"]
        if "一级标题" in text or any(name == text for name in heading1_names) or re.match(r"^\d+\s*[\u4e00-\u9fffA-Za-z].{0,24}$", text):
            role = "heading1"
        elif "二级标题" in text or any(name == text for name in heading2_names) or re.match(r"^\d+\.\d+\s*.+", text):
            role = "heading2"
        elif "三级标题" in text or re.match(r"^\d+\.\d+\.\d+\s*.+", text):
            role = "heading3"
        else:
            role = "paragraph"
    if zone == "references" and role != "title":
        role = "item"
    return zone, role


def _parse_toc_heading(text: str):
    compact = _compact_text(text)
    if not compact:
        return None

    # 目录项通常是「2.1标题页码」。优先提取 1/2/3 级标题，页码只作为尾部数字剥离。
    patterns = [
        (r"^(\d+\.\d+\.\d+)(.+?)(\d{1,3})$", "heading3"),
        (r"^(\d+\.\d+)(.+?)(\d{1,3})$", "heading2"),
        (r"^(\d+)([^\d].+?)(\d{1,3})$", "heading1"),
    ]
    for pattern, role in patterns:
        match = re.match(pattern, compact)
        if not match:
            continue
        number, title, _page = match.groups()
        if not title or len(title) > 60:
            continue
        if title in {"目录", "参考文献", "致谢", "附录"}:
            return None
        return {"number": number, "title": title, "role": role}
    return None


def _collect_toc_headings(paragraphs):
    headings = []
    zone = "cover"
    for p in paragraphs:
        text = _p_direct_text(p)
        next_zone, _role = _zone_and_role(text, zone)
        if next_zone != zone:
            zone = next_zone
        if zone != "toc":
            continue
        parsed = _parse_toc_heading(text)
        if parsed:
            headings.append(parsed)
    return headings


def _match_toc_heading(text: str, toc_headings, cursor: int):
    compact = _compact_text(text)
    if not compact:
        return cursor, None
    window_end = min(len(toc_headings), cursor + 10)
    for index in range(cursor, window_end):
        heading = toc_headings[index]
        title = _compact_text(heading.get("title", ""))
        if title and (title in compact or compact in title):
            return index + 1, heading
    return cursor, None


def _looks_media_text(text: str):
    compact = _compact_text(text)
    if not compact:
        return False
    if re.match(r"^(图|表)\d", compact):
        return True
    markers = [
        "图序号", "图名", "图题", "表序号", "表名", "表题",
        "先有文字说明", "再引出图", "再引出表",
    ]
    return any(marker in compact for marker in markers)


def _prepare_work_docx(docx_path: Path):
    root = _document_xml(docx_path)
    paragraphs = root.xpath("./w:body/w:p", namespaces=NS)
    zone = "cover"
    changed = False
    for p in paragraphs:
        text = _p_direct_text(p)
        all_text = _p_text(p)
        next_zone, _role = _zone_and_role(text, zone)
        if next_zone != zone:
            zone = next_zone
        if zone == "toc":
            _clear_text_runs(p)
            changed = True
            continue
        if text and all_text != text:
            _clear_nested_text_runs(p)
            changed = True
            continue
        if not text and (_looks_template_instruction(all_text) or _looks_media_text(all_text)):
            _clear_text_runs(p)
            changed = True
    if changed:
        _write_document_xml(docx_path, root)


def build_manifest(docx_path: Path):
    root = _document_xml(docx_path)
    tree = etree.ElementTree(root)
    paragraphs = root.xpath("./w:body/w:p", namespaces=NS)
    toc_headings = _collect_toc_headings(paragraphs)
    nodes = []
    zone = "cover"
    toc_cursor = 0

    for p in paragraphs:
        text = _p_direct_text(p)
        next_zone, role = _zone_and_role(text, zone)
        if next_zone != zone:
            zone = next_zone
        if zone in ("abstract_cn", "abstract_en") and role == "paragraph":
            if re.match(r"^\d+\s+.+", text):
                zone = "body"
                role = "heading1"
        if zone == "toc":
            continue
        if not text or _looks_media_text(text):
            continue

        source_number = ""
        if zone == "body":
            toc_cursor, toc_heading = _match_toc_heading(text, toc_headings, toc_cursor)
            if toc_heading:
                text = toc_heading["title"]
                role = toc_heading["role"]
                source_number = toc_heading["number"]

        node = {
            "nodeId": f"p{len(nodes):04d}",
            "kind": "paragraph",
            "zone": zone,
            "role": role,
            "xpath": tree.getpath(p),
            "text": text[:90],
            **_p_meta(p),
        }
        if source_number:
            node["sourceNumberLabel"] = source_number
        nodes.append(node)

    _refine_nodes(nodes)
    rules = _build_rules(nodes)
    manifest = {
        "source": docx_path.name,
        "nodeCount": len(nodes),
        "nodes": nodes,
        "rules": rules,
    }
    return _attach_product_manifest(manifest)


def _refine_nodes(nodes):
    seen_cover_en_field = False
    for node in nodes:
        if node["zone"] != "cover_en":
            continue
        if node["role"] == "field_label":
            seen_cover_en_field = True
            continue
        if not seen_cover_en_field and node["role"] in ("field_value", "paragraph") and _looks_english(node.get("text", "")):
            node["role"] = "title"


def _targets(nodes, zone=None, role=None):
    return [n["nodeId"] for n in nodes if (zone is None or n["zone"] == zone) and (role is None or n["role"] == role)]


def _build_citation_registry(manifest: dict):
    refs = []
    for index, node in enumerate([n for n in manifest.get("nodes", []) if n.get("zone") == "references" and n.get("role") == "item"], start=1):
        citation_id = f"ref{index:03d}"
        label = f"[{index}]"
        text = re.sub(r"^\s*\[\d+\]\s*", "", node.get("text", "") or "").strip()
        node["citationId"] = citation_id
        node["citationIndex"] = index
        node["citationLabel"] = label
        node["displayText"] = f"{label} {text}".strip()
        refs.append({
            "id": citation_id,
            "index": index,
            "label": label,
            "nodeId": node.get("nodeId"),
            "text": text,
            "bookmark": citation_id,
        })
    manifest["citationRegistry"] = refs
    return refs


def _build_rules(nodes):
    raw_rules = [
        ("cover_cn.field", "中文封面字段", "cover", "field", "cover", "封面信息", {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "left"}),
        ("cover_en.title", "英文封面标题", "cover_en", "title", "cover", "封面信息", {"font": "Times New Roman", "sizePt": 22, "bold": False, "alignment": "center"}),
        ("cover_en.field_label", "英文封面字段名", "cover_en", "field_label", "cover", "封面信息", {"font": "Times New Roman", "sizePt": 12, "bold": False, "alignment": "left"}),
        ("cover_en.field_value", "英文封面字段值", "cover_en", "field_value", "cover", "封面信息", {"font": "Times New Roman", "sizePt": 12, "bold": False, "alignment": "center"}),
        ("abstract_cn.title", "标题", "abstract_cn", "title", "abstract_cn", "中文摘要", {"font": "黑体", "sizePt": 18, "bold": True, "alignment": "center"}),
        ("abstract_cn.body", "正文", "abstract_cn", "paragraph", "abstract_cn", "中文摘要", {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2}),
        ("abstract_cn.keywords", "关键词", "abstract_cn", "keywords", "abstract_cn", "中文摘要", {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "left", "lineSpacing": 1.25}),
        ("abstract_en.title", "标题", "abstract_en", "title", "abstract_en", "英文摘要", {"font": "Times New Roman", "sizePt": 18, "bold": True, "alignment": "center"}),
        ("abstract_en.body", "正文", "abstract_en", "paragraph", "abstract_en", "英文摘要", {"font": "Times New Roman", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25}),
        ("abstract_en.keywords", "关键词", "abstract_en", "keywords", "abstract_en", "英文摘要", {"font": "Times New Roman", "sizePt": 12, "bold": False, "alignment": "left", "lineSpacing": 1.25}),
        ("body.heading1", "一级标题", "body", "heading1", "body", "正文", {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25}),
        ("body.heading2", "二级标题", "body", "heading2", "body", "正文", {"font": "黑体", "sizePt": 15, "bold": True, "alignment": "left", "lineSpacing": 1.25}),
        ("body.heading3", "三级标题", "body", "heading3", "body", "正文", {"font": "黑体", "sizePt": 12, "bold": True, "alignment": "left", "lineSpacing": 1.25}),
        ("body.paragraph", "正文段落", "body", "paragraph", "body", "正文", {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2}),
        ("references.item", "参考文献条目", "references", "item", "references", "参考文献", {"font": "宋体", "sizePt": 10.5, "bold": False, "alignment": "left", "lineSpacing": 1.5}),
    ]
    rules = []
    for rule_id, label, zone, role, section_key, section_label, fmt in raw_rules:
        if rule_id in {"body.heading1", "body.heading2", "body.heading3"}:
            fmt = {**fmt, "clearIndent": True}
        target_ids = _targets(nodes, zone, role)
        rules.append({
            "ruleId": rule_id,
            "label": label,
            "sectionKey": section_key,
            "sectionLabel": section_label,
            "selector": {"zone": zone, "role": role},
            "targetNodeIds": target_ids,
            "targetCount": len(target_ids),
            "format": fmt,
        })
    return rules


def _looks_template_instruction(text: str):
    normalized = (text or "").replace(" ", "")
    if not normalized:
        return False
    markers = [
        "宋体", "黑体", "TimesNewRoman", "字号", "行距", "段前", "段后",
        "居中", "居左", "打印", "单面", "双面", "关键字", "关键词",
        "参考文献在正文中", "注：", "不写发展状况", "标题", "目录",
    ]
    return sum(1 for marker in markers if marker in normalized) >= 2


def _node_product_meta(node):
    zone = node.get("zone")
    role = node.get("role")
    text = node.get("text", "")

    if not node.get("generated") and not (text or "").strip():
        return {
            "sectionType": "locked",
            "sectionLabel": "版式空段落",
            "editable": False,
            "acceptsGenerated": False,
            "cleaningAction": "layout_spacer",
            "lockedReason": "这是模板中的空白版式段落，不作为 AI 写入锚点。",
            "anchorPolicy": [],
        }
    if not node.get("generated") and _looks_template_instruction(text):
        return {
            "sectionType": "locked",
            "sectionLabel": "规范说明清洗区",
            "editable": False,
            "acceptsGenerated": False,
            "cleaningAction": "remove_instruction",
            "lockedReason": "这是模板里的格式说明或示例批注，不是正文写作锚点。",
            "anchorPolicy": [],
        }
    if zone == "body":
        return {
            "sectionType": "body",
            "sectionLabel": "正文写作区",
            "editable": True,
            "acceptsGenerated": role in BODY_WRITE_ROLES,
            "cleaningAction": "write_area",
            "lockedReason": "",
            "anchorPolicy": ["append", "insertAfter", "replace"],
        }
    if zone == "toc":
        return {
            "sectionType": "locked",
            "sectionLabel": "目录占位区",
            "editable": False,
            "acceptsGenerated": False,
            "cleaningAction": "replace_with_auto_toc_hint",
            "lockedReason": "目录不由 AI 写入，导出后交给 Word/WPS 自动生成。",
            "anchorPolicy": [],
        }
    if zone in ("cover", "cover_en"):
        return {
            "sectionType": "locked",
            "sectionLabel": "封面保留区",
            "editable": False,
            "acceptsGenerated": False,
            "cleaningAction": "lock_keep",
            "lockedReason": "封面字段先保留模板原样，MVP 不开放 AI 写入。",
            "anchorPolicy": [],
        }
    if zone in ("abstract_cn", "abstract_en"):
        return {
            "sectionType": "optional",
            "sectionLabel": "摘要候选区",
            "editable": False,
            "acceptsGenerated": False,
            "cleaningAction": "lock_review",
            "lockedReason": "摘要后续可接入 AI 自动归纳；当前基础框架先锁定，避免和正文注册混在一起。",
            "anchorPolicy": [],
        }
    if zone == "references":
        return {
            "sectionType": "citation",
            "sectionLabel": "参考文献注册区",
            "editable": False,
            "acceptsGenerated": False,
            "cleaningAction": "citation_registry",
            "lockedReason": "参考文献应由引用注册器管理，不作为普通正文段落写入。",
            "anchorPolicy": [],
        }
    return {
        "sectionType": "locked",
        "sectionLabel": "模板保留区",
        "editable": False,
        "acceptsGenerated": False,
        "cleaningAction": "lock_keep",
        "lockedReason": "当前区域不参与正文写作。",
        "anchorPolicy": [],
    }


def _build_cleaning_plan(nodes):
    groups = [
        {
            "key": "locked_template",
            "label": "模板保留区",
            "description": "封面、页眉页脚、学校固定版式等保持原样，不参与 AI 写入。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("cleaningAction") == "lock_keep"],
        },
        {
            "key": "auto_toc",
            "label": "目录自动生成",
            "description": "目录页只保留占位含义，导出后由 Word/WPS 根据标题重新生成。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("cleaningAction") == "replace_with_auto_toc_hint"],
        },
        {
            "key": "format_instructions",
            "label": "规范说明清洗区",
            "description": "模板里的格式说明、示例批注和红蓝标注只用于提取规范，不作为正文写入位置。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("cleaningAction") == "remove_instruction"],
        },
        {
            "key": "layout_spacers",
            "label": "版式空段落",
            "description": "空白段落只保留排版结构，不作为 AI 写入锚点。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("cleaningAction") == "layout_spacer"],
        },
        {
            "key": "body_writer",
            "label": "正文写作区",
            "description": "AI 生成内容只注册到这里；标题、正文段落和独立格式都绑定真实 DOCX 节点。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("acceptsGenerated")],
        },
        {
            "key": "citation_registry",
            "label": "参考文献注册区",
            "description": "参考文献后续交给引用注册器处理，避免像普通正文一样手动拼接。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("cleaningAction") == "citation_registry"],
        },
        {
            "key": "review_later",
            "label": "后续 AI 归纳区",
            "description": "摘要、关键词、致谢等先保留，后续由 AI 根据正文归纳生成或单独确认。",
            "nodeIds": [n["nodeId"] for n in nodes if n.get("cleaningAction") == "lock_review"],
        },
    ]
    return [{**group, "count": len(group["nodeIds"])} for group in groups]


def _with_number_prefix(text: str, number_label: str):
    if not number_label:
        return text or ""
    text = text or ""
    return text if text.startswith(number_label) else f"{number_label} {text}".strip()


def _without_number_prefix(text: str, number_label: str):
    text = text or ""
    number_label = number_label or ""
    if number_label and text.startswith(number_label):
        return text[len(number_label):].lstrip(" 　.．、")
    return re.sub(r"^\s*\d+(?:\.\d+)*\s+", "", text).strip() or text


def _attach_heading_numbers(manifest: dict):
    h1 = h2 = h3 = 0
    for node in manifest.get("nodes", []):
        node.pop("numberLabel", None)
        role = node.get("role")
        if not node.get("acceptsGenerated") or node.get("zone") != "body":
            node["displayText"] = node.get("text", "")
            continue
        source_number = node.get("sourceNumberLabel", "")
        if source_number:
            parts = [int(part) for part in source_number.split(".") if part.isdigit()]
            if len(parts) >= 1:
                h1 = parts[0]
            if len(parts) >= 2:
                h2 = parts[1]
            else:
                h2 = 0
            if len(parts) >= 3:
                h3 = parts[2]
            else:
                h3 = 0
            node["numberLabel"] = source_number
        elif role == "heading1":
            h1 += 1
            h2 = h3 = 0
            node["numberLabel"] = str(h1)
        elif role == "heading2":
            h2 += 1
            h3 = 0
            node["numberLabel"] = f"{max(h1, 1)}.{h2}"
        elif role == "heading3":
            h3 += 1
            node["numberLabel"] = f"{max(h1, 1)}.{max(h2, 1)}.{h3}"
        node["displayText"] = _with_number_prefix(node.get("text", ""), node.get("numberLabel", ""))


def _attach_product_manifest(manifest: dict):
    for node in manifest.get("nodes", []):
        node.update(_node_product_meta(node))
    _attach_heading_numbers(manifest)
    for rule in manifest.get("rules", []):
        selector = rule.get("selector", {})
        target_ids = [
            n["nodeId"] for n in manifest.get("nodes", [])
            if n.get("zone") == selector.get("zone")
            and n.get("role") == selector.get("role")
            and (rule.get("sectionKey") != "body" or n.get("acceptsGenerated"))
        ]
        rule["targetNodeIds"] = target_ids
        rule["targetCount"] = len(target_ids)
    writable_ids = [n["nodeId"] for n in manifest.get("nodes", []) if n.get("acceptsGenerated")]
    locked_ids = [n["nodeId"] for n in manifest.get("nodes", []) if not n.get("acceptsGenerated")]
    manifest["productMode"] = "body_writer"
    manifest["writableNodeIds"] = writable_ids
    manifest["lockedNodeIds"] = locked_ids
    manifest["cleaningPlan"] = _build_cleaning_plan(manifest.get("nodes", []))
    manifest["cleaningSummary"] = {
        "totalNodes": len(manifest.get("nodes", [])),
        "writableNodes": len(writable_ids),
        "lockedNodes": len(locked_ids),
        "bodyOnly": True,
    }
    _build_citation_registry(manifest)
    return manifest


def _set_attr(element, name, value):
    element.set(f"{{{NS['w']}}}{name}", str(value))


def _new_para_id():
    return uuid.uuid4().hex[:8].upper()


def _make_paragraph(text: str):
    p = etree.Element(f"{{{NS['w']}}}p")
    p.set(f"{{{NS['w14']}}}paraId", _new_para_id())
    r = etree.SubElement(p, f"{{{NS['w']}}}r")
    t = etree.SubElement(r, f"{{{NS['w']}}}t")
    if text.startswith(" ") or text.endswith(" "):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return p


def _next_node_id(manifest: dict):
    max_id = -1
    for node in manifest.get("nodes", []):
        m = re.match(r"p(\d+)", node.get("nodeId", ""))
        if m:
            max_id = max(max_id, int(m.group(1)))
    return f"p{max_id + 1:04d}"


def _matching_rule(manifest: dict, zone: str, role: str):
    for rule in manifest.get("rules", []):
        selector = rule.get("selector", {})
        if selector.get("zone") == zone and selector.get("role") == role:
            return rule
    return None


def _find_node(manifest: dict, node_id: str):
    return next((n for n in manifest.get("nodes", []) if n.get("nodeId") == node_id), None)


def _find_node_element(root, manifest: dict, node_id: str):
    node = _find_node(manifest, node_id)
    if not node:
        return None, None
    targets = root.xpath(node.get("xpath", ""), namespaces=NS)
    return node, targets[0] if targets else None


def _set_paragraph_text(paragraph, text: str):
    for child in list(paragraph):
        if child.tag != f"{{{NS['w']}}}pPr":
            paragraph.remove(child)
    run = etree.SubElement(paragraph, f"{{{NS['w']}}}r")
    t = etree.SubElement(run, f"{{{NS['w']}}}t")
    if text.startswith(" ") or text.endswith(" "):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text


def _citation_lookup(manifest: dict):
    lookup = {}
    for ref in manifest.get("citationRegistry", []):
        lookup[str(ref.get("index"))] = ref
        lookup[ref.get("id")] = ref
    return lookup


def _parse_citation_segments(text: str, manifest: dict):
    lookup = _citation_lookup(manifest)
    pattern = re.compile(r"\{\{cite:(ref\d{3}|\d+)\}\}|\[\[(?:cite:)?(ref\d{3}|\d+)\]\]|\[(\d{1,3})\]")
    segments = []
    citations = []
    last = 0
    for match in pattern.finditer(text or ""):
        key = next((group for group in match.groups() if group), "")
        ref = lookup.get(key)
        if not ref:
            continue
        if match.start() > last:
            segments.append({"type": "text", "text": text[last:match.start()]})
        segments.append({"type": "citation", "text": ref["label"], "ref": ref})
        citations.append(ref["id"])
        last = match.end()
    if last < len(text or ""):
        segments.append({"type": "text", "text": text[last:]})
    if not segments:
        segments.append({"type": "text", "text": text or ""})
    return segments, list(dict.fromkeys(citations))


def _append_text_run(parent, text: str, superscript=False):
    run = etree.SubElement(parent, f"{{{NS['w']}}}r")
    if superscript:
        rpr = etree.SubElement(run, f"{{{NS['w']}}}rPr")
        vert = etree.SubElement(rpr, f"{{{NS['w']}}}vertAlign")
        _set_attr(vert, "val", "superscript")
    t = etree.SubElement(run, f"{{{NS['w']}}}t")
    if text.startswith(" ") or text.endswith(" "):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return run


def _set_paragraph_text_with_citations(paragraph, text: str, manifest: dict):
    segments, citations = _parse_citation_segments(text, manifest)
    for child in list(paragraph):
        if child.tag != f"{{{NS['w']}}}pPr":
            paragraph.remove(child)
    for segment in segments:
        if segment["type"] == "citation":
            hyperlink = etree.SubElement(paragraph, f"{{{NS['w']}}}hyperlink")
            _set_attr(hyperlink, "anchor", segment["ref"]["bookmark"])
            _append_text_run(hyperlink, segment["text"], superscript=True)
        else:
            _append_text_run(paragraph, segment["text"])
    return citations


def _remove_paragraph_numbering(paragraph):
    ppr = _first(paragraph, "./w:pPr")
    if ppr is None:
        return
    numpr = _first(ppr, "./w:numPr")
    if numpr is not None:
        ppr.remove(numpr)


def _next_bookmark_id(root):
    ids = []
    for bookmark in root.xpath(".//w:bookmarkStart", namespaces=NS):
        value = bookmark.get(f"{{{NS['w']}}}id")
        if value and value.isdigit():
            ids.append(int(value))
    return (max(ids) + 1) if ids else 1


def _ensure_paragraph_bookmark(root, paragraph, name: str):
    existing = paragraph.xpath(f"./w:bookmarkStart[@w:name='{name}']", namespaces=NS)
    if existing:
        return False
    bookmark_id = str(_next_bookmark_id(root))
    start = etree.Element(f"{{{NS['w']}}}bookmarkStart")
    _set_attr(start, "id", bookmark_id)
    _set_attr(start, "name", name)
    end = etree.Element(f"{{{NS['w']}}}bookmarkEnd")
    _set_attr(end, "id", bookmark_id)
    ppr = _first(paragraph, "./w:pPr")
    insert_at = paragraph.index(ppr) + 1 if ppr is not None else 0
    paragraph.insert(insert_at, start)
    paragraph.append(end)
    return True


def _materialize_heading_numbers(root, manifest: dict):
    changed = False
    for node in manifest.get("nodes", []):
        if node.get("zone") != "body" or not str(node.get("role", "")).startswith("heading"):
            continue
        targets = root.xpath(node.get("xpath", ""), namespaces=NS)
        if not targets:
            continue
        paragraph = targets[0]
        visible_text = node.get("displayText") or _with_number_prefix(node.get("text", ""), node.get("numberLabel", ""))
        plain_text = _without_number_prefix(visible_text, node.get("numberLabel", ""))
        if _p_direct_text(paragraph) != visible_text:
            _set_paragraph_text(paragraph, visible_text)
            changed = True
        rule = _matching_rule(manifest, "body", node.get("role", ""))
        if rule:
            _apply_paragraph_style(paragraph, rule.get("format", {}))
            changed = True
        if _first(paragraph, "./w:pPr/w:numPr") is not None:
            _remove_paragraph_numbering(paragraph)
            changed = True
        node["text"] = plain_text[:90]
        node.update(_p_meta(paragraph))
    return changed


def _materialize_heading_numbers_docx(docx_path: Path, manifest: dict):
    root = _document_xml(docx_path)
    changed = _materialize_heading_numbers(root, manifest)
    if changed:
        _write_document_xml(docx_path, root)


def _materialize_reference_numbers(root, manifest: dict):
    changed = False
    rule = _matching_rule(manifest, "references", "item")
    for ref in manifest.get("citationRegistry", []):
        node = _find_node(manifest, ref.get("nodeId", ""))
        if not node:
            continue
        targets = root.xpath(node.get("xpath", ""), namespaces=NS)
        if not targets:
            continue
        paragraph = targets[0]
        visible_text = node.get("displayText") or f"{ref['label']} {ref['text']}".strip()
        if _p_direct_text(paragraph) != visible_text:
            _set_paragraph_text(paragraph, visible_text)
            changed = True
        if _first(paragraph, "./w:pPr/w:numPr") is not None:
            _remove_paragraph_numbering(paragraph)
            changed = True
        if rule:
            _apply_paragraph_style(paragraph, rule.get("format", {}))
            changed = True
        if _ensure_paragraph_bookmark(root, paragraph, ref["bookmark"]):
            changed = True
        node["text"] = ref["text"][:90]
        node["displayText"] = visible_text
        node.update(_p_meta(paragraph))
    return changed


def _materialize_reference_numbers_docx(docx_path: Path, manifest: dict):
    root = _document_xml(docx_path)
    changed = _materialize_reference_numbers(root, manifest)
    if changed:
        _write_document_xml(docx_path, root)


def _default_custom_format():
    return {
        "font": "宋体",
        "sizePt": 12,
        "bold": False,
        "alignment": "left",
        "lineSpacing": 1.25,
    }


def _refresh_rule_targets(manifest: dict):
    nodes = manifest.get("nodes", [])
    for rule in manifest.get("rules", []):
        selector = rule.get("selector", {})
        target_ids = _targets(nodes, selector.get("zone"), selector.get("role"))
        rule["targetNodeIds"] = target_ids
        rule["targetCount"] = len(target_ids)


def _sync_node_xpaths(manifest: dict, root):
    tree = etree.ElementTree(root)
    by_para_id = {}
    for p in root.xpath("//w:body//w:p", namespaces=NS):
        para_id = p.get(f"{{{NS['w14']}}}paraId")
        if para_id:
            by_para_id[para_id] = p
    for node in manifest.get("nodes", []):
        para_id = node.get("paraId")
        if para_id and para_id in by_para_id:
            p = by_para_id[para_id]
            node["xpath"] = tree.getpath(p)
            node.update(_p_meta(p))


def _sort_manifest_nodes_by_document_order(manifest: dict, root):
    order_by_para_id = {}
    for index, p in enumerate(root.xpath("//w:body//w:p", namespaces=NS)):
        para_id = p.get(f"{{{NS['w14']}}}paraId")
        if para_id:
            order_by_para_id[para_id] = index
    manifest.get("nodes", []).sort(key=lambda node: order_by_para_id.get(node.get("paraId"), 10**9))


def _body_insert_anchor(root, manifest: dict, zone: str):
    body = _first(root, "./w:body")
    if body is None:
        return None, None
    if zone == "body":
        for node in manifest.get("nodes", []):
            if node.get("zone") not in ("references", "acknowledgement"):
                continue
            targets = root.xpath(node.get("xpath", ""), namespaces=NS)
            if targets and targets[0].getparent() is body:
                return body, targets[0]
    sect = _first(body, "./w:sectPr")
    return body, sect


def add_generated_node(
    case_id: str,
    text: str,
    zone: str = "body",
    role: str = "paragraph",
    mode: str = "append",
    anchor_node_id: str = "",
    custom_format: dict | None = None,
):
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = _document_xml(work_docx)
    normalized_text = text.strip() or "新生成内容"

    if zone != "body" or role not in BODY_WRITE_ROLES:
        raise ValueError("AI generated content can only be registered into the body writing area")

    if mode == "replace":
        node, target = _find_node_element(root, manifest, anchor_node_id)
        if not node or target is None:
            raise KeyError(f"replace target not found: {anchor_node_id}")
        if not node.get("acceptsGenerated"):
            raise ValueError(f"target node is locked and cannot be replaced: {anchor_node_id}")
        citations = _set_paragraph_text_with_citations(target, normalized_text, manifest)
        node["zone"] = zone
        node["role"] = role
        node["text"] = _p_text(target)[:90]
        node["citations"] = citations
        node["generated"] = True
        if role == "custom":
            node["formatOverride"] = custom_format or _default_custom_format()
            _apply_paragraph_style(target, node["formatOverride"])
        else:
            node.pop("formatOverride", None)
            rule = _matching_rule(manifest, zone, role)
            if rule:
                _apply_paragraph_style(target, rule.get("format", {}))
        node.update(_p_meta(target))
        _sync_node_xpaths(manifest, root)
        _sort_manifest_nodes_by_document_order(manifest, root)
        _refresh_rule_targets(manifest)
        _attach_product_manifest(manifest)
        _materialize_heading_numbers(root, manifest)
        _materialize_reference_numbers(root, manifest)
        _write_document_xml(work_docx, root)
        manifest["version"] = int(time.time() * 1000)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return manifest

    paragraph = _make_paragraph("")
    citations = _set_paragraph_text_with_citations(paragraph, normalized_text, manifest)
    if mode == "insertAfter" and anchor_node_id:
        anchor_node, anchor = _find_node_element(root, manifest, anchor_node_id)
        if anchor is None:
            raise KeyError(f"insert anchor not found: {anchor_node_id}")
        if not anchor_node.get("acceptsGenerated"):
            raise ValueError(f"anchor node is locked and cannot accept generated content: {anchor_node_id}")
        parent = anchor.getparent()
        parent.insert(parent.index(anchor) + 1, paragraph)
    else:
        parent, before = _body_insert_anchor(root, manifest, zone)
        if parent is None:
            raise RuntimeError("document body not found")
        if before is not None:
            parent.insert(parent.index(before), paragraph)
        else:
            parent.append(paragraph)

    if role == "custom":
        _apply_paragraph_style(paragraph, custom_format or _default_custom_format())
    else:
        rule = _matching_rule(manifest, zone, role)
        if rule:
            _apply_paragraph_style(paragraph, rule.get("format", {}))

    tree = etree.ElementTree(root)
    node = {
        "nodeId": _next_node_id(manifest),
        "kind": "paragraph",
        "zone": zone,
        "role": role,
        "xpath": tree.getpath(paragraph),
        "text": _p_text(paragraph)[:90],
        "citations": citations,
        "generated": True,
        **_p_meta(paragraph),
    }
    if role == "custom":
        node["formatOverride"] = custom_format or _default_custom_format()
    manifest["nodes"].append(node)
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _materialize_heading_numbers(root, manifest)
    _materialize_reference_numbers(root, manifest)
    _write_document_xml(work_docx, root)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def update_node_role(case_id: str, node_id: str, zone: str, role: str):
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = _document_xml(work_docx)

    node = next((n for n in manifest.get("nodes", []) if n.get("nodeId") == node_id), None)
    if not node:
        raise KeyError(f"node not found: {node_id}")
    if not node.get("acceptsGenerated"):
        raise ValueError(f"node is locked and cannot change writing role: {node_id}")
    if zone != "body" or role not in BODY_WRITE_ROLES:
        raise ValueError("node roles can only be changed inside the body writing area")

    targets = root.xpath(node.get("xpath", ""), namespaces=NS)
    if not targets:
        raise KeyError(f"node xpath not found: {node_id}")

    node["zone"] = zone
    node["role"] = role
    if role == "custom":
        node["formatOverride"] = node.get("formatOverride") or _default_custom_format()
        _apply_paragraph_style(targets[0], node["formatOverride"])
    else:
        node.pop("formatOverride", None)
        rule = _matching_rule(manifest, zone, role)
        if rule:
            _apply_paragraph_style(targets[0], rule.get("format", {}))

    node["text"] = _p_text(targets[0])[:90]
    node.update(_p_meta(targets[0]))
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _materialize_heading_numbers(root, manifest)
    _materialize_reference_numbers(root, manifest)
    _write_document_xml(work_docx, root)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def _apply_paragraph_style(p, fmt):
    ppr = _ensure(p, "w:pPr", before_first_run=True)

    if fmt.get("clearIndent"):
        ind = _first(ppr, "./w:ind")
        if ind is not None:
            ppr.remove(ind)

    if fmt.get("alignment"):
        jc = _ensure(ppr, "w:jc")
        align_map = {"left": "left", "center": "center", "right": "right", "both": "both"}
        _set_attr(jc, "val", align_map.get(fmt["alignment"], fmt["alignment"]))

    if fmt.get("lineSpacing"):
        spacing = _ensure(ppr, "w:spacing")
        _set_attr(spacing, "line", int(float(fmt["lineSpacing"]) * 240))
        _set_attr(spacing, "lineRule", "auto")

    if fmt.get("firstLineIndentChars") is not None:
        ind = _ensure(ppr, "w:ind")
        _set_attr(ind, "firstLineChars", int(float(fmt["firstLineIndentChars"]) * 100))

    runs = p.xpath(".//w:r", namespaces=NS)
    if not runs:
        runs = [etree.SubElement(p, f"{{{NS['w']}}}r")]

    for run in runs:
        rpr = _ensure(run, "w:rPr")
        if fmt.get("font"):
            rfonts = _ensure(rpr, "w:rFonts")
            for key in ("ascii", "hAnsi", "eastAsia", "cs"):
                _set_attr(rfonts, key, fmt["font"])
        if fmt.get("sizePt"):
            half_points = int(float(fmt["sizePt"]) * 2)
            sz = _ensure(rpr, "w:sz")
            sz_cs = _ensure(rpr, "w:szCs")
            _set_attr(sz, "val", half_points)
            _set_attr(sz_cs, "val", half_points)
        b = _first(rpr, "./w:b")
        if fmt.get("bold"):
            if b is None:
                b = etree.SubElement(rpr, f"{{{NS['w']}}}b")
            _set_attr(b, "val", "1")
        elif b is not None:
            rpr.remove(b)


def apply_rule(case_id: str, rule_id: str, fmt: dict):
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    rule = next((r for r in manifest["rules"] if r["ruleId"] == rule_id), None)
    if not rule:
        raise KeyError(f"rule not found: {rule_id}")

    root = _document_xml(work_docx)
    by_id = {n["nodeId"]: n for n in manifest["nodes"]}
    for node_id in rule["targetNodeIds"]:
        node = by_id.get(node_id)
        if not node:
            continue
        targets = root.xpath(node["xpath"], namespaces=NS)
        if targets:
            _apply_paragraph_style(targets[0], fmt)

    rule["format"] = fmt
    _write_document_xml(work_docx, root)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def create_case(source_docx: Path | None = None):
    source_docx = source_docx or _default_docx()
    case_id = str(uuid.uuid4())[:8]
    folder = CASE_DIR / case_id
    folder.mkdir(exist_ok=True)
    work_docx = folder / "work.docx"
    shutil.copyfile(source_docx, work_docx)
    manifest = build_manifest(work_docx)
    _prepare_work_docx(work_docx)
    _materialize_heading_numbers_docx(work_docx, manifest)
    _materialize_reference_numbers_docx(work_docx, manifest)
    manifest["caseId"] = case_id
    manifest["version"] = int(time.time() * 1000)
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
        self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            _send_json(self, 200, {"status": "ok"})
            return
        if self.path.startswith("/case/") and self.path.endswith("/manifest"):
            case_id = self.path.split("/")[2]
            path = CASE_DIR / case_id / "manifest.json"
            if not path.exists():
                _send_json(self, 404, {"error": "case not found"})
                return
            _send_json(self, 200, json.loads(path.read_text(encoding="utf-8")))
            return
        if self.path.startswith("/case/") and "/file" in self.path:
            case_id = self.path.split("/")[2]
            path = CASE_DIR / case_id / "work.docx"
            if not path.exists():
                _send_json(self, 404, {"error": "file not found"})
                return
            _send_docx(self, path)
            return
        _send_json(self, 404, {"error": "not found"})

    def do_POST(self):
        try:
            if self.path == "/case/load":
                manifest = create_case()
                _send_json(self, 200, manifest)
                return
            if self.path.startswith("/case/") and self.path.endswith("/node"):
                parts = self.path.split("/")
                case_id = parts[2]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                manifest = add_generated_node(
                    case_id,
                    data.get("text", ""),
                    data.get("zone", "body"),
                    data.get("role", "paragraph"),
                    data.get("mode", "append"),
                    data.get("anchorNodeId", ""),
                    data.get("customFormat") or None,
                )
                _send_json(self, 200, manifest)
                return
            if self.path == "/case/upload":
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0:
                    _send_json(self, 400, {"error": "empty upload"})
                    return
                case_id = str(uuid.uuid4())[:8]
                folder = CASE_DIR / case_id
                folder.mkdir(exist_ok=True)
                source = folder / "source.docx"
                source.write_bytes(self.rfile.read(length))
                manifest = create_case(source)
                _send_json(self, 200, manifest)
                return
        except Exception as exc:
            _send_json(self, 500, {"error": str(exc)})
            return
        _send_json(self, 404, {"error": "not found"})

    def do_PATCH(self):
        try:
            if self.path.startswith("/case/") and "/rule/" in self.path:
                parts = self.path.split("/")
                case_id = parts[2]
                rule_id = parts[4]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                manifest = apply_rule(case_id, rule_id, data.get("format", {}))
                _send_json(self, 200, manifest)
                return
            if self.path.startswith("/case/") and "/node/" in self.path:
                parts = self.path.split("/")
                case_id = parts[2]
                node_id = parts[4]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                manifest = update_node_role(
                    case_id,
                    node_id,
                    data.get("zone", "body"),
                    data.get("role", "paragraph"),
                )
                _send_json(self, 200, manifest)
                return
        except Exception as exc:
            _send_json(self, 500, {"error": str(exc)})
            return
        _send_json(self, 404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


def main():
    port = 8899
    server = HTTPServer(("127.0.0.1", port), Handler)
    print(f"binding case API running at http://127.0.0.1:{port}")
    print(f"default source: {_default_docx()}")
    server.serve_forever()


if __name__ == "__main__":
    main()

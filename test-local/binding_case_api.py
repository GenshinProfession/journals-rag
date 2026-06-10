"""
DOCX node-binding proof API.

This is a small prototype for the route:
source DOCX -> manifest -> style rules bound to real OOXML nodes
-> mutate the working DOCX -> preview the updated working DOCX.
"""

import json
import re
import shutil
import subprocess
import sys
import time
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse, parse_qs

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

BODY_WRITE_ROLES = {"heading1", "heading2", "heading3", "heading4", "paragraph", "custom"}

FORMAT_RULE_KEYS_BY_NODE = {
    ("abstract_cn", "title"): "摘要标题",
    ("abstract_cn", "paragraph"): "摘要正文",
    ("abstract_cn", "keywords"): "关键词",
    ("abstract_en", "title"): "英文标题",
    ("abstract_en", "paragraph"): "英文正文",
    ("abstract_en", "keywords"): "英文关键词",
    ("body", "heading1"): "一级标题",
    ("body", "heading2"): "二级标题",
    ("body", "heading3"): "三级标题",
    ("body", "paragraph"): "正文段落",
    ("acknowledgement", "title"): "致谢标题",
    ("acknowledgement", "paragraph"): "致谢正文",
    ("references", "title"): "参考文献标题",
    ("references", "item"): "参考文献条目",
    ("appendix", "title"): "附录标题",
    ("appendix", "paragraph"): "附录正文",
    ("media", "image_caption"): "图片标注",
    ("media", "table_caption"): "表格标注",
    ("media", "table"): "表格文本",
}

FORMAT_RULE_DEFAULTS = {
    "摘要标题": {"font": "黑体", "sizePt": 18, "bold": True, "alignment": "center", "lineSpacing": 1.25},
    "摘要正文": {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2},
    "关键词": {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "left", "lineSpacing": 1.25},
    "英文标题": {"font": "Times New Roman", "sizePt": 18, "bold": True, "alignment": "center", "lineSpacing": 1.25},
    "英文正文": {"font": "Times New Roman", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2},
    "英文关键词": {"font": "Times New Roman", "sizePt": 12, "bold": False, "alignment": "left", "lineSpacing": 1.25},
    "一级标题": {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25, "clearIndent": True},
    "二级标题": {"font": "黑体", "sizePt": 15, "bold": True, "alignment": "left", "lineSpacing": 1.25, "clearIndent": True},
    "三级标题": {"font": "黑体", "sizePt": 12, "bold": True, "alignment": "left", "lineSpacing": 1.25, "clearIndent": True},
    "正文段落": {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2},
    "图片标注": {"font": "宋体", "sizePt": 10.5, "bold": False, "alignment": "center", "lineSpacing": 1.0},
    "表格标注": {"font": "宋体", "sizePt": 10.5, "bold": False, "alignment": "center", "lineSpacing": 1.0},
    "表格文本": {"font": "宋体", "sizePt": 10.5, "bold": False, "alignment": "left", "lineSpacing": 1.0},
    "致谢标题": {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25},
    "致谢正文": {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2},
    "参考文献标题": {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25},
    "参考文献条目": {"font": "宋体", "sizePt": 10.5, "bold": False, "alignment": "left", "lineSpacing": 1.5},
    "附录标题": {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25},
    "附录正文": {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2},
}


def _format_rule_key_for_node(node: dict):
    return FORMAT_RULE_KEYS_BY_NODE.get((node.get("zone", ""), node.get("role", "")))


def _normalize_paper_config(config: dict | None, extracted_rules: dict | None = None):
    """Keep the format-rule contract complete while preserving user overrides."""
    normalized = dict(config or {})
    rules = {key: dict(value) for key, value in FORMAT_RULE_DEFAULTS.items()}
    for source in (normalized.get("formatRules", {}), extracted_rules or {}):
        if not isinstance(source, dict):
            continue
        for key, value in source.items():
            if isinstance(value, dict):
                rules[key] = {**rules.get(key, {}), **value}
    normalized["formatRules"] = rules
    return normalized


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


def _send_png(handler, path: Path):
    data = path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", "image/png")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def _send_binary(handler, data: bytes, content_type: str):
    handler.send_response(200)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def _image_resource(case_id: str, node_id: str):
    folder = CASE_DIR / case_id
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    node = _find_node(manifest, node_id)
    if not node or node.get("role") != "image":
        raise KeyError(f"image node not found: {node_id}")

    media_path = node.get("mediaPath", "")
    content_type = node.get("contentType", "")
    with zipfile.ZipFile(folder / "work.docx", "r") as zf:
        if not media_path:
            embed_id = node.get("embedId", "")
            rels = etree.fromstring(zf.read("word/_rels/document.xml.rels"))
            matches = rels.xpath(f"//*[local-name()='Relationship'][@Id='{embed_id}']")
            if not matches:
                raise KeyError(f"image relationship not found: {embed_id}")
            media_path = f"word/{matches[0].get('Target', '').lstrip('/')}"
        data = zf.read(media_path)

    if not content_type:
        suffix = Path(media_path).suffix.lower()
        content_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }.get(suffix, "image/png")
    return data, content_type


def _default_docx() -> Path:
    for path in DEFAULT_DOCX_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("No test DOCX found in test-local")


def _document_xml(docx_path: Path):
    with zipfile.ZipFile(docx_path, "r") as zf:
        raw = zf.read("word/document.xml")
    return etree.fromstring(raw)


def _parse_styles(docx_path: Path):
    """Parse word/styles.xml and return a dict of style_id → formatting properties."""
    try:
        with zipfile.ZipFile(docx_path, "r") as zf:
            raw = zf.read("word/styles.xml")
    except (KeyError, FileNotFoundError):
        return {}
    root = etree.fromstring(raw)
    styles = {}
    for style_el in root.xpath("//w:style", namespaces=NS):
        style_id = style_el.get(f"{{{NS['w']}}}styleId", "")
        if not style_id:
            continue
        # Resolve basedOn chain (up to 3 levels)
        resolved = {}
        current = style_el
        chain = [current]
        for _ in range(3):
            based_on = current.find(f"{{{NS['w']}}}basedOn")
            if based_on is None:
                break
            parent_id = based_on.get(f"{{{NS['w']}}}val", "")
            if not parent_id or parent_id == style_id:
                break
            for s in root.xpath(f"//w:style[@w:styleId='{parent_id}']", namespaces=NS):
                current = s
                chain.append(current)
                break
        # Collect properties from chain (base first, derived overrides).
        for s in reversed(chain):
            rpr = s.find(f"{{{NS['w']}}}rPr")
            if rpr is not None:
                fonts_el = rpr.find(f"{{{NS['w']}}}rFonts")
                if fonts_el is not None:
                    font = (
                        fonts_el.get(f"{{{NS['w']}}}eastAsia")
                        or fonts_el.get(f"{{{NS['w']}}}ascii")
                        or fonts_el.get(f"{{{NS['w']}}}hAnsi")
                    )
                    if font:
                        resolved["font"] = font
                sz_el = rpr.find(f"{{{NS['w']}}}sz")
                if sz_el is not None and sz_el.get(f"{{{NS['w']}}}val"):
                    resolved["sizePt"] = int(sz_el.get(f"{{{NS['w']}}}val")) / 2
                bold_el = rpr.find(f"{{{NS['w']}}}b")
                if bold_el is not None:
                    resolved["bold"] = bold_el.get(f"{{{NS['w']}}}val", "1") != "0"
            ppr = s.find(f"{{{NS['w']}}}pPr")
            if ppr is not None:
                jc_el = ppr.find(f"{{{NS['w']}}}jc")
                if jc_el is not None and jc_el.get(f"{{{NS['w']}}}val"):
                    resolved["alignment"] = jc_el.get(f"{{{NS['w']}}}val")
                spacing_el = ppr.find(f"{{{NS['w']}}}spacing")
                if spacing_el is not None:
                    line = spacing_el.get(f"{{{NS['w']}}}line")
                    if line and line.isdigit():
                        resolved["lineSpacing"] = round(int(line) / 240, 2)
        styles[style_id] = resolved
    return styles


def parse_format_from_docx(docx_path: Path, manifest: dict = None):
    """从DOCX中解析真实格式"""
    try:
        with zipfile.ZipFile(docx_path, "r") as zf:
            raw = zf.read("word/document.xml")
    except (KeyError, FileNotFoundError):
        return {}

    root = etree.fromstring(raw)
    body = root.find(f"{{{NS['w']}}}body")
    if body is None:
        return {}

    W = NS['w']
    format_rules = {}

    # 如果有manifest，使用manifest中的节点信息来识别标题
    node_map = {}
    if manifest:
        for node in manifest.get("nodes", []):
            node_map[node.get("paraId", "")] = node

    # 解析所有段落
    for p in body.findall(f".//{{{W}}}p"):
        # 获取段落文本
        text = "".join(p.xpath(".//w:t/text()", namespaces=NS)).strip()
        if not text:
            continue

        # 获取段落样式
        pPr = p.find(f"{{{W}}}pPr")
        if pPr is None:
            continue

        # 获取段落ID
        para_id = p.get(f"{{{NS['w14']}}}paraId", "")

        # 获取样式ID
        style_id = None
        pStyle = pPr.find(f"{{{W}}}pStyle")
        if pStyle is not None:
            style_id = pStyle.get(f"{{{W}}}val", "")

        # 获取字体信息
        rPr = p.find(f".//{{{W}}}rPr")
        font = "宋体"
        size_pt = 12
        bold = False
        color = "#000000"

        if rPr is not None:
            fonts_el = rPr.find(f"{{{W}}}rFonts")
            if fonts_el is not None:
                font = fonts_el.get(f"{{{W}}}ascii", "宋体") or fonts_el.get(f"{{{W}}}eastAsia", "宋体")

            sz_el = rPr.find(f"{{{W}}}sz")
            if sz_el is not None:
                sz_val = sz_el.get(f"{{{W}}}val", "24")
                try:
                    size_pt = int(sz_val) / 2  # half-points to points
                except:
                    size_pt = 12

            b_el = rPr.find(f"{{{W}}}b")
            if b_el is not None:
                bold = True

            color_el = rPr.find(f"{{{W}}}color")
            if color_el is not None:
                color_val = color_el.get(f"{{{W}}}val", "000000")
                color = f"#{color_val}"

        # 获取对齐方式
        alignment = "left"
        jc = pPr.find(f"{{{W}}}jc")
        if jc is not None:
            jc_val = jc.get(f"{{{W}}}val", "left")
            align_map = {"left": "left", "center": "center", "right": "right", "both": "both"}
            alignment = align_map.get(jc_val, "left")

        # 获取行距
        line_spacing = 1.25
        spacing = pPr.find(f"{{{W}}}spacing")
        if spacing is not None:
            line_val = spacing.get(f"{{{W}}}line", "300")
            try:
                line_spacing = int(line_val) / 240  # twentieths of a line
            except:
                line_spacing = 1.25

        # 获取段前距和段后距
        space_before = 0
        space_after = 0
        if spacing is not None:
            before_val = spacing.get(f"{{{W}}}before", "0")
            after_val = spacing.get(f"{{{W}}}after", "0")
            try:
                space_before = int(before_val) / 240
                space_after = int(after_val) / 240
            except:
                space_before = 0
                space_after = 0

        # 获取首行缩进
        first_line_indent_chars = 0
        ind = pPr.find(f"{{{W}}}ind")
        if ind is not None:
            first_line_val = ind.get(f"{{{W}}}firstLineChars", "0")
            try:
                first_line_indent_chars = int(first_line_val) / 100  # hundredths of a character
            except:
                first_line_indent_chars = 0

        # 生成格式规则
        format_rule = {
            "font": font,
            "sizePt": size_pt,
            "bold": bold,
            "alignment": alignment,
            "lineSpacing": line_spacing,
            "spaceBefore": space_before,
            "spaceAfter": space_after,
            "firstLineIndentChars": first_line_indent_chars,
            "color": color,
        }

        # 使用manifest中的区域和角色映射到稳定的规范键，避免不同区域互相覆盖。
        node = node_map.get(para_id)
        if node:
            rule_key = _format_rule_key_for_node(node)
            if rule_key:
                format_rules[rule_key] = format_rule

    return format_rules



# Cache parsed styles per docx path
_style_cache = {}


def _get_styles(docx_path: Path):
    if docx_path not in _style_cache:
        _style_cache[docx_path] = _parse_styles(docx_path)
    return _style_cache[docx_path]


def _write_document_xml(docx_path: Path, root, manifest=None):
    """Write the updated document.xml back to the DOCX file.
    If manifest is provided, also regenerate preview anchors (bookmarks).
    """
    if manifest is not None:
        _ensure_preview_anchors(root, manifest)
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


def _preview_anchor_name(node_id: str) -> str:
    """Generate a stable bookmark name for a node."""
    return f"jr_node_{node_id}"


def _ensure_preview_anchors(root, manifest):
    """Insert hidden bookmarks into the DOCX XML for each manifest node.

    docx-preview renders Word bookmarks as <span id="bookmarkName">,
    giving us stable DOM anchors without guessing.

    Strategy:
    1. Build node lookup by paraId (paraId is already generated in build_manifest)
    2. Remove ALL old jr_node_ bookmarks
    3. Insert new bookmarks for ALL nodes (including tables/images)
    """
    W = NS['w']
    W14 = NS['w14']
    body = root.find(f"{{{W}}}body")
    if body is None:
        return

    # Step 1: Build node lookup by paraId
    # (paraId is already generated in build_manifest, so all nodes should have it)

    # Step 2: Build node lookup by paraId
    node_by_para_id = {}
    for node in manifest.get("nodes", []):
        pid = node.get("paraId")
        if pid:
            node_by_para_id[pid] = node

    # Also update manifest paraId for nodes that had missing paraId
    all_paragraphs = list(body.findall(f".//{{{W}}}p"))
    tree = etree.ElementTree(root)  # Use root, not body, to match build_manifest
    for p in all_paragraphs:
        para_id = p.get(f"{{{W14}}}paraId", "")
        if not para_id:
            continue
        # Find node by xpath (using root-based tree to match build_manifest)
        xpath = tree.getpath(p)
        for node in manifest.get("nodes", []):
            if node.get("xpath") == xpath and not node.get("paraId"):
                node["paraId"] = para_id
                node_by_para_id[para_id] = node
                break

    # Step 3: Remove ALL old jr_node_ bookmarks
    for bm_start in list(body.xpath("//w:bookmarkStart[starts-with(@w:name, 'jr_node_')]", namespaces=NS)):
        parent = bm_start.getparent()
        if parent is not None:
            bm_end = bm_start.getnext()
            if bm_end is not None and bm_end.tag == f"{{{W}}}bookmarkEnd":
                parent.remove(bm_end)
            parent.remove(bm_start)

    # Step 4: Clear all previewAnchor from manifest
    for node in manifest.get("nodes", []):
        node.pop("previewAnchor", None)

    # Step 5: Insert bookmarks for ALL nodes
    # First, handle paragraph nodes (by paraId)
    for p in all_paragraphs:
        para_id = p.get(f"{{{W14}}}paraId", "")
        node = node_by_para_id.get(para_id)
        if not node:
            continue

        node_id = node["nodeId"]
        anchor_name = _preview_anchor_name(node_id)
        bm_id = _next_bookmark_id(root)

        bm_start = etree.Element(f"{{{W}}}bookmarkStart")
        bm_start.set(f"{{{W}}}id", str(bm_id))
        bm_start.set(f"{{{W}}}name", anchor_name)
        bm_end = etree.Element(f"{{{W}}}bookmarkEnd")
        bm_end.set(f"{{{W}}}id", str(bm_id))

        p.insert(0, bm_start)
        p.insert(1, bm_end)
        node["previewAnchor"] = anchor_name

    # Step 6: Handle table and image nodes (by xpath)
    for node in manifest.get("nodes", []):
        if node.get("previewAnchor"):
            continue  # Already bookmarked

        node_id = node["nodeId"]
        anchor_name = _preview_anchor_name(node_id)
        bm_id = _next_bookmark_id(root)

        xpath = node.get("xpath", "")
        if not xpath:
            continue

        try:
            el = body.xpath(xpath, namespaces=NS)
            if not el:
                continue
            el = el[0]

            if node.get("kind") == "table":
                # For tables, put bookmark in first cell paragraph
                first_tc = el.find(f".//{{{W}}}tc")
                if first_tc is not None:
                    first_p = first_tc.find(f"{{{W}}}p")
                    if first_p is not None:
                        bm_start = etree.Element(f"{{{W}}}bookmarkStart")
                        bm_start.set(f"{{{W}}}id", str(bm_id))
                        bm_start.set(f"{{{W}}}name", anchor_name)
                        bm_end = etree.Element(f"{{{W}}}bookmarkEnd")
                        bm_end.set(f"{{{W}}}id", str(bm_id))
                        first_p.insert(0, bm_start)
                        first_p.insert(1, bm_end)
                        node["previewAnchor"] = anchor_name
            elif node.get("kind") == "image":
                # For images, put bookmark in the containing paragraph
                p = el if el.tag == f"{{{W}}}p" else el.find(f".//{{{W}}}p") or el.getparent()
                if p is not None and p.tag == f"{{{W}}}p":
                    bm_start = etree.Element(f"{{{W}}}bookmarkStart")
                    bm_start.set(f"{{{W}}}id", str(bm_id))
                    bm_start.set(f"{{{W}}}name", anchor_name)
                    bm_end = etree.Element(f"{{{W}}}bookmarkEnd")
                    bm_end.set(f"{{{W}}}id", str(bm_id))
                    p.insert(0, bm_start)
                    p.insert(1, bm_end)
                    node["previewAnchor"] = anchor_name
        except Exception:
            pass

    # Step 7: Count actual bookmarks in XML
    actual_bookmarks = len(body.xpath("//w:bookmarkStart[starts-with(@w:name, 'jr_node_')]", namespaces=NS))
    anchor_count = sum(1 for n in manifest.get("nodes", []) if n.get("previewAnchor"))
    total_count = len(manifest.get("nodes", []))
    manifest["previewBinding"] = {
        "expectedCount": total_count,
        "actualBookmarks": actual_bookmarks,
        "anchorCount": anchor_count,
        "missingNodeIds": [n["nodeId"] for n in manifest.get("nodes", []) if not n.get("previewAnchor")]
    }

    return manifest


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


# ---------------------------------------------------------------------------
# Format extraction & clustering
# ---------------------------------------------------------------------------

def _extract_para_format(p, docx_path=None):
    """Extract the visual formatting fingerprint of a paragraph from OOXML.
    Resolves style references via styles.xml when docx_path is provided."""
    styles = _get_styles(docx_path) if docx_path else {}

    # Resolve paragraph style
    ps_el = _first(p, "./w:pPr/w:pStyle")
    pstyle_id = ps_el.get(f"{{{NS['w']}}}val", "") if ps_el is not None else ""
    pstyle_fmt = styles.get(pstyle_id, {})

    # --- run-level properties (first non-empty run) ---
    rpr = None
    for r in p.xpath("./w:r/w:rPr", namespaces=NS):
        txt = "".join(r.xpath("../w:t/text()", namespaces=NS))
        if txt.strip():
            rpr = r
            break

    # Resolve run style
    rstyle_id = ""
    if rpr is not None:
        rs_el = _first(rpr, "./w:rStyle")
        if rs_el is not None:
            rstyle_id = rs_el.get(f"{{{NS['w']}}}val", "")
    rstyle_fmt = styles.get(rstyle_id, {})

    def _rval(tag, default=None):
        if rpr is not None:
            el = _first(rpr, f"./w:{tag}")
            if el is not None:
                return el.get(f"{{{NS['w']}}}val", default)
        return default

    # Font: direct → run style → paragraph style → fallback
    font = ""
    if rpr is not None:
        fonts_el = _first(rpr, "./w:rFonts")
        if fonts_el is not None:
            font = (
                fonts_el.get(f"{{{NS['w']}}}eastAsia")
                or fonts_el.get(f"{{{NS['w']}}}ascii")
                or fonts_el.get(f"{{{NS['w']}}}hAnsi")
                or ""
            )
    if not font:
        font = rstyle_fmt.get("font", "")
    if not font:
        font = pstyle_fmt.get("font", "")
    if not font:
        font = "宋体"  # default

    # Font size: direct → run style → paragraph style → default 12pt
    sz = _rval("sz")
    size_pt = int(sz) / 2 if sz else rstyle_fmt.get("sizePt", pstyle_fmt.get("sizePt", 12.0))

    # Bold: direct → run style → paragraph style
    bold_direct = _rval("b")
    if bold_direct is not None:
        bold = bold_direct != "0"
    elif "bold" in rstyle_fmt:
        bold = rstyle_fmt["bold"]
    else:
        bold = pstyle_fmt.get("bold", False)

    # --- paragraph-level properties ---
    ppr = _first(p, "./w:pPr")

    def _pval(tag, default=None):
        if ppr is not None:
            el = _first(ppr, f"./w:{tag}")
            if el is not None:
                return el.get(f"{{{NS['w']}}}val", default)
        return default

    # Alignment: direct → paragraph style → default left
    alignment = _pval("jc")
    if not alignment or alignment not in ("center", "both", "right", "left"):
        alignment = pstyle_fmt.get("alignment", "left")

    # Line spacing
    ls = _pval("line")
    ls_rule = _pval("lineRule")
    if ls and ls != "auto":
        twips = int(ls)
        line_spacing = round(twips / 240, 2)
    else:
        line_spacing = pstyle_fmt.get("lineSpacing", 1.0)

    # First-line indent (twips → characters)
    fi = _pval("firstLine")
    fi_chars = round(int(fi) / 240, 1) if fi else 0

    # Left indent
    li = _pval("left")
    left_indent = round(int(li) / 240, 1) if li else 0

    return {
        "font": font,
        "sizePt": size_pt,
        "bold": bold,
        "alignment": alignment,
        "lineSpacing": line_spacing,
        "firstLineIndentChars": fi_chars,
        "leftIndentChars": left_indent,
    }


def _format_fingerprint(fmt):
    """Create a hashable fingerprint from a format dict."""
    return (
        fmt["font"],
        round(fmt["sizePt"], 1),
        fmt["bold"],
        fmt["alignment"],
        round(fmt["lineSpacing"], 2),
        round(fmt["firstLineIndentChars"], 1),
        round(fmt["leftIndentChars"], 1),
    )


def _detect_heading_level(text):
    """Detect heading level from numbered text patterns (1, 1.1, 1.1.1, etc.)."""
    compact = re.sub(r"\s+", "", text or "")
    if re.match(r"^\d+\.\d+\.\d+\s*\S", compact):
        return "heading3"
    if re.match(r"^\d+\.\d+\s*\S", compact):
        return "heading2"
    if re.match(r"^\d+\s+[一-鿿A-Za-z]", compact):
        return "heading1"
    return None


def _cluster_body_by_format(nodes):
    """Cluster body-zone nodes by format fingerprint. Auto-detect heading levels
    using styleId from the document's paragraph styles."""
    body_nodes = [n for n in nodes if n.get("zone") == "body" and n.get("text", "").strip()]
    if not body_nodes:
        return

    # Build fingerprint → cluster
    clusters = {}
    for node in body_nodes:
        fp = node.get("_fingerprint")
        if fp not in clusters:
            clusters[fp] = {"fingerprint": fp, "format": node.get("_format", {}), "nodes": []}
        clusters[fp]["nodes"].append(node)

    # Sort clusters by size (descending) to identify the dominant format
    sorted_clusters = sorted(clusters.values(), key=lambda c: len(c["nodes"]), reverse=True)

    # The largest cluster is likely body paragraph
    body_cluster = sorted_clusters[0] if sorted_clusters else None

    # Detect heading levels using styleId
    # Collect styleId → heading level mapping from nodes that have clear heading patterns
    style_heading_map = {}
    for node in body_nodes:
        style_id = node.get("styleId", "")
        if not style_id:
            continue
        # Count how many nodes with this styleId exist
        count = sum(1 for n in body_nodes if n.get("styleId") == style_id)
        if count < 2:
            continue
        # Check if this style is used for headings by looking at format characteristics
        fmt = node.get("_format", {})
        is_bold = fmt.get("bold", False)
        alignment = fmt.get("alignment", "left")
        size = fmt.get("sizePt", 12)
        # Heuristic: headings are typically bold, smaller count, different format from body
        if style_id not in style_heading_map:
            style_heading_map[style_id] = {"count": count, "format": fmt, "nodes": []}
        style_heading_map[style_id]["nodes"].append(node)

    # Determine heading levels based on font size hierarchy
    # Larger font = higher level heading
    body_fmt = body_cluster["format"] if body_cluster else {}
    body_size = body_fmt.get("sizePt", 12)

    heading_styles = []
    for style_id, info in style_heading_map.items():
        fmt = info["format"]
        size = fmt.get("sizePt", 12)
        is_bold = fmt.get("bold", False)
        # Skip if same size as body and not bold (likely body paragraphs)
        if size == body_size and not is_bold:
            continue
        heading_styles.append((style_id, size, info))

    # Sort by font size descending (largest = heading1)
    heading_styles.sort(key=lambda x: -x[1])

    level_names = ["heading1", "heading2", "heading3", "heading4"]
    for i, (style_id, size, info) in enumerate(heading_styles):
        level = level_names[min(i, len(level_names) - 1)]
        for node in info["nodes"]:
            style_heading_map[style_id]["level"] = level

    # Assign roles to all body nodes
    for node in body_nodes:
        style_id = node.get("styleId", "")
        if style_id in style_heading_map and "level" in style_heading_map[style_id]:
            node["role"] = style_heading_map[style_id]["level"]
        else:
            node["role"] = "paragraph"


def _build_dynamic_rules(nodes):
    """Generate format rules dynamically from clustered nodes."""
    # Collect unique format clusters
    clusters = {}
    for node in nodes:
        if node.get("zone") != "body":
            continue
        fp = node.get("_fingerprint")
        role = node.get("role", "paragraph")
        key = (fp, role)
        if key not in clusters:
            clusters[key] = {
                "fingerprint": fp,
                "format": node.get("_format", {}),
                "role": role,
                "nodes": [],
            }
        clusters[key]["nodes"].append(node)

    # Build rules from clusters
    rules = []
    role_labels = {
        "heading1": "一级标题",
        "heading2": "二级标题",
        "heading3": "三级标题",
        "paragraph": "正文段落",
    }

    for (fp, role), cluster in clusters.items():
        rule_id = f"body.{role}"
        # Deduplicate: if multiple clusters have same role, append index
        existing_ids = [r["ruleId"] for r in rules]
        if rule_id in existing_ids:
            idx = 2
            while f"body.{role}_{idx}" in existing_ids:
                idx += 1
            rule_id = f"body.{role}_{idx}"

        label = role_labels.get(role, role)
        fmt = cluster["format"]
        if role.startswith("heading"):
            fmt = {**fmt, "clearIndent": True}

        rules.append({
            "ruleId": rule_id,
            "label": label,
            "sectionKey": "body",
            "sectionLabel": "正文",
            "selector": {"zone": "body", "role": role, "fingerprint": list(fp) if fp else None},
            "targetNodeIds": [n["nodeId"] for n in cluster["nodes"]],
            "targetCount": len(cluster["nodes"]),
            "format": fmt,
        })

    # Sort: headings first (by level), then paragraph
    level_order = {"heading1": 0, "heading2": 1, "heading3": 2, "paragraph": 10}
    rules.sort(key=lambda r: (level_order.get(r["selector"]["role"], 5), -r["targetCount"]))

    return rules


# ---------------------------------------------------------------------------
# Image & table extraction
# ---------------------------------------------------------------------------

def _extract_images(root):
    """Extract image information from OOXML body paragraphs."""
    WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    A = "http://schemas.openxmlformats.org/drawingml/2006/main"
    R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    VML = "urn:schemas-microsoft-com:vml"
    tree = etree.ElementTree(root)

    images = []
    paragraphs = root.xpath("./w:body/w:p", namespaces=NS)
    for p_index, p in enumerate(paragraphs):
        # Check for DrawingML images (w:drawing)
        for drawing in p.xpath(".//w:drawing", namespaces=NS):
            extent = drawing.find(f".//{{{WP}}}extent")
            cx = int(extent.get("cx", "0")) if extent is not None else 0
            cy = int(extent.get("cy", "0")) if extent is not None else 0
            width_px = round(cx / 9525) if cx else 0
            height_px = round(cy / 9525) if cy else 0
            blip = drawing.find(f".//{{{A}}}blip")
            embed_id = blip.get(f"{{{R}}}embed", "") if blip is not None else ""
            xpath = tree.getpath(p)
            images.append({
                "kind": "image",
                "paraIndex": p_index,
                "width": width_px,
                "height": height_px,
                "embedId": embed_id,
                "xpath": xpath,
                "text": f"[图片 {width_px}×{height_px}px]",
            })

        # Check for VML images (w:pict) - only if paragraph has NO text content
        # AND has actual image data (not just formatting elements)
        text = _p_direct_text(p)
        if not text.strip():
            has_real_image = False
            for pict in p.xpath(".//w:pict", namespaces=NS):
                imagedata = pict.find(f".//{{{VML}}}imagedata")
                if imagedata is not None:
                    # Check if this is a real image (has relationship ID)
                    rel_id = imagedata.get(f"{{{R}}}id", "")
                    if rel_id:
                        has_real_image = True
                        xpath = tree.getpath(p)
                        images.append({
                            "kind": "image",
                            "paraIndex": p_index,
                            "width": 0,
                            "height": 0,
                            "embedId": rel_id,
                            "xpath": xpath,
                            "text": "[VML图片]",
                        })
    return images


def _extract_tables(root):
    """Extract table information from OOXML body."""
    tables = []
    tree = etree.ElementTree(root)
    body = root.find(f"{{{NS['w']}}}body")
    if body is None:
        return tables
    for tbl_index, tbl in enumerate(body.findall(f"{{{NS['w']}}}tbl")):
        rows = tbl.findall(f"{{{NS['w']}}}tr")
        row_count = len(rows)
        col_count = 0
        cell_texts = []
        for row in rows:
            cells = row.findall(f"{{{NS['w']}}}tc")
            col_count = max(col_count, len(cells))
            for cell in cells:
                text = "".join(cell.xpath(".//w:t/text()", namespaces=NS)).strip()
                cell_texts.append(text[:30] if text else "")
        xpath = tree.getpath(tbl)
        tables.append({
            "kind": "table",
            "rows": row_count,
            "cols": col_count,
            "cellTexts": cell_texts,
            "xpath": xpath,
            "text": f"[表格 {row_count}行×{col_count}列]",
        })
    return tables


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


def _page_break_count(p):
    count = 0
    for br in p.xpath(".//w:br", namespaces=NS):
        if br.get(f"{{{NS['w']}}}type") == "page":
            count += 1
    return count


def _detect_locked_preview(docx_path: Path):
    """Detect pages that should be shown as locked visual previews.

    Cover pages in school thesis templates are often built from VML absolute
    shapes plus empty paragraphs and tables. They are unreliable editable DOM
    surfaces, so keep them outside the node registry and render them as page
    images instead.
    """
    root = _document_xml(docx_path)
    body = _first(root, "./w:body")
    if body is None:
        return {"strategy": "pdf-page-image", "pages": [], "zones": []}

    zone = "cover"
    page = 1
    pages = set()

    for child in body:
        if child.tag == f"{{{NS['w']}}}sectPr":
            continue

        if child.tag == f"{{{NS['w']}}}tbl":
            if zone in ("cover", "cover_en"):
                pages.add(page)
            continue

        if child.tag != f"{{{NS['w']}}}p":
            continue

        text = _p_direct_text(child)
        next_zone, _role = _zone_and_role(text, zone)
        if next_zone != zone:
            zone = next_zone

        if zone in ("cover", "cover_en"):
            pages.add(page)
        elif zone == "body" and text:
            break

        page += _page_break_count(child)

    return {
        "strategy": "pdf-page-image",
        "pages": sorted(pages),
        "zones": ["cover", "cover_en", "toc"],
        "autoSections": ["toc"],
        "reason": "封面/目录属于模板锁定视觉页，使用 WPS/PDF 页图锁定预览，正文节点单独注册。",
    }


def _parse_toc_heading(text: str):
    compact = _compact_text(text)
    if not compact:
        return None

    # 目录项通常是「2.1标题页码」。编号后必须紧跟空格或中文字符，防止把标题里的数字吃进去。
    patterns = [
        (r"^(\d+\.\d+\.\d+)\s+(.+?)(\d{1,3})$", "heading3"),
        (r"^(\d+\.\d+)\s+(.+?)(\d{1,3})$", "heading2"),
        (r"^(\d+)\s+([^\d].+?)(\d{1,3})$", "heading1"),
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
    """Detect template instruction text (not actual figure/table captions)."""
    compact = _compact_text(text)
    if not compact:
        return False
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
        if zone in ("cover", "cover_en", "toc"):
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
    W14 = NS['w14']
    generated_para_ids = False

    # Step 0: Auto-generate paraId for all paragraphs that don't have one
    paraid_generated = False
    for p in root.findall(f".//{{{NS['w']}}}p"):
        para_id = p.get(f"{{{W14}}}paraId", "")
        if not para_id:
            import random
            para_id = f"{random.randint(0x10000000, 0x7FFFFFFF):08X}"
            p.set(f"{{{W14}}}paraId", para_id)
            generated_para_ids = True
            paraid_generated = True

    # Write paraId back to DOCX immediately
    if paraid_generated:
        _write_document_xml(docx_path, root)

    # Find all paragraphs in the document, including those inside w:sdt and other nested structures
    paragraphs = root.xpath(".//w:body//w:p", namespaces=NS)
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
        if zone in ("toc", "cover", "cover_en"):
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
        # Extract formatting properties for clustering
        fmt = _extract_para_format(p, docx_path)
        node["_format"] = fmt
        node["_fingerprint"] = _format_fingerprint(fmt)
        if source_number:
            node["sourceNumberLabel"] = source_number
        nodes.append(node)

    _refine_nodes(nodes)

    # Dynamically cluster body nodes by format and detect heading levels
    _cluster_body_by_format(nodes)

    # Extract images and tables as media nodes
    image_list = _extract_images(root)
    table_list = _extract_tables(root)
    for img in image_list:
        nodes.append({
            "nodeId": f"img{len(nodes):04d}",
            "kind": "image",
            "zone": "media",
            "role": "image",
            "text": img["text"],
            "width": img["width"],
            "height": img["height"],
            "embedId": img.get("embedId", ""),
            "paraIndex": img["paraIndex"],
            "xpath": img.get("xpath", ""),
        })
    for tbl in table_list:
        nodes.append({
            "nodeId": f"tbl{len(nodes):04d}",
            "kind": "table",
            "zone": "media",
            "role": "table",
            "text": tbl["text"],
            "rows": tbl["rows"],
            "cols": tbl["cols"],
            "cellTexts": tbl["cellTexts"],
            "xpath": tbl.get("xpath", ""),
        })

    # Dynamic clustering is useful for body variants, but it must not replace
    # stable semantic rules for abstracts, references, covers, and other zones.
    rules = [
        rule for rule in _build_rules(nodes)
        if rule.get("selector", {}).get("zone") != "body"
    ] + _build_dynamic_rules(nodes)
    manifest = {
        "source": docx_path.name,
        "nodeCount": len(nodes),
        "nodes": nodes,
        "rules": rules,
        "lockedPreview": _detect_locked_preview(docx_path),
    }
    if generated_para_ids:
        _write_document_xml(docx_path, root)
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
        ("acknowledgement.title", "致谢标题", "acknowledgement", "title", "acknowledgement", "致谢", {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25}),
        ("acknowledgement.body", "致谢正文", "acknowledgement", "paragraph", "acknowledgement", "致谢", {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2}),
        ("references.title", "参考文献标题", "references", "title", "references", "参考文献", {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25}),
        ("references.item", "参考文献条目", "references", "item", "references", "参考文献", {"font": "宋体", "sizePt": 10.5, "bold": False, "alignment": "left", "lineSpacing": 1.5}),
        ("appendix.title", "附录标题", "appendix", "title", "appendix", "附录", {"font": "黑体", "sizePt": 16, "bold": True, "alignment": "center", "lineSpacing": 1.25}),
        ("appendix.body", "附录正文", "appendix", "paragraph", "appendix", "附录", {"font": "宋体", "sizePt": 12, "bold": False, "alignment": "both", "lineSpacing": 1.25, "firstLineIndentChars": 2}),
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


def _load_paper_config():
    """加载论文结构配置文件"""
    config_path = ROOT.parent / "config" / "paper_structure.json"
    if config_path.exists():
        return _normalize_paper_config(json.loads(config_path.read_text(encoding="utf-8")))
    return _normalize_paper_config({})


def _match_semantic_label(text, config=None, node_info=None):
    """匹配语义标签"""
    if config is None:
        config = _load_paper_config()

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

    # 关键词匹配（只对短文本使用，避免长文本误匹配）
    if len(normalized_text) < 30:
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
            "anchorPolicy": ["append", "insertAfter", "insertBefore", "replace"],
        }
    if zone in ("abstract_cn", "abstract_en"):
        return {
            "sectionType": "abstract",
            "sectionLabel": "中文摘要" if zone == "abstract_cn" else "英文摘要",
            "editable": True,
            "acceptsGenerated": True,
            "cleaningAction": "write_area",
            "lockedReason": "",
            "anchorPolicy": ["append", "insertAfter", "insertBefore", "replace"],
        }
    if zone == "acknowledgement":
        return {
            "sectionType": "acknowledgement",
            "sectionLabel": "致谢",
            "editable": True,
            "acceptsGenerated": True,
            "cleaningAction": "write_area",
            "lockedReason": "",
            "anchorPolicy": ["append", "insertAfter", "insertBefore", "replace"],
        }
    if zone == "appendix":
        return {
            "sectionType": "appendix",
            "sectionLabel": "附录",
            "editable": True,
            "acceptsGenerated": True,
            "cleaningAction": "write_area",
            "lockedReason": "",
            "anchorPolicy": ["append", "insertAfter", "insertBefore", "replace"],
        }
    if zone == "media":
        kind_label = "图片" if role == "image" else "表格"
        return {
            "sectionType": "media",
            "sectionLabel": f"{kind_label}区",
            "editable": True,
            "acceptsGenerated": False,
            "cleaningAction": "media_item",
            "lockedReason": "",
            "anchorPolicy": ["delete", "replace"],
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


def generate_config_from_case(case_id):
    """根据case生成配置文件"""
    folder = CASE_DIR / case_id
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # 加载默认配置
    config = _load_paper_config()

    # 分析manifest中的节点，提取语义标签
    nodes = manifest.get("nodes", [])
    semantic_labels = config.get("semanticLabels", {})

    # 收集每个zone的文本样本
    zone_samples = {}
    for node in nodes:
        zone = node.get("zone", "unknown")
        text = node.get("text", "")
        if text and zone not in ("media",):
            if zone not in zone_samples:
                zone_samples[zone] = []
            zone_samples[zone].append(text[:50])

    # 更新配置中的别名
    for zone, samples in zone_samples.items():
        # 根据zone类型更新别名
        if zone == "abstract_cn" and "中文摘要" in semantic_labels:
            # 添加zone名称作为别名
            if zone not in semantic_labels["中文摘要"]["aliases"]:
                semantic_labels["中文摘要"]["aliases"].append(zone)
        elif zone == "abstract_en" and "英文摘要" in semantic_labels:
            if zone not in semantic_labels["英文摘要"]["aliases"]:
                semantic_labels["英文摘要"]["aliases"].append(zone)
        elif zone == "acknowledgement" and "致谢" in semantic_labels:
            if zone not in semantic_labels["致谢"]["aliases"]:
                semantic_labels["致谢"]["aliases"].append(zone)

    # 从DOCX中解析真实格式
    work_docx = folder / "work.docx"
    if work_docx.exists():
        format_rules = parse_format_from_docx(work_docx, manifest)
        config = _normalize_paper_config(config, format_rules)

    # 保存更新后的配置
    config_path = ROOT.parent / "config" / "paper_structure.json"
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")

    return config


def apply_config_to_case(case_id: str, config: dict):
    """根据配置更新DOCX"""
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # 获取格式规则
    format_rules = config.get("formatRules", {})

    # 更新DOCX中的样式
    root = _document_xml(work_docx)
    body = root.find(f"{{{NS['w']}}}body")
    W = NS['w']

    # 遍历所有段落，应用格式规则
    for p in body.findall(f".//{{{W}}}p"):
        # 获取段落文本
        text = "".join(p.xpath(".//w:t/text()", namespaces=NS)).strip()
        if not text:
            continue

        # 获取段落ID
        para_id = p.get(f"{{{NS['w14']}}}paraId", "")

        # 查找对应的节点
        node = None
        for n in manifest.get("nodes", []):
            if n.get("paraId") == para_id:
                node = n
                break

        if not node:
            continue

        # 区域和角色共同决定格式，摘要/致谢等正文不再误用“正文段落”。
        format_rule = format_rules.get(_format_rule_key_for_node(node))

        if not format_rule:
            continue

        # 应用格式规则
        _apply_paragraph_format(p, format_rule)

    # 写入更新后的DOCX
    _write_document_xml(work_docx, root, manifest)

    # 更新manifest
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return manifest


def _apply_paragraph_format(p, format_rule):
    """应用段落格式"""
    W = NS['w']

    # 获取或创建段落属性
    pPr = p.find(f"{{{W}}}pPr")
    if pPr is None:
        pPr = etree.SubElement(p, f"{{{W}}}pPr")

    # 设置对齐方式
    if "alignment" in format_rule:
        jc = pPr.find(f"{{{W}}}jc")
        if jc is None:
            jc = etree.SubElement(pPr, f"{{{W}}}jc")
        align_map = {"left": "left", "center": "center", "right": "right", "both": "both"}
        jc.set(f"{{{W}}}val", align_map.get(format_rule["alignment"], "left"))

    # 设置行距
    if "lineSpacing" in format_rule:
        spacing = pPr.find(f"{{{W}}}spacing")
        if spacing is None:
            spacing = etree.SubElement(pPr, f"{{{W}}}spacing")
        line_val = str(int(format_rule["lineSpacing"] * 240))
        spacing.set(f"{{{W}}}line", line_val)
        spacing.set(f"{{{W}}}lineRule", "auto")

    # 设置段前距和段后距
    if "spaceBefore" in format_rule:
        spacing = pPr.find(f"{{{W}}}spacing")
        if spacing is None:
            spacing = etree.SubElement(pPr, f"{{{W}}}spacing")
        before_val = str(int(format_rule["spaceBefore"] * 240))
        spacing.set(f"{{{W}}}before", before_val)

    if "spaceAfter" in format_rule:
        spacing = pPr.find(f"{{{W}}}spacing")
        if spacing is None:
            spacing = etree.SubElement(pPr, f"{{{W}}}spacing")
        after_val = str(int(format_rule["spaceAfter"] * 240))
        spacing.set(f"{{{W}}}after", after_val)

    # 设置首行缩进
    if "firstLineIndentChars" in format_rule:
        ind = pPr.find(f"{{{W}}}ind")
        if ind is None:
            ind = etree.SubElement(pPr, f"{{{W}}}ind")
        first_line_val = str(int(format_rule["firstLineIndentChars"] * 100))
        ind.set(f"{{{W}}}firstLineChars", first_line_val)

    # 遍历所有run，应用字体格式
    for r in p.findall(f".//{{{W}}}r"):
        rPr = r.find(f"{{{W}}}rPr")
        if rPr is None:
            rPr = etree.SubElement(r, f"{{{W}}}rPr")

        # 设置字体
        if "font" in format_rule:
            fonts = rPr.find(f"{{{W}}}rFonts")
            if fonts is None:
                fonts = etree.SubElement(rPr, f"{{{W}}}rFonts")
            fonts.set(f"{{{W}}}ascii", format_rule["font"])
            fonts.set(f"{{{W}}}eastAsia", format_rule["font"])

        # 设置字号
        if "sizePt" in format_rule:
            sz = rPr.find(f"{{{W}}}sz")
            if sz is None:
                sz = etree.SubElement(rPr, f"{{{W}}}sz")
            sz.set(f"{{{W}}}val", str(int(format_rule["sizePt"] * 2)))

        # 设置加粗
        if "bold" in format_rule:
            b = rPr.find(f"{{{W}}}b")
            if format_rule["bold"]:
                if b is None:
                    b = etree.SubElement(rPr, f"{{{W}}}b")
            else:
                if b is not None:
                    rPr.remove(b)

        # 设置颜色
        if "color" in format_rule:
            color = rPr.find(f"{{{W}}}color")
            if color is None:
                color = etree.SubElement(rPr, f"{{{W}}}color")
            color_val = format_rule["color"].replace("#", "")
            color.set(f"{{{W}}}val", color_val)


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
    manifest["nodeCount"] = len(manifest.get("nodes", []))
    for node in manifest.get("nodes", []):
        node.update(_node_product_meta(node))
    _attach_heading_numbers(manifest)
    for rule in manifest.get("rules", []):
        selector = rule.get("selector", {})
        target_ids = [
            n["nodeId"] for n in manifest.get("nodes", [])
            if _node_matches_rule_selector(n, selector)
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


def _node_matches_rule_selector(node: dict, selector: dict):
    if node.get("zone") != selector.get("zone") or node.get("role") != selector.get("role"):
        return False
    fingerprint = selector.get("fingerprint")
    if fingerprint is None:
        return True
    return list(node.get("_fingerprint") or []) == list(fingerprint)


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

    # Try to find by xpath
    targets = root.xpath(node.get("xpath", ""), namespaces=NS)

    # If not found by xpath, try to find by paraId
    if not targets:
        para_id = node.get("paraId", "")
        if para_id:
            targets = root.xpath(f".//w:p[@w14:paraId='{para_id}']", namespaces=NS)

    return node, targets[0] if targets else None


def _is_preserved_paragraph_anchor(child):
    """Check if a child element should be preserved when clearing paragraph content."""
    preserved_tags = {
        f"{{{NS['w']}}}pPr",
        f"{{{NS['w']}}}bookmarkStart",
        f"{{{NS['w']}}}bookmarkEnd",
        f"{{{NS['w']}}}pict",  # VML images
        f"{{{NS['w']}}}smartTag",
        f"{{{NS['w']}}}sdt",
    }
    if child.tag in preserved_tags:
        return True
    # Also preserve elements that contain images or drawings
    if child.find(f".//{{{NS['w']}}}drawing") is not None:
        return True
    if child.find(f".//{{{NS['w']}}}pict") is not None:
        return True
    return False


def _clear_paragraph_content_keep_anchors(paragraph):
    for child in list(paragraph):
        if not _is_preserved_paragraph_anchor(child):
            paragraph.remove(child)


def _paragraph_text_insert_index(paragraph):
    bookmark_end_tag = f"{{{NS['w']}}}bookmarkEnd"
    for index, child in enumerate(paragraph):
        if child.tag == bookmark_end_tag:
            return index
    return len(paragraph)


def _set_paragraph_text(paragraph, text: str):
    """Set text content of a paragraph, preserving paragraph properties and bookmarks."""
    W = NS['w']
    # Remove all existing runs (but keep pPr and bookmarks)
    for r in list(paragraph.findall(f"{{{W}}}r")):
        paragraph.remove(r)
    # Create new text run
    run = etree.Element(f"{{{W}}}r")
    t = etree.SubElement(run, f"{{{W}}}t")
    if text.startswith(" ") or text.endswith(" "):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    # Add run to paragraph
    paragraph.append(run)


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


def _make_text_run(text: str, superscript=False):
    run = etree.Element(f"{{{NS['w']}}}r")
    if superscript:
        rpr = etree.SubElement(run, f"{{{NS['w']}}}rPr")
        vert = etree.SubElement(rpr, f"{{{NS['w']}}}vertAlign")
        _set_attr(vert, "val", "superscript")
    t = etree.SubElement(run, f"{{{NS['w']}}}t")
    if text.startswith(" ") or text.endswith(" "):
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return run


def _append_text_run(parent, text: str, superscript=False):
    run = _make_text_run(text, superscript=superscript)
    parent.append(run)
    return run


def _set_paragraph_text_with_citations(paragraph, text: str, manifest: dict):
    segments, citations = _parse_citation_segments(text, manifest)
    _clear_paragraph_content_keep_anchors(paragraph)
    for segment in segments:
        if segment["type"] == "citation":
            hyperlink = etree.Element(f"{{{NS['w']}}}hyperlink")
            _set_attr(hyperlink, "anchor", segment["ref"]["bookmark"])
            _append_text_run(hyperlink, segment["text"], superscript=True)
            paragraph.insert(_paragraph_text_insert_index(paragraph), hyperlink)
        else:
            run = _make_text_run(segment["text"])
            paragraph.insert(_paragraph_text_insert_index(paragraph), run)
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


def _case_preview_pdf(case_id: str):
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    pdf_path = folder / "preview.pdf"
    if not work_docx.exists():
        raise FileNotFoundError(f"case docx not found: {case_id}")
    if pdf_path.exists() and pdf_path.stat().st_mtime >= work_docx.stat().st_mtime:
        return pdf_path

    script = ROOT / "wps_convert_pdf.py"
    if not script.exists():
        raise FileNotFoundError("wps_convert_pdf.py not found")
    pdf_path.unlink(missing_ok=True)
    result = subprocess.run(
        [sys.executable, str(script), str(work_docx), str(pdf_path)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0 or not pdf_path.exists():
        detail = (result.stderr or result.stdout or "unknown WPS conversion error").strip()
        raise RuntimeError(f"PDF preview conversion failed: {detail}")
    return pdf_path


def render_preview_page(case_id: str, page_no: int):
    if page_no < 1:
        raise ValueError("page number must be >= 1")
    pdf_path = _case_preview_pdf(case_id)
    folder = CASE_DIR / case_id
    png_path = folder / f"preview_page_{page_no}.png"
    if png_path.exists() and png_path.stat().st_mtime >= pdf_path.stat().st_mtime:
        return png_path

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(str(pdf_path))
    if page_no > len(pdf):
        raise ValueError(f"page {page_no} out of range")
    page = pdf[page_no - 1]
    image = page.render(scale=2).to_pil()
    image.save(png_path)
    return png_path


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
        target_ids = [
            node["nodeId"] for node in nodes
            if _node_matches_rule_selector(node, selector)
        ]
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


def replace_node_content(case_id: str, node_id: str, text: str, format_rule_id: str = None, format_override: dict = None, preserve_format: bool = True):
    """Replace the text content of an existing node, preserving or updating format."""
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # Find the node in manifest
    node = None
    for n in manifest.get("nodes", []):
        if n.get("nodeId") == node_id:
            node = n
            break

    if not node:
        raise KeyError(f"Node not found: {node_id}")

    # Find the paragraph in DOCX
    root = _document_xml(work_docx)
    xpath = node.get("xpath", "")
    if not xpath:
        raise ValueError(f"Node has no xpath: {node_id}")

    # Try to find by xpath
    targets = root.xpath(xpath, namespaces=NS)

    # If not found by xpath, try to find by paraId
    if not targets:
        para_id = node.get("paraId", "")
        if para_id:
            targets = root.xpath(f".//w:p[@w14:paraId='{para_id}']", namespaces=NS)

    if not targets:
        raise ValueError(f"Element not found for xpath: {xpath}")

    p = targets[0]

    # Write new text with citation-aware parsing
    citations = _set_paragraph_text_with_citations(p, text, manifest)

    # Apply format
    if format_override:
        _apply_paragraph_style(p, format_override)
        node["formatOverride"] = format_override
    elif format_rule_id:
        config = _load_paper_config()
        rule = config.get("formatRules", {}).get(format_rule_id, {})
        if rule:
            _apply_paragraph_style(p, rule)
        node["formatRuleId"] = format_rule_id
        node.pop("formatOverride", None)
    elif preserve_format:
        # Keep existing format - don't touch style
        pass

    # Update manifest
    node["text"] = text[:90]
    node["displayText"] = text[:90]
    node["citations"] = citations
    node.update(_p_meta(p))

    # Write back
    _write_document_xml(work_docx, root, manifest)
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"manifest": manifest, "affectedNodeId": node_id, "operation": "replaceText"}


def replace_image(case_id: str, node_id: str, image_data: bytes, filename: str, width_px: int = 400):
    """Replace an existing image in-place, preserving nodeId and position."""
    import hashlib
    import struct

    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # Find the image node
    node = None
    for n in manifest.get("nodes", []):
        if n.get("nodeId") == node_id:
            node = n
            break

    if not node:
        raise KeyError(f"Image node not found: {node_id}")

    # Find the image element in DOCX
    root = _document_xml(work_docx)
    xpath = node.get("xpath", "")
    if not xpath:
        raise ValueError(f"Node has no xpath: {node_id}")

    # Try to find by xpath
    targets = root.xpath(xpath, namespaces=NS)

    # If not found by xpath, try to find by paraId
    if not targets:
        para_id = node.get("paraId", "")
        if para_id:
            targets = root.xpath(f".//w:p[@w14:paraId='{para_id}']", namespaces=NS)

    if not targets:
        raise ValueError(f"Element not found for xpath: {xpath}")

    p = targets[0]
    W = NS['w']
    WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

    # Calculate image dimensions
    height_px = 300
    try:
        if image_data[:8] == b'\x89PNG\r\n\x1a\n':
            w = struct.unpack('>I', image_data[16:20])[0]
            h = struct.unpack('>I', image_data[20:24])[0]
            if w > 0 and h > 0:
                height_px = round(width_px * h / w)
        elif image_data[:2] == b'\xff\xd8':
            height_px = round(width_px * 0.75)
    except Exception:
        pass

    # Generate unique filename
    img_hash = hashlib.md5(image_data).hexdigest()[:8]
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'png'
    img_filename = f"image_{img_hash}.{ext}"
    rel_id = f"rImg{img_hash}"

    # Update DOCX zip
    temp_path = work_docx.with_suffix(".tmp.docx")
    with zipfile.ZipFile(work_docx, "r") as zin:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "[Content_Types].xml":
                    content = zin.read(item.filename)
                    ct_root = etree.fromstring(content)
                    if ext == "png":
                        existing = ct_root.xpath("//Default[@Extension='png']")
                        if not existing:
                            default_el = etree.SubElement(ct_root, "Default")
                            default_el.set("Extension", "png")
                            default_el.set("ContentType", "image/png")
                    elif ext in ("jpg", "jpeg"):
                        existing = ct_root.xpath("//Default[@Extension='jpg']")
                        if not existing:
                            default_el = etree.SubElement(ct_root, "Default")
                            default_el.set("Extension", "jpg")
                            default_el.set("ContentType", "image/jpeg")
                    zout.writestr(item, etree.tostring(ct_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
                elif item.filename == "word/_rels/document.xml.rels":
                    content = zin.read(item.filename)
                    rels_root = etree.fromstring(content)
                    # Remove old relationship for this node's embedId
                    old_embed_id = node.get("embedId", "")
                    if old_embed_id:
                        for rel in rels_root.xpath(f"//Relationship[@Id='{old_embed_id}']", namespaces=NS):
                            rels_root.remove(rel)
                    # Add new relationship
                    rel = etree.SubElement(rels_root, "Relationship")
                    rel.set("Id", rel_id)
                    rel.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image")
                    rel.set("Target", f"media/{img_filename}")
                    zout.writestr(item, etree.tostring(rels_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
                elif item.filename.startswith("word/media/") and old_embed_id:
                    # Skip old media file
                    pass
                else:
                    zout.writestr(item, zin.read(item.filename))
            # Add new image file
            zout.writestr(f"word/media/{img_filename}", image_data)
    temp_path.replace(work_docx)

    # Update the drawing element in the paragraph
    # Find the drawing element
    drawing = p.find(f".//{{{WP_NS}}}inline")
    if drawing is None:
        drawing = p.find(f".//{{{WP_NS}}}anchor")
    if drawing is not None:
        # Update the relationship reference
        for blip in drawing.findall(f".//{{{NS['a']}}}blip"):
            blip.set(f"{{{R_NS}}}embed", rel_id)

        # Update dimensions
        for ext in drawing.findall(f".//{{{WP_NS}}}extent"):
            cx = int(width_px * 9525)
            cy = int(height_px * 9525)
            ext.set("cx", str(cx))
            ext.set("cy", str(cy))

    # Update manifest
    node["embedId"] = rel_id
    node["mediaPath"] = f"word/media/{img_filename}"
    node["width"] = width_px
    node["height"] = height_px
    node.update(_p_meta(p))

    _write_document_xml(work_docx, root, manifest)
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"manifest": manifest, "affectedNodeId": node_id, "operation": "replaceImage"}


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
        if custom_format:
            node["formatOverride"] = custom_format
            _apply_paragraph_style(target, custom_format)
        elif role == "custom":
            node["formatOverride"] = _default_custom_format()
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
        _write_document_xml(work_docx, root, manifest)
        manifest["version"] = int(time.time() * 1000)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return manifest

    paragraph = _make_paragraph("")
    citations = _set_paragraph_text_with_citations(paragraph, normalized_text, manifest)
    if mode in ("insertAfter", "insertBefore") and anchor_node_id:
        anchor_node, anchor = _find_node_element(root, manifest, anchor_node_id)
        if anchor is None:
            raise KeyError(f"insert anchor not found: {anchor_node_id}")
        if not anchor_node.get("acceptsGenerated"):
            raise ValueError(f"anchor node is locked and cannot accept generated content: {anchor_node_id}")
        parent = anchor.getparent()
        if mode == "insertAfter":
            parent.insert(parent.index(anchor) + 1, paragraph)
        else:  # insertBefore
            parent.insert(parent.index(anchor), paragraph)
    else:
        parent, before = _body_insert_anchor(root, manifest, zone)
        if parent is None:
            raise RuntimeError("document body not found")
        if before is not None:
            parent.insert(parent.index(before), paragraph)
        else:
            parent.append(paragraph)

    if custom_format:
        _apply_paragraph_style(paragraph, custom_format)
    elif role == "custom":
        _apply_paragraph_style(paragraph, _default_custom_format())
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
    if custom_format:
        node["formatOverride"] = custom_format
    elif role == "custom":
        node["formatOverride"] = _default_custom_format()
    manifest["nodes"].append(node)
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _materialize_heading_numbers(root, manifest)
    _materialize_reference_numbers(root, manifest)
    _write_document_xml(work_docx, root, manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def batch_operations(case_id: str, operations: list):
    """Execute multiple operations in a single DOCX write cycle.

    Each operation is a dict with "type" key:
    - insert: {type, text, zone, role, mode, anchorNodeId, customFormat}
    - replace: {type, nodeId, text, formatRuleId?, formatOverride?, preserveFormat?}
    - delete: {type, nodeId}
    - replace_image: {type, nodeId, imageData (base64), filename, widthPx}

    "anchorNodeId": "__prev__" references the node created by the previous insert operation.
    """
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = _document_xml(work_docx)
    results = []
    prev_node_id = ""

    for op in operations:
        op_type = op.get("type")

        if op_type == "insert":
            text = (op.get("text") or "").strip() or "新生成内容"
            zone = op.get("zone", "body")
            role = op.get("role", "paragraph")
            mode = op.get("mode", "append")
            anchor = op.get("anchorNodeId", "")
            if anchor == "__prev__":
                anchor = prev_node_id
            custom_format = op.get("customFormat") or None

            if zone != "body" or role not in BODY_WRITE_ROLES:
                results.append({"type": "insert", "error": "invalid zone/role"})
                continue

            paragraph = _make_paragraph("")
            citations = _set_paragraph_text_with_citations(paragraph, text, manifest)

            if mode in ("insertAfter", "insertBefore") and anchor:
                anchor_node, anchor_el = _find_node_element(root, manifest, anchor)
                if anchor_el is None:
                    results.append({"type": "insert", "error": f"anchor not found: {anchor}"})
                    continue
                parent = anchor_el.getparent()
                if mode == "insertAfter":
                    parent.insert(parent.index(anchor_el) + 1, paragraph)
                else:
                    parent.insert(parent.index(anchor_el), paragraph)
            else:
                parent, before = _body_insert_anchor(root, manifest, zone)
                if parent is None:
                    results.append({"type": "insert", "error": "document body not found"})
                    continue
                if before is not None:
                    parent.insert(parent.index(before), paragraph)
                else:
                    parent.append(paragraph)

            if custom_format:
                _apply_paragraph_style(paragraph, custom_format)
            elif role == "custom":
                _apply_paragraph_style(paragraph, _default_custom_format())
            else:
                rule = _matching_rule(manifest, zone, role)
                if rule:
                    _apply_paragraph_style(paragraph, rule.get("format", {}))

            tree = etree.ElementTree(root)
            new_node_id = _next_node_id(manifest)
            node = {
                "nodeId": new_node_id,
                "kind": "paragraph",
                "zone": zone,
                "role": role,
                "xpath": tree.getpath(paragraph),
                "text": _p_text(paragraph)[:90],
                "citations": citations,
                "generated": True,
                **_p_meta(paragraph),
            }
            if custom_format:
                node["formatOverride"] = custom_format
            elif role == "custom":
                node["formatOverride"] = _default_custom_format()
            manifest["nodes"].append(node)
            prev_node_id = new_node_id
            results.append({"type": "insert", "nodeId": new_node_id})

        elif op_type == "replace":
            node_id = op.get("nodeId")
            text = op.get("text", "")
            node = next((n for n in manifest["nodes"] if n.get("nodeId") == node_id), None)
            if not node:
                results.append({"type": "replace", "error": f"node not found: {node_id}"})
                continue
            targets = root.xpath(node.get("xpath", ""), namespaces=NS)
            if not targets:
                para_id = node.get("paraId", "")
                if para_id:
                    targets = root.xpath(f".//w:p[@w14:paraId='{para_id}']", namespaces=NS)
            if not targets:
                results.append({"type": "replace", "error": f"element not found: {node_id}"})
                continue
            p = targets[0]
            citations = _set_paragraph_text_with_citations(p, text, manifest)
            fmt_override = op.get("formatOverride")
            fmt_rule = op.get("formatRuleId")
            if fmt_override:
                _apply_paragraph_style(p, fmt_override)
                node["formatOverride"] = fmt_override
            elif fmt_rule:
                config = _load_paper_config()
                rule = config.get("formatRules", {}).get(fmt_rule, {})
                if rule:
                    _apply_paragraph_style(p, rule)
            node["text"] = text[:90]
            node["displayText"] = text[:90]
            node["citations"] = citations
            node.update(_p_meta(p))
            results.append({"type": "replace", "nodeId": node_id})

        elif op_type == "delete":
            node_id = op.get("nodeId")
            node = next((n for n in manifest["nodes"] if n.get("nodeId") == node_id), None)
            if not node:
                results.append({"type": "delete", "error": f"node not found: {node_id}"})
                continue
            targets = root.xpath(node.get("xpath", ""), namespaces=NS)
            if not targets:
                para_id = node.get("paraId", "")
                if para_id:
                    targets = root.xpath(f".//w:p[@w14:paraId='{para_id}']", namespaces=NS)
            if targets:
                parent = targets[0].getparent()
                if parent is not None:
                    parent.remove(targets[0])
            manifest["nodes"] = [n for n in manifest["nodes"] if n.get("nodeId") != node_id]
            results.append({"type": "delete", "nodeId": node_id})

        else:
            results.append({"type": op_type, "error": f"unknown operation type: {op_type}"})

    # Single write cycle for all operations
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _materialize_heading_numbers(root, manifest)
    _materialize_reference_numbers(root, manifest)
    _write_document_xml(work_docx, root, manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"manifest": manifest, "results": results, "operation": "batch"}


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
    _write_document_xml(work_docx, root, manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def delete_node(case_id: str, node_id: str):
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = _document_xml(work_docx)

    node, target = _find_node_element(root, manifest, node_id)
    if not node or target is None:
        raise KeyError(f"node not found: {node_id}")
    # Media nodes (images, tables) can be deleted even though they're locked
    if not node.get("acceptsGenerated") and node.get("zone") != "media":
        raise ValueError(f"node is locked and cannot be deleted: {node_id}")

    parent = target.getparent()
    if parent is None:
        raise RuntimeError("node has no parent")
    parent.remove(target)
    manifest["nodes"] = [n for n in manifest.get("nodes", []) if n.get("nodeId") != node_id]

    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _materialize_heading_numbers(root, manifest)
    _materialize_reference_numbers(root, manifest)
    _write_document_xml(work_docx, root, manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def insert_image(case_id: str, image_data: bytes, filename: str, anchor_node_id: str = "", width_px: int = 400, mode: str = "insertAfter", replace_node_id: str = ""):
    """Insert an image into the DOCX after the anchor node (or at end of body).
    If replace_node_id is provided, replace the existing image node instead of inserting a new one.
    """
    import hashlib
    import struct

    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    replace_node = _find_node(manifest, replace_node_id) if replace_node_id else None
    if replace_node_id and not replace_node:
        raise KeyError(f"image node not found: {replace_node_id}")
    if replace_node and replace_node.get("role") != "image":
        raise ValueError(f"node is not an image: {replace_node_id}")

    # Determine image dimensions from data if possible
    height_px = 300  # default aspect ratio
    try:
        # Try to detect PNG dimensions
        if image_data[:8] == b'\x89PNG\r\n\x1a\n':
            w = struct.unpack('>I', image_data[16:20])[0]
            h = struct.unpack('>I', image_data[20:24])[0]
            if w > 0 and h > 0:
                height_px = round(width_px * h / w)
        # Try to detect JPEG dimensions (simplified)
        elif image_data[:2] == b'\xff\xd8':
            height_px = round(width_px * 0.75)
    except Exception:
        pass

    # Generate unique image filename and relationship ID
    img_hash = hashlib.md5(image_data).hexdigest()[:8]
    if image_data[:8] == b'\x89PNG\r\n\x1a\n':
        extension, content_type = "png", "image/png"
    elif image_data[:2] == b'\xff\xd8':
        extension, content_type = "jpg", "image/jpeg"
    else:
        extension, content_type = "png", "image/png"
    img_filename = f"image_{img_hash}.{extension}"
    rel_id = f"rImg{img_hash}"

    # First, update the DOCX zip to add image and relationships
    temp_path = work_docx.with_suffix(".tmp.docx")
    with zipfile.ZipFile(work_docx, "r") as zin:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if item.filename == "[Content_Types].xml":
                    content = zin.read(item.filename)
                    ct_root = etree.fromstring(content)
                    existing = ct_root.xpath(f"//Default[@Extension='{extension}']")
                    if not existing:
                        default_el = etree.SubElement(ct_root, "Default")
                        default_el.set("Extension", extension)
                        default_el.set("ContentType", content_type)
                    zout.writestr(item, etree.tostring(ct_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
                elif item.filename == "word/_rels/document.xml.rels":
                    content = zin.read(item.filename)
                    rels_root = etree.fromstring(content)
                    existing = rels_root.xpath(f"//Relationship[@Id='{rel_id}']")
                    if not existing:
                        rel = etree.SubElement(rels_root, "Relationship")
                        rel.set("Id", rel_id)
                        rel.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image")
                        rel.set("Target", f"media/{img_filename}")
                    zout.writestr(item, etree.tostring(rels_root, xml_declaration=True, encoding="UTF-8", standalone="yes"))
                else:
                    zout.writestr(item, zin.read(item.filename))
            # Add image file only if it doesn't already exist
            if f"word/media/{img_filename}" not in [item.filename for item in zin.infolist()]:
                zout.writestr(f"word/media/{img_filename}", image_data)
    temp_path.replace(work_docx)

    # Now read document.xml and add image paragraph
    root = _document_xml(work_docx)
    body = root.find(f"{{{NS['w']}}}body")
    W = NS['w']
    WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
    A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
    R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture"

    # Find anchor position
    insert_parent = body
    insert_idx = len(list(body))  # default: end of body
    if replace_node:
        targets = root.xpath(replace_node.get("xpath", ""), namespaces=NS)
        if not targets:
            raise KeyError(f"image xpath not found: {replace_node_id}")
        old_image = targets[0]
        insert_parent = old_image.getparent()
        insert_idx = insert_parent.index(old_image)
        insert_parent.remove(old_image)
    elif anchor_node_id:
        anchor_node, anchor_el = _find_node_element(root, manifest, anchor_node_id)
        if anchor_el is not None:
            insert_parent = anchor_el.getparent()
            if mode == "insertBefore":
                insert_idx = list(insert_parent).index(anchor_el)
            else:  # insertAfter
                insert_idx = list(insert_parent).index(anchor_el) + 1

    # Create paragraph with centered alignment for image
    p = etree.Element(f"{{{W}}}p")
    p.set(f"{{{NS['w14']}}}paraId", _new_para_id())
    ppr = etree.SubElement(p, f"{{{W}}}pPr")
    jc = etree.SubElement(ppr, f"{{{W}}}jc")
    jc.set(f"{{{W}}}val", "center")

    # Create run with drawing
    run = etree.SubElement(p, f"{{{W}}}r")
    drawing = etree.SubElement(run, f"{{{W}}}drawing")

    # Create inline drawing
    inline = etree.SubElement(drawing, f"{{{WP_NS}}}inline")
    inline.set("distT", "0")
    inline.set("distB", "0")
    inline.set("distL", "0")
    inline.set("distR", "0")

    # Set size
    extent = etree.SubElement(inline, f"{{{WP_NS}}}extent")
    cx = width_px * 9525  # EMU
    cy = height_px * 9525
    extent.set("cx", str(int(cx)))
    extent.set("cy", str(int(cy)))

    # Set effect extent
    effectExtent = etree.SubElement(inline, f"{{{WP_NS}}}effectExtent")
    effectExtent.set("L", "0")
    effectExtent.set("T", "0")
    effectExtent.set("R", "0")
    effectExtent.set("B", "0")

    # Doc properties
    docPr = etree.SubElement(inline, f"{{{WP_NS}}}docPr")
    docPr.set("id", str(len(manifest.get("nodes", [])) + 1))
    docPr.set("name", img_filename)

    # Graphic
    graphic = etree.SubElement(inline, f"{{{A_NS}}}graphic")
    graphicData = etree.SubElement(graphic, f"{{{A_NS}}}graphicData")
    graphicData.set("uri", "http://schemas.openxmlformats.org/drawingml/2006/picture")

    # Picture
    pic = etree.SubElement(graphicData, f"{{{PIC_NS}}}pic")
    nvPicPr = etree.SubElement(pic, f"{{{PIC_NS}}}nvPicPr")
    cNvPr = etree.SubElement(nvPicPr, f"{{{PIC_NS}}}cNvPr")
    cNvPr.set("id", "0")
    cNvPr.set("name", img_filename)
    cNvPicPr = etree.SubElement(nvPicPr, f"{{{PIC_NS}}}cNvPicPr")

    blipFill = etree.SubElement(pic, f"{{{PIC_NS}}}blipFill")
    blip = etree.SubElement(blipFill, f"{{{A_NS}}}blip")
    blip.set(f"{{{R_NS}}}embed", rel_id)

    stretch = etree.SubElement(blipFill, f"{{{A_NS}}}stretch")
    fillRect = etree.SubElement(stretch, f"{{{A_NS}}}fillRect")

    spPr = etree.SubElement(pic, f"{{{PIC_NS}}}spPr")
    xfrm = etree.SubElement(spPr, f"{{{A_NS}}}xfrm")
    off = etree.SubElement(xfrm, f"{{{A_NS}}}off")
    off.set("x", "0")
    off.set("y", "0")
    ext = etree.SubElement(xfrm, f"{{{A_NS}}}ext")
    ext.set("cx", str(int(cx)))
    ext.set("cy", str(int(cy)))

    prstGeom = etree.SubElement(spPr, f"{{{A_NS}}}prstGeom")
    prstGeom.set("prst", "rect")

    # Insert at the calculated position
    insert_parent.insert(insert_idx, p)

    # Compute xpath for the new image paragraph
    tree = etree.ElementTree(root)
    p_xpath = tree.getpath(p)

    # Add image node to manifest
    existing_img_ids = [int(n['nodeId'][3:]) for n in manifest.get('nodes', []) if n.get('role') == 'image' and n.get('nodeId', '').startswith('img') and n['nodeId'][3:].isdigit()]
    new_node_id = replace_node_id or f"img{(max(existing_img_ids) + 1) if existing_img_ids else 1:04d}"
    image_node = {
        "nodeId": new_node_id,
        "kind": "image",
        "zone": "media",
        "role": "image",
        "text": f"[图片: {filename}]",
        "xpath": p_xpath,
        "width": width_px,
        "height": height_px,
        "embedId": rel_id,
        "mediaPath": f"word/media/{img_filename}",
        "contentType": content_type,
        "sectionType": "media",
        "sectionLabel": "图片区",
        "editable": True,
        "acceptsGenerated": True,
        "generated": True,
        "cleaningAction": "media_item",
        "lockedReason": "",
        "anchorPolicy": ["delete", "replace"],
        "displayText": f"[图片: {filename}]"
    }
    if replace_node:
        replace_node.clear()
        replace_node.update(image_node)
    else:
        manifest.setdefault("nodes", []).append(image_node)

    # Write updated document.xml
    _write_document_xml(work_docx, root, manifest)

    # Update manifest
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def insert_table(case_id: str, rows: int, cols: int, anchor_node_id: str = "", cell_text_list: list = None, mode: str = "insertAfter"):
    """Insert a table into the DOCX after the anchor node (or at end of body)."""
    print(f"DEBUG insert_table called: case_id={case_id}, rows={rows}, cols={cols}, cell_text_list={cell_text_list}, mode={mode}", flush=True)
    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    root = _document_xml(work_docx)
    body = root.find(f"{{{NS['w']}}}body")

    W = NS['w']

    # Find anchor position
    insert_idx = len(list(body))  # default: end of body
    if anchor_node_id:
        anchor_node, anchor_el = _find_node_element(root, manifest, anchor_node_id)
        if anchor_el is not None:
            parent = anchor_el.getparent()
            if mode == "insertBefore":
                insert_idx = list(parent).index(anchor_el)
            else:  # insertAfter
                insert_idx = list(parent).index(anchor_el) + 1

    # Create table element
    tbl = etree.Element(f"{{{W}}}tbl")

    # Table properties
    tblPr = etree.SubElement(tbl, f"{{{W}}}tblPr")
    tblStyle = etree.SubElement(tblPr, f"{{{W}}}tblStyle")
    tblStyle.set(f"{{{W}}}val", "TableGrid")
    tblW = etree.SubElement(tblPr, f"{{{W}}}tblW")
    tblW.set(f"{{{W}}}w", "0")
    tblW.set(f"{{{W}}}type", "auto")
    tblBorders = etree.SubElement(tblPr, f"{{{W}}}tblBorders")
    for border_name in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        border = etree.SubElement(tblBorders, f"{{{W}}}{border_name}")
        border.set(f"{{{W}}}val", "single")
        border.set(f"{{{W}}}sz", "4")
        border.set(f"{{{W}}}space", "0")
        border.set(f"{{{W}}}color", "000000")

    # Create rows and cells
    cell_idx = 0
    for i in range(rows):
        tr = etree.SubElement(tbl, f"{{{W}}}tr")
        for j in range(cols):
            tc = etree.SubElement(tr, f"{{{W}}}tc")
            # Cell properties
            tcPr = etree.SubElement(tc, f"{{{W}}}tcPr")
            tcW = etree.SubElement(tcPr, f"{{{W}}}tcW")
            tcW.set(f"{{{W}}}w", str(round(8500 / cols)))  # Distribute width
            tcW.set(f"{{{W}}}type", "dxa")
            # Paragraph in cell with text
            p = etree.SubElement(tc, f"{{{W}}}p")
            p.set(f"{{{NS['w14']}}}paraId", _new_para_id())
            if cell_text_list and cell_idx < len(cell_text_list) and cell_text_list[cell_idx]:
                # Add text run to paragraph
                r = etree.SubElement(p, f"{{{W}}}r")
                t = etree.SubElement(r, f"{{{W}}}t")
                t.text = cell_text_list[cell_idx]
            cell_idx += 1

    # Insert at the calculated position
    body.insert(insert_idx, tbl)

    # Add table node to manifest
    existing_tbl_ids = [int(n['nodeId'][3:]) for n in manifest.get('nodes', []) if n.get('role') == 'table' and n.get('nodeId', '').startswith('tbl') and n['nodeId'][3:].isdigit()]
    new_node_id = f"tbl{(max(existing_tbl_ids) + 1) if existing_tbl_ids else 1:04d}"

    # Compute xpath for the new table
    tree = etree.ElementTree(root)
    tbl_xpath = tree.getpath(tbl)

    table_node = {
        "nodeId": new_node_id,
        "kind": "table",
        "zone": "media",
        "role": "table",
        "text": f"[表格 {rows}行×{cols}列]",
        "rows": rows,
        "cols": cols,
        "cellTexts": cell_text_list if cell_text_list else [],
        "xpath": tbl_xpath,
        "sectionType": "media",
        "sectionLabel": "表格区",
        "editable": True,
        "acceptsGenerated": True,
        "generated": True,
        "cleaningAction": "media_item",
        "lockedReason": "",
        "anchorPolicy": ["delete", "replace"],
        "displayText": f"[表格 {rows}行×{cols}列]"
    }
    manifest.setdefault("nodes", []).append(table_node)
    print(f"DEBUG: Added table node {new_node_id} with cellTexts={cell_text_list}", flush=True)
    print(f"DEBUG: Total nodes now: {len(manifest.get('nodes', []))}", flush=True)

    # Update manifest
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _write_document_xml(work_docx, root, manifest)
    manifest["version"] = int(time.time() * 1000)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def update_table(case_id: str, node_id: str, rows: int, cols: int, cell_text_list: list = None):
    """Update an existing table in the DOCX."""
    rows = max(1, min(int(rows), 20))
    cols = max(1, min(int(cols), 10))
    cell_text_list = list(cell_text_list or [])[: rows * cols]

    folder = CASE_DIR / case_id
    work_docx = folder / "work.docx"
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # Find the table node in manifest
    table_node = None
    for node in manifest.get("nodes", []):
        if node.get("nodeId") == node_id and node.get("role") == "table":
            table_node = node
            break

    if not table_node:
        raise KeyError(f"table node not found: {node_id}")

    # Update table node properties
    table_node["rows"] = rows
    table_node["cols"] = cols
    table_node["cellTexts"] = cell_text_list
    table_node["text"] = f"[表格 {rows}行×{cols}列]"
    table_node["displayText"] = f"[表格 {rows}行×{cols}列]"

    # Update DOCX file - find and update the table in document.xml
    root = _document_xml(work_docx)
    W = NS['w']

    targets = root.xpath(table_node.get("xpath", ""), namespaces=NS)
    if not targets or targets[0].tag != f"{{{W}}}tbl":
        raise KeyError(f"table xpath not found: {node_id}")
    tbl = targets[0]

    for tr in tbl.findall(f"{{{W}}}tr"):
        tbl.remove(tr)

    cell_idx = 0
    for _ in range(rows):
        tr = etree.SubElement(tbl, f"{{{W}}}tr")
        for _ in range(cols):
            tc = etree.SubElement(tr, f"{{{W}}}tc")
            tc_pr = etree.SubElement(tc, f"{{{W}}}tcPr")
            tc_w = etree.SubElement(tc_pr, f"{{{W}}}tcW")
            tc_w.set(f"{{{W}}}w", str(round(8500 / cols)))
            tc_w.set(f"{{{W}}}type", "dxa")
            paragraph = etree.SubElement(tc, f"{{{W}}}p")
            paragraph.set(f"{{{NS['w14']}}}paraId", _new_para_id())
            if cell_idx < len(cell_text_list) and cell_text_list[cell_idx]:
                run = etree.SubElement(paragraph, f"{{{W}}}r")
                text = etree.SubElement(run, f"{{{W}}}t")
                text.text = str(cell_text_list[cell_idx])
            cell_idx += 1

    # Update manifest
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _attach_product_manifest(manifest)
    _write_document_xml(work_docx, root, manifest)
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
        chars = float(fmt["firstLineIndentChars"])
        _set_attr(ind, "firstLineChars", int(chars * 100))
        _set_attr(ind, "firstLine", int(chars * 240))

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
            node.update(_p_meta(targets[0]))

    rule["format"] = fmt
    _sync_node_xpaths(manifest, root)
    _sort_manifest_nodes_by_document_order(manifest, root)
    _refresh_rule_targets(manifest)
    _attach_product_manifest(manifest)
    _write_document_xml(work_docx, root, manifest)
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
    # Insert preview anchors (bookmarks) into DOCX
    root = _document_xml(work_docx)
    _ensure_preview_anchors(root, manifest)
    _write_document_xml(work_docx, root, manifest)
    manifest["caseId"] = case_id
    manifest["version"] = int(time.time() * 1000)
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path).path
        if self.path == "/status":
            _send_json(self, 200, {"status": "ok"})
            return
        if parsed_path.startswith("/case/") and parsed_path.endswith("/manifest"):
            case_id = parsed_path.split("/")[2]
            path = CASE_DIR / case_id / "manifest.json"
            if not path.exists():
                _send_json(self, 404, {"error": "case not found"})
                return
            _send_json(self, 200, json.loads(path.read_text(encoding="utf-8")))
            return
        if parsed_path.startswith("/case/") and "/preview/page/" in parsed_path:
            try:
                parts = parsed_path.split("/")
                case_id = parts[2]
                page_no = int(parts[5])
                png_path = render_preview_page(case_id, page_no)
                _send_png(self, png_path)
            except Exception as exc:
                _send_json(self, 500, {"error": str(exc)})
            return
        if parsed_path.startswith("/case/") and "/media/" in parsed_path:
            try:
                parts = parsed_path.split("/")
                data, content_type = _image_resource(parts[2], parts[4])
                _send_binary(self, data, content_type)
            except Exception as exc:
                _send_json(self, 404, {"error": str(exc)})
            return
        if parsed_path.startswith("/case/") and "/file" in parsed_path:
            case_id = parsed_path.split("/")[2]
            path = CASE_DIR / case_id / "work.docx"
            if not path.exists():
                _send_json(self, 404, {"error": "file not found"})
                return
            _send_docx(self, path)
            return
        if parsed_path == "/config":
            config_path = ROOT.parent / "config" / "paper_structure.json"
            if config_path.exists():
                _send_json(self, 200, _load_paper_config())
            else:
                _send_json(self, 404, {"error": "config not found"})
            return
        _send_json(self, 404, {"error": "not found"})

    def do_POST(self):
        print(f"DEBUG do_POST: path={self.path}", flush=True)
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
            # Image insert: POST /case/{caseId}/image
            parsed_path = urlparse(self.path).path
            if parsed_path.startswith("/case/") and parsed_path.endswith("/image"):
                parts = parsed_path.split("/")
                case_id = parts[2]
                # Read multipart form data (simplified - expects raw body with X-File-Name header)
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0:
                    _send_json(self, 400, {"error": "empty image data"})
                    return
                image_data = self.rfile.read(length)
                filename = self.headers.get("X-File-Name", "image.png")
                # Parse query params for anchor, width, and mode
                params = parse_qs(urlparse(self.path).query)
                anchor_node_id = params.get("anchor", [""])[0]
                width_px = int(params.get("width", ["400"])[0])
                mode = params.get("mode", ["insertAfter"])[0]
                replace_node_id = params.get("replaceNodeId", [""])[0]
                manifest = insert_image(case_id, image_data, filename, anchor_node_id, width_px, mode, replace_node_id)
                _send_json(self, 200, manifest)
                return
            # Table insert: POST /case/{caseId}/table
            if self.path.startswith("/case/") and self.path.endswith("/table"):
                parts = self.path.split("/")
                case_id = parts[2]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                rows = data.get("rows", 3)
                cols = data.get("cols", 3)
                anchor_node_id = data.get("anchorNodeId", "")
                cell_text_list = data.get("cellTexts", [])
                mode = data.get("mode", "insertAfter")
                manifest = insert_table(case_id, rows, cols, anchor_node_id, cell_text_list, mode)
                _send_json(self, 200, manifest)
                return
            # Batch operations: POST /case/{caseId}/batch
            parsed_path = urlparse(self.path).path
            if parsed_path.startswith("/case/") and parsed_path.endswith("/batch"):
                parts = parsed_path.split("/")
                case_id = parts[2]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                operations = data.get("operations", [])
                if not operations:
                    _send_json(self, 400, {"error": "empty operations list"})
                    return
                result = batch_operations(case_id, operations)
                _send_json(self, 200, result)
                return
            # Compile DOCX: POST /case/{caseId}/compile
            if parsed_path.startswith("/case/") and parsed_path.endswith("/compile"):
                parts = parsed_path.split("/")
                case_id = parts[2]
                folder = CASE_DIR / case_id
                work_docx = folder / "work.docx"
                manifest_path = folder / "manifest.json"
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                root = _document_xml(work_docx)
                _materialize_heading_numbers(root, manifest)
                _materialize_reference_numbers(root, manifest)
                _write_document_xml(work_docx, root, manifest)
                manifest["version"] = int(time.time() * 1000)
                manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
                _send_json(self, 200, {"status": "compiled", "version": manifest["version"]})
                return
            # Config: POST /config
            if self.path == "/config":
                length = int(self.headers.get("Content-Length", "0"))
                data = _normalize_paper_config(json.loads(self.rfile.read(length) or b"{}"))
                config_path = ROOT.parent / "config" / "paper_structure.json"
                config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                _send_json(self, 200, {"status": "ok"})
                return
            # Save config and update DOCX: POST /case/{caseId}/config
            if self.path.startswith("/case/") and self.path.endswith("/config"):
                parts = self.path.split("/")
                case_id = parts[2]
                length = int(self.headers.get("Content-Length", "0"))
                data = _normalize_paper_config(json.loads(self.rfile.read(length) or b"{}"))
                # 保存配置文件
                config_path = ROOT.parent / "config" / "paper_structure.json"
                config_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
                # 更新DOCX
                manifest = apply_config_to_case(case_id, data)
                _send_json(self, 200, manifest)
                return
            # Generate config: POST /case/{caseId}/generate-config
            if self.path.startswith("/case/") and self.path.endswith("/generate-config"):
                parts = self.path.split("/")
                case_id = parts[2]
                config = generate_config_from_case(case_id)
                _send_json(self, 200, config)
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
            # Text replacement: PATCH /case/{caseId}/node/{nodeId}/content
            if self.path.startswith("/case/") and "/node/" in self.path and self.path.endswith("/content"):
                parts = self.path.split("/")
                case_id = parts[2]
                node_id = parts[4]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                manifest = replace_node_content(
                    case_id,
                    node_id,
                    data.get("text", ""),
                    data.get("formatRuleId"),
                    data.get("formatOverride"),
                    data.get("preserveFormat", True),
                )
                _send_json(self, 200, manifest)
                return
            # Node role update: PATCH /case/{caseId}/node/{nodeId}
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
            # Image replacement: PATCH /case/{caseId}/image/{nodeId}
            parsed_path = urlparse(self.path).path
            if parsed_path.startswith("/case/") and "/image/" in parsed_path:
                parts = parsed_path.split("/")
                case_id = parts[2]
                node_id = parts[4]
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0:
                    _send_json(self, 400, {"error": "empty image data"})
                    return
                image_data = self.rfile.read(length)
                filename = self.headers.get("X-File-Name", "image.png")
                params = parse_qs(urlparse(self.path).query)
                width_px = int(params.get("width", ["400"])[0])
                manifest = replace_image(case_id, node_id, image_data, filename, width_px)
                _send_json(self, 200, manifest)
                return
            # Table update: PATCH /case/{caseId}/table/{nodeId}
            if self.path.startswith("/case/") and "/table/" in self.path:
                parts = self.path.split("/")
                case_id = parts[2]
                node_id = parts[4]
                length = int(self.headers.get("Content-Length", "0"))
                data = json.loads(self.rfile.read(length) or b"{}")
                rows = data.get("rows", 3)
                cols = data.get("cols", 3)
                cell_text_list = data.get("cellTexts", [])
                manifest = update_table(case_id, node_id, rows, cols, cell_text_list)
                _send_json(self, 200, manifest)
                return
        except Exception as exc:
            _send_json(self, 500, {"error": str(exc)})
            return
        _send_json(self, 404, {"error": "not found"})

    def do_DELETE(self):
        try:
            if self.path.startswith("/case/") and "/node/" in self.path:
                parts = self.path.split("/")
                case_id = parts[2]
                node_id = parts[4]
                manifest = delete_node(case_id, node_id)
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

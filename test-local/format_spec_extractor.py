"""
格式规范提取器 v2：从清洗后的文档中提取结构化格式规范 JSON
输出面向用户可编辑的规范，而非原始元素逐个 dump
"""

import re
from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn


# ─────────────────────────────────────────────
#  单位转换
# ─────────────────────────────────────────────

def emu_to_cm(emu):
    if emu is None: return None
    return round(emu / 360000, 2)

def emu_to_pt(emu):
    if emu is None: return None
    return round(emu / 12700, 1)

def cn_size(pt_val):
    if pt_val is None: return None
    size_map = {
        42: "初号", 36: "小初", 26: "一号", 24: "小一",
        22: "二号", 18: "小二", 16: "三号", 15: "小三",
        14: "四号", 12: "小四", 10.5: "五号", 9: "小五",
        7.5: "六号", 6.5: "小六",
    }
    for pt, name in size_map.items():
        if abs(pt_val - pt) < 0.3:
            return name
    return f"{pt_val}pt"

def align_name(val):
    if val is None: return "inherit"
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    mapping = {
        WD_ALIGN_PARAGRAPH.LEFT: "left",
        WD_ALIGN_PARAGRAPH.CENTER: "center",
        WD_ALIGN_PARAGRAPH.RIGHT: "right",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "justify",
    }
    return mapping.get(val, str(val))

def align_cn(val):
    mapping = {"left": "左对齐", "center": "居中", "right": "右对齐", "justify": "两端对齐", "inherit": "继承"}
    return mapping.get(val, val)


def _line_spacing_info(pf):
    if pf.line_spacing is None:
        return None
    if pf.line_spacing_rule is not None:
        from docx.enum.text import WD_LINE_SPACING
        if pf.line_spacing_rule in (WD_LINE_SPACING.MULTIPLE,):
            return {"type": "multiple", "value": pf.line_spacing, "label": f"{pf.line_spacing}倍行距"}
    if isinstance(pf.line_spacing, (int, float)):
        pt = emu_to_pt(pf.line_spacing)
        return {"type": "fixed_pt", "value": pt, "label": f"{pt}pt固定"}
    return {"type": "unknown", "value": str(pf.line_spacing), "label": str(pf.line_spacing)}

def _line_spacing_label(info):
    if not info: return None
    return info.get("label", "")


def get_effective_style(para, doc):
    """获取段落的有效样式（包含继承链）"""
    style = para.style
    if not style:
        return {}
    result = {}
    current = style
    while current:
        if hasattr(current, 'font'):
            if 'font_name' not in result and current.font.name:
                result['font_name'] = current.font.name
            if 'size_pt' not in result and current.font.size:
                result['size_pt'] = emu_to_pt(current.font.size)
                result['size_cn'] = cn_size(result['size_pt'])
            if 'bold' not in result and current.font.bold is not None:
                result['bold'] = current.font.bold
            if 'italic' not in result and current.font.italic is not None:
                result['italic'] = current.font.italic
        if hasattr(current, 'paragraph_format'):
            pf = current.paragraph_format
            if 'alignment' not in result and pf.alignment is not None:
                result['alignment'] = align_name(pf.alignment)
            if 'line_spacing' not in result and pf.line_spacing is not None:
                result['line_spacing'] = _line_spacing_info(pf)
            if 'first_line_indent' not in result and pf.first_line_indent:
                result['first_line_indent_chars'] = round(pf.first_line_indent / 360000 / 0.375, 1)
        current = current.base_style if hasattr(current, 'base_style') else None
    result['style_name'] = para.style.name if para.style else None
    return result


# ─────────────────────────────────────────────
#  区域识别
# ─────────────────────────────────────────────

ZONE_MARKERS = [
    (r'^摘\s*要$', 'abstract_cn', '中文摘要'),
    (r'^Abstract$', 'abstract_en', '英文摘要'),
    (r'^目\s*录$', 'toc', '目录'),
    (r'^参考文献$', 'reference', '参考文献'),
    (r'^致\s*谢$', 'acknowledgement', '致谢'),
    (r'^附\s*录', 'appendix', '附录'),
]

def _is_chapter_heading(para):
    text = para.text.strip()
    if not text or len(text) > 30: return False
    for run in para.runs:
        if run.font.size:
            pt = run.font.size / 12700
            if 17 <= pt <= 19 and run.font.bold:
                from docx.enum.text import WD_ALIGN_PARAGRAPH
                if para.alignment == WD_ALIGN_PARAGRAPH.CENTER:
                    return True
    return False


def classify_zones(elements, doc):
    result = []
    current_zone = 'cover'
    current_zone_name = '封面'
    in_toc = False

    for idx, element in enumerate(elements):
        is_para = element.tag.endswith('}p')
        text = ""
        style_name = None

        if is_para:
            para = Paragraph(element, doc)
            text = para.text.strip()
            style_name = para.style.name if para.style else None

        if in_toc:
            if is_para and text and (style_name and 'Heading 1' in style_name or _is_chapter_heading(para)):
                in_toc = False
                current_zone = 'body'
                current_zone_name = f'正文'
            result.append({"index": idx, "zone": current_zone, "zone_name": current_zone_name, "element": element})
            continue

        hit = False
        for pattern, zone_type, zone_name in ZONE_MARKERS:
            if text and re.match(pattern, text):
                current_zone = zone_type
                current_zone_name = zone_name
                if zone_type == 'toc': in_toc = True
                hit = True
                break

        if not hit and is_para and text and current_zone in ('cover', 'abstract_cn', 'abstract_en'):
            if style_name and 'Heading 1' in style_name or _is_chapter_heading(para):
                current_zone = 'body'
                current_zone_name = '正文'

        result.append({"index": idx, "zone": current_zone, "zone_name": current_zone_name, "element": element})

    return result


# ─────────────────────────────────────────────
#  提取段落格式摘要
# ─────────────────────────────────────────────

def _extract_para_format(para, doc):
    """提取单个段落的核心格式信息"""
    info = {"alignment": align_name(para.alignment)}

    pf = para.paragraph_format
    if pf.line_spacing is not None:
        info["line_spacing"] = _line_spacing_info(pf)
    if pf.first_line_indent:
        info["first_line_indent_chars"] = round(pf.first_line_indent / 360000 / 0.375, 1)
    if pf.space_before is not None:
        info["space_before_pt"] = emu_to_pt(pf.space_before)
    if pf.space_after is not None:
        info["space_after_pt"] = emu_to_pt(pf.space_after)

    # runs 字体信息
    for run in para.runs:
        if not run.text.strip():
            continue
        font = run.font
        size_pt = emu_to_pt(font.size) if font.size else None
        if font.name and "font" not in info:
            info["font"] = font.name
        if size_pt and "size" not in info:
            info["size"] = cn_size(size_pt)
            info["size_pt"] = size_pt
        if font.bold is not None and "bold" not in info:
            info["bold"] = font.bold
        if font.italic is not None and "italic" not in info:
            info["italic"] = font.italic

    # 从样式继承补全
    if "size" not in info or "font" not in info:
        style_info = get_effective_style(para, doc)
        if "font" not in info and style_info.get("font_name"):
            info["font"] = style_info["font_name"]
        if "size" not in info and style_info.get("size_cn"):
            info["size"] = style_info["size_cn"]
            info["size_pt"] = style_info.get("size_pt")
        if "bold" not in info and style_info.get("bold") is not None:
            info["bold"] = style_info["bold"]
        if info.get("alignment") == "inherit" and style_info.get("alignment"):
            info["alignment"] = style_info["alignment"]
        if "line_spacing" not in info and style_info.get("line_spacing"):
            info["line_spacing"] = style_info["line_spacing"]

    return info


def _extract_cover_fields(elements, doc):
    """从封面区域提取可填写字段（从表格和段落中识别）"""
    fields = []
    for z in elements:
        elem = z["element"]
        if elem.tag.endswith('}tbl'):
            table = Table(elem, doc)
            for ri, row in enumerate(table.rows):
                cells_text = []
                for cell in row.cells:
                    cells_text.append(cell.text.strip())
                # 去重（合并单元格）
                deduped = []
                for c in cells_text:
                    if not deduped or c != deduped[-1]:
                        deduped.append(c)
                # 通常是 [label, value] 结构
                if len(deduped) >= 2 and deduped[0]:
                    label = deduped[0].rstrip('：:').strip()
                    if label and not deduped[1]:  # 有标签无值 = 可填字段
                        fields.append({"label": label, "value": "", "row": ri})
                    elif label:
                        fields.append({"label": label, "value": deduped[1], "row": ri})
        elif elem.tag.endswith('}p'):
            para = Paragraph(elem, doc)
            text = para.text.strip()
            # 检查是否是 "标签：___" 格式的段落
            match = re.match(r'^([^：:]+)[：:]\s*(.*)', text)
            if match:
                label = match.group(1).strip()
                value = match.group(2).strip()
                fields.append({"label": label, "value": value})
    return fields


# ─────────────────────────────────────────────
#  主函数
# ─────────────────────────────────────────────

def extract_format_spec(docx_path: str) -> dict:
    """
    从清洗后的文档提取结构化格式规范
    
    输出结构：
    {
        "page_setup": {...},
        "cover": {"title": {...}, "fields": [...]},
        "abstract_cn": {"title": {...}, "body": {...}},
        "body": {"heading1": {...}, "heading2": {...}, "body": {...}},
        "reference": {...},
        ...
    }
    """
    doc = Document(str(docx_path))
    body = doc.element.body

    # 1. 页面设置
    section = doc.sections[0]
    page_setup = {
        "size": f"{emu_to_cm(section.page_width)} × {emu_to_cm(section.page_height)} cm",
        "margin_top": emu_to_cm(section.top_margin),
        "margin_bottom": emu_to_cm(section.bottom_margin),
        "margin_left": emu_to_cm(section.left_margin),
        "margin_right": emu_to_cm(section.right_margin),
    }

    # 2. 区域分类
    zones = classify_zones(list(body), doc)

    # 3. 按区域分组
    zone_groups = {}
    for z in zones:
        zone_type = z["zone"]
        if zone_type not in zone_groups:
            zone_groups[zone_type] = []
        zone_groups[zone_type].append(z)

    # 4. 逐区域提取格式规则
    spec = {"page_setup": page_setup}

    # 区域显示顺序
    zone_order = ['cover', 'abstract_cn', 'abstract_en', 'toc', 'body', 'reference', 'acknowledgement', 'appendix']
    zone_cn_names = {
        'cover': '封面', 'abstract_cn': '中文摘要', 'abstract_en': '英文摘要',
        'toc': '目录', 'body': '正文', 'reference': '参考文献',
        'acknowledgement': '致谢', 'appendix': '附录',
    }

    for zone_type in zone_order:
        if zone_type not in zone_groups:
            continue
        group = zone_groups[zone_type]
        zone_spec = {"zone_name": zone_cn_names.get(zone_type, zone_type)}

        if zone_type == 'cover':
            # 封面：提取标题样式和可填字段
            title_fmt = None
            cover_elements = []
            for z in group:
                elem = z["element"]
                if elem.tag.endswith('}p'):
                    para = Paragraph(elem, doc)
                    text = para.text.strip()
                    if not text:
                        continue
                    pf = _extract_para_format(para, doc)
                    # 判断是否是标题行（大字号居中、无冒号分隔符）
                    if not title_fmt and pf.get("size_pt", 0) >= 14 and pf.get("alignment") == "center":
                        title_fmt = {
                            "font": pf.get("font", ""),
                            "size": pf.get("size", ""),
                            "bold": pf.get("bold", False),
                            "align": align_cn(pf.get("alignment")),
                        }
                    elif ":" in text or "：" in text:
                        # 封面字段行
                        pf_short = {
                            "font": pf.get("font", ""),
                            "size": pf.get("size", ""),
                        }
                        if not zone_spec.get("field_format"):
                            zone_spec["field_format"] = pf_short

            if title_fmt:
                zone_spec["title"] = title_fmt
            zone_spec["fields"] = _extract_cover_fields(group, doc)

        elif zone_type in ('abstract_cn', 'abstract_en', 'acknowledgement', 'appendix'):
            # 有标题+正文的区域
            title_fmt = None
            body_fmt = None
            for z in group:
                elem = z["element"]
                if not elem.tag.endswith('}p'):
                    continue
                para = Paragraph(elem, doc)
                text = para.text.strip()
                if not text:
                    continue
                pf = _extract_para_format(para, doc)

                if not title_fmt and pf.get("alignment") == "center":
                    title_fmt = {
                        "font": pf.get("font", ""),
                        "size": pf.get("size", ""),
                        "bold": pf.get("bold", False),
                        "align": "居中",
                    }
                elif not body_fmt and pf.get("alignment") != "center":
                    body_fmt = {
                        "font": pf.get("font", ""),
                        "size": pf.get("size", ""),
                    }
                    ls = pf.get("line_spacing")
                    if ls:
                        body_fmt["line_spacing"] = _line_spacing_label(ls)
                    indent = pf.get("first_line_indent_chars")
                    if indent:
                        body_fmt["first_indent"] = f"{indent}字符"
            if title_fmt:
                zone_spec["title"] = title_fmt
            if body_fmt:
                zone_spec["body"] = body_fmt

        elif zone_type == 'toc':
            # 目录
            title_fmt = None
            for z in group:
                elem = z["element"]
                if not elem.tag.endswith('}p'):
                    continue
                para = Paragraph(elem, doc)
                text = para.text.strip()
                if not text:
                    continue
                pf = _extract_para_format(para, doc)
                if not title_fmt and pf.get("alignment") == "center":
                    title_fmt = {
                        "font": pf.get("font", ""),
                        "size": pf.get("size", ""),
                        "bold": pf.get("bold", False),
                        "align": "居中",
                    }
            if title_fmt:
                zone_spec["title"] = title_fmt

        elif zone_type == 'body':
            # 正文区域：提取 heading1/2/3 和正文样式
            heading_sizes = []  # 收集不同级别的标题格式
            body_fmt = None
            body_paragraphs = []

            for z in group:
                elem = z["element"]
                if not elem.tag.endswith('}p'):
                    continue
                para = Paragraph(elem, doc)
                text = para.text.strip()
                if not text:
                    continue
                pf = _extract_para_format(para, doc)
                style_name = para.style.name if para.style else ""

                # 判断是标题还是正文
                is_heading = False
                if 'Heading' in style_name or _is_chapter_heading(para):
                    is_heading = True
                elif pf.get("alignment") == "center" and pf.get("bold") and len(text) < 30:
                    is_heading = True
                elif pf.get("size_pt", 0) >= 14 and pf.get("bold"):
                    is_heading = True

                if is_heading:
                    heading_sizes.append(pf)
                else:
                    body_paragraphs.append(pf)

            # 去重得到 heading 层级
            seen = set()
            heading_levels = []
            for h in heading_sizes:
                key = (h.get("size", ""), h.get("bold", False))
                if key not in seen:
                    seen.add(key)
                    heading_levels.append(h)

            for i, h in enumerate(heading_levels[:3]):
                level_key = f"heading{i+1}"
                zone_spec[level_key] = {
                    "font": h.get("font", ""),
                    "size": h.get("size", ""),
                    "bold": h.get("bold", False),
                    "align": align_cn(h.get("alignment", "left")),
                }
                ls = h.get("line_spacing")
                if ls:
                    zone_spec[level_key]["line_spacing"] = _line_spacing_label(ls)

            # 正文样式（取出现最多的）
            if body_paragraphs:
                bp = body_paragraphs[0]
                body_style = {
                    "font": bp.get("font", ""),
                    "size": bp.get("size", ""),
                    "align": align_cn(bp.get("alignment", "justify")),
                }
                ls = bp.get("line_spacing")
                if ls:
                    body_style["line_spacing"] = _line_spacing_label(ls)
                indent = bp.get("first_line_indent_chars")
                if indent:
                    body_style["first_indent"] = f"{indent}字符"
                zone_spec["body"] = body_style

        elif zone_type == 'reference':
            # 参考文献
            title_fmt = None
            body_fmt = None
            for z in group:
                elem = z["element"]
                if not elem.tag.endswith('}p'):
                    continue
                para = Paragraph(elem, doc)
                text = para.text.strip()
                if not text:
                    continue
                pf = _extract_para_format(para, doc)
                if not title_fmt and pf.get("alignment") == "center" and text == "参考文献":
                    title_fmt = {
                        "font": pf.get("font", ""),
                        "size": pf.get("size", ""),
                        "bold": pf.get("bold", False),
                        "align": "居中",
                    }
                elif not body_fmt:
                    body_fmt = {
                        "font": pf.get("font", ""),
                        "size": pf.get("size", ""),
                    }
                    ls = pf.get("line_spacing")
                    if ls:
                        body_fmt["line_spacing"] = _line_spacing_label(ls)
            if title_fmt:
                zone_spec["title"] = title_fmt
            if body_fmt:
                zone_spec["body"] = body_fmt
            zone_spec["style"] = "GB/T 7714"

        spec[zone_type] = zone_spec

    return spec


if __name__ == "__main__":
    import sys
    import json

    path = sys.argv[1] if len(sys.argv) > 1 else "论文模板说明_converted_cleaned.docx"
    output = sys.argv[2] if len(sys.argv) > 2 else "_format_spec_v2.json"

    print(f"提取格式规范: {path}")
    spec = extract_format_spec(path)

    with open(output, 'w', encoding='utf-8') as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)

    print(f"已保存: {output}")
    print(f"包含区域: {[k for k in spec.keys() if k != 'page_setup']}")
    for zone_key in ['cover', 'abstract_cn', 'body', 'reference']:
        if zone_key in spec:
            print(f"\n{zone_key}:")
            print(json.dumps(spec[zone_key], ensure_ascii=False, indent=2)[:500])

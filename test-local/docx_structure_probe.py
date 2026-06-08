"""
模板解析原型：程序层直接提取 docx 结构
验证不依赖AI也能精确拿到格式信息
"""

from pathlib import Path
from docx import Document
from docx.shared import Pt, Emu
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.enum.text import WD_ALIGN_PARAGRAPH


def emu_to_cm(emu):
    """EMU转厘米"""
    if emu is None:
        return None
    return round(emu / 360000, 2)


def emu_to_pt(emu):
    """EMU转磅"""
    if emu is None:
        return None
    return round(emu / 12700, 1)


def align_name(val):
    """对齐方式转中文名"""
    if val is None:
        return "继承样式"
    mapping = {
        WD_ALIGN_PARAGRAPH.LEFT: "左对齐",
        WD_ALIGN_PARAGRAPH.CENTER: "居中",
        WD_ALIGN_PARAGRAPH.RIGHT: "右对齐",
        WD_ALIGN_PARAGRAPH.JUSTIFY: "两端对齐",
    }
    return mapping.get(val, f"未知({val})")


def cn_size(pt_val):
    """磅值转中文字号名"""
    if pt_val is None:
        return None
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


def extract_structure(docx_path: str) -> dict:
    """
    程序层：精确提取文档结构和格式
    返回结构化的格式数据，不需要AI参与
    """
    doc = Document(str(docx_path))
    
    result = {
        "sections": [],        # 分节信息
        "styles": {},          # 样式定义
        "elements": [],        # 所有 body 元素（段落/表格），带精确格式
        "page_setup": {},      # 页面设置
    }
    
    # 0. 提取样式定义
    for style in doc.styles:
        if hasattr(style, 'font') and hasattr(style, 'paragraph_format'):
            font = style.font
            size_pt = emu_to_pt(font.size) if font.size else None
            result["styles"][style.name] = {
                "font_name": font.name,
                "size_pt": size_pt,
                "size_cn": cn_size(size_pt),
                "bold": font.bold,
                "alignment": align_name(getattr(style, 'base_alignment', None)),
            }
    
    # 1. 页面设置（从第一个 section 提取）
    for section in doc.sections:
        result["page_setup"] = {
            "paper_width_cm": emu_to_cm(section.page_width),
            "paper_height_cm": emu_to_cm(section.page_height),
            "margin_top_cm": emu_to_cm(section.top_margin),
            "margin_bottom_cm": emu_to_cm(section.bottom_margin),
            "margin_left_cm": emu_to_cm(section.left_margin),
            "margin_right_cm": emu_to_cm(section.right_margin),
            "header_distance_cm": emu_to_cm(section.header_distance),
            "footer_distance_cm": emu_to_cm(section.footer_distance),
        }
        break  # 先只取第一个 section
    
    # 2. 遍历 body 的每个元素
    element_index = 0
    for element in doc.element.body:
        if element.tag.endswith('}p'):
            para = Paragraph(element, doc)
            info = _extract_paragraph_format(para, element_index, doc)
            result["elements"].append(info)
            element_index += 1
            
        elif element.tag.endswith('}tbl'):
            table = Table(element, doc)
            info = _extract_table_format(table, element_index)
            result["elements"].append(info)
            element_index += 1
    
    return result


def _extract_paragraph_format(para, index, doc=None):
    """精确提取单个段落的所有格式"""
    pf = para.paragraph_format
    
    # 基础信息
    info = {
        "type": "paragraph",
        "index": index,
        "text": para.text[:120] if para.text else "",
        "style_name": para.style.name if para.style else None,
        "alignment": align_name(para.alignment),
    }
    
    # 段落格式
    info["paragraph_format"] = {
        "line_spacing": _line_spacing_info(pf),
        "first_line_indent_chars": _indent_chars(pf.first_line_indent),
        "first_line_indent_cm": emu_to_cm(pf.first_line_indent) if pf.first_line_indent else None,
        "space_before_pt": emu_to_pt(pf.space_before) if pf.space_before else None,
        "space_after_pt": emu_to_pt(pf.space_after) if pf.space_after else None,
        "keep_with_next": pf.keep_with_next,
        "page_break_before": pf.page_break_before,
    }
    
    # runs 的字体信息
    runs_info = []
    for run in para.runs:
        if not run.text.strip():
            continue
        font = run.font
        size_pt = emu_to_pt(font.size) if font.size else None
        runs_info.append({
            "text": run.text[:60],
            "font_name": font.name,
            "font_name_east_asia": font.name_east_asia if hasattr(font, 'name_east_asia') else None,
            "size_pt": size_pt,
            "size_cn": cn_size(size_pt),
            "bold": font.bold,
            "italic": font.italic,
            "underline": font.underline,
            "color": str(font.color.rgb) if font.color and font.color.rgb else None,
        })
    
    info["runs"] = runs_info
    
    # 推断段落的"代表格式"（取第一个 run 的格式，并回溯样式）
    if runs_info:
        first = runs_info[0]
        info["primary_font"] = first["font_name"]
        info["primary_size_cn"] = first["size_cn"]
        info["primary_bold"] = first["bold"]
    
    # 如果 run 没有直接设置格式，从样式继承
    if not info.get("primary_size_cn") and para.style:
        style_info = _get_effective_style(para, doc) if doc else None
        if style_info:
            info["inherited_style"] = style_info
            if not info.get("primary_font"):
                info["primary_font"] = style_info.get("font_name")
            if not info.get("primary_size_cn"):
                info["primary_size_cn"] = style_info.get("size_cn")
            if info.get("primary_bold") is None:
                info["primary_bold"] = style_info.get("bold")
            if info.get("alignment") == "继承样式":
                info["alignment"] = style_info.get("alignment", "继承样式")
    
    return info


def _get_effective_style(para, doc):
    """获取段落的有效样式（包含继承链）"""
    style = para.style
    if not style:
        return None
    
    result = {
        "style_name": style.name,
        "font_name": None,
        "size_cn": None,
        "bold": None,
        "alignment": None,
    }
    
    # 沿样式继承链查找
    current = style
    while current:
        if hasattr(current, 'font'):
            if not result["font_name"] and current.font.name:
                result["font_name"] = current.font.name
            if not result["size_cn"] and current.font.size:
                pt = emu_to_pt(current.font.size)
                result["size_cn"] = cn_size(pt)
            if result["bold"] is None and current.font.bold is not None:
                result["bold"] = current.font.bold
        if hasattr(current, 'paragraph_format'):
            if not result["alignment"] and current.paragraph_format.alignment is not None:
                result["alignment"] = align_name(current.paragraph_format.alignment)
        current = current.base_style if hasattr(current, 'base_style') else None
    
    return result


def _extract_table_format(table, index):
    """精确提取表格格式"""
    rows_data = []
    for row_idx, row in enumerate(table.rows):
        cells = []
        for cell in row.cells:
            cells.append({
                "text": cell.text.strip()[:80],
                "paragraph_count": len(cell.paragraphs),
            })
        # 去重合并单元格
        deduped = []
        for cell in cells:
            if not deduped or cell["text"] != deduped[-1]["text"]:
                deduped.append(cell)
        rows_data.append({
            "row_index": row_idx,
            "cells": deduped,
        })
    
    return {
        "type": "table",
        "index": index,
        "row_count": len(table.rows),
        "col_count": len(table.columns) if table.rows else 0,
        "rows": rows_data,
        "summary": _table_summary(rows_data),
    }


def _table_summary(rows_data):
    """表格摘要"""
    all_text = []
    for row in rows_data:
        for cell in row["cells"]:
            if cell["text"]:
                all_text.append(cell["text"][:40])
    return " | ".join(all_text[:10])


def _line_spacing_info(pf):
    """行距信息"""
    if pf.line_spacing is None:
        return {"type": "inherit", "value": None}
    if pf.line_spacing_rule is not None:
        # 倍数行距
        try:
            from docx.enum.text import WD_LINE_SPACING
            if pf.line_spacing_rule in (WD_LINE_SPACING.MULTIPLE, WD_LINE_SPACING.PROPORTIONAL):
                return {"type": "multiple", "value": pf.line_spacing}
        except Exception:
            pass
    # 固定值行距
    if isinstance(pf.line_spacing, (int, float)):
        return {"type": "fixed_pt", "value": emu_to_pt(pf.line_spacing)}
    return {"type": "unknown", "value": pf.line_spacing}


def _indent_chars(emu):
    """缩进转字符数（粗略估算，2字符≈0.75cm）"""
    if emu is None:
        return None
    cm = emu / 360000
    return round(cm / 0.375, 1)


# ─────────────────────────────────────────────
#  测试入口
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import json
    import sys
    
    path = sys.argv[1] if len(sys.argv) > 1 else "论文模板说明.doc"
    docx_path = Path(path)
    
    if docx_path.suffix.lower() == '.doc':
        print("检测到 .doc，先转换...")
        from ai_template_parser_v2 import convert_doc_to_docx
        converted = convert_doc_to_docx(str(docx_path))
        if converted:
            docx_path = Path(converted)
        else:
            print("转换失败")
            sys.exit(1)
    
    print(f"解析文档: {docx_path}")
    print("=" * 60)
    
    result = extract_structure(str(docx_path))
    
    # 页面设置
    ps = result["page_setup"]
    print(f"\n页面设置:")
    print(f"  纸张: {ps.get('paper_width_cm')}cm x {ps.get('paper_height_cm')}cm")
    print(f"  页边距: 上{ps.get('margin_top_cm')} 下{ps.get('margin_bottom_cm')} 左{ps.get('margin_left_cm')} 右{ps.get('margin_right_cm')} cm")
    
    # 统计
    paras = [e for e in result["elements"] if e["type"] == "paragraph"]
    tables = [e for e in result["elements"] if e["type"] == "table"]
    print(f"\n元素统计: {len(paras)} 段落, {len(tables)} 表格")
    
    # 打印每个元素的摘要
    print(f"\n{'='*60}")
    print(f"{'索引':>4} | {'类型':6} | {'字号':6} | {'对齐':6} | 文本摘要")
    print(f"{'-'*60}")
    for e in result["elements"]:
        idx = e["index"]
        typ = e["type"]
        text = (e.get("text") or "")[:50]
        
        if typ == "paragraph":
            size = e.get("primary_size_cn") or "?"
            bold = "+" if e.get("primary_bold") else " "
            align = (e.get("alignment") or "?")[:6]
            print(f"{idx:>4} | {'段落':6} | {size:>5}{bold} | {align:<6} | {text}")
        elif typ == "table":
            summary = e.get("summary", "")[:50]
            print(f"{idx:>4} | {'表格':6} | {'':>6} | {'':>6} | [{e['row_count']}行] {summary}")
    
    # 保存完整 JSON
    output_path = docx_path.parent / "_debug_structure.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n完整结构已保存: {output_path}")

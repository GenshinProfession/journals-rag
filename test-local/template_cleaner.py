"""模板清洗器：将上传的模板清洗为可直接编辑的干净文档

核心策略（v3 - 更彻底的清洗）：
- 封面/摘要/目录 → 保留结构，只删文本框
- 正文区 → 完全清空（AI 会重新生成）
- 参考文献/致谢/附录 → 只保留标题，删除内容
"""

import re
from pathlib import Path
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.oxml.ns import qn


# ─────────────────────────────────────────────
#  图片检测（保留，用于报告）
# ─────────────────────────────────────────────

IMAGE_TAGS = {
    qn('w:pict'),
    qn('w:drawing'),
    qn('wp:inline'),
    qn('wp:anchor'),
}
MC_ALTERNATE_CONTENT = '{http://schemas.openxmlformats.org/markup-compatibility/2006}AlternateContent'


def _has_image(element) -> bool:
    for tag in IMAGE_TAGS:
        if element.findall('.//' + tag):
            return True
    if element.findall('.//' + MC_ALTERNATE_CONTENT):
        return True
    return False


# ─────────────────────────────────────────────
#  区域识别：模板页 vs 正文区
# ─────────────────────────────────────────────

# 区域清洗策略
# - keep_all: 完全保留（只删文本框）
# - title_only: 只保留标题，删除内容
# - clear_all: 完全清空
ZONE_CLEAN_STRATEGY = {
    'cover':           'keep_all',      # 封面：保留结构
    'abstract_cn':     'keep_all',      # 中文摘要：保留结构
    'abstract_en':     'keep_all',      # 英文摘要：保留结构
    'toc':             'keep_all',      # 目录：保留结构
    'body':            'clear_all',     # 正文：完全清空
    'reference':       'title_only',    # 参考文献：只留标题
    'acknowledgement': 'title_only',    # 致谢：只留标题
    'appendix':        'title_only',    # 附录：只留标题
}

# 用于识别区域边界的关键词（按文档顺序）
ZONE_MARKERS = [
    # (关键词/正则, 区域类型, 区域名称)
    (r'^摘\s*要$', 'abstract_cn', '中文摘要'),
    (r'^Abstract$', 'abstract_en', '英文摘要'),
    (r'^目\s*录$', 'toc', '目录'),
    (r'^参考文献$', 'reference', '参考文献'),
    (r'^致\s*谢$', 'acknowledgement', '致谢'),
    (r'^附\s*录', 'appendix', '附录'),
]


def _classify_zones(elements: list, doc) -> list:
    """
    对每个 body 元素进行区域分类
    
    返回：每个元素的区域信息列表
    """
    result = []
    current_zone = 'cover'
    current_zone_name = '封面'
    in_toc = False  # 是否正在目录区域内
    
    for idx, element in enumerate(elements):
        is_para = element.tag.endswith('}p')
        is_table = element.tag.endswith('}tbl')
        
        text = ""
        style_name = None
        
        if is_para:
            para = Paragraph(element, doc)
            text = para.text.strip()
            style_name = para.style.name if para.style else None
        
        # 目录区域特殊处理：目录内的条目不触发其他区域标记
        if in_toc:
            # 目录结束条件：遇到 Heading 1 或 小二加粗居中的大标题（非目录条目）
            if is_para and text and (style_name and 'Heading 1' in style_name or _is_chapter_heading(para)):
                in_toc = False
                current_zone = 'body'
                current_zone_name = f'正文·{text[:10]}'
                # 注意：这里不 continue，继续走正常流程以正确设置 is_template
            else:
                # 继续保持目录区域
                result.append({
                    "element": element,
                    "index": idx,
                    "zone_type": current_zone,
                    "zone_name": current_zone_name,
                    "is_template": True,
                    "is_zone_title": False,
                    "text": text[:60] if text else "",
                })
                continue
        
        # 检查是否命中区域标记
        hit_marker = False
        is_zone_title = False
        for pattern, zone_type, zone_name in ZONE_MARKERS:
            if text and re.match(pattern, text):
                current_zone = zone_type
                current_zone_name = zone_name
                if zone_type == 'toc':
                    in_toc = True
                hit_marker = True
                break
        
        # 标记区域标题元素（用于 title_only 策略保留标题）
        is_zone_title = hit_marker and current_zone in ('reference', 'acknowledgement', 'appendix')
        
        # 识别正文开始：Heading 1 或 小二加粗居中的标题
        if not hit_marker and is_para and text and current_zone in ('cover', 'abstract_cn', 'abstract_en'):
            if style_name and 'Heading 1' in style_name:
                current_zone = 'body'
                current_zone_name = f'正文·{text[:10]}'
            elif _is_chapter_heading(para):
                current_zone = 'body'
                current_zone_name = f'正文·{text[:10]}'
        
        # 正文区内检测子标题切换 zone_name
        if current_zone == 'body' and is_para and text:
            if style_name and 'Heading 1' in style_name:
                current_zone_name = f'正文·{text[:10]}'
            elif _is_chapter_heading(para):
                current_zone_name = f'正文·{text[:10]}'
        
        is_template = current_zone in ZONE_CLEAN_STRATEGY and ZONE_CLEAN_STRATEGY[current_zone] == 'keep_all'
        
        result.append({
            "element": element,
            "index": idx,
            "zone_type": current_zone,
            "zone_name": current_zone_name,
            "is_template": is_template,
            "is_zone_title": is_zone_title,
            "text": text[:60] if text else "",
        })
    
    return result


def _is_chapter_heading(para) -> bool:
    """判断是否一级标题（小二加粗居中）"""
    text = para.text.strip()
    if not text or len(text) > 30:
        return False
    
    # 检查字号和对齐
    for run in para.runs:
        if run.font.size:
            pt = run.font.size / 12700
            if 17 <= pt <= 19 and run.font.bold:
                # 小二 ≈ 18pt
                if para.alignment is not None:
                    from docx.enum.text import WD_ALIGN_PARAGRAPH
                    if para.alignment in (WD_ALIGN_PARAGRAPH.CENTER,):
                        return True
    
    return False


# ─────────────────────────────────────────────
#  清洗逻辑
# ─────────────────────────────────────────────

def clean_template(input_path: str, output_path: str = None) -> dict:
    """
    清洗模板文档
    
    策略：
    - 模板页（封面、摘要、目录、参考文献、致谢、附录）→ 完全不动
    - 正文区 → 可清洗（删除连续空段落等）
    
    返回：清洗报告（含区域分析）
    """
    input_path = Path(input_path)
    
    # 1. .doc 转换
    docx_path = input_path
    if input_path.suffix.lower() == '.doc':
        from ai_template_parser_v2 import convert_doc_to_docx
        converted = convert_doc_to_docx(str(input_path))
        if not converted:
            return {"error": "无法转换 .doc 文件"}
        docx_path = Path(converted)
    
    # 2. 打开文档
    doc = Document(str(docx_path))
    body = doc.element.body
    
    # 3. 区域分类
    zones = _classify_zones(list(body), doc)
    
    # 4. 统计
    zone_stats = {}
    for z in zones:
        zt = z["zone_type"]
        if zt not in zone_stats:
            zone_stats[zt] = {"name": z["zone_name"], "count": 0, "template": z["is_template"]}
        zone_stats[zt]["count"] += 1
    
    template_count = sum(1 for z in zones if z["is_template"])
    body_count = sum(1 for z in zones if not z["is_template"])
    
    report = {
        "original_file": str(input_path),
        "zone_stats": zone_stats,
        "template_elements": template_count,
        "body_elements": body_count,
        "total_elements": len(zones),
        "removed": {"textboxes": 0, "body_cleared": 0, "content_cleared": 0},
        "zones": [],  # 区域边界摘要
    }
    
    # 生成区域边界摘要
    prev_zone = None
    for z in zones:
        if z["zone_type"] != prev_zone:
            report["zones"].append({
                "index": z["index"],
                "zone_type": z["zone_type"],
                "zone_name": z["zone_name"],
                "is_template": z["is_template"],
                "first_text": z["text"],
            })
            prev_zone = z["zone_type"]
    
    # 5. 清洗逻辑（v3 - 按区域策略清洗）
    removed_empty = 0
    removed_runs = 0
    removed_textboxes = 0
    removed_body = 0
    removed_content = 0
    elements_to_remove = []
    
    for z in zones:
        element = z["element"]
        zone_type = z["zone_type"]
        strategy = ZONE_CLEAN_STRATEGY.get(zone_type, 'keep_all')
        is_title_element = z.get("is_zone_title", False)
        
        if element.tag.endswith('}p'):
            para = Paragraph(element, doc)
            
            # 全区域：删除排版说明文本框（w:txbxContent）
            runs_to_remove = []
            for run in para.runs:
                run_elem = run._element
                if run_elem.findall('.//' + qn('w:txbxContent')):
                    runs_to_remove.append(run_elem)
                    removed_textboxes += 1
            for run_elem in runs_to_remove:
                run_elem.getparent().remove(run_elem)
            
            # 按策略处理
            if strategy == 'clear_all':
                # 正文区：完全清空所有元素
                elements_to_remove.append(element)
                removed_body += 1
            elif strategy == 'title_only':
                # 参考文献/致谢/附录：保留标题，删除其他
                if not is_title_element:
                    elements_to_remove.append(element)
                    removed_content += 1
            # else: keep_all → 不删除段落
        
        elif element.tag.endswith('}tbl'):
            if strategy == 'clear_all':
                elements_to_remove.append(element)
                removed_body += 1
            elif strategy == 'title_only':
                # 表格也删（标题是段落，不是表格）
                elements_to_remove.append(element)
                removed_content += 1
    
    # 执行删除
    for element in elements_to_remove:
        body.remove(element)
    
    report["removed"]["textboxes"] = removed_textboxes
    report["removed"]["body_cleared"] = removed_body
    report["removed"]["content_cleared"] = removed_content
    
    # 6. 统计清洗后
    report["after"] = {
        "total_elements": len(body),
        "paragraphs": sum(1 for e in body if e.tag.endswith('}p')),
        "tables": sum(1 for e in body if e.tag.endswith('}tbl')),
    }
    
    # 7. 保存
    if output_path is None:
        output_path = str(docx_path.parent / f"{docx_path.stem}_cleaned{docx_path.suffix}")
    
    doc.save(output_path)
    report["output_file"] = output_path
    
    return report


def print_report(report):
    """打印清洗报告"""
    if "error" in report:
        print(f"错误: {report['error']}")
        return
    
    print("=" * 60)
    print("模板清洗报告")
    print("=" * 60)
    print(f"原始文件: {report['original_file']}")
    print()
    
    print(f"区域分析 (模板页={report['template_elements']}元素, 正文={report['body_elements']}元素):")
    for zt, info in report["zone_stats"].items():
        tag = "模板" if info["template"] else "正文"
        print(f"  [{tag}] {zt}: {info['count']}元素 ({info['name']})")
    print()
    
    print("区域边界:")
    for z in report["zones"]:
        tag = "模板" if z["is_template"] else "正文"
        text = z["first_text"][:30] if z["first_text"] else "(空)"
        print(f"  #{z['index']:>3} [{tag}] {z['zone_name']:<10} | {text}")
    print()
    
    r = report["removed"]
    print(f"清洗动作:")
    print(f"  删除排版说明文本框: {r.get('textboxes', 0)}")
    print(f"  正文区完全清空: {r.get('body_cleared', 0)} 元素")
    print(f"  内容区只保留标题: {r.get('content_cleared', 0)} 元素")
    print()
    
    a = report["after"]
    print(f"清洗后: 总元素 {a['total_elements']} (段落 {a['paragraphs']}, 表格 {a['tables']})")
    print(f"输出文件: {report['output_file']}")


if __name__ == "__main__":
    import sys
    
    path = sys.argv[1] if len(sys.argv) > 1 else "论文模板说明.doc"
    output = sys.argv[2] if len(sys.argv) > 2 else None
    
    print(f"开始清洗模板: {path}")
    report = clean_template(path, output)
    print_report(report)

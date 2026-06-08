"""
论文 DOCX 生成器 v2
根据AI生成的论文内容和格式规范，生成格式化的Word文档
改进：完整封面、分页、参考文献超链接
"""

import json
from io import BytesIO
from pathlib import Path
from typing import Optional

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

# 中文字号 -> 磅值映射
FONT_SIZE_MAP = {
    "初号": 42, "小初号": 36, "一号": 26, "小一号": 24,
    "二号": 22, "小二号": 18, "三号": 16, "小三号": 15,
    "四号": 14, "小四号": 12, "五号": 10.5, "小五号": 9,
    "六号": 7.5, "小六号": 6.5, "七号": 5.5, "八号": 5,
}


def _get(spec: dict, path: str, default=None):
    """安全获取嵌套字典值"""
    keys = path.split('.')
    cur = spec
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def _size_pt(size_str: str) -> float:
    """字号字符串转磅值"""
    if not size_str:
        return 12
    if size_str in FONT_SIZE_MAP:
        return FONT_SIZE_MAP[size_str]
    try:
        return float(size_str)
    except:
        return 12


def _set_run_font(run, family: str, size_pt: float, bold: bool = False, italic: bool = False):
    """设置run的字体"""
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.name = family
    # 设置中文字体
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:ascii"), family)
    rfonts.set(qn("w:hAnsi"), family)
    rfonts.set(qn("w:eastAsia"), family)


def _add_page_number(paragraph):
    """添加页码域"""
    run = paragraph.add_run()
    fld_char_begin = OxmlElement("w:fldChar")
    fld_char_begin.set(qn("w:fldCharType"), "begin")
    run._element.append(fld_char_begin)

    run2 = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    run2._element.append(instr)

    run3 = paragraph.add_run()
    fld_char_end = OxmlElement("w:fldChar")
    fld_char_end.set(qn("w:fldCharType"), "end")
    run3._element.append(fld_char_end)


def _add_paragraph(doc, text: str, font_name: str, size_pt: float, 
                   bold: bool = False, align: str = 'left', 
                   line_spacing: float = 1.5, first_indent_pt: float = 0,
                   spacing_before_pt: float = 0, spacing_after_pt: float = 0):
    """添加一个格式化的段落"""
    para = doc.add_paragraph()
    
    # 对齐
    align_map = {
        '左对齐': WD_ALIGN_PARAGRAPH.LEFT,
        '居中': WD_ALIGN_PARAGRAPH.CENTER,
        '右对齐': WD_ALIGN_PARAGRAPH.RIGHT,
        '两端对齐': WD_ALIGN_PARAGRAPH.JUSTIFY,
        'justified': WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    if align in align_map:
        para.alignment = align_map[align]
    
    # 行距
    para.paragraph_format.line_spacing = line_spacing
    
    # 首行缩进
    if first_indent_pt > 0:
        para.paragraph_format.first_line_indent = Pt(first_indent_pt)
    
    # 段前段后
    if spacing_before_pt > 0:
        para.paragraph_format.space_before = Pt(spacing_before_pt)
    if spacing_after_pt > 0:
        para.paragraph_format.space_after = Pt(spacing_after_pt)
    
    # 添加文本
    run = para.add_run(text)
    _set_run_font(run, font_name, size_pt, bold)
    
    return para


def _add_empty_lines(doc, count: int = 1):
    """添加空行"""
    for _ in range(count):
        doc.add_paragraph()


def _add_hyperlink(paragraph, text: str, bookmark_name: str):
    """添加超链接到书签"""
    # 创建超链接
    part = paragraph.part
    r_id = part.relate_to(f'#{bookmark_name}', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('r:id'), r_id)
    
    run = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    rstyle = OxmlElement('w:rStyle')
    rstyle.set(qn('w:val'), 'Hyperlink')
    rpr.append(rstyle)
    run.append(rpr)
    
    t = OxmlElement('w:t')
    t.text = text
    run.append(t)
    hyperlink.append(run)
    paragraph._element.append(hyperlink)


def _add_bookmark(paragraph, bookmark_name: str):
    """添加书签"""
    run = paragraph.runs[0] if paragraph.runs else paragraph.add_run()
    
    bookmark_start = OxmlElement('w:bookmarkStart')
    bookmark_start.set(qn('w:id'), '0')
    bookmark_start.set(qn('w:name'), bookmark_name)
    run._element.insert(0, bookmark_start)
    
    bookmark_end = OxmlElement('w:bookmarkEnd')
    bookmark_end.set(qn('w:id'), '0')
    bookmark_end.set(qn('w:name'), bookmark_name)
    run._element.append(bookmark_end)


def _setup_styles(doc):
    """设置文档样式"""
    styles = doc.styles
    
    # 添加超链接样式
    if 'Hyperlink' not in styles:
        style = styles.add_style('Hyperlink', 1)  # 1 = character style
        style.font.color.rgb = None  # 默认蓝色


def generate_thesis_docx(thesis: dict, spec: dict, cover_info: dict = None) -> Optional[bytes]:
    """
    根据论文内容和格式规范生成DOCX文件
    
    Args:
        thesis: 论文内容
        spec: 格式规范
        cover_info: 封面信息（学号、姓名等）
    """
    try:
        doc = Document()
        _setup_styles(doc)
        
        # ---- 页面设置 ----
        section = doc.sections[0]
        
        page_size = _get(spec, 'page.size', 'A4')
        if page_size == 'A4':
            section.page_width = Cm(21)
            section.page_height = Cm(29.7)
        
        section.top_margin = Cm(_get(spec, 'margin.top', 2.54))
        section.bottom_margin = Cm(_get(spec, 'margin.bottom', 2.54))
        section.left_margin = Cm(_get(spec, 'margin.left', 3.17))
        section.right_margin = Cm(_get(spec, 'margin.right', 3.17))
        
        # ---- 页眉页脚 ----
        header = section.header
        header.is_linked_to_previous = False
        hp = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
        hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        hr = hp.add_run(_get(spec, 'header.content', ''))
        _set_run_font(hr, _get(spec, 'header.font', '宋体'), _size_pt(_get(spec, 'header.size', '小五号')))
        
        footer = section.footer
        footer.is_linked_to_previous = False
        fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _add_page_number(fp)
        
        # ============================================================
        # 封面
        # ============================================================
        # 学校名称
        _add_paragraph(doc, _get(spec, '_metadata.school_name', 'XX大学'),
                       '华文行楷', 28, bold=True, align='居中', spacing_after_pt=30)
        
        # 学位论文类型
        degree = _get(spec, '_metadata.degree_level', 'bachelor')
        degree_str = {'bachelor': '本科毕业论文', 'master': '硕士学位论文', 'doctor': '博士学位论文'}.get(degree, '本科毕业论文')
        _add_paragraph(doc, degree_str, '华文行楷', 36, bold=True, align='居中', spacing_after_pt=60)
        
        # 中文标题
        _add_paragraph(doc, thesis.get('title', ''), 
                       _get(spec, 'cover.title_cn.font', '宋体'),
                       _size_pt(_get(spec, 'cover.title_cn.size', '小二号')),
                       bold=_get(spec, 'cover.title_cn.bold', False),
                       align=_get(spec, 'cover.title_cn.align', '居中'),
                       spacing_after_pt=40)
        
        # 英文标题
        _add_paragraph(doc, thesis.get('title_en', ''),
                       _get(spec, 'cover.title_en.font', 'Times New Roman'),
                       _size_pt(_get(spec, 'cover.title_en.size', '二号')),
                       bold=_get(spec, 'cover.title_en.bold', False),
                       align=_get(spec, 'cover.title_en.align', '居中'),
                       spacing_after_pt=60)
        
        # 封面信息（如果有）
        if cover_info:
            field_font = _get(spec, 'cover.field.font', '宋体')
            field_size = _size_pt(_get(spec, 'cover.field.size', '四号'))
            
            fields = [
                ('学    院：', cover_info.get('college', '')),
                ('专    业：', cover_info.get('major', '')),
                ('学    号：', cover_info.get('student_id', '')),
                ('姓    名：', cover_info.get('name', '')),
                ('指导教师：', cover_info.get('advisor', '')),
                ('完成日期：', cover_info.get('date', '')),
            ]
            
            for label, value in fields:
                para = doc.add_paragraph()
                para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                para.paragraph_format.line_spacing = 2.0
                
                run_label = para.add_run(label)
                _set_run_font(run_label, field_font, field_size, bold=True)
                
                run_value = para.add_run(value)
                _set_run_font(run_value, field_font, field_size)
        
        doc.add_page_break()
        
        # ============================================================
        # 中文摘要
        # ============================================================
        _add_paragraph(doc, '摘  要',
                       _get(spec, 'abstract_cn.title.font', '黑体'),
                       _size_pt(_get(spec, 'abstract_cn.title.size', '小二号')),
                       bold=_get(spec, 'abstract_cn.title.bold', True),
                       align=_get(spec, 'abstract_cn.title.align', '居中'),
                       spacing_after_pt=20)
        
        body_font = _get(spec, 'abstract_cn.body.font', '宋体')
        body_size = _size_pt(_get(spec, 'abstract_cn.body.size', '小四号'))
        body_indent = body_size * 2  # 首行缩进2字符
        
        _add_paragraph(doc, thesis.get('abstract_cn', ''),
                       body_font, body_size,
                       align='两端对齐', first_indent_pt=body_indent)
        
        # 中文关键词
        kw_cn = thesis.get('keywords_cn', [])
        kw_sep = _get(spec, 'abstract_cn.keywords.separator', '；')
        kw_label_font = _get(spec, 'abstract_cn.keywords_label.font', '宋体')
        kw_label_size = _size_pt(_get(spec, 'abstract_cn.keywords_label.size', '四号'))
        kw_label_bold = _get(spec, 'abstract_cn.keywords_label.bold', True)
        
        _add_paragraph(doc, '关键词：' + kw_sep.join(kw_cn),
                       kw_label_font, kw_label_size,
                       bold=kw_label_bold, align='左对齐',
                       spacing_before_pt=20)
        
        doc.add_page_break()
        
        # ============================================================
        # 英文摘要
        # ============================================================
        _add_paragraph(doc, 'Abstract',
                       _get(spec, 'abstract_en.title.font', 'Times New Roman'),
                       _size_pt(_get(spec, 'abstract_en.title.size', '小二号')),
                       bold=_get(spec, 'abstract_en.title.bold', True),
                       align=_get(spec, 'abstract_en.title.align', '居中'),
                       spacing_after_pt=20)
        
        en_body_font = _get(spec, 'abstract_en.body.font', 'Times New Roman')
        en_body_size = _size_pt(_get(spec, 'abstract_en.body.size', '小四号'))
        
        _add_paragraph(doc, thesis.get('abstract_en', ''),
                       en_body_font, en_body_size,
                       align='两端对齐')
        
        # 英文关键词
        kw_en = thesis.get('keywords_en', [])
        kw_en_sep = _get(spec, 'abstract_en.keywords.separator', '; ')
        kw_en_label_font = _get(spec, 'abstract_en.keywords_label.font', 'Times New Roman')
        kw_en_label_size = _size_pt(_get(spec, 'abstract_en.keywords_label.size', '四号'))
        kw_en_label_bold = _get(spec, 'abstract_en.keywords_label.bold', True)
        
        _add_paragraph(doc, 'Key words: ' + kw_en_sep.join(kw_en),
                       kw_en_label_font, kw_en_label_size,
                       bold=kw_en_label_bold, align='左对齐',
                       spacing_before_pt=20)
        
        doc.add_page_break()
        
        # ============================================================
        # 目录（占位）
        # ============================================================
        _add_paragraph(doc, '目  录',
                       _get(spec, 'toc.title.font', '黑体'),
                       _size_pt(_get(spec, 'toc.title.size', '小二号')),
                       bold=_get(spec, 'toc.title.bold', True),
                       align=_get(spec, 'toc.title.align', '居中'),
                       spacing_after_pt=20)
        
        _add_paragraph(doc, '（目录请在Word中插入→引用→目录自动生成）',
                       '宋体', 12, align='居中')
        
        doc.add_page_break()
        
        # ============================================================
        # 正文
        # ============================================================
        ch1_font = _get(spec, 'heading1.font', '黑体')
        ch1_size = _size_pt(_get(spec, 'heading1.size', '三号'))
        ch1_bold = _get(spec, 'heading1.bold', True)
        ch1_align = _get(spec, 'heading1.align', '左对齐')
        
        ch2_font = _get(spec, 'heading2.font', '黑体')
        ch2_size = _size_pt(_get(spec, 'heading2.size', '小三号'))
        ch2_bold = _get(spec, 'heading2.bold', True)
        ch2_align = _get(spec, 'heading2.align', '左对齐')
        
        ch3_font = _get(spec, 'heading3.font', '黑体')
        ch3_size = _size_pt(_get(spec, 'heading3.size', '四号'))
        ch3_bold = _get(spec, 'heading3.bold', True)
        ch3_align = _get(spec, 'heading3.align', '左对齐')
        
        body_font_name = _get(spec, 'body.font', '宋体')
        body_font_size = _size_pt(_get(spec, 'body.size', '小四号'))
        body_indent_pt = body_font_size * 2
        
        for i, chapter in enumerate(thesis.get('chapters', [])):
            # 一级标题（每章前分页，除了第一章）
            if i > 0:
                doc.add_page_break()
            
            ch_num = chapter.get('number', '')
            ch_title = chapter.get('title', '')
            heading1_text = f"{ch_num}  {ch_title}" if ch_num else ch_title
            _add_paragraph(doc, heading1_text, ch1_font, ch1_size, ch1_bold, ch1_align,
                           spacing_before_pt=20, spacing_after_pt=20)
            
            # 正文段落（章节开头的正文）
            if chapter.get('content'):
                _add_paragraph(doc, chapter['content'], body_font_name, body_font_size,
                               align='两端对齐', first_indent_pt=body_indent_pt)
            
            # 二级标题和正文
            for section_item in chapter.get('sections', []):
                sec_num = section_item.get('number', '')
                sec_title = section_item.get('title', '')
                heading2_text = f"{sec_num}  {sec_title}" if sec_num else sec_title
                _add_paragraph(doc, heading2_text, ch2_font, ch2_size, ch2_bold, ch2_align,
                               spacing_before_pt=15, spacing_after_pt=10)
                
                # 正文
                content = section_item.get('content', '')
                if content:
                    paragraphs = content.split('\n')
                    for p in paragraphs:
                        p = p.strip()
                        if p:
                            _add_paragraph(doc, p, body_font_name, body_font_size,
                                           align='两端对齐', first_indent_pt=body_indent_pt)
                
                # 三级标题和正文
                for sub in section_item.get('subsections', []):
                    sub_num = sub.get('number', '')
                    sub_title = sub.get('title', '')
                    heading3_text = f"{sub_num}  {sub_title}" if sub_num else sub_title
                    _add_paragraph(doc, heading3_text, ch3_font, ch3_size, ch3_bold, ch3_align,
                                   spacing_before_pt=10, spacing_after_pt=8)
                    
                    sub_content = sub.get('content', '')
                    if sub_content:
                        paragraphs = sub_content.split('\n')
                        for p in paragraphs:
                            p = p.strip()
                            if p:
                                _add_paragraph(doc, p, body_font_name, body_font_size,
                                               align='两端对齐', first_indent_pt=body_indent_pt)
        
        # ============================================================
        # 参考文献
        # ============================================================
        doc.add_page_break()
        
        _add_paragraph(doc, '参考文献',
                       _get(spec, 'reference.title.font', '黑体'),
                       _size_pt(_get(spec, 'reference.title.size', '小二号')),
                       bold=_get(spec, 'reference.title.bold', True),
                       align=_get(spec, 'reference.title.align', '居中'),
                       spacing_after_pt=20)
        
        ref_font_name = _get(spec, 'reference.font', '宋体')
        ref_font_size = _size_pt(_get(spec, 'reference.size', '五号'))
        
        references = thesis.get('references', [])
        for idx, ref in enumerate(references):
            para = _add_paragraph(doc, ref, ref_font_name, ref_font_size, align='左对齐')
            # 添加书签，供正文引用跳转
            _add_bookmark(para, f'ref{idx+1}')
        
        # ============================================================
        # 致谢
        # ============================================================
        doc.add_page_break()
        
        _add_paragraph(doc, '致  谢',
                       _get(spec, 'acknowledgement.title.font', '黑体'),
                       _size_pt(_get(spec, 'acknowledgement.title.size', '小二号')),
                       bold=_get(spec, 'acknowledgement.title.bold', True),
                       align=_get(spec, 'acknowledgement.title.align', '居中'),
                       spacing_after_pt=20)
        
        ack_body_font = _get(spec, 'acknowledgement.body.font', '宋体')
        ack_body_size = _size_pt(_get(spec, 'acknowledgement.body.size', '小四号'))
        ack_body_indent = ack_body_size * 2
        
        ack_content = thesis.get('acknowledgement', '')
        if ack_content:
            _add_paragraph(doc, ack_content, ack_body_font, ack_body_size,
                           align='两端对齐', first_indent_pt=ack_body_indent)
        
        # 保存到BytesIO
        buffer = BytesIO()
        doc.save(buffer)
        return buffer.getvalue()
    
    except Exception as e:
        print(f"[docx_generator] 错误: {e}")
        import traceback
        traceback.print_exc()
        return None


def _clear_and_write_paragraph(paragraph, text: str):
    first_run = paragraph.runs[0] if paragraph.runs else None
    font_name = first_run.font.name if first_run else None
    font_size = first_run.font.size if first_run else None
    bold = first_run.font.bold if first_run else None

    for run in list(paragraph.runs):
        run.text = ""
    run = paragraph.runs[0] if paragraph.runs else paragraph.add_run()
    run.text = text
    if font_name:
        run.font.name = font_name
    if font_size:
        run.font.size = font_size
    if bold is not None:
        run.font.bold = bold


def _fill_line_value(text: str, value: str) -> str:
    if not value:
        return text
    if "：" in text:
        label, rest = text.split("：", 1)
        if "_" in rest or "＿" in rest or not rest.strip():
            return f"{label}： {value}"
    if ":" in text:
        label, rest = text.split(":", 1)
        if "_" in rest or "＿" in rest or not rest.strip():
            return f"{label}: {value}"
    if "_" in text:
        return text.replace("_", "", text.count("_")).rstrip() + f" {value}"
    return text


def _field_values(thesis: dict, cover_info: dict) -> dict:
    return {
        "title": thesis.get("title", ""),
        "titleEn": thesis.get("title_en", ""),
        "college": cover_info.get("college", ""),
        "major": cover_info.get("major", ""),
        "studentId": cover_info.get("student_id", ""),
        "studentName": cover_info.get("name", ""),
        "adviser": cover_info.get("advisor", ""),
        "date": cover_info.get("date", ""),
    }


FIELD_LABELS = {
    "title": ["题目", "论文题目", "题    目", "题  目"],
    "titleEn": ["英文题目", "English Title"],
    "college": ["学院"],
    "major": ["专业年级", "专业"],
    "studentId": ["学号"],
    "studentName": ["学生姓名", "姓名"],
    "adviser": ["指导教师", "指导老师"],
    "date": ["完成日期"],
}


def _fill_template_fields(doc, thesis: dict, cover_info: dict):
    values = _field_values(thesis, cover_info)
    containers = list(doc.paragraphs)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                containers.extend(cell.paragraphs)

    for paragraph in containers:
        original = paragraph.text
        if not original.strip():
            continue
        for key, labels in FIELD_LABELS.items():
            value = values.get(key, "")
            if value and any(label in original for label in labels):
                updated = _fill_line_value(original, value)
                if updated != original:
                    _clear_and_write_paragraph(paragraph, updated)
                break


def _append_generated_body(doc, thesis: dict):
    chapters = thesis.get("chapters", [])
    if not chapters:
        return

    doc.add_page_break()
    for chapter in chapters:
        chapter_title = " ".join([chapter.get("number", ""), chapter.get("title", "")]).strip()
        if chapter_title:
            paragraph = doc.add_paragraph()
            run = paragraph.add_run(chapter_title)
            run.bold = True
        for section in chapter.get("sections", []):
            section_title = " ".join([section.get("number", ""), section.get("title", "")]).strip()
            if section_title:
                paragraph = doc.add_paragraph()
                run = paragraph.add_run(section_title)
                run.bold = True
            for text in (section.get("content") or "").split("\n"):
                text = text.strip()
                if text:
                    doc.add_paragraph(text)

    references = thesis.get("references", [])
    if references:
        doc.add_page_break()
        heading = doc.add_paragraph()
        heading.add_run("参考文献").bold = True
        for reference in references:
            doc.add_paragraph(reference)


def generate_thesis_docx_from_template(template_path: str, thesis: dict, spec: dict, cover_info: dict = None) -> Optional[bytes]:
    """Open the uploaded template DOCX and write generated data back into it."""
    try:
        cover_info = cover_info or {}
        doc = Document(template_path)
        _setup_styles(doc)
        _fill_template_fields(doc, thesis, cover_info)
        _append_generated_body(doc, thesis)
        buffer = BytesIO()
        doc.save(buffer)
        return buffer.getvalue()
    except Exception as e:
        print(f"[template_export] error: {e}")
        import traceback
        traceback.print_exc()
        return None

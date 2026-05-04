"""
Format-aware LaTeX generation engine.

Reads TemplateFormatRules DSL and produces a XeLaTeX-compilable .tex file
that honours the school's thesis formatting guidelines.
"""

from __future__ import annotations

from typing import Any


def _deep(d: dict, path: str, fallback: Any = None) -> Any:
    keys = path.split(".")
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict):
            return fallback
        cur = cur.get(k)
        if cur is None:
            return fallback
    return cur


_FONT_SIZE_MAP: dict[str, str] = {
    "初号": "42pt", "小初号": "36pt", "一号": "26pt", "小一号": "24pt",
    "二号": "22pt", "小二号": "18pt", "三号": "16pt", "小三号": "15pt",
    "四号": "14pt", "小四号": "12pt", "五号": "10.5pt", "小五号": "9pt",
    "六号": "7.5pt", "小六号": "6.5pt", "七号": "5.5pt", "八号": "5pt",
}


def _resolve_font_size(font_cfg: dict) -> str:
    if "size_pt" in font_cfg:
        return f"{font_cfg['size_pt']}pt"
    name = font_cfg.get("size_name", "")
    return _FONT_SIZE_MAP.get(name, "12pt")


def _tex_escape(s: str) -> str:
    replacements = [
        ("\\", "\\textbackslash{}"),
        ("{", "\\{"), ("}", "\\}"),
        ("&", "\\&"), ("%", "\\%"),
        ("$", "\\$"), ("#", "\\#"),
        ("_", "\\_"), ("~", "\\textasciitilde{}"),
        ("^", "\\textasciicircum{}"),
    ]
    for old, new in replacements:
        s = s.replace(old, new)
    return s


def _font_family_latex(family: str) -> str:
    cn_fonts = {"宋体": "SimSun", "黑体": "SimHei", "楷体": "KaiTi", "仿宋": "FangSong"}
    return cn_fonts.get(family, family)


class LatexService:
    """Generates a format-compliant .tex source from chapters + DSL rules."""

    def __init__(self, rules_json: dict | None = None, citation_json: dict | None = None):
        self.rules = rules_json or {}
        self.citation = citation_json or {}

    def generate(
        self,
        *,
        title: str,
        degree_level: str,
        discipline: str,
        abstract_cn: str = "",
        abstract_en: str = "",
        keywords_cn: str = "",
        keywords_en: str = "",
        chapters: list[dict[str, str]],
        references: list[str] | None = None,
    ) -> str:
        r = self.rules
        margin = _deep(r, "margin", {})
        body_font = _deep(r, "fonts.body", {"family": "宋体", "size_pt": 12})
        body_size = _resolve_font_size(body_font)
        line_spacing = _deep(r, "spacing.line", 1.5)

        main_cn_font = _font_family_latex(body_font.get("family", "宋体"))
        chapter_font_cfg = _deep(r, "fonts.chapter_title", {"family": "黑体"})
        heading_cn_font = _font_family_latex(chapter_font_cfg.get("family", "黑体"))

        parts: list[str] = []

        parts.append(f"\\documentclass[{body_size}, a4paper]{{article}}")
        parts.append("")
        parts.append("% ── Packages ──")
        parts.append("\\usepackage{fontspec}")
        parts.append("\\usepackage{xeCJK}")
        parts.append(f"\\usepackage[top={margin.get('top', 2.5)}cm, "
                     f"bottom={margin.get('bottom', 2.0)}cm, "
                     f"left={margin.get('left', 2.5)}cm, "
                     f"right={margin.get('right', 2.0)}cm]{{geometry}}")
        parts.append("\\usepackage{setspace}")
        parts.append("\\usepackage{titlesec}")
        parts.append("\\usepackage{fancyhdr}")
        parts.append("\\usepackage{hyperref}")
        parts.append("\\usepackage{booktabs}")
        parts.append("\\usepackage{graphicx}")
        parts.append("\\usepackage{caption}")
        parts.append("\\usepackage{indentfirst}")
        parts.append("")

        parts.append("% ── Fonts ──")
        parts.append(f"\\setCJKmainfont{{{main_cn_font}}}")
        parts.append(f"\\setCJKsansfont{{{heading_cn_font}}}")
        parts.append("\\setmainfont{Times New Roman}")
        parts.append("")

        parts.append("% ── Spacing ──")
        spacing_cmd = {1.0: "\\singlespacing", 1.5: "\\onehalfspacing", 2.0: "\\doublespacing"}
        parts.append(spacing_cmd.get(float(line_spacing), f"\\linespread{{{line_spacing}}}"))
        parts.append("")

        first_indent = _deep(r, "spacing.first_line_indent", 2)
        parts.append(f"\\setlength{{\\parindent}}{{{first_indent}em}}")
        parts.append("")

        ch_size = _resolve_font_size(chapter_font_cfg)
        s1_cfg = _deep(r, "fonts.section_l1", {"size_pt": 15})
        s1_size = _resolve_font_size(s1_cfg)
        s2_cfg = _deep(r, "fonts.section_l2", {"size_pt": 14})
        s2_size = _resolve_font_size(s2_cfg)

        parts.append("% ── Heading styles ──")
        parts.append(f"\\titleformat{{\\section}}{{\\centering\\CJKfamily{{zhsong}}\\fontsize{{{ch_size}}}{{1.2em}}\\selectfont\\bfseries}}{{\\thesection}}{{1em}}{{}}")
        parts.append(f"\\titleformat{{\\subsection}}{{\\CJKfamily{{zhsong}}\\fontsize{{{s1_size}}}{{1.2em}}\\selectfont\\bfseries}}{{\\thesubsection}}{{1em}}{{}}")
        parts.append(f"\\titleformat{{\\subsubsection}}{{\\CJKfamily{{zhsong}}\\fontsize{{{s2_size}}}{{1.2em}}\\selectfont\\bfseries}}{{\\thesubsubsection}}{{1em}}{{}}")
        parts.append("")

        parts.append("% ── Header/Footer ──")
        parts.append("\\pagestyle{fancy}")
        parts.append("\\fancyhf{}")
        parts.append("\\fancyfoot[C]{\\thepage}")
        parts.append("\\renewcommand{\\headrulewidth}{0pt}")
        parts.append("")

        parts.append(f"\\title{{{_tex_escape(title)}}}")
        parts.append(f"\\date{{{_tex_escape(discipline)}  ·  {degree_level}}}")
        parts.append("")
        parts.append("\\begin{document}")
        parts.append("\\maketitle")
        parts.append("\\thispagestyle{empty}")
        parts.append("\\newpage")
        parts.append("")

        if abstract_cn:
            ab_title_cfg = _deep(r, "fonts.abstract_title", {"size_pt": 16})
            ab_size = _resolve_font_size(ab_title_cfg)
            parts.append(f"{{\\centering\\fontsize{{{ab_size}}}{{1.4em}}\\selectfont\\bfseries 摘要\\par}}")
            parts.append("\\vspace{12pt}")
            parts.append(_tex_escape(abstract_cn))
            if keywords_cn:
                parts.append("")
                parts.append(f"\\noindent\\textbf{{关键词：}}{_tex_escape(keywords_cn)}")
            parts.append("\\newpage")
            parts.append("")

        if abstract_en:
            ab_title_cfg = _deep(r, "fonts.abstract_title", {"size_pt": 16})
            ab_size = _resolve_font_size(ab_title_cfg)
            parts.append(f"{{\\centering\\fontsize{{{ab_size}}}{{1.4em}}\\selectfont\\bfseries Abstract\\par}}")
            parts.append("\\vspace{12pt}")
            parts.append(_tex_escape(abstract_en))
            if keywords_en:
                parts.append("")
                parts.append(f"\\noindent\\textbf{{Keywords: }}{_tex_escape(keywords_en)}")
            parts.append("\\newpage")
            parts.append("")

        toc_depth = _deep(r, "numbering.toc_depth", 2)
        parts.append(f"\\setcounter{{tocdepth}}{{{toc_depth}}}")
        parts.append("\\tableofcontents")
        parts.append("\\newpage")
        parts.append("")

        for ch in chapters:
            ch_title = ch.get("title", "")
            ch_content = ch.get("content", "")
            parts.append(f"\\section{{{_tex_escape(ch_title)}}}")
            if ch_content:
                for line in ch_content.split("\n"):
                    stripped = line.strip()
                    if not stripped:
                        parts.append("")
                        continue
                    if stripped.startswith("### "):
                        parts.append(f"\\subsection{{{_tex_escape(stripped[4:])}}}")
                    elif stripped.startswith("#### "):
                        parts.append(f"\\subsubsection{{{_tex_escape(stripped[5:])}}}")
                    elif stripped.startswith("##### "):
                        parts.append(f"\\paragraph{{{_tex_escape(stripped[6:])}}}")
                    else:
                        parts.append(_tex_escape(stripped))
            parts.append("")

        if references:
            parts.append("\\newpage")
            parts.append("\\section*{参考文献}")
            parts.append("\\addcontentsline{toc}{section}{参考文献}")
            parts.append("\\begin{enumerate}")
            for ref in references:
                parts.append(f"  \\item {_tex_escape(ref)}")
            parts.append("\\end{enumerate}")
            parts.append("")

        parts.append("\\end{document}")
        return "\n".join(parts)

"""
Citation formatting service (rule-based, no LLM).

Transforms in-text citation markers like [lit_001] into the target style
(GB/T 7714, APA, Harvard, etc.) and builds the reference list.
"""

from __future__ import annotations

import re
from typing import Any


_MARKER_RE = re.compile(r"\[lit_(\w+)\]")


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


def _format_author_list(authors: str, max_authors: int = 3, et_al: str = "等") -> str:
    parts = re.split(r"[,;，；、]\s*", authors.strip())
    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) <= max_authors:
        return ", ".join(parts)
    return ", ".join(parts[:max_authors]) + f", {et_al}"


def _gb7714_reference(lit: dict, seq: int) -> str:
    authors = _format_author_list(lit.get("authors", ""), 3, "等")
    title = lit.get("title", "")
    year = lit.get("year", "")
    journal = lit.get("journal", "")
    doi = lit.get("doi", "")

    if journal:
        entry = f"{authors}. {title}[J]. {journal}, {year}."
    else:
        entry = f"{authors}. {title}[M]. {year}."

    if doi:
        entry += f" DOI: {doi}."
    return f"[{seq}] {entry}"


def _gb7714_inline(seq: int) -> str:
    return f"[{seq}]"


def _apa_reference(lit: dict) -> str:
    authors = _format_author_list(lit.get("authors", ""), 7, "et al.")
    year = lit.get("year", "n.d.")
    title = lit.get("title", "")
    journal = lit.get("journal", "")

    if journal:
        return f"{authors} ({year}). {title}. *{journal}*."
    return f"{authors} ({year}). *{title}*."


def _apa_inline(authors: str, year: str | int) -> str:
    parts = re.split(r"[,;，；、]\s*", authors.strip())
    first = parts[0].strip() if parts else "Unknown"
    if len(parts) > 2:
        first += " et al."
    elif len(parts) == 2:
        first += f" & {parts[1].strip()}"
    return f"({first}, {year})"


def _harvard_reference(lit: dict) -> str:
    return _apa_reference(lit)


def _harvard_inline(authors: str, year: str | int) -> str:
    return _apa_inline(authors, year)


class CitationService:
    """
    Formats citations in thesis text and builds the reference list.

    Usage:
        svc = CitationService(style="GB/T 7714", literature=literature_list)
        formatted_text = svc.format_text(raw_text)
        ref_list = svc.reference_list()
    """

    def __init__(
        self,
        style: str = "GB/T 7714",
        literature: list[dict] | None = None,
        citation_rules: dict | None = None,
    ):
        self.style = style.upper().replace(" ", "")
        self.literature = literature or []
        self.rules = citation_rules or {}
        self._lit_index: dict[str, int] = {}
        self._cited_ids: list[str] = []

    def _ensure_index(self):
        if self._lit_index:
            return
        for idx, lit in enumerate(self.literature, start=1):
            lit_id = str(lit.get("id", ""))
            self._lit_index[lit_id] = idx

    def format_text(self, text: str) -> str:
        self._ensure_index()
        self._cited_ids = []

        def _replacer(match: re.Match) -> str:
            lit_id = match.group(1)
            if lit_id not in self._lit_index:
                return match.group(0)
            self._cited_ids.append(lit_id)
            seq = self._lit_index[lit_id]
            lit = self.literature[seq - 1]

            if "GB" in self.style or "7714" in self.style:
                return _gb7714_inline(seq)
            elif "APA" in self.style:
                return _apa_inline(lit.get("authors", ""), lit.get("year", ""))
            elif "HARVARD" in self.style:
                return _harvard_inline(lit.get("authors", ""), lit.get("year", ""))
            else:
                return _gb7714_inline(seq)

        return _MARKER_RE.sub(_replacer, text)

    def reference_list(self) -> list[str]:
        self._ensure_index()
        result: list[str] = []

        if "GB" in self.style or "7714" in self.style:
            for idx, lit in enumerate(self.literature, start=1):
                result.append(_gb7714_reference(lit, idx))
        elif "APA" in self.style:
            sorted_lits = sorted(self.literature, key=lambda x: x.get("authors", ""))
            for lit in sorted_lits:
                result.append(_apa_reference(lit))
        elif "HARVARD" in self.style:
            sorted_lits = sorted(self.literature, key=lambda x: x.get("authors", ""))
            for lit in sorted_lits:
                result.append(_harvard_reference(lit))
        else:
            for idx, lit in enumerate(self.literature, start=1):
                result.append(_gb7714_reference(lit, idx))

        return result

    def validate_citations(self, text: str) -> dict:
        self._ensure_index()
        markers_in_text: set[str] = set()
        for m in _MARKER_RE.finditer(text):
            markers_in_text.add(m.group(1))

        all_ids = set(self._lit_index.keys())
        uncited = all_ids - markers_in_text
        orphaned = markers_in_text - all_ids

        return {
            "total_literature": len(self.literature),
            "cited_count": len(markers_in_text & all_ids),
            "uncited_literature_ids": list(uncited),
            "orphaned_markers": list(orphaned),
            "is_consistent": len(orphaned) == 0,
        }

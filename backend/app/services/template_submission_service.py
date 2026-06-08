"""
Template submission service: file parsing, AI pre-parsing, and approval workflow.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.school import (
    School,
    SchoolTemplateGroup,
    TemplateCitationRules,
    TemplateFormatRules,
    TemplateStructure,
)
from app.models.template_submission import TemplateSubmission
from app.services.billing_service import BillingService


def _parse_file_text(file_path: str) -> str:
    """Extract plain text from a file (PDF or plain text)."""
    path = Path(file_path)
    if not path.exists():
        return ""
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md", ".text"):
        return path.read_text(encoding="utf-8", errors="replace")[:80000]
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            pages = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages.append(t)
            return "\n\n".join(pages)[:80000]
        except Exception:
            return ""
    return ""


async def pre_parse_template(
    db: Session,
    submission: TemplateSubmission,
    llm_call,
    model,
    user_id: UUID,
) -> None:
    """Call LLM to extract structure/format/citation DSL from the uploaded template file."""
    text = _parse_file_text(submission.file_path)
    if not text:
        submission.notes = (submission.notes or "") + "\n[系统] 无法提取文件文本内容，请手动补充格式规则。"
        db.commit()
        return

    prompt = (
        "你是一个学校论文格式规范解析专家。请从下面的论文格式规范文件中提取三套DSL配置。"
        "只输出一个JSON对象，包含以下三个字段：\n"
        "1. structure: {\"sections\": [{\"type\": \"章节名称\", \"required\": true/false}]}\n"
        "2. format_rules: {\"fonts\": {\"chapter_title\": {\"family\": \"黑体\", \"size_name\": \"小二号\", \"bold\": true, \"align\": \"center\"}, ...}, \"spacing\": {\"line\": 1.5, \"first_line_indent\": 2, ...}, \"margin\": {\"top\": 2.5, ...}, \"numbering\": {\"examples\": [...]}, \"word_count\": {\"min\": 30000}}\n"
        "3. citation_rules: {\"citationType\": \"GB/T 7714\", \"citationExamples\": [\"示例1\", ...], \"citationRules\": [\"规则1\", ...]}\n"
        "4. citation_text: 从文件中提取的引用格式原文（如果有）\n"
        "5. citation_style: 识别到的引用格式名称（如 GB/T 7714、APA、Harvard）\n\n"
        "如果某个字段无法从文件中识别，设为null。尽量从文件中提取具体的字体名称、字号、行距、页边距等数值。"
    )

    try:
        content = await llm_call(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": f"学校：{submission.school_name}\n学位：{submission.degree_level}\n\n文件内容：\n{text[:24000]}"},
            ],
        )
    except Exception:
        content = ""

    data = _parse_json_object(content)
    if data:
        submission.parsed_structure = data.get("structure")
        submission.parsed_format_rules = data.get("format_rules")
        submission.parsed_citation_rules = data.get("citation_rules")
        submission.parsed_citation_text = data.get("citation_text")
        if data.get("citation_style") and not submission.citation_style:
            submission.citation_style = data["citation_style"]
    db.commit()


def approve_submission(
    db: Session,
    submission_id: UUID,
    reviewer_id: UUID,
    token_reward_cents: int = 5000,
) -> TemplateSubmission:
    """Approve a template submission: create school template group + issue token reward."""
    submission = db.get(TemplateSubmission, submission_id)
    if submission is None or submission.status != "pending":
        raise ValueError("Submission not found or already processed")

    # Find or create school
    stmt = select(School).where(School.name == submission.school_name)
    school = db.scalar(stmt)
    if school is None:
        school = School(name=submission.school_name, enabled=True)
        db.add(school)
        db.flush()

    # Create template group
    group = SchoolTemplateGroup(
        school_id=school.id,
        degree_level=submission.degree_level,
        discipline=submission.discipline,
        citation_style=submission.citation_style,
        enabled=True,
    )
    db.add(group)
    db.flush()

    # Create structure DSL
    if submission.parsed_structure:
        db.add(TemplateStructure(
            template_group_id=group.id,
            structure_json=submission.parsed_structure,
        ))

    # Create format rules DSL
    if submission.parsed_format_rules:
        db.add(TemplateFormatRules(
            template_group_id=group.id,
            rules_json=submission.parsed_format_rules,
        ))

    # Create citation rules DSL
    citation_json = submission.parsed_citation_rules or {}
    if submission.citation_style:
        citation_json.setdefault("citationType", submission.citation_style)
    if submission.parsed_citation_rules:
        db.add(TemplateCitationRules(
            template_group_id=group.id,
            citation_json=citation_json,
            citation_text=submission.parsed_citation_text,
        ))

    # Issue token reward via billing service
    billing = BillingService(db)
    billing.recharge(
        user_id=submission.user_id,
        admin_id=reviewer_id,
        amount_cents=token_reward_cents,
        note=f"模板贡献奖励：{submission.school_name} ({submission.degree_level})",
        commit=False,
    )

    # Update submission status
    submission.status = "approved"
    submission.reviewer_id = reviewer_id
    submission.token_reward = token_reward_cents
    submission.school_template_group_id = group.id

    db.commit()
    db.refresh(submission)
    return submission


def reject_submission(
    db: Session,
    submission_id: UUID,
    reviewer_id: UUID,
    review_notes: str | None = None,
) -> TemplateSubmission:
    """Reject a template submission."""
    submission = db.get(TemplateSubmission, submission_id)
    if submission is None or submission.status != "pending":
        raise ValueError("Submission not found or already processed")

    submission.status = "rejected"
    submission.reviewer_id = reviewer_id
    submission.review_notes = review_notes
    db.commit()
    db.refresh(submission)
    return submission


def _parse_json_object(raw: str) -> dict:
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            data = json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


def get_template_completeness(
    db: Session,
    school_template_group_id: UUID | None,
) -> dict:
    """Check how complete a school template group's DSLs are."""
    result = {
        "has_group": False,
        "structure": False,
        "format_rules": False,
        "citation_rules": False,
        "structure_detail": "未配置",
        "format_detail": "未配置",
        "citation_detail": "未配置",
    }
    if school_template_group_id is None:
        return result

    group = db.get(SchoolTemplateGroup, school_template_group_id)
    if group is None:
        return result

    result["has_group"] = True

    if group.structure and group.structure.structure_json:
        result["structure"] = True
        sections = group.structure.structure_json.get("sections", [])
        result["structure_detail"] = f"已配置 ({len(sections)} 个章节)"

    if group.format_rules and group.format_rules.rules_json:
        result["format_rules"] = True
        fonts = group.format_rules.rules_json.get("fonts", {})
        result["format_detail"] = f"已配置 ({len(fonts)} 种字体规则)"

    if group.citation_rules:
        cj = group.citation_rules.citation_json or {}
        if cj:
            result["citation_rules"] = True
            cite_type = cj.get("citationType", "")
            result["citation_detail"] = f"已配置 ({cite_type})" if cite_type else "已配置"

    return result

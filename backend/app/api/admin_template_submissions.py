"""
Admin template submission review endpoints.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.deps import DbSessionDep, AdminUserDep, LLMServiceDep
from app.models.template_submission import TemplateSubmission
from app.schemas.template_submission import (
    TemplateSubmissionDetail,
    TemplateSubmissionResponse,
    TemplateSubmissionReview,
)
from app.services.template_submission_service import (
    approve_submission,
    get_template_completeness,
    reject_submission,
)

router = APIRouter()


def _admin_submission(db: Session, submission_id: UUID) -> TemplateSubmission:
    sub = db.get(TemplateSubmission, submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return sub


@router.get("")
def list_submissions(
    admin: AdminUserDep,
    db: DbSessionDep,
    status: str | None = Query(default=None),
) -> dict:
    """List all template submissions with optional status filter."""
    stmt = select(TemplateSubmission).order_by(TemplateSubmission.created_at.desc())
    if status:
        stmt = stmt.where(TemplateSubmission.status == status)
    rows = list(db.scalars(stmt).all())
    total = len(rows)

    # Enrich with submitter username
    from app.models.user import User

    user_ids = {r.user_id for r in rows}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids))).all()} if user_ids else {}

    items = []
    for r in rows:
        user = users.get(r.user_id)
        items.append({
            "id": str(r.id),
            "user_id": str(r.user_id),
            "username": user.username if user else "unknown",
            "school_name": r.school_name,
            "degree_level": r.degree_level,
            "discipline": r.discipline,
            "file_name": r.file_name,
            "citation_style": r.citation_style,
            "notes": r.notes,
            "status": r.status,
            "review_notes": r.review_notes,
            "token_reward": r.token_reward,
            "school_template_group_id": str(r.school_template_group_id) if r.school_template_group_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        })

    # Status counts
    stmt_all = select(func.count(TemplateSubmission.id))
    total_count = db.scalar(stmt_all) or 0
    pending_count = db.scalar(
        select(func.count(TemplateSubmission.id)).where(TemplateSubmission.status == "pending")
    ) or 0
    approved_count = db.scalar(
        select(func.count(TemplateSubmission.id)).where(TemplateSubmission.status == "approved")
    ) or 0
    rejected_count = db.scalar(
        select(func.count(TemplateSubmission.id)).where(TemplateSubmission.status == "rejected")
    ) or 0

    return {
        "total": total,
        "counts": {"all": total_count, "pending": pending_count, "approved": approved_count, "rejected": rejected_count},
        "items": items,
    }


@router.get("/{submission_id}")
def get_submission_detail(
    admin: AdminUserDep,
    db: DbSessionDep,
    submission_id: UUID,
) -> dict:
    """Get full detail of a submission including parsed DSLs."""
    sub = _admin_submission(db, submission_id)

    from app.models.user import User

    user = db.get(User, sub.user_id)
    reviewer = db.get(User, sub.reviewer_id) if sub.reviewer_id else None

    return {
        "id": str(sub.id),
        "user_id": str(sub.user_id),
        "username": user.username if user else "unknown",
        "school_name": sub.school_name,
        "degree_level": sub.degree_level,
        "discipline": sub.discipline,
        "file_name": sub.file_name,
        "file_path": sub.file_path,
        "citation_style": sub.citation_style,
        "notes": sub.notes,
        "parsed_structure": sub.parsed_structure,
        "parsed_format_rules": sub.parsed_format_rules,
        "parsed_citation_rules": sub.parsed_citation_rules,
        "parsed_citation_text": sub.parsed_citation_text,
        "status": sub.status,
        "reviewer_id": str(sub.reviewer_id) if sub.reviewer_id else None,
        "reviewer_name": reviewer.username if reviewer else None,
        "review_notes": sub.review_notes,
        "token_reward": sub.token_reward,
        "school_template_group_id": str(sub.school_template_group_id) if sub.school_template_group_id else None,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
        "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
    }


@router.post("/{submission_id}/approve")
def approve(
    admin: AdminUserDep,
    db: DbSessionDep,
    submission_id: UUID,
    payload: TemplateSubmissionReview | None = None,
) -> dict:
    """Approve a submission: create school template group and issue token reward."""
    reward = payload.token_reward if payload and payload.token_reward is not None else 5000
    try:
        sub = approve_submission(db, submission_id, admin.id, token_reward_cents=reward)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "status": "approved",
        "submission_id": str(sub.id),
        "school_template_group_id": str(sub.school_template_group_id) if sub.school_template_group_id else None,
        "token_reward": sub.token_reward,
    }


@router.post("/{submission_id}/reject")
def reject(
    admin: AdminUserDep,
    db: DbSessionDep,
    submission_id: UUID,
    payload: TemplateSubmissionReview | None = None,
) -> dict:
    """Reject a submission with optional review notes."""
    notes = payload.review_notes if payload else None
    try:
        sub = reject_submission(db, submission_id, admin.id, review_notes=notes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {
        "status": "rejected",
        "submission_id": str(sub.id),
        "review_notes": sub.review_notes,
    }

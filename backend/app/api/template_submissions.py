"""
Writer-facing template submission endpoints.
"""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import DbSessionDep, LLMServiceDep, WriterUserDep
from app.models.template_submission import TemplateSubmission
from app.schemas.template_submission import (
    TemplateSubmissionCreate,
    TemplateSubmissionResponse,
)
from app.services.template_submission_service import pre_parse_template
from app.services.llm_service import LLMService

router = APIRouter()


def _allowed_ext(filename: str) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in (".pdf", ".docx", ".doc", ".txt", ".md")


@router.post("", response_model=TemplateSubmissionResponse, status_code=201)
async def submit_template(
    writer: WriterUserDep,
    db: DbSessionDep,
    llm: LLMServiceDep,
    school_name: str = Form(...),
    degree_level: str = Form(...),
    discipline: str | None = Form(default=None),
    citation_style: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> TemplateSubmission:
    """Submit a school thesis template for review."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    if not _allowed_ext(file.filename):
        raise HTTPException(status_code=400, detail=f"File type not allowed: {file.filename}")

    # Save uploaded file
    settings = get_settings()
    upload_dir = Path(settings.upload_root) / "template_submissions"
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_stem = Path(file.filename).stem
    safe_name = f"{writer.id}_{file_stem}_{UUID.uuid4().hex[:8]}{Path(file.filename).suffix}"
    dest = upload_dir / safe_name

    content = await file.read()
    max_bytes = getattr(settings, "upload_max_bytes", 100 * 1024 * 1024)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="File too large")
    dest.write_bytes(content)

    submission = TemplateSubmission(
        user_id=writer.id,
        school_name=school_name,
        degree_level=degree_level,
        discipline=discipline,
        file_path=str(dest),
        file_name=file.filename,
        citation_style=citation_style,
        notes=notes,
        status="pending",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)

    # Fire-and-forget AI pre-parse (best effort)
    model = _resolve_model(db, "template_parse")
    if model:
        try:
            await pre_parse_template(
                db, submission,
                llm_call=lambda messages: llm.call(
                    user_id=writer.id,
                    project_id=None,
                    agent_name="template_parser",
                    scenario="template_parse",
                    model=model,
                    messages=messages,
                ),
                model=model,
                user_id=writer.id,
            )
        except Exception:
            pass  # Pre-parse is best-effort; admin can still review

    db.refresh(submission)
    return submission


@router.get("/mine", response_model=list[TemplateSubmissionResponse])
def list_my_submissions(writer: WriterUserDep, db: DbSessionDep) -> list[TemplateSubmission]:
    stmt = (
        select(TemplateSubmission)
        .where(TemplateSubmission.user_id == writer.id)
        .order_by(TemplateSubmission.created_at.desc())
    )
    return list(db.scalars(stmt).all())


@router.get("/{submission_id}", response_model=TemplateSubmissionResponse)
def get_my_submission(
    writer: WriterUserDep,
    db: DbSessionDep,
    submission_id: UUID,
) -> TemplateSubmission:
    submission = db.get(TemplateSubmission, submission_id)
    if submission is None or submission.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


def _resolve_model(db: Session, scenario: str):
    from app.models.model_catalog import ModelCatalog
    from sqlalchemy import select as sel

    stmt = (
        sel(ModelCatalog)
        .where(ModelCatalog.enabled.is_(True))
        .order_by(ModelCatalog.sort_order, ModelCatalog.display_name)
    )
    for row in db.scalars(stmt).all():
        allowed = row.allowed_scenarios or []
        if not allowed or scenario in allowed:
            return row
    return None

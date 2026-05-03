from pathlib import Path
import re
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.deps import DbSessionDep, SettingsDep, WriterUserDep
from app.models.project import Project
from app.models.rag import Literature
from app.schemas.literature import LiteratureCreate

router = APIRouter()


def _require_project(db: DbSessionDep, writer: WriterUserDep, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _safe_filename(name: str) -> str:
    stem = Path(name).name.replace(" ", "_")
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "", stem)
    return cleaned[:200] if cleaned else "upload.bin"


@router.get("")
def list_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    stmt = select(Literature).where(Literature.project_id == project_id).order_by(Literature.created_at.desc())
    items = db.scalars(stmt).all()
    return {
        "project_id": str(project_id),
        "items": [
            {
                "id": str(lit.id),
                "title": lit.title,
                "rag_status": lit.rag_status,
                "doi": lit.doi,
                "year": lit.year,
                "source": lit.source,
            }
            for lit in items
        ],
    }


@router.post("")
def create_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
    payload: LiteratureCreate,
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    lit = Literature(
        project_id=project_id,
        title=payload.title,
        authors=payload.authors,
        year=payload.year,
        journal=payload.journal,
        doi=payload.doi,
        abstract=payload.abstract or payload.body_text,
        citation_key=payload.citation_key,
        folder=payload.folder,
        source="manual",
        rag_status="pending",
    )
    db.add(lit)
    db.commit()
    db.refresh(lit)
    return {"id": str(lit.id), "title": lit.title, "rag_status": lit.rag_status}


@router.post("/upload")
async def upload_literature(
    writer: WriterUserDep,
    db: DbSessionDep,
    settings: SettingsDep,
    project_id: UUID,
    title: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, object]:
    _require_project(db, writer, project_id)
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing_filename")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in settings.upload_allowed_extensions:
        raise HTTPException(status_code=400, detail="unsupported_file_type")

    lit = Literature(
        project_id=project_id,
        title=title,
        source="upload",
        rag_status="pending",
    )
    db.add(lit)
    db.flush()

    upload_root = Path(settings.upload_root).resolve()
    target_dir = upload_root / str(project_id) / str(lit.id)
    target_dir.mkdir(parents=True, exist_ok=True)

    fname = _safe_filename(file.filename)
    dest_abs = target_dir / fname

    chunk = await file.read()
    if len(chunk) > settings.upload_max_bytes:
        raise HTTPException(status_code=413, detail="file_too_large")
    dest_abs.write_bytes(chunk)

    lit.file_path = f"{project_id}/{lit.id}/{fname}"

    db.add(lit)
    db.commit()
    db.refresh(lit)
    return {"id": str(lit.id), "title": lit.title, "file_path": lit.file_path, "rag_status": lit.rag_status}


@router.post("/import")
def legacy_import_stub(
    writer: WriterUserDep,
    db: DbSessionDep,
    project_id: UUID,
) -> dict[str, str]:
    """Deprecated BibTeX import placeholder — use POST /upload or POST /."""
    _require_project(db, writer, project_id)
    return {"status": "unsupported", "project_id": str(project_id), "hint": "use POST .../literature or .../literature/upload"}

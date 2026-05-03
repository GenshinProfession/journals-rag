from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.deps import DbSessionDep, WriterUserDep
from app.models.job import BackgroundJob
from app.models.project import Project
from app.schemas.jobs import BackgroundJobResponse
from app.services.job_service import JobService
from app.tasks import noop_job

router = APIRouter()


@router.get("", response_model=list[BackgroundJobResponse])
def list_jobs(writer: WriterUserDep, db: DbSessionDep) -> list[BackgroundJob]:
    stmt = (
        select(BackgroundJob)
        .where(BackgroundJob.user_id == writer.id)
        .order_by(BackgroundJob.created_at.desc())
        .limit(100)
    )
    return list(db.scalars(stmt).all())


@router.get("/{job_id}", response_model=BackgroundJobResponse)
def get_job(writer: WriterUserDep, db: DbSessionDep, job_id: UUID) -> BackgroundJob:
    job = db.get(BackgroundJob, job_id)
    if job is None or job.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.post("/noop", response_model=BackgroundJobResponse, status_code=202)
def enqueue_noop_job(writer: WriterUserDep, db: DbSessionDep) -> BackgroundJob:
    job = JobService(db).create(
        user_id=writer.id,
        project_id=None,
        job_type="noop",
        input_payload={},
    )
    result = noop_job.delay(str(job.id))
    job.celery_task_id = result.id
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def ensure_writer_project(db: DbSessionDep, writer: WriterUserDep, project_id: UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None or project.user_id != writer.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

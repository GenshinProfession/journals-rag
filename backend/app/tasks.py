from uuid import UUID

from app.db import SessionLocal
from app.models.job import BackgroundJob
from app.services.job_service import JobService
from app.worker import celery_app


@celery_app.task(name="jobs.noop")
def noop_job(job_id: str) -> dict[str, str]:
    """Smoke-test task used to verify Redis/Celery wiring."""
    with SessionLocal() as db:
        job = db.get(BackgroundJob, UUID(job_id))
        if job is None:
            return {"status": "missing"}
        service = JobService(db)
        service.mark_running(job)
        service.mark_succeeded(job, {"message": "ok"})
    return {"status": "ok", "job_id": job_id}


@celery_app.task(name="rag.rebuild_document")
def rebuild_rag_document_job(job_id: str) -> dict[str, str]:
    """Placeholder for async RAG rebuild; synchronous API path still performs the work today."""
    with SessionLocal() as db:
        job = db.get(BackgroundJob, UUID(job_id))
        if job is None:
            return {"status": "missing"}
        service = JobService(db)
        service.mark_running(job)
        service.mark_failed(job, "not_implemented")
    return {"status": "not_implemented", "job_id": job_id}


@celery_app.task(name="project.generate_chapter")
def generate_chapter_job(job_id: str) -> dict[str, str]:
    """Placeholder for async chapter generation; API currently runs generation inline."""
    with SessionLocal() as db:
        job = db.get(BackgroundJob, UUID(job_id))
        if job is None:
            return {"status": "missing"}
        service = JobService(db)
        service.mark_running(job)
        service.mark_failed(job, "not_implemented")
    return {"status": "not_implemented", "job_id": job_id}

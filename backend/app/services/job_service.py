from uuid import UUID

from sqlalchemy.orm import Session

from app.models.job import BackgroundJob


class JobService:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        *,
        user_id: UUID,
        project_id: UUID | None,
        job_type: str,
        input_payload: dict | None = None,
        celery_task_id: str | None = None,
        commit: bool = True,
    ) -> BackgroundJob:
        job = BackgroundJob(
            user_id=user_id,
            project_id=project_id,
            job_type=job_type,
            status="queued",
            celery_task_id=celery_task_id,
            input_payload=input_payload or {},
        )
        self.db.add(job)
        if commit:
            self.db.commit()
            self.db.refresh(job)
        return job

    def mark_running(self, job: BackgroundJob, *, celery_task_id: str | None = None) -> None:
        job.status = "running"
        if celery_task_id:
            job.celery_task_id = celery_task_id
        self.db.add(job)
        self.db.commit()

    def mark_succeeded(self, job: BackgroundJob, result_payload: dict | None = None) -> None:
        job.status = "succeeded"
        job.result_payload = result_payload or {}
        self.db.add(job)
        self.db.commit()

    def mark_failed(self, job: BackgroundJob, error: str) -> None:
        job.status = "failed"
        job.error = error
        self.db.add(job)
        self.db.commit()

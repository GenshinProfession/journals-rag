from uuid import UUID

from pydantic import BaseModel


class BackgroundJobResponse(BaseModel):
    id: UUID
    user_id: UUID
    project_id: UUID | None
    job_type: str
    status: str
    celery_task_id: str | None
    input_payload: dict | None
    result_payload: dict | None
    error: str | None

    model_config = {"from_attributes": True}

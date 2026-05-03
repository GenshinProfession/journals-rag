from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "journals_rag",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_track_started=True,
    task_time_limit=60 * 30,
    worker_prefetch_multiplier=1,
)

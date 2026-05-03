from collections import defaultdict, deque
from time import time


class InMemoryRateLimiter:
    """Small single-process limiter; replace with Redis for multi-instance production."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, *, max_attempts: int, window_seconds: int) -> bool:
        now = time()
        hits = self._hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= max_attempts:
            return False
        hits.append(now)
        return True


login_limiter = InMemoryRateLimiter()

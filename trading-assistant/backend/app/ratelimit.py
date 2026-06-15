"""A tiny in-memory rate limiter for public endpoints (auth, lead capture).

Good enough to blunt abuse on a single instance. For multi-instance production,
swap the backing store for Redis.
"""

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_BUCKETS: dict[str, deque] = defaultdict(deque)


def limit(request: Request, *, key: str, max_calls: int, window_secs: int) -> None:
    client = request.client.host if request.client else "unknown"
    bucket_key = f"{key}:{client}"
    now = time.monotonic()
    bucket = _BUCKETS[bucket_key]
    while bucket and now - bucket[0] > window_secs:
        bucket.popleft()
    if len(bucket) >= max_calls:
        raise HTTPException(429, "rate limit exceeded, try again shortly")
    bucket.append(now)

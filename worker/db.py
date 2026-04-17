"""Postgres helpers for the Mac Mini job worker.

Schema lives in the web app (Drizzle). This file knows the column names and
nothing else — any schema change in web/src/lib/db/schema.ts must be mirrored
here.
"""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row


def _connect() -> psycopg.Connection:
    dsn = os.environ["DATABASE_URL"]
    return psycopg.connect(dsn, row_factory=dict_row, autocommit=False)


@contextmanager
def cursor() -> Iterator[psycopg.Cursor]:
    conn = _connect()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def claim_next_job(worker_id: str) -> dict[str, Any] | None:
    """Atomically move the next queued job to 'processing' and return it.

    Uses FOR UPDATE SKIP LOCKED so many workers can poll safely.
    """
    sql = """
    with j as (
        select id from jobs
        where status = 'queued'
        order by created_at
        limit 1
        for update skip locked
    )
    update jobs
       set status = 'processing',
           started_at = now(),
           updated_at = now(),
           attempts = attempts + 1,
           worker_id = %s
      where id in (select id from j)
    returning *;
    """
    with cursor() as cur:
        cur.execute(sql, (worker_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def set_progress(job_id: str, progress: float) -> None:
    with cursor() as cur:
        cur.execute(
            "update jobs set progress = %s, updated_at = now() where id = %s",
            (max(0.0, min(1.0, progress)), job_id),
        )


def mark_done(job_id: str, result_keys: dict[str, str], timings_ms: dict[str, float]) -> None:
    with cursor() as cur:
        cur.execute(
            """
            update jobs
               set status = 'done',
                   progress = 1.0,
                   result_keys = %s,
                   timings_ms = %s,
                   completed_at = now(),
                   updated_at = now()
             where id = %s
            """,
            (json.dumps(result_keys), json.dumps(timings_ms), job_id),
        )


def mark_failed(job_id: str, error: str) -> None:
    with cursor() as cur:
        cur.execute(
            """
            update jobs
               set status = 'failed',
                   error = %s,
                   updated_at = now()
             where id = %s
            """,
            (error, job_id),
        )

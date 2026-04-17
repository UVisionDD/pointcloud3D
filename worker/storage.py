"""Cloudflare R2 helper (S3-compatible). Small wrapper around boto3.

Environment:
    R2_ACCOUNT_ID
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable

import boto3
from botocore.client import Config


def _client():
    account = os.environ["R2_ACCOUNT_ID"]
    endpoint = f"https://{account}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def bucket() -> str:
    return os.environ["R2_BUCKET"]


def download_to_path(key: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    _client().download_file(bucket(), key, str(dest))
    return dest


def upload_file(key: str, src: Path, content_type: str | None = None) -> str:
    extra = {"ContentType": content_type} if content_type else {}
    _client().upload_file(str(src), bucket(), key, ExtraArgs=extra or None)
    return key


def upload_many(items: Iterable[tuple[str, Path, str | None]]) -> list[str]:
    """items: iterable of (key, local_path, content_type)."""
    keys: list[str] = []
    for key, path, ct in items:
        upload_file(key, path, ct)
        keys.append(key)
    return keys


def presigned_get(key: str, expires_seconds: int = 60 * 60 * 24 * 7) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket(), "Key": key},
        ExpiresIn=expires_seconds,
    )


CONTENT_TYPES = {
    "ply": "application/octet-stream",
    "stl": "model/stl",
    "glb": "model/gltf-binary",
    "dxf": "application/dxf",
    "xyz": "text/plain",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "bmp": "image/bmp",
}

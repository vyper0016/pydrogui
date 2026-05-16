import logging
import os
import uuid

from fastapi import HTTPException, UploadFile
from werkzeug.utils import secure_filename

EXAMPLES_DIR = '/app/static/binary_examples'
UPLOADS_DIR = '/app/uploads'
MAX_UPLOAD_BYTES = 256 * 1024 * 1024
ELF_MAGIC = b'\x7fELF'

EXAMPLE_PREFIX = 'example:'
UPLOAD_PREFIX = 'upload:'

log = logging.getLogger(__name__)

os.makedirs(UPLOADS_DIR, exist_ok=True)


def strip_and_sanitize(binary_id: str, prefix: str) -> str:
    raw = binary_id[len(prefix):]
    name = secure_filename(raw)
    if not name or name != raw:
        raise HTTPException(status_code=400, detail=f"Malformed binary_id: {binary_id}")
    return name


def list_examples() -> list[dict]:
    out: list[dict] = []
    if not os.path.isdir(EXAMPLES_DIR):
        return out
    for name in sorted(os.listdir(EXAMPLES_DIR)):
        path = os.path.join(EXAMPLES_DIR, name)
        if not os.path.isfile(path):
            continue
        out.append({
            "id": EXAMPLE_PREFIX + name,
            "name": name,
            "size": os.path.getsize(path),
        })
    return out


async def save_upload(file: UploadFile) -> dict:
    head = await file.read(len(ELF_MAGIC))
    if head != ELF_MAGIC:
        raise HTTPException(status_code=400, detail="Invalid binary: ELF magic bytes missing")

    uid = uuid.uuid4().hex
    dest = os.path.join(UPLOADS_DIR, uid)
    total = len(head)
    chunk_size = 1024 * 1024

    try:
        with open(dest, 'wb') as f:
            f.write(head)
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    f.close()
                    os.remove(dest)
                    raise HTTPException(
                        status_code=400,
                        detail=f"Upload exceeds {MAX_UPLOAD_BYTES} bytes",
                    )
                f.write(chunk)
    except HTTPException:
        raise
    except Exception:
        if os.path.exists(dest):
            os.remove(dest)
        raise

    binary_id = UPLOAD_PREFIX + uid
    log.info("binary uploaded id=%s name=%s size=%d", binary_id, file.filename, total)
    return {"id": binary_id, "name": file.filename, "size": total}


def resolve(binary_id: str) -> str:
    if binary_id.startswith(EXAMPLE_PREFIX):
        name = strip_and_sanitize(binary_id, EXAMPLE_PREFIX)
        path = os.path.join(EXAMPLES_DIR, name)
        if not os.path.isfile(path):
            raise HTTPException(status_code=404, detail=f"Binary not found: {binary_id}")
        return path

    if binary_id.startswith(UPLOAD_PREFIX):
        uid = strip_and_sanitize(binary_id, UPLOAD_PREFIX)
        path = os.path.join(UPLOADS_DIR, uid)
        if not os.path.isfile(path):
            raise HTTPException(status_code=404, detail=f"Binary not found: {binary_id}")
        return path

    raise HTTPException(status_code=400, detail=f"Malformed binary_id: {binary_id}")


def delete_upload(binary_id: str) -> None:
    if not binary_id.startswith(UPLOAD_PREFIX):
        return
    try:
        uid = strip_and_sanitize(binary_id, UPLOAD_PREFIX)
    except HTTPException:
        return
    path = os.path.join(UPLOADS_DIR, uid)
    try:
        os.remove(path)
        log.info("upload deleted id=%s", binary_id)
    except FileNotFoundError:
        pass
    except OSError as e:
        log.warning("upload delete failed id=%s err=%s", binary_id, e)

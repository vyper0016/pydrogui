import logging
import time
import uuid
import threading

from fastapi import HTTPException, Header

from _pydrofoil import RISCV64

import binaries

SESSION_TTL_SECONDS = 30 * 60

log = logging.getLogger(__name__)

class Session:
    def __init__(self, binary_id: str) -> None:
        self.binary_id = binary_id
        self.binary_path = binaries.resolve(binary_id)
        self.last_access = time.monotonic()
        self.reset_machine()

    def touch(self) -> None:
        self.last_access = time.monotonic()

    def is_expired(self, now: float) -> bool:
        return now - self.last_access > SESSION_TTL_SECONDS

    def reset_machine(self) -> None:
        self.machine = RISCV64(self.binary_path, dtb=True)
        self.machine.set_verbosity(0)



_sessions: dict[str, Session] = {}
_lock = threading.Lock()


def _pop(sid: str) -> Session | None:
    s = _sessions.pop(sid, None)
    if s is not None:
        binaries.delete_upload(s.binary_id)
    return s


def _purge_expired(now: float) -> None:
    expired = [sid for sid, s in _sessions.items() if s.is_expired(now)]
    for sid in expired:
        _pop(sid)
        log.info("session expired and purged sid=%s", sid)
    if expired:
        log.debug("purge complete count=%d remaining=%d", len(expired), len(_sessions))


def create(binary_id: str) -> str:
    sid = uuid.uuid4().hex
    with _lock:
        _purge_expired(time.monotonic())
        _sessions[sid] = Session(binary_id)
        active = len(_sessions)
    log.info("session created sid=%s binary_id=%s active=%d", sid, binary_id, active)
    return sid


def delete(sid: str) -> bool:
    with _lock:
        existed = _pop(sid) is not None
        active = len(_sessions)
    if existed:
        log.info("session deleted sid=%s active=%d", sid, active)
    else:
        log.warning("session delete miss sid=%s", sid)
    return existed


def list_all() -> list[dict]:
    now = time.monotonic()
    with _lock:
        return [
            {"session_id": sid, "idle_seconds": now - s.last_access, "expired": s.is_expired(now)}
            for sid, s in _sessions.items()
        ]


def get(x_session_id: str = Header(..., description="Session ID from POST /sessions")) -> Session:
    now = time.monotonic()
    with _lock:
        s = _sessions.get(x_session_id)
        if s is None:
            log.warning("session get miss sid=%s", x_session_id)
            raise HTTPException(status_code=404, detail="Session not found or expired")
        if s.is_expired(now):
            log.info("session get expired sid=%s idle=%.1fs", x_session_id, now - s.last_access)
            _pop(x_session_id)
            raise HTTPException(status_code=404, detail="Session not found or expired")
        s.touch()
    log.debug("session hit sid=%s", x_session_id)
    return s

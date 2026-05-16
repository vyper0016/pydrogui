import time
import uuid
import threading
from fastapi import HTTPException, Header
from _pydrofoil import RISCV64

SESSION_TTL_SECONDS = 30 * 60


def _new_machine() -> RISCV64:
    m = RISCV64('/riscv/rv64-linux-4.15.0-gcc-7.2.0-64mb.bbl', dtb=True)
    m.set_verbosity(0)
    return m


class Session:
    def __init__(self) -> None:
        self.machine = _new_machine()
        self.last_access = time.monotonic()

    def touch(self) -> None:
        self.last_access = time.monotonic()

    def is_expired(self, now: float) -> bool:
        return now - self.last_access > SESSION_TTL_SECONDS

    def reset_machine(self) -> None:
        self.machine = _new_machine()


_sessions: dict[str, Session] = {}
_lock = threading.Lock()


def _purge_expired(now: float) -> None:
    expired = [sid for sid, s in _sessions.items() if s.is_expired(now)]
    for sid in expired:
        _sessions.pop(sid, None)


def create() -> str:
    sid = uuid.uuid4().hex
    with _lock:
        _purge_expired(time.monotonic())
        _sessions[sid] = Session()
    return sid


def delete(sid: str) -> bool:
    with _lock:
        return _sessions.pop(sid, None) is not None


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
        if s is None or s.is_expired(now):
            raise HTTPException(status_code=404, detail="Session not found or expired")
        s.last_access = now
        return s

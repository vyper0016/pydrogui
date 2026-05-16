import logging
from typing import List

import fastapi
from fastapi import HTTPException, Query, Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import sessions
from sessions import Session, SESSION_TTL_SECONDS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = fastapi.FastAPI(
    title="PyDroGUI API",
    description="RISC-V simulator control and inspection API"
)
app.mount('/static', StaticFiles(directory='/app/static'), name='static')


@app.post('/sessions', tags=["Sessions"])
def create_session() -> dict:
    """Create new simulator session. Returns session_id to pass as X-Session-Id header."""
    sid = sessions.create()
    return {"session_id": sid, "ttl_seconds": SESSION_TTL_SECONDS}


@app.delete('/sessions/{session_id}', tags=["Sessions"])
def delete_session(session_id: str) -> str:
    if not sessions.delete(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return 'deleted'


@app.get('/test', tags=["UI"])
def test_page() -> FileResponse:
    """Serve the test HTML page."""
    return FileResponse('/app/static/test.html')


@app.get('/hello')
def hello() -> str:
    return 'Hello, world!'


@app.get('/disassemble-last-instruction')
def disassemble_last_instruction(session: Session = Depends(sessions.get)) -> str:
    return session.machine.disassemble_last_instruction()


@app.get('/read-register/{reg_name}')
def read_register(reg_name: str, session: Session = Depends(sessions.get)) -> str:
    try:
        value = session.machine.read_register(reg_name)
        value = hex(value.signed()) if 'signed' in dir(value) else value
        return str(value)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=f"{reg_name}: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{reg_name}: {e}")


@app.get('/read-registers-batch')
def read_registers_batch(
    reg_names: List[str] = Query(...),
    session: Session = Depends(sessions.get),
) -> dict:
    return {reg: read_register(reg, session) for reg in reg_names}


@app.get('/read-memory/{address}/{bits}')
def read_memory(address: int, bits: int, session: Session = Depends(sessions.get)) -> int:
    try:
        return session.machine.read_memory(address, bits)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post('/step')
def step(session: Session = Depends(sessions.get)) -> str:
    """Execute a single instruction"""
    session.machine.step()
    return 'success'


@app.post('/run')
def run(steps: int, session: Session = Depends(sessions.get)) -> str:
    """Execute a specified number of instructions"""
    try:
        session.machine.run(steps)
        return 'success'
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post('/reset')
def reset(session: Session = Depends(sessions.get)) -> str:
    session.reset_machine()
    return 'Simulator reset successfully'

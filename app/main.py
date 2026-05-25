import logging
import os
from typing import List

import fastapi
from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from _pydrofoil import bitvector
import sessions
import binaries
from sessions import Session, SESSION_TTL_SECONDS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = fastapi.FastAPI(
    title="PyDroGUI API",
    description="RISC-V simulator control and inspection API"
)

api = APIRouter(prefix='/api')


@api.get('/binaries/examples', tags=["Binaries"])
def list_binary_examples() -> List[dict]:
    return binaries.list_examples()


@api.post('/binaries', tags=["Binaries"])
async def upload_binary(file: UploadFile = File(...)) -> dict:
    return await binaries.save_upload(file)


@api.post('/disassemble', tags=["Binaries"])
async def disassemble_binary(binary_id: str) -> list[dict]:
    return binaries.disassemble(binary_id)


@api.post('/sessions', tags=["Sessions"])
def create_session(binary_id: str) -> dict:
    """Create new simulator session. Returns session_id to pass as X-Session-Id header."""
    sid = sessions.create(binary_id)
    return {"session_id": sid, "ttl_seconds": SESSION_TTL_SECONDS}


@api.delete('/sessions/{session_id}', tags=["Sessions"])
def delete_session(session_id: str) -> str:
    if not sessions.delete(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return 'deleted'


@api.get('/test')
def test_page() -> FileResponse:
    """Serve the legacy test HTML page."""
    return FileResponse('/app/static/test.html')


@api.get('/hello')
def hello() -> str:
    return 'Hello, world!'


@api.get('/disassemble-last-instruction', tags=["Execution Control"])
def disassemble_last_instruction(session: Session = Depends(sessions.get)) -> str:
    return session.machine.disassemble_last_instruction()


@api.post('/write-register/{reg_name}', tags=["Registers"])
def write_register(reg_name: str, value: int, session: Session = Depends(sessions.get)) -> str:
    try:
        session.machine.write_register(reg_name, value)
        return 'success'
    except ValueError as e:
        raise HTTPException(status_code=404, detail=f"{reg_name}: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{reg_name}: {e}")


@api.get('/read-register/{reg_name}', tags=["Registers"])
def read_register(reg_name: str, session: Session = Depends(sessions.get)) -> str:
    try:
        value = session.machine.read_register(reg_name)
        value = hex(value.signed()) if isinstance(value, bitvector) else value
        return str(value)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=f"{reg_name}: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{reg_name}: {e}")


@api.get('/read-registers-batch', tags=["Registers"])
def read_registers_batch(
    reg_names: List[str] = Query(...),
    session: Session = Depends(sessions.get),
) -> dict:
    return {reg: read_register(reg, session) for reg in reg_names}


@api.get('/read-memory/{address}/{bits}', tags=["Memory"])
def read_memory(address: int, bits: int, session: Session = Depends(sessions.get)) -> int:
    try:
        return session.machine.read_memory(address, bits)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.post('/step', tags=["Execution Control"])
def step(session: Session = Depends(sessions.get)) -> str:
    """Execute a single instruction"""
    session.machine.step()
    return 'success'


@api.post('/run', tags=["Execution Control"])
def run(steps: int, session: Session = Depends(sessions.get)) -> str:
    """Execute a specified number of instructions"""
    try:
        session.machine.run(steps)
        return 'success'
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.post('/reset', tags=["Execution Control"])
def reset(session: Session = Depends(sessions.get)) -> str:
    session.reset_machine()
    return 'Simulator reset successfully'


app.include_router(api)
app.mount('/static', StaticFiles(directory='/app/static'), name='static')

FRONTEND_DIR = '/frontend-dist'
if os.path.isdir(FRONTEND_DIR):
    app.mount('/', StaticFiles(directory=FRONTEND_DIR, html=True), name='frontend')



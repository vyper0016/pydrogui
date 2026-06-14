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

ALL_REG_NAMES: list[str] = [
    'pc', 'nextpc', 'instbits', 'cur_privilege',
    *[f'x{i}' for i in range(1, 32)],
    'mstatus', 'misa',
    'mtvec', 'mcause', 'mepc', 'mtval',
    'stvec', 'scause', 'sepc', 'stval',
    'satp', 'mip', 'mie',
    *[f'f{i}' for i in range(32)], 'fcsr',
    *[f'vr{i}' for i in range(32)], 'vtype', 'vl', 'vstart', 'vlenb',
    'mcycle', 'minstret', 'mtime', 'mtimecmp',
]


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
def write_register(reg_name: str, value_str: str, session: Session = Depends(sessions.get)) -> str:
    try:
        value = str_to_int(value_str)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid value: {value_str} for register {reg_name}")
    
    try:            
        session.machine.write_register(reg_name, value)
        return 'success'
    except ValueError as e:
        raise HTTPException(status_code=404, detail=f"{reg_name}: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{reg_name}: {e}")


def str_to_int(s: str) -> int:
    if s.startswith('0x'):
        value = int(s, 16)
    else:
        value = int(s)
    return value


@api.get('/read-register/{reg_name}', tags=["Registers"])
def read_register(reg_name: str, session: Session = Depends(sessions.get)) -> str:
    try:
        return session.machine.read_register(reg_name)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=f"{reg_name}: {e}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{reg_name}: {e}")


@api.get('/read-registers-batch', tags=["Registers"])
def read_registers_batch(
    reg_names: List[str] = Query(..., description="Register names, or 'all' to fetch a standard set of registers"),
    session: Session = Depends(sessions.get),
) -> dict:
    if reg_names == ['all']:
        reg_names = ALL_REG_NAMES
    return {reg: read_register(reg, session) for reg in reg_names}


@api.get('/read-memory-page/{address}', tags=["Memory"])
def read_memory_page(address: str, session: Session = Depends(sessions.get)) -> dict:
    try:
        return session.machine.read_memory_page(str_to_int(address))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.post('/set-memory-page-size', tags=["Memory"], response_description="Set the memory page size for read_memory_page. Returns success or error message.")
def set_memory_page_size(page_size: int, session: Session = Depends(sessions.get)) -> dict:
    try:
        session.machine.set_mem_page_size(page_size)
        return {'status': 'success'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    
@api.post('/write-memory', tags=["Memory"])
def write_memory(address: str, value: str, width: int = 8, session: Session = Depends(sessions.get)) -> dict:
    try:        
        session.machine.write_memory(str_to_int(address), str_to_int(value), width)
        return {'status': 'success'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.post('/step-mem', tags=["Execution Control"])
def step_mem(session: Session = Depends(sessions.get)) -> list[dict]:
    """Step the machine and return a list of memory accesses"""
    try:
        return session.machine.step_mem()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.post('/run', tags=["Execution Control"])
def run(steps: int, session: Session = Depends(sessions.get)) -> list[dict]:
    """Execute a specified number of instructions"""
    try:        
        return session.machine.run_for_steps(steps)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.post('/run-until-breakpoint', tags=["Execution Control"])
def run_until_breakpoint(session: Session = Depends(sessions.get)) -> list[dict]:
    """Run the machine until a breakpoint is hit, and return a list of all memory accesses during the run."""
    try:
        return session.machine.run_until_breakpoint()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    
@api.post('/add-breakpoint', tags=["Execution Control"])
def add_breakpoint(address: str, session: Session = Depends(sessions.get)) -> list[int]:
    try:        
        session.machine.add_breakpoint(str_to_int(address))
        return session.machine.list_breakpoints()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    

@api.post('/remove-breakpoint', tags=["Execution Control"])
def remove_breakpoint(address: str, session: Session = Depends(sessions.get)) -> list[int]:
    try:        
        session.machine.remove_breakpoint(str_to_int(address))
        return session.machine.list_breakpoints()
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@api.get('/list-breakpoints', tags=["Execution Control"])
def list_breakpoints(session: Session = Depends(sessions.get)) -> list[int]:
    return session.machine.list_breakpoints()


@api.post('/reset-breakpoints', tags=["Execution Control"])
def reset_breakpoints(session: Session = Depends(sessions.get)) -> list[int]:
    try:
        session.machine.reset_breakpoints()
        return session.machine.list_breakpoints()
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



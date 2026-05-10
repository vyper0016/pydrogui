from _pydrofoil import RISCV64
import fastapi
from fastapi import HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = fastapi.FastAPI(
    title="PyDroGUI API",
    description="RISC-V simulator control and inspection API"
)
app.mount('/static', StaticFiles(directory='/app'), name='static')

@app.get('/test', tags=["UI"])
def test_page() -> FileResponse:
    """Serve the test HTML page."""
    return FileResponse('/app/test.html')

@app.get('/hello')
def hello() -> str:
    return 'Hello, world!'

@app.get('/disassemble-last-instruction')
def disassemble_last_instruction() -> str:
    return m.disassemble_last_instruction()

@app.get('/read-register/{reg_name}')
def read_register(reg_name: str) -> str:
    try:
        value = m.read_register(reg_name)
        return str(value)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
@app.get('/read-memory/{address}/{bits}')
def read_memory(address: int, bits: int) -> int:
    try:
        value = m.read_memory(address, bits)
        return value
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post('/step')
def step() -> str:
    """Execute a single instruction"""
    m.step()
    return 'success'

@app.post('/run/{steps}')
def run(steps: int) -> str:
    '''Execute a specified number of instructions'''
    try:
        m.run(steps)
        return 'success'
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post('/reset')
def reset() -> str:
    global m
    m = RISCV64('/riscv/rv64-linux-4.15.0-gcc-7.2.0-64mb.bbl', dtb=True)
    m.set_verbosity(0)
    return 'Simulator reset successfully'

reset()

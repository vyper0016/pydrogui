from _pydrofoil import RISCV64
import fastapi
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

@app.post('/step')
def step() -> str:
    """Execute a single instruction"""
    m.step()
    return 'success'

@app.get('/disassemble-last-instruction')
def disassemble_last_instruction() -> str:
    """Get the disassembled representation of the last executed instruction."""
    return m.disassemble_last_instruction()

@app.get('/read-register/{reg_name}')
def read_register(reg_name: str) -> str:
    """Read the value of a register."""
    try:
        value = m.read_register(reg_name)
        return str(value)
    except Exception as e:
        return f"Error: {str(e)}"

@app.post('/reset')
def reset() -> str:
    """Reset the simulator to its initial state."""
    global m
    m = RISCV64('/riscv/rv64-linux-4.15.0-gcc-7.2.0-64mb.bbl', dtb=True)
    m.set_verbosity(0)
    return 'Simulator reset successfully'

reset()

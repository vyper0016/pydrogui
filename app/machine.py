
from _pydrofoil import RISCV64
import logging

log = logging.getLogger(__name__)

class Machine:
    def __init__(self, binary_path: str) -> None:
        self.binary_path = binary_path
        self.reset()

    def reset(self) -> None:
        self._inner = RISCV64(self.binary_path, dtb=True)
        self._inner.set_verbosity(0)

    def __getattr__(self, name: str):
        # delegate everything else (read_register, step, run, ...) to RISCV64
        return getattr(self._inner, name)

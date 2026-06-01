
from _pydrofoil import RISCV64
import logging

log = logging.getLogger(__name__)

PAGE_SIZE = 16 * 16 # bytes
WIDTH = 1 # bytes

class Machine:
    def __init__(self, binary_path: str) -> None:
        self.binary_path = binary_path
        self.reset()

    def reset(self) -> None:
        self._inner = RISCV64(self.binary_path, dtb=True)
        self._inner.set_verbosity(0)
        log.info("machine reset binary_path=%s", self.binary_path)

    def __getattr__(self, name: str):
        # delegate everything else (read_register, step, run, ...) to RISCV64
        return getattr(self._inner, name)

    def clamp_address(self, addr: int) -> int:
        '''Clamp the address to the start of its memory page.'''
        log.debug("clamping address addr=0x%X to 0x%X", addr, addr - (addr % PAGE_SIZE))
        return addr - (addr % PAGE_SIZE)
    
    def read_memory_page(self, addr: int) -> dict:
        page_start = self.clamp_address(addr)
        values = [self._inner.read_memory(page_start + offset, WIDTH) for offset in range(PAGE_SIZE)]
        return {'start': hex(page_start), 'values': values, 'page_size': PAGE_SIZE, 'step': WIDTH}

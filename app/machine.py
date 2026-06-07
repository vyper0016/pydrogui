
from _pydrofoil import RISCV64
import logging

log = logging.getLogger(__name__)

WIDTH = 1 # bytes

class Machine:
    def __init__(self, binary_path: str, page_size: int = 16*16) -> None:
        self.binary_path = binary_path
        self.page_size = page_size # bytes per page
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
        log.debug("clamping address addr=0x%X to 0x%X", addr, addr - (addr % self.page_size))
        return addr - (addr % self.page_size)
    
    def read_memory_page(self, addr: int) -> dict:
        page_start = self.clamp_address(addr)
        values = [self._inner.read_memory(page_start + offset, WIDTH) for offset in range(self.page_size)]
        return {'start': hex(page_start), 'values': values, 'page_size': self.page_size, 'step': WIDTH}

    def set_mem_page_size(self, page_size: int) -> None:
        self.page_size = page_size
        log.info("page size set to %d bytes", self.page_size)
        
    def step_mem(self) -> list[dict]:
        '''Step the machine and return a list of memory accesses'''
        accessed = self._inner.step_monitor_mem()
        return [{'type': type, 'addr': hex(addr), 'width': width, 'value': value} for type, addr, width, value in accessed]
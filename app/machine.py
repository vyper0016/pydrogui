
from _pydrofoil import RISCV64, bitvector
import logging
import os
import tempfile

log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)

WIDTH = 1 # bytes
MEM_HISTORY_LIMIT = 1000

class Machine:
    def __init__(self, binary_path: str, page_size: int = 16*16) -> None:
        self.binary_path = binary_path
        self.page_size = page_size # bytes per page
        self.term_file = None
        self.reset()
        self.memory_ranges = self._inner.memory_info()
        self.breakpoints = set()

    def reset(self) -> None:
        self.close_term()
        self.term_file = tempfile.TemporaryFile()
        self._inner = RISCV64(self.binary_path, dtb=True)
        self._inner.set_verbosity(0)
        self._inner.set_term_fd(self.term_file.fileno())
        self.step_count = 0
        self.memory_history = []
        log.info(f"machine reset binary_path={self.binary_path}")

    def read_term(self, offset: int = 0) -> dict:
        '''Return terminal output from a byte offset, plus the offset to ask for next time.'''
        data = os.pread(self.term_file.fileno(), 1 << 20, offset)
        return {'data': data.decode('utf-8', errors='replace'), 'next_offset': offset + len(data)}

    def close_term(self) -> None:
        if self.term_file is not None:
            self.term_file.close()
            self.term_file = None

    def __getattr__(self, name: str):
        # delegate everything else (read_register, step, run, ...) to RISCV64
        if name == "_inner":
            raise AttributeError(name)
        return getattr(self._inner, name)

    def read_register(self, reg_name: str) -> str:
        value = self._inner.read_register(reg_name)
        value = hex(value.signed()) if isinstance(value, bitvector) else value
        return str(value)
    
    def add_memory_access(self, type: str, addr: int, width: int, value: int) -> None:
        self.memory_history.append({'step': self.step_count, 'type': type, 'addr': hex(addr), 'width': width, 'value': value})
        if len(self.memory_history) > MEM_HISTORY_LIMIT:
            self.memory_history.pop(0)
    
    def read_register_raw(self, reg_name: str) -> int:
        return self._inner.read_register(reg_name).signed()
    
    def clamp_address(self, addr: int) -> int:
        '''Clamp the address to the start of its memory page, kept inside a valid memory range.'''
        page_start = addr - (addr % self.page_size)
        for start, end in self.memory_ranges:
            if start <= addr < end:
                # page may start before the range when range start is not page-aligned
                page_start = max(page_start, start)
                break
        log.debug(f"clamping address addr={hex(addr)} to {hex(page_start)}")
        return page_start
    
    def read_memory_page(self, addr: int) -> dict:
        page_start = self.clamp_address(addr)
        values = []
        for offset in range(self.page_size):
            a = page_start + offset
            try:                
                values.append(self._inner.read_memory(a, WIDTH))
            except Exception as e:
                log.error(f"failed to read memory at addr={hex(a)}: {e}")
                log.error(f"page start: {hex(page_start)}, page size: {self.page_size}, width: {WIDTH}")
                raise e
        return {'start': hex(page_start), 'values': values, 'page_size': self.page_size, 'step': WIDTH}

    def set_mem_page_size(self, page_size: int) -> None:
        self.page_size = page_size
        log.info(f"page size set to {self.page_size} bytes")
        
    def step_mem(self) -> None:
        '''Step the machine and return a list of memory accesses'''
        accessed = self._inner.step_monitor_mem()
        self.step_count += 1
        for type, addr, width, value in accessed:
            self.add_memory_access(type, addr, width, value)
    
    def add_breakpoint(self, addr: int) -> None:
        self.breakpoints.add(addr)
        log.info(f"breakpoint added at addr={hex(addr)}")
        
    def remove_breakpoint(self, addr: int) -> None:
        self.breakpoints.discard(addr)
        log.info(f"breakpoint removed at addr={hex(addr)}")
        
    def list_breakpoints(self) -> list[int]:
        return sorted(self.breakpoints)
    
    def reset_breakpoints(self) -> None:
        self.breakpoints.clear()
        log.info("all breakpoints cleared")
        
    #TODO: stop execution if running into an infinite loop without hitting a breakpoint
    def run_until_breakpoint(self) -> None:
        '''Run the machine until a breakpoint is hit, and return a list of all memory accesses during the run.'''
        while True:
            self.step_mem()
            pc = self.read_register_raw("pc")
            if pc in self.breakpoints:
                log.info(f"hit breakpoint at addr={hex(pc)}")
                break

    def run_for_steps(self, steps: int) -> None:
        '''Run the machine for a given number of steps, and return a list of all memory accesses during the run.'''
        for _ in range(steps):
            self.step_mem()
            pc = self.read_register_raw("pc")
            if pc in self.breakpoints:
                log.info(f"hit breakpoint at addr={hex(pc)}")
                break
    
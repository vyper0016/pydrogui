class bitvector:
    def signed(self) -> int:
        ...
    
class RISCV64:
    def read_register(self, reg: str) -> bitvector|str:
        ...
        
    def read_memory(self, addr: int, width: int = 8) -> int:
        ...
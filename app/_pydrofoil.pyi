class bitvector:
    def signed(self) -> int:
        ...
    
class RISCV64:
    def read_register(self, reg: str) -> bitvector|str:
        ...
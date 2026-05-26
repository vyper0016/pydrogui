export type RegMap = Record<string, string>

export type FlashKind = 'yellow' | 'green' | 'red'
export type FlashState = { kind: FlashKind; seq: number }
export type FlashMap = Record<string, FlashState>

const range = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${start + i}`)

export const CORE_REGS = [
  'pc', 'nextpc', 'instbits', 'cur_privilege',
  ...range('x', 1, 31),
]

export const CSR_REGS = [
  'mstatus', 'misa',
  'mtvec', 'mcause', 'mepc', 'mtval',
  'stvec', 'scause', 'sepc', 'stval',
  'satp', 'mip', 'mie',
]

export const FLOAT_REGS = [...range('f', 0, 31), 'fcsr']

export const VECTOR_REGS = [...range('vr', 0, 31), 'vtype', 'vl', 'vstart', 'vlenb']

export const COUNTER_REGS = ['mcycle', 'minstret', 'mtime', 'mtimecmp']

export const READ_ALL_REGS_URL = '/read-registers-batch?reg_names=all'

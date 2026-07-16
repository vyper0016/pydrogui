import type { DisasmItem } from './disasm'

export const SESSION_KEY = 'pydrogui.session_id'
export const BINARY_NAME_KEY = 'pydrogui.binary_name'
export const BINARY_ID_KEY = 'pydrogui.binary_id'
export const NAME_MODE_KEY = 'pydrogui.name_mode'
export const THEME_KEY = 'pydrogui.theme'
export const DISASM_HEIGHT_KEY = 'pydrogui.disasm_height_px'
export const MEM_ADDR_KEY = 'pydrogui.mem_addr'
export const MEM_COLS_KEY = 'pydrogui.mem_cols'
export const MEM_ROWS_KEY = 'pydrogui.mem_rows'
export const MEM_HISTORY_HEIGHT_KEY = 'pydrogui.mem_history_height_px'
export const TERM_HEIGHT_KEY = 'pydrogui.term_height_px'
const DISASM_KEY_PREFIX = 'pydrogui.disasm.'

export function loadCachedDisasm(binaryId: string): DisasmItem[] | null {
  const raw = localStorage.getItem(DISASM_KEY_PREFIX + binaryId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DisasmItem[]
  } catch {
    return null
  }
}

export function cacheDisasm(binaryId: string, data: DisasmItem[]): void {
  try {
    localStorage.setItem(DISASM_KEY_PREFIX + binaryId, JSON.stringify(data))
  } catch {
    // quota exceeded — skip persistence, keep in memory
  }
}

export function pruneDisasmCache(keepId: string | null): void {
  const keepKey = keepId ? DISASM_KEY_PREFIX + keepId : null
  const toRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(DISASM_KEY_PREFIX) && k !== keepKey) {
      toRemove.push(k)
    }
  }
  for (const k of toRemove) localStorage.removeItem(k)
}

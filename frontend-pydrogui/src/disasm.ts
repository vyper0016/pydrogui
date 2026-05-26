import { API } from './api'

export type DisasmItem =
  | { type: 'section'; name: string }
  | { type: 'label'; pc: string; name: string }
  | {
      type: 'instruction'
      pc: string
      bytes: string
      instruction: string
      operands?: string[]
      comment?: string
    }

export async function fetchDisassembly(binaryId: string): Promise<DisasmItem[]> {
  const res = await fetch(
    `${API}/disassemble?binary_id=${encodeURIComponent(binaryId)}`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Disassemble failed: ${await res.text()}`)
  return res.json()
}

export function normalizePc(pc: string | undefined): string | null {
  if (!pc) return null
  const m =
    pc.trim().match(/^(-?)0x([0-9a-fA-F]+)$/) ?? pc.trim().match(/^(-?)([0-9a-fA-F]+)$/)
  if (!m) return null
  const sign = m[1]
  const hex = m[2].replace(/^0+/, '') || '0'
  return `${sign}0x${hex.toLowerCase()}`
}

export function normalizeDisasmPcs(items: DisasmItem[]): DisasmItem[] {
  return items.map((d) => {
    if (d.type === 'instruction') return { ...d, pc: normalizePc(d.pc) ?? d.pc }
    if (d.type === 'label') return { ...d, pc: normalizePc(d.pc) ?? d.pc }
    return d
  })
}

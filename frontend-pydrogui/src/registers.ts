export type RegInfo = { abi: string; desc: string }

function build(): Record<string, RegInfo> {
  const out: Record<string, RegInfo> = {}

  out['pc'] = { abi: 'pc', desc: 'Program counter' }

  out['x0'] = { abi: 'zero', desc: 'Hard-wired zero' }
  out['x1'] = { abi: 'ra', desc: 'Return address' }
  out['x2'] = { abi: 'sp', desc: 'Stack pointer' }
  out['x3'] = { abi: 'gp', desc: 'Global pointer' }
  out['x4'] = { abi: 'tp', desc: 'Thread pointer' }

  for (let i = 5; i <= 7; i++) {
    out[`x${i}`] = { abi: `t${i - 5}`, desc: 'Temporary' }
  }
  out['x8'] = { abi: 's0/fp', desc: 'Saved register / frame pointer' }
  out['x9'] = { abi: 's1', desc: 'Saved register' }
  for (let i = 10; i <= 11; i++) {
    out[`x${i}`] = { abi: `a${i - 10}`, desc: 'Function argument / return value' }
  }
  for (let i = 12; i <= 17; i++) {
    out[`x${i}`] = { abi: `a${i - 10}`, desc: 'Function argument' }
  }
  for (let i = 18; i <= 27; i++) {
    out[`x${i}`] = { abi: `s${i - 16}`, desc: 'Saved register' }
  }
  for (let i = 28; i <= 31; i++) {
    out[`x${i}`] = { abi: `t${i - 25}`, desc: 'Temporary' }
  }

  for (let i = 0; i <= 7; i++) {
    out[`f${i}`] = { abi: `ft${i}`, desc: 'FP temporary' }
  }
  for (let i = 8; i <= 9; i++) {
    out[`f${i}`] = { abi: `fs${i - 8}`, desc: 'FP saved register' }
  }
  for (let i = 10; i <= 11; i++) {
    out[`f${i}`] = { abi: `fa${i - 10}`, desc: 'FP argument / return value' }
  }
  for (let i = 12; i <= 17; i++) {
    out[`f${i}`] = { abi: `fa${i - 10}`, desc: 'FP argument' }
  }
  for (let i = 18; i <= 27; i++) {
    out[`f${i}`] = { abi: `fs${i - 16}`, desc: 'FP saved register' }
  }
  for (let i = 28; i <= 31; i++) {
    out[`f${i}`] = { abi: `ft${i - 20}`, desc: 'FP temporary' }
  }

  return out
}

export const REG_INFO: Record<string, RegInfo> = build()

export type NameMode = 'reg' | 'abi'

export function displayName(reg: string, mode: NameMode): string {
  if (mode === 'abi') {
    const info = REG_INFO[reg]
    if (info) return info.abi
  }
  return reg
}

export function describe(reg: string): string | undefined {
  return REG_INFO[reg]?.desc
}

import { useState, useEffect } from 'react'

async function apiFetch(path: string, method = 'GET') {
  const res = await fetch(path, { method })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

async function apiFetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const range = (prefix: string, start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, i) => `${prefix}${start + i}`)

const CORE_REGS = [
  'pc', 'nextpc', 'instbits', 'cur_privilege',
  ...range('x', 1, 31),
]

const CSR_REGS = [
  'mstatus', 'misa',
  'mtvec', 'mcause', 'mepc', 'mtval',
  'stvec', 'scause', 'sepc', 'stval',
  'satp', 'mip', 'mie',
]

const FLOAT_REGS = [...range('f', 0, 31), 'fcsr']

const VECTOR_REGS = [...range('vr', 0, 31), 'vtype', 'vl', 'vstart', 'vlenb']

const COUNTER_REGS = ['mcycle', 'minstret', 'mtime', 'mtimecmp']

const ALL_REGS = [
  ...CORE_REGS, ...CSR_REGS, ...FLOAT_REGS, ...VECTOR_REGS, ...COUNTER_REGS,
]

function buildBatchUrl(regs: string[]): string {
  const params = regs.map((r) => `reg_names=${encodeURIComponent(r)}`).join('&')
  return `/read-registers-batch?${params}`
}

type RegMap = Record<string, string>

function RegList({ regs, values }: { regs: string[]; values: RegMap }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
      {regs.map((r) => (
        <div key={r} className="contents">
          <span className="text-gray-600">{r}</span>
          <span className="text-gray-900 break-all">{values[r] ?? ''}</span>
        </div>
      ))}
    </div>
  )
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex justify-between items-center bg-gray-50 hover:bg-gray-100 text-left font-semibold text-sm text-gray-700 cursor-pointer"
      >
        <span>{title}</span>
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  )
}

export default function App() {
  const [regs, setRegs] = useState<RegMap>({})
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState('')

  async function updateDisplay() {
    try {
      const [regMap, instVal] = await Promise.all([
        apiFetchJson<RegMap>(buildBatchUrl(ALL_REGS)),
        apiFetch('/disassemble-last-instruction'),
      ])
      setRegs(regMap)
      setInstruction(instVal)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function step() {
    try {
      await apiFetch('/step', 'POST')
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function reset() {
    try {
      await apiFetch('/reset', 'POST')
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => { updateDisplay() }, [])

  return (
    <div className="mx-auto p-6 font-sans grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">RISC-V Simulator</h1>

        <div className="mb-8 space-y-4">
          <div className="flex flex-col gap-1">
            <button
              onClick={step}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded cursor-pointer text-base"
            >
              Step
            </button>
            <span className="text-sm text-gray-500">Execute one instruction</span>
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={reset}
              className="px-6 py-3 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white font-bold rounded cursor-pointer text-base"
            >
              Reset
            </button>
            <span className="text-sm text-gray-500">Reset the simulator</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="font-bold text-gray-700">Last Instruction (Disassembled)</label>
            <input
              type="text"
              readOnly
              value={instruction}
              className="px-3 py-2 font-mono text-sm border border-gray-300 rounded bg-gray-50"
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600">Error: {error}</p>
        )}
      </div>

      <aside className="space-y-3">
        <Section title="Core">
          <RegList regs={CORE_REGS} values={regs} />
        </Section>
        <Section title="CSRs">
          <RegList regs={CSR_REGS} values={regs} />
        </Section>
        <Section title="Float" defaultOpen={false}>
          <RegList regs={FLOAT_REGS} values={regs} />
        </Section>
        <Section title="Vector" defaultOpen={false}>
          <RegList regs={VECTOR_REGS} values={regs} />
        </Section>
        <Section title="Counters" defaultOpen={false}>
          <RegList regs={COUNTER_REGS} values={regs} />
        </Section>
      </aside>
    </div>
  )
}

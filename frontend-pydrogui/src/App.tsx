import { useState, useEffect, useRef } from 'react'

const API = '/api'
const SESSION_KEY = 'pydrogui.session_id'
const BINARY_NAME_KEY = 'pydrogui.binary_name'

let sessionId: string | null = localStorage.getItem(SESSION_KEY)

type BinaryItem = { id: string; name: string; size: number }

async function listExamples(): Promise<BinaryItem[]> {
  const res = await fetch(API + '/binaries/examples')
  if (!res.ok) throw new Error(`List examples failed: ${await res.text()}`)
  return res.json()
}

async function uploadBinary(file: File): Promise<BinaryItem> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(API + '/binaries', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
  return res.json()
}

async function createSession(binaryId: string): Promise<string> {
  const res = await fetch(`${API}/sessions?binary_id=${encodeURIComponent(binaryId)}`, { method: 'POST' })
  if (!res.ok) throw new Error(`Create session failed: ${await res.text()}`)
  const data = await res.json() as { session_id: string }
  sessionId = data.session_id
  localStorage.setItem(SESSION_KEY, sessionId)
  return sessionId
}

async function deleteSession(sid: string): Promise<void> {
  try {
    await fetch(`${API}/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' })
  } catch {
    // best-effort; server will purge expired anyway
  }
}

class NoSessionError extends Error {
  constructor() { super('No active session. Pick a binary to start.') }
}

async function rawFetch(path: string, method: string): Promise<Response> {
  if (!sessionId) throw new NoSessionError()
  return fetch(API + path, { method, headers: { 'X-Session-Id': sessionId } })
}

class SessionExpiredError extends Error {
  constructor() { super('Session expired. Pick a binary to start a new one.') }
}

async function checkSession(res: Response): Promise<Response> {
  if (res.status === 404) {
    const body = await res.clone().text()
    if (body.includes('Session not found') || body.includes('expired')) {
      sessionId = null
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(BINARY_NAME_KEY)
      throw new SessionExpiredError()
    }
  }
  return res
}

async function apiFetch(path: string, method = 'GET'): Promise<string> {
  const res = await checkSession(await rawFetch(path, method))
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

async function apiFetchJson<T>(path: string, method = 'GET'): Promise<T> {
  const res = await checkSession(await rawFetch(path, method))
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
  const [runSteps, setRunSteps] = useState(100)
  const [examples, setExamples] = useState<BinaryItem[]>([])
  const [pickedId, setPickedId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean>(sessionId !== null)
  const [loadedName, setLoadedName] = useState<string>(localStorage.getItem(BINARY_NAME_KEY) ?? '')
  const [loadStatus, setLoadStatus] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState<boolean>(sessionId === null)
  const inited = useRef(false)

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

  async function run() {
    try {
      await apiFetch(`/run?steps=${runSteps}`, 'POST')
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

  async function endSession() {
    const old = sessionId
    sessionId = null
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(BINARY_NAME_KEY)
    setHasSession(false)
    setLoadedName('')
    setLoadStatus('')
    setPickerOpen(true)
    setRegs({})
    setInstruction('')
    if (old) await deleteSession(old)
  }

  async function startSession(binaryId: string, name: string) {
    setError('')
    setLoadStatus(`Loading ${name}…`)
    try {
      await endSession()
      await createSession(binaryId)
      setHasSession(true)
      setLoadedName(name)
      localStorage.setItem(BINARY_NAME_KEY, name)
      setLoadStatus(`Loaded ${name}`)
      setPickerOpen(false)
      await updateDisplay()
    } catch (err) {
      setLoadStatus('')
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onUpload(file: File) {
    setError('')
    setUploading(true)
    setLoadStatus(`Uploading ${file.name}…`)
    try {
      const item = await uploadBinary(file)
      await startSession(item.id, item.name)
    } catch (err) {
      setLoadStatus('')
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    if (inited.current) return
    inited.current = true
    listExamples()
      .then((items) => {
        setExamples(items)
        if (items.length > 0) setPickedId(items[0].id)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    if (sessionId) updateDisplay()
  }, [])

  return (
    <div className="mx-auto p-6 font-sans grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">RISC-V Simulator</h1>

        {hasSession && !pickerOpen ? (
          <div className="mb-4 flex items-center gap-2 text-xs text-gray-600">
            <span>
              Loaded <span className="font-mono text-gray-800">{loadedName}</span>
            </span>
            <button
              onClick={() => setPickerOpen(true)}
              className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
            >
              Change
            </button>
            <button
              onClick={endSession}
              className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
            >
              End
            </button>
          </div>
        ) : (
          <div className="mb-4 p-3 border border-gray-200 rounded space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700">
                {hasSession ? (
                  <>Loaded: <span className="font-mono">{loadedName}</span></>
                ) : 'Pick a binary to start:'}
              </div>
              {hasSession && (
                <button
                  onClick={() => setPickerOpen(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  ▴ hide
                </button>
              )}
            </div>
            {hasSession && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Loading a new binary will end the current session.
              </div>
            )}
            <div className="flex gap-2 items-center">
              <select
                value={pickedId}
                onChange={(e) => setPickedId(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {examples.length === 0 && <option value="">(no examples)</option>}
                {examples.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const picked = examples.find((b) => b.id === pickedId)
                  if (picked) startSession(picked.id, picked.name)
                }}
                disabled={!pickedId}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 cursor-pointer"
              >
                Load example
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onUpload(f)
                  e.target.value = ''
                }}
                disabled={uploading}
                className="flex-1 text-sm"
              />
            </div>
            {loadStatus && (
              <div className={`text-xs ${loadStatus.startsWith('Loaded') ? 'text-green-700' : 'text-gray-600'}`}>
                {loadStatus}
              </div>
            )}
            {hasSession && (
              <button
                onClick={endSession}
                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
              >
                End session
              </button>
            )}
          </div>
        )}

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
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={runSteps}
                onChange={(e) => setRunSteps(Number(e.target.value))}
                className="w-24 px-3 py-3 border border-gray-300 rounded text-base"
              />
              <button
                onClick={run}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded cursor-pointer text-base"
              >
                Run
              </button>
            </div>
            <span className="text-sm text-gray-500">Execute N instructions</span>
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

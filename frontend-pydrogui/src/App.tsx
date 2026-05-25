import { useState, useEffect, useRef, useMemo } from 'react'

const API = '/api'
const SESSION_KEY = 'pydrogui.session_id'
const BINARY_NAME_KEY = 'pydrogui.binary_name'
const BINARY_ID_KEY = 'pydrogui.binary_id'
const DISASM_KEY_PREFIX = 'pydrogui.disasm.'

let sessionId: string | null = localStorage.getItem(SESSION_KEY)

type BinaryItem = { id: string; name: string; size: number }

type DisasmItem =
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

async function fetchDisassembly(binaryId: string): Promise<DisasmItem[]> {
  const res = await fetch(
    `${API}/disassemble?binary_id=${encodeURIComponent(binaryId)}`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Disassemble failed: ${await res.text()}`)
  return res.json()
}

function loadCachedDisasm(binaryId: string): DisasmItem[] | null {
  const raw = localStorage.getItem(DISASM_KEY_PREFIX + binaryId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DisasmItem[]
  } catch {
    return null
  }
}

function cacheDisasm(binaryId: string, data: DisasmItem[]): void {
  try {
    localStorage.setItem(DISASM_KEY_PREFIX + binaryId, JSON.stringify(data))
  } catch {
    // quota exceeded — skip persistence, keep in memory
  }
}

function pruneDisasmCache(keepId: string | null): void {
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
      localStorage.removeItem(BINARY_ID_KEY)
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

function normalizePc(pc: string | undefined): string | null {
  if (!pc) return null
  const m = pc.trim().match(/^(-?)0x([0-9a-fA-F]+)$/) ?? pc.trim().match(/^(-?)([0-9a-fA-F]+)$/)
  if (!m) return null
  const sign = m[1]
  const hex = m[2].replace(/^0+/, '') || '0'
  return `${sign}0x${hex.toLowerCase()}`
}

type RegMap = Record<string, string>

function RegList({
  regs,
  values,
  flashSeq,
}: {
  regs: string[]
  values: RegMap
  flashSeq: Record<string, number>
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs">
      {regs.map((r) => {
        const seq = flashSeq[r] ?? 0
        return (
          <div key={r} className="contents">
            <span className="text-gray-600">{r}</span>
            <span
              key={seq}
              className={'text-gray-900 break-all px-1 -mx-1' + (seq > 0 ? ' reg-flash' : '')}
            >
              {values[r] ?? ''}
            </span>
          </div>
        )
      })}
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

type ScrollRequest = { pc: string; seq: number }

function DisasmView({
  items,
  pc,
  scrollRequest,
}: {
  items: DisasmItem[]
  pc: string | null
  scrollRequest: ScrollRequest | null
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [activeVisible, setActiveVisible] = useState(true)
  const [activeDir, setActiveDir] = useState<'up' | 'down'>('down')

  useEffect(() => {
    const w = wrapperRef.current
    if (!w) return
    const saved = localStorage.getItem('pydrogui.disasm_height_px')
    if (saved) w.style.height = `${parseInt(saved, 10)}px`
    const ro = new ResizeObserver(([entry]) => {
      localStorage.setItem(
        'pydrogui.disasm_height_px',
        String(Math.round(entry.contentRect.height)),
      )
    })
    ro.observe(w)
    return () => ro.disconnect()
  }, [])

  function centerInView(el: HTMLElement) {
    const c = containerRef.current
    if (!c) return
    const offset = el.offsetTop - c.offsetTop - c.clientHeight / 2 + el.clientHeight / 2
    c.scrollTo({ top: offset, behavior: 'smooth' })
  }

  function scrollToCurrent() {
    if (activeRef.current) centerInView(activeRef.current)
  }

  useEffect(() => {
    if (activeRef.current) centerInView(activeRef.current)
  }, [pc, items])

  useEffect(() => {
    if (!activeRef.current || !containerRef.current) return
    const root = containerRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        setActiveVisible(entry.isIntersecting)
        if (!entry.isIntersecting) {
          const rootRect = root.getBoundingClientRect()
          setActiveDir(entry.boundingClientRect.top < rootRect.top ? 'up' : 'down')
        }
      },
      { root, threshold: 0.1 },
    )
    observer.observe(activeRef.current)
    return () => observer.disconnect()
  }, [pc, items])

  useEffect(() => {
    if (!scrollRequest || !containerRef.current) return
    const el = containerRef.current.querySelector(
      `[data-pc="${scrollRequest.pc}"]`,
    ) as HTMLElement | null
    if (!el) return
    centerInView(el)
    el.classList.remove('disasm-flash')
    void el.offsetWidth
    el.classList.add('disasm-flash')
    const t = window.setTimeout(() => el.classList.remove('disasm-flash'), 1900)
    return () => window.clearTimeout(t)
  }, [scrollRequest])

  if (items.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic p-3 border border-gray-200 rounded">
        No disassembly loaded.
      </div>
    )
  }

  return (
    <div
      ref={wrapperRef}
      className="relative resize-y overflow-hidden border border-gray-200 rounded bg-white h-[60vh] min-h-[160px] max-h-[90vh]"
    >
      <div
        ref={containerRef}
        className="font-mono text-xs overflow-auto h-full"
      >
        <div className="sticky top-0 z-10 grid grid-cols-[10ch_10ch_8ch_1fr] gap-3 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wide text-xs">
          <span>address</span>
          <span>bytes</span>
          <span>mnemonic</span>
          <span>operands</span>
        </div>
        {items.map((it, i) => {
          if (it.type === 'section') {
            return (
              <div key={i} className="px-3 py-1 mt-2 text-gray-500 uppercase tracking-wide">
                section {it.name}
              </div>
            )
          }
          if (it.type === 'label') {
            return (
              <div key={i} className="px-3 py-1 mt-1 text-purple-700 font-semibold">
                {it.name}:
              </div>
            )
          }
          const isActive = pc !== null && it.pc === pc
          return (
            <div
              key={i}
              data-pc={it.pc}
              ref={isActive ? activeRef : undefined}
              className={
                'grid grid-cols-[10ch_10ch_8ch_1fr] gap-3 px-3 py-0.5 ' +
                (isActive
                  ? 'bg-yellow-200 text-gray-900'
                  : 'text-gray-800 hover:bg-gray-50')
              }
            >
              <span className="text-gray-500">{it.pc}</span>
              <span className="text-gray-400">{it.bytes}</span>
              <span className="text-blue-700">{it.instruction}</span>
              <span className="break-all">
                {it.operands?.join(', ') ?? ''}
                {it.comment && (
                  <span className="text-gray-500 italic ml-2"># {it.comment}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
      {pc !== null && !activeVisible && (
        <button
          onClick={scrollToCurrent}
          title="scroll back to current instruction"
          className="absolute bottom-3 right-4 w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center text-lg cursor-pointer"
        >
          {activeDir === 'up' ? '↑' : '↓'}
        </button>
      )}
    </div>
  )
}

export default function App() {
  const [regs, setRegs] = useState<RegMap>({})
  const [flashSeq, setFlashSeq] = useState<Record<string, number>>({})
  const prevRegsRef = useRef<RegMap>({})
  const [lastInstructionPc, setLastInstructionPc] = useState<string | null>(null)
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null)
  const [lastInstr, setLastInstr] = useState('')
  const [error, setError] = useState('')
  const [runSteps, setRunSteps] = useState(100)
  const [examples, setExamples] = useState<BinaryItem[]>([])
  const [pickedId, setPickedId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean>(sessionId !== null)
  const [loadedName, setLoadedName] = useState<string>(localStorage.getItem(BINARY_NAME_KEY) ?? '')
  const [loadStatus, setLoadStatus] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState<boolean>(sessionId === null)
  const [disasm, setDisasm] = useState<DisasmItem[]>([])
  const [disasmLoading, setDisasmLoading] = useState(false)
  const inited = useRef(false)

  const pcNormalized = normalizePc(regs.pc)

  const disasmPcs = useMemo(() => {
    const s = new Set<string>()
    for (const it of disasm) {
      if (it.type === 'instruction' || it.type === 'label') s.add(it.pc)
    }
    return s
  }, [disasm])

  const canScrollLast = lastInstructionPc !== null && disasmPcs.has(lastInstructionPc)

  async function loadDisasm(binaryId: string): Promise<void> {
    pruneDisasmCache(binaryId)
    const cached = loadCachedDisasm(binaryId)
    if (cached) {
      setDisasm(cached)
      return
    }
    setDisasmLoading(true)
    try {
      const data = await fetchDisassembly(binaryId)
      const normalized: DisasmItem[] = data.map((d) => {
        if (d.type === 'instruction') return { ...d, pc: normalizePc(d.pc) ?? d.pc }
        if (d.type === 'label') return { ...d, pc: normalizePc(d.pc) ?? d.pc }
        return d
      })
      setDisasm(normalized)
      cacheDisasm(binaryId, normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDisasmLoading(false)
    }
  }

  async function updateDisplay() {
    try {
      const [regMap, instVal] = await Promise.all([
        apiFetchJson<RegMap>(buildBatchUrl(ALL_REGS)),
        apiFetchJson<string>('/disassemble-last-instruction'),
      ])
      const prev = prevRegsRef.current
      setFlashSeq((cur) => {
        const next = { ...cur }
        for (const k of Object.keys(regMap)) {
          if (prev[k] !== undefined && prev[k] !== regMap[k]) {
            next[k] = (next[k] ?? 0) + 1
          }
        }
        return next
      })
      prevRegsRef.current = regMap
      setRegs(regMap)
      setLastInstr(instVal)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function step() {
    try {
      const snapshot = normalizePc(prevRegsRef.current.pc)
      await apiFetch('/step', 'POST')
      setLastInstructionPc(snapshot)
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function run() {
    try {
      await apiFetch(`/run?steps=${runSteps}`, 'POST')
      setLastInstructionPc(null)
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function reset() {
    try {
      await apiFetch('/reset', 'POST')
      setLastInstructionPc(null)
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
    localStorage.removeItem(BINARY_ID_KEY)
    pruneDisasmCache(null)
    setHasSession(false)
    setLoadedName('')
    setLoadStatus('')
    setPickerOpen(true)
    setRegs({})
    setFlashSeq({})
    prevRegsRef.current = {}
    setLastInstructionPc(null)
    setScrollRequest(null)
    setLastInstr('')
    setDisasm([])
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
      localStorage.setItem(BINARY_ID_KEY, binaryId)
      setLoadStatus(`Loaded ${name}`)
      setPickerOpen(false)
      await Promise.all([updateDisplay(), loadDisasm(binaryId)])
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
    if (sessionId) {
      updateDisplay()
      const bid = localStorage.getItem(BINARY_ID_KEY)
      if (bid) loadDisasm(bid)
      else pruneDisasmCache(null)
    } else {
      pruneDisasmCache(null)
    }
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

        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <button
            onClick={step}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm"
          >
            Step
          </button>
          <input
            type="number"
            min={1}
            value={runSteps}
            onChange={(e) => setRunSteps(Number(e.target.value))}
            className="w-20 px-2 py-2 border border-gray-300 rounded text-sm"
          />
          <button
            onClick={run}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm"
          >
            Run N
          </button>
          <button
            onClick={reset}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white font-semibold rounded cursor-pointer text-sm"
          >
            Reset
          </button>
          {pcNormalized && (
            <span className="ml-auto text-xs font-mono flex flex-col items-end gap-1">
              <span className="flex items-center gap-1">
                <span className="text-gray-600">pc:</span>
                <span className="text-gray-900 px-2 py-0.5 bg-gray-100 rounded border border-gray-200">
                  {pcNormalized}
                </span>
              </span>
              {lastInstr && (
                <span className="flex items-center gap-1">
                  <span className="text-gray-600">last instruction:</span>
                  {canScrollLast ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!lastInstructionPc) return
                        setScrollRequest((cur) => ({
                          pc: lastInstructionPc,
                          seq: (cur?.seq ?? 0) + 1,
                        }))
                      }}
                      title="scroll to last instruction"
                      className="text-gray-900 px-2 py-0.5 bg-gray-100 rounded border border-gray-200 hover:bg-gray-200 cursor-pointer font-mono"
                    >
                      {lastInstr}
                    </button>
                  ) : (
                    <span className="text-gray-900 px-2 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono">
                      {lastInstr}
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
        </div>

        {disasmLoading ? (
          <div className="text-xs text-gray-500 italic p-3 border border-gray-200 rounded">
            Loading disassembly…
          </div>
        ) : (
          <DisasmView items={disasm} pc={pcNormalized} scrollRequest={scrollRequest} />
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600">Error: {error}</p>
        )}
      </div>

      <aside className="space-y-3">
        <Section title="Core">
          <RegList regs={CORE_REGS} values={regs} flashSeq={flashSeq} />
        </Section>
        <Section title="CSRs">
          <RegList regs={CSR_REGS} values={regs} flashSeq={flashSeq} />
        </Section>
        <Section title="Float" defaultOpen={false}>
          <RegList regs={FLOAT_REGS} values={regs} flashSeq={flashSeq} />
        </Section>
        <Section title="Vector" defaultOpen={false}>
          <RegList regs={VECTOR_REGS} values={regs} flashSeq={flashSeq} />
        </Section>
        <Section title="Counters" defaultOpen={false}>
          <RegList regs={COUNTER_REGS} values={regs} flashSeq={flashSeq} />
        </Section>
      </aside>
    </div>
  )
}

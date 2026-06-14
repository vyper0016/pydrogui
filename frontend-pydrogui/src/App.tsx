import { useState, useEffect, useRef, useMemo } from 'react'
import { type NameMode } from './registers'
import {
  apiFetch,
  apiFetchJson,
  listExamples,
  uploadBinary,
  createSession,
  deleteSession,
  getSessionId,
  clearSessionState,
  stepMem,
  run as runApi,
  runUntilBreakpoint as runUntilBreakpointApi,
  listBreakpoints,
  addBreakpoint,
  removeBreakpoint,
  type BinaryItem,
  type CommitResult,
  type MemAccess,
} from './api'
import {
  BINARY_NAME_KEY,
  BINARY_ID_KEY,
  NAME_MODE_KEY,
  MEM_HISTORY_KEY,
  loadCachedDisasm,
  cacheDisasm,
  pruneDisasmCache,
} from './storage'
import {
  fetchDisassembly,
  normalizePc,
  normalizeDisasmPcs,
  type DisasmItem,
} from './disasm'
import {
  READ_ALL_REGS_URL,
  type RegMap,
  type FlashMap,
  type FlashKind,
} from './regGroups'
import { BinaryPicker } from './components/BinaryPicker'
import { ControlBar } from './components/ControlBar'
import { DisasmView, type ScrollRequest } from './components/DisasmView'
import { MemoryView } from './components/MemoryView'
import { AccessHistory, type AccessEntry } from './components/AccessHistory'
import { RegSidebar } from './components/RegSidebar'

function loadHistory(): AccessEntry[] {
  try {
    const raw = localStorage.getItem(MEM_HISTORY_KEY)
    return raw ? (JSON.parse(raw) as AccessEntry[]) : []
  } catch {
    return []
  }
}

export default function App() {
  const [regs, setRegs] = useState<RegMap>({})
  const [flash, setFlash] = useState<FlashMap>({})
  const flashSeqRef = useRef(0)
  const prevRegsRef = useRef<RegMap>({})

  function bumpFlash(updates: Array<{ reg: string; kind: FlashKind }>) {
    if (updates.length === 0) return
    setFlash((cur) => {
      const next = { ...cur }
      for (const { reg, kind } of updates) {
        flashSeqRef.current += 1
        next[reg] = { kind, seq: flashSeqRef.current }
      }
      return next
    })
  }
  const [lastInstructionPc, setLastInstructionPc] = useState<string | null>(null)
  const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null)
  const [lastInstr, setLastInstr] = useState('')
  const [nameMode, setNameMode] = useState<NameMode>(
    () => (localStorage.getItem(NAME_MODE_KEY) as NameMode | null) ?? 'reg',
  )
  const [error, setError] = useState('')
  const [runSteps, setRunSteps] = useState(100)
  const [examples, setExamples] = useState<BinaryItem[]>([])
  const [pickedId, setPickedId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean>(getSessionId() !== null)
  const [loadedName, setLoadedName] = useState<string>(
    localStorage.getItem(BINARY_NAME_KEY) ?? '',
  )
  const [loadStatus, setLoadStatus] = useState<string>('')
  const [pickerOpen, setPickerOpen] = useState<boolean>(getSessionId() === null)
  const [disasm, setDisasm] = useState<DisasmItem[]>([])
  const [disasmLoading, setDisasmLoading] = useState(false)
  const [memRefresh, setMemRefresh] = useState(0)
  const [memJump, setMemJump] = useState<
    { addr: string; seq: number; width: number; cls: string } | null
  >(null)
  const [memHistory, setMemHistory] = useState<AccessEntry[]>(loadHistory)
  const [memAccessFlash, setMemAccessFlash] = useState<
    { seq: number; accesses: MemAccess[] } | null
  >(null)
  const accessSeqRef = useRef(0)
  const memFlashSeqRef = useRef(0)
  const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set())

  useEffect(() => {
    const max = memHistory.reduce((m, a) => Math.max(m, a.seq), 0)
    accessSeqRef.current = max
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(MEM_HISTORY_KEY, JSON.stringify(memHistory))
    } catch {
      // quota exceeded — keep in memory only
    }
  }, [memHistory])

  function clearHistory() {
    setMemHistory([])
    setMemAccessFlash(null)
    accessSeqRef.current = 0
  }

  // Normalize backend breakpoint addresses (ints) into the same hex form as disasm PCs.
  function bpListToSet(addrs: number[]): Set<string> {
    return new Set(addrs.map((a) => normalizePc('0x' + a.toString(16)) ?? '0x' + a.toString(16)))
  }

  // Prepend a batch of memory accesses to the history (newest first) and flash the touched bytes.
  function recordAccesses(accesses: MemAccess[]) {
    if (accesses.length === 0) return
    const entries = accesses.map((a) => ({
      ...a,
      seq: (accessSeqRef.current += 1),
    }))
    setMemHistory((cur) => [...entries.reverse(), ...cur])
    setMemAccessFlash({ seq: (memFlashSeqRef.current += 1), accesses })
  }

  async function toggleBreakpoint(pc: string) {
    try {
      const addrs = breakpoints.has(pc)
        ? await removeBreakpoint(pc)
        : await addBreakpoint(pc)
      setBreakpoints(bpListToSet(addrs))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const memViewRef = useRef<HTMLDivElement>(null)

  function jumpToMemory(addr: string, width = 1, cls = 'reg-flash') {
    setMemJump((cur) => ({ addr, seq: (cur?.seq ?? 0) + 1, width, cls }))
    // Drop the last step's access flash so its bytes don't re-animate on the freshly loaded page.
    setMemAccessFlash(null)
    memViewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const inited = useRef(false)

  useEffect(() => {
    localStorage.setItem(NAME_MODE_KEY, nameMode)
  }, [nameMode])

  const pcNormalized = normalizePc(regs.pc)

  const disasmPcs = useMemo(() => {
    const s = new Set<string>()
    for (const it of disasm) {
      if (it.type === 'instruction' || it.type === 'label') s.add(it.pc)
    }
    return s
  }, [disasm])

  const canScrollLast =
    lastInstructionPc !== null && disasmPcs.has(lastInstructionPc)

  async function commitWrite(reg: string, raw: string): Promise<CommitResult> {
    const trimmed = raw.trim()
    if (!trimmed) return { ok: false, error: 'Empty value' }
    const prev = regs[reg]
    try {
      await apiFetch(
        `/write-register/${encodeURIComponent(reg)}?value_str=${encodeURIComponent(trimmed)}`,
        'POST',
      )
      const canonical = await apiFetchJson<string>(
        `/read-register/${encodeURIComponent(reg)}`,
      )
      setRegs((cur) => ({ ...cur, [reg]: canonical }))
      prevRegsRef.current = { ...prevRegsRef.current, [reg]: canonical }
      const changed = canonical !== prev
      if (changed) bumpFlash([{ reg, kind: 'green' }])
      return { ok: true, changed }
    } catch (err) {
      bumpFlash([{ reg, kind: 'red' }])
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

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
      const normalized = normalizeDisasmPcs(data)
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
        apiFetchJson<RegMap>(READ_ALL_REGS_URL),
        apiFetchJson<string>('/disassemble-last-instruction'),
      ])
      const prev = prevRegsRef.current
      const yellowUpdates: Array<{ reg: string; kind: FlashKind }> = []
      for (const k of Object.keys(regMap)) {
        if (prev[k] !== undefined && prev[k] !== regMap[k]) {
          yellowUpdates.push({ reg: k, kind: 'yellow' })
        }
      }
      bumpFlash(yellowUpdates)
      prevRegsRef.current = regMap
      setRegs(regMap)
      setLastInstr(instVal)
      setMemRefresh((n) => n + 1)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function step() {
    try {
      const snapshot = normalizePc(prevRegsRef.current.pc)
      const accesses = await stepMem()
      setLastInstructionPc(snapshot)
      recordAccesses(accesses)
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function run() {
    try {
      const accesses = await runApi(runSteps)
      setLastInstructionPc(null)
      recordAccesses(accesses)
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function runUntilBreakpoint() {
    try {
      const accesses = await runUntilBreakpointApi()
      setLastInstructionPc(null)
      recordAccesses(accesses)
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function reset() {
    try {
      await apiFetch('/reset', 'POST')
      setLastInstructionPc(null)
      clearHistory()
      await updateDisplay()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function endSession() {
    const old = getSessionId()
    clearSessionState()
    pruneDisasmCache(null)
    setHasSession(false)
    setLoadedName('')
    setLoadStatus('')
    setPickerOpen(true)
    setRegs({})
    setFlash({})
    flashSeqRef.current = 0
    prevRegsRef.current = {}
    clearHistory()
    setBreakpoints(new Set())
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
    if (getSessionId()) {
      updateDisplay()
      listBreakpoints()
        .then((addrs) => setBreakpoints(bpListToSet(addrs)))
        .catch(() => {})
      const bid = localStorage.getItem(BINARY_ID_KEY)
      if (bid) loadDisasm(bid)
      else pruneDisasmCache(null)
    } else {
      pruneDisasmCache(null)
    }
  }, [])

  function handleLoadExample() {
    const picked = examples.find((b) => b.id === pickedId)
    if (picked) startSession(picked.id, picked.name)
  }

  function handleScrollToLast() {
    if (!lastInstructionPc) return
    setScrollRequest((cur) => ({
      pc: lastInstructionPc,
      seq: (cur?.seq ?? 0) + 1,
    }))
  }

  return (
    <div className="mx-auto p-6 font-sans grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-6">RISC-V Simulator</h1>

        <BinaryPicker
          hasSession={hasSession}
          pickerOpen={pickerOpen}
          loadedName={loadedName}
          examples={examples}
          pickedId={pickedId}
          uploading={uploading}
          loadStatus={loadStatus}
          onPickedIdChange={setPickedId}
          onLoadExample={handleLoadExample}
          onUpload={onUpload}
          onSetPickerOpen={setPickerOpen}
          onEndSession={endSession}
        />

        <ControlBar
          runSteps={runSteps}
          onRunStepsChange={setRunSteps}
          onStep={step}
          onRun={run}
          onRunUntilBreakpoint={runUntilBreakpoint}
          onReset={reset}
          pcNormalized={pcNormalized}
          lastInstr={lastInstr}
          canScrollLast={canScrollLast}
          onScrollToLast={handleScrollToLast}
        />

        {disasmLoading ? (
          <div className="text-xs text-gray-500 italic p-3 border border-gray-200 rounded">
            Loading disassembly…
          </div>
        ) : (
          <DisasmView
            items={disasm}
            pc={pcNormalized}
            scrollRequest={scrollRequest}
            breakpoints={breakpoints}
            onToggleBreakpoint={toggleBreakpoint}
          />
        )}

        <div ref={memViewRef}>
          <MemoryView
            hasSession={hasSession}
            refreshKey={memRefresh}
            jump={memJump}
            accessFlash={memAccessFlash}
          />
        </div>

        <AccessHistory
          history={memHistory}
          onClear={clearHistory}
          onJumpToMemory={jumpToMemory}
        />

        {error && (
          <p className="mt-4 text-sm text-red-600">Error: {error}</p>
        )}
      </div>

      <RegSidebar
        regs={regs}
        flash={flash}
        nameMode={nameMode}
        onNameModeChange={setNameMode}
        onCommit={commitWrite}
        onJumpToMemory={jumpToMemory}
      />
    </div>
  )
}

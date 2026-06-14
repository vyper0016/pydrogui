import { useState, useEffect, useRef } from 'react'
import type { DisasmItem } from '../disasm'
import { DISASM_HEIGHT_KEY } from '../storage'

export type ScrollRequest = { pc: string; seq: number }

export function DisasmView({
  items,
  pc,
  scrollRequest,
  breakpoints,
  onToggleBreakpoint,
}: {
  items: DisasmItem[]
  pc: string | null
  scrollRequest: ScrollRequest | null
  breakpoints: Set<string>
  onToggleBreakpoint: (pc: string) => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [activeVisible, setActiveVisible] = useState(true)
  const [activeDir, setActiveDir] = useState<'up' | 'down'>('down')

  useEffect(() => {
    const w = wrapperRef.current
    if (!w) return
    const saved = localStorage.getItem(DISASM_HEIGHT_KEY)
    if (saved) w.style.height = `${parseInt(saved, 10)}px`
    const ro = new ResizeObserver(([entry]) => {
      localStorage.setItem(DISASM_HEIGHT_KEY, String(Math.round(entry.contentRect.height)))
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
      <div ref={containerRef} className="font-mono text-xs overflow-auto h-full">
        <div className="sticky top-0 z-10 grid grid-cols-[2ch_10ch_10ch_8ch_1fr] gap-3 px-3 py-1.5 bg-gray-100 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wide text-xs">
          <span></span>
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
          const isBreakpoint = breakpoints.has(it.pc)
          return (
            <div
              key={i}
              data-pc={it.pc}
              ref={isActive ? activeRef : undefined}
              className={
                'group grid grid-cols-[2ch_10ch_10ch_8ch_1fr] gap-3 px-3 py-0.5 ' +
                (isActive
                  ? 'bg-yellow-200 text-gray-900'
                  : 'text-gray-800 hover:bg-gray-50')
              }
            >
              <button
                type="button"
                onClick={() => onToggleBreakpoint(it.pc)}
                title={isBreakpoint ? 'remove breakpoint' : 'set breakpoint'}
                className="flex items-center justify-center cursor-pointer -ml-0.5"
              >
                <span
                  className={
                    'w-2.5 h-2.5 rounded-full ' +
                    (isBreakpoint
                      ? 'bg-red-600'
                      : 'bg-red-400 opacity-0 group-hover:opacity-50 hover:!opacity-100')
                  }
                />
              </button>
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

import { useEffect, useRef } from 'react'
import { TERM_HEIGHT_KEY } from '../storage'

export function TermView({
  text,
  onClear,
}: {
  text: string
  onClear: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const outRef = useRef<HTMLPreElement>(null)

  // Persist the user's chosen height, mirroring the access history view.
  useEffect(() => {
    const w = wrapperRef.current
    if (!w) return
    const saved = localStorage.getItem(TERM_HEIGHT_KEY)
    if (saved) w.style.height = `${parseInt(saved, 10)}px`
    const ro = new ResizeObserver(([entry]) => {
      localStorage.setItem(
        TERM_HEIGHT_KEY,
        String(Math.round(entry.contentRect.height)),
      )
    })
    ro.observe(w)
    return () => ro.disconnect()
  }, [])

  // Follow the tail as the guest writes more output.
  useEffect(() => {
    const o = outRef.current
    if (o) o.scrollTop = o.scrollHeight
  }, [text])

  return (
    <div className="mt-4 border border-gray-200 rounded bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="font-semibold text-sm text-gray-700">Terminal</span>
        <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
          <button
            onClick={onClear}
            disabled={text.length === 0}
            className="px-2 py-0.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
          >
            clear
          </button>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className="resize-y overflow-hidden h-[20vh] min-h-[80px] max-h-[80vh]"
      >
        {text.length === 0 ? (
          <div className="text-xs text-gray-500 italic p-3">
            No terminal output yet. Run the machine to see what the guest prints.
          </div>
        ) : (
          <pre
            ref={outRef}
            className="font-mono text-xs whitespace-pre-wrap break-all overflow-auto h-full px-3 py-1.5 text-gray-800"
          >
            {text}
          </pre>
        )}
      </div>
    </div>
  )
}

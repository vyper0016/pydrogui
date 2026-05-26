import { useState } from 'react'

export function Section({
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

import { useState, useEffect } from 'react'

async function apiFetch(path: string, method = 'GET') {
  const res = await fetch(path, { method })
  if (!res.ok) throw new Error(await res.text())
  return res.text()
}

export default function App() {
  const [pc, setPc] = useState('')
  const [instruction, setInstruction] = useState('')
  const [error, setError] = useState('')

  async function updateDisplay() {
    try {
      const [pcVal, instVal] = await Promise.all([
        apiFetch('/read-register/pc'),
        apiFetch('/disassemble-last-instruction'),
      ])
      setPc(pcVal)
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
    <div className="max-w-lg mx-auto p-6 font-sans">
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
          <label className="font-bold text-gray-700">Program Counter</label>
          <input
            type="text"
            readOnly
            value={pc}
            className="px-3 py-2 font-mono text-sm border border-gray-300 rounded bg-gray-50"
          />
        </div>
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
  )
}

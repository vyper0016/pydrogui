import type { BinaryItem } from '../api'

export function BinaryPicker({
  hasSession,
  pickerOpen,
  loadedName,
  examples,
  pickedId,
  uploading,
  loadStatus,
  onPickedIdChange,
  onLoadExample,
  onUpload,
  onSetPickerOpen,
  onEndSession,
}: {
  hasSession: boolean
  pickerOpen: boolean
  loadedName: string
  examples: BinaryItem[]
  pickedId: string
  uploading: boolean
  loadStatus: string
  onPickedIdChange: (id: string) => void
  onLoadExample: () => void
  onUpload: (file: File) => void
  onSetPickerOpen: (open: boolean) => void
  onEndSession: () => void
}) {
  if (hasSession && !pickerOpen) {
    return (
      <div className="mb-4 flex items-center gap-2 text-xs text-gray-600">
        <span>
          Loaded <span className="font-mono text-gray-800">{loadedName}</span>
        </span>
        <button
          onClick={() => onSetPickerOpen(true)}
          className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
        >
          Change
        </button>
        <button
          onClick={onEndSession}
          className="px-2 py-0.5 border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
        >
          End
        </button>
      </div>
    )
  }

  return (
    <div className="mb-4 p-3 border border-gray-200 rounded space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">
          {hasSession ? (
            <>Loaded: <span className="font-mono">{loadedName}</span></>
          ) : 'Pick a binary to start:'}
        </div>
        {hasSession && (
          <button
            onClick={() => onSetPickerOpen(false)}
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
          onChange={(e) => onPickedIdChange(e.target.value)}
          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
        >
          {examples.length === 0 && <option value="">(no examples)</option>}
          {examples.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <button
          onClick={onLoadExample}
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
          onClick={onEndSession}
          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
        >
          End session
        </button>
      )}
    </div>
  )
}

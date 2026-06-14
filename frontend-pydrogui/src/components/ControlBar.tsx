export function ControlBar({
  runSteps,
  onRunStepsChange,
  onStep,
  onRun,
  onRunUntilBreakpoint,
  onReset,
  pcNormalized,
  lastInstr,
  canScrollLast,
  onScrollToLast,
}: {
  runSteps: number
  onRunStepsChange: (n: number) => void
  onStep: () => void
  onRun: () => void
  onRunUntilBreakpoint: () => void
  onReset: () => void
  pcNormalized: string | null
  lastInstr: string
  canScrollLast: boolean
  onScrollToLast: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 items-center">
      <button
        onClick={onStep}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm"
      >
        Step
      </button>
      <input
        type="number"
        min={1}
        value={runSteps}
        onChange={(e) => onRunStepsChange(Number(e.target.value))}
        className="w-20 px-2 py-2 border border-gray-300 rounded text-sm"
      />
      <button
        onClick={onRun}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm"
      >
        Run N
      </button>
      <button
        onClick={onRunUntilBreakpoint}
        title="run until a breakpoint is hit"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm"
      >
        Run to breakpoint
      </button>
      <button
        onClick={onReset}
        className="px-4 py-2 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white font-semibold rounded cursor-pointer text-sm"
      >
        Reset
      </button>
      {pcNormalized && (
        <span className="ml-auto text-xs font-mono flex flex-col items-end gap-1">
          <span className="flex items-center gap-1">
            <span className="text-gray-600 cursor-help" title="Program counter">pc:</span>
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
                  onClick={onScrollToLast}
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
  )
}

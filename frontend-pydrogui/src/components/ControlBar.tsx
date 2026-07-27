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
  autoRunning,
  autoStepDelayMs,
  onAutoStepDelayChange,
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
  autoRunning: boolean
  autoStepDelayMs: number
  onAutoStepDelayChange: (ms: number) => void
}) {
  return (
    <div className="mb-4">
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={onStep}
        disabled={autoRunning}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Step
      </button>
      <input
        type="number"
        min={1}
        value={runSteps}
        onChange={(e) => onRunStepsChange(Number(e.target.value))}
        disabled={autoRunning}
        className="w-20 px-2 py-2 border border-gray-300 rounded text-sm disabled:opacity-50"
      />
      <button
        onClick={onRun}
        disabled={autoRunning}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Run N
      </button>
      <button
        onClick={onRunUntilBreakpoint}
        title={autoRunning ? 'stop running' : 'run until a breakpoint is hit'}
        className={
          autoRunning
            ? 'px-4 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-semibold rounded cursor-pointer text-sm'
            : 'px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded cursor-pointer text-sm'
        }
      >
        {autoRunning ? 'Stop' : 'Run to breakpoint'}
      </button>
      <label
        title="delay between auto-steps while running to a breakpoint"
        className="flex flex-col items-center gap-0.5 text-[10px] leading-none text-gray-600"
      >
        <input
          type="number"
          min={30}
          step={10}
          value={autoStepDelayMs}
          onChange={(e) => onAutoStepDelayChange(Math.max(30, Number(e.target.value)))}
          className="w-14 px-1 py-1 border border-gray-300 rounded text-sm"
        />
        delay (ms)
      </label>
      <button
        onClick={onReset}
        disabled={autoRunning}
        className="px-4 py-2 bg-gray-500 hover:bg-gray-600 active:bg-gray-700 text-white font-semibold rounded cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Reset
      </button>
    </div>
      {pcNormalized && (
        <div className="mt-2 flex justify-end">
        <span className="text-xs font-mono flex flex-col items-end gap-1">
          <span className="flex items-center gap-1">
            <span className="text-gray-600 cursor-help" title="Program counter">pc:</span>
            <span className="text-gray-900 px-2 py-0.5 bg-gray-100 rounded border border-gray-200">
              {pcNormalized}
            </span>
          </span>
          {lastInstr && (
            <span className="flex items-center gap-1 max-w-full">
              <span className="text-gray-600 shrink-0">last instruction:</span>
              {canScrollLast ? (
                <button
                  type="button"
                  onClick={onScrollToLast}
                  title={lastInstr}
                  className="text-gray-900 px-2 py-0.5 bg-gray-100 rounded border border-gray-200 hover:bg-gray-200 cursor-pointer font-mono max-w-[16rem] truncate inline-block"
                >
                  {lastInstr}
                </button>
              ) : (
                <span
                  title={lastInstr}
                  className="text-gray-900 px-2 py-0.5 bg-gray-100 rounded border border-gray-200 font-mono max-w-[16rem] truncate inline-block"
                >
                  {lastInstr}
                </span>
              )}
            </span>
          )}
        </span>
        </div>
      )}
    </div>
  )
}

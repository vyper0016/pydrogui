import type { NameMode } from '../registers'
import type { RegMap, FlashMap } from '../regGroups'
import type { CommitResult } from '../api'
import {
  CORE_REGS,
  CSR_REGS,
  FLOAT_REGS,
  VECTOR_REGS,
  COUNTER_REGS,
} from '../regGroups'
import { Section } from './Section'
import { RegList } from './RegList'
import { ThemeToggle } from './ThemeToggle'

export function RegSidebar({
  regs,
  flash,
  nameMode,
  onNameModeChange,
  onCommit,
  onJumpToMemory,
}: {
  regs: RegMap
  flash: FlashMap
  nameMode: NameMode
  onNameModeChange: (m: NameMode) => void
  onCommit: (reg: string, raw: string) => Promise<CommitResult>
  onJumpToMemory: (addr: string) => void
}) {
  const common = { values: regs, flash, nameMode, onCommit, onJumpToMemory }
  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-end gap-1 text-xs">
        <ThemeToggle />
        <span className="text-gray-500 mr-1 ml-3">names:</span>
        <button
          onClick={() => onNameModeChange('reg')}
          className={
            'px-2 py-0.5 rounded border cursor-pointer ' +
            (nameMode === 'reg'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100')
          }
        >
          reg
        </button>
        <button
          onClick={() => onNameModeChange('abi')}
          className={
            'px-2 py-0.5 rounded border cursor-pointer ' +
            (nameMode === 'abi'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100')
          }
        >
          abi
        </button>
      </div>
      <Section title="Core">
        <RegList regs={CORE_REGS} {...common} />
      </Section>
      <Section title="CSRs">
        <RegList regs={CSR_REGS} {...common} />
      </Section>
      <Section title="Float" defaultOpen={false}>
        <RegList regs={FLOAT_REGS} {...common} />
      </Section>
      <Section title="Vector" defaultOpen={false}>
        <RegList regs={VECTOR_REGS} {...common} />
      </Section>
      <Section title="Counters" defaultOpen={false}>
        <RegList regs={COUNTER_REGS} {...common} />
      </Section>
    </aside>
  )
}

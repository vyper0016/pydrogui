import { useState } from 'react'
import { THEME_KEY } from '../storage'

// The early-apply script in index.html sets the initial class; mirror it here.
function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

export function ThemeToggle() {
  const [dark, setDark] = useState(isDark)

  function apply(next: boolean) {
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
    setDark(next)
  }

  const btn = (active: boolean) =>
    'px-2 py-0.5 rounded border cursor-pointer ' +
    (active
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100')

  return (
    <>
      <span className="text-gray-500 mr-1">theme:</span>
      <button onClick={() => apply(false)} className={btn(!dark)}>
        light
      </button>
      <button onClick={() => apply(true)} className={btn(dark)}>
        dark
      </button>
    </>
  )
}

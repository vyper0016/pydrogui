import { SESSION_KEY, BINARY_NAME_KEY, BINARY_ID_KEY } from './storage'

export const API = '/api'

export type BinaryItem = { id: string; name: string; size: number }

export type MemoryPage = {
  start: string
  values: number[]
  page_size: number
  step: number
}

export type MemAccess = {
  type: string
  addr: string
  width: number
  value: number
}

export type CommitResult =
  | { ok: true; changed: boolean }
  | { ok: false; error: string }

export class NoSessionError extends Error {
  constructor() { super('No active session. Pick a binary to start.') }
}

export class SessionExpiredError extends Error {
  constructor() { super('Session expired. Pick a binary to start a new one.') }
}

let sessionId: string | null = localStorage.getItem(SESSION_KEY)

export function getSessionId(): string | null {
  return sessionId
}

export function clearSessionState(): void {
  sessionId = null
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(BINARY_NAME_KEY)
  localStorage.removeItem(BINARY_ID_KEY)
}

export async function listExamples(): Promise<BinaryItem[]> {
  const res = await fetch(API + '/binaries/examples')
  if (!res.ok) throw new Error(`List examples failed: ${await res.text()}`)
  return res.json()
}

export async function uploadBinary(file: File): Promise<BinaryItem> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(API + '/binaries', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`)
  return res.json()
}

export async function createSession(binaryId: string): Promise<string> {
  const res = await fetch(
    `${API}/sessions?binary_id=${encodeURIComponent(binaryId)}`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Create session failed: ${await res.text()}`)
  const data = (await res.json()) as { session_id: string }
  sessionId = data.session_id
  localStorage.setItem(SESSION_KEY, sessionId)
  return sessionId
}

export async function deleteSession(sid: string): Promise<void> {
  try {
    await fetch(`${API}/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' })
  } catch {
    // best-effort; server will purge expired anyway
  }
}

async function rawFetch(path: string, method: string): Promise<Response> {
  if (!sessionId) throw new NoSessionError()
  return fetch(API + path, { method, headers: { 'X-Session-Id': sessionId } })
}

async function checkSession(res: Response): Promise<Response> {
  if (res.status === 404) {
    const body = await res.clone().text()
    if (body.includes('Session not found') || body.includes('expired')) {
      clearSessionState()
      throw new SessionExpiredError()
    }
  }
  return res
}

async function extractErrorMessage(res: Response): Promise<string> {
  const body = await res.text()
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && 'detail' in parsed) {
      const d = (parsed as { detail: unknown }).detail
      if (typeof d === 'string') return d
      return JSON.stringify(d)
    }
  } catch {
    // not JSON
  }
  return body
}

export async function apiFetch(path: string, method = 'GET'): Promise<string> {
  const res = await checkSession(await rawFetch(path, method))
  if (!res.ok) throw new Error(await extractErrorMessage(res))
  return res.text()
}

export async function setMemoryPageSize(pageSize: number): Promise<void> {
  await apiFetch(`/set-memory-page-size?page_size=${pageSize}`, 'POST')
}

export async function stepMem(): Promise<MemAccess[]> {
  return apiFetchJson<MemAccess[]>('/step-mem', 'POST')
}

export async function writeMemory(
  address: string,
  value: string,
  width = 8,
): Promise<void> {
  await apiFetch(
    `/write-memory?address=${encodeURIComponent(address)}` +
      `&value=${encodeURIComponent(value)}&width=${width}`,
    'POST',
  )
}

export async function apiFetchJson<T>(path: string, method = 'GET'): Promise<T> {
  const res = await checkSession(await rawFetch(path, method))
  if (!res.ok) throw new Error(await extractErrorMessage(res))
  return res.json()
}

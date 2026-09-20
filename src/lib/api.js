// Use relative URLs — Next.js proxies /api/* to Express internally.
// Leave this empty so requests go to http://192.168.1.50:3000/api/...
const BASE_URL = ''

import { useAuthStore } from '@/store/authStore'

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })
  if (res.status === 401 && typeof window !== 'undefined') {
    useAuthStore.getState().logout()
    window.location.href = '/'
    throw new Error('Session expired')
  }
  
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
}

export default api
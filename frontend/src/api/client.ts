import axios from 'axios'

const STORAGE_KEY = 'fairshare-auth'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

function getStoredTokens(): { accessToken: string | null; refreshToken: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { accessToken: null, refreshToken: null }
    const { state } = JSON.parse(raw)
    return { accessToken: state?.accessToken ?? null, refreshToken: state?.refreshToken ?? null }
  } catch {
    return { accessToken: null, refreshToken: null }
  }
}

function setStoredAccessToken(token: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    parsed.state.accessToken = token
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch {}
}

// Attach Bearer token to every request
client.interceptors.request.use((config) => {
  const { accessToken } = getStoredTokens()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// Silent token refresh on 401 with request queue
let isRefreshing = false
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: Error) => void }> = []

function drainQueue(err: Error | null, token: string | null) {
  pendingQueue.forEach((p) => (err ? p.reject(err) : p.resolve(token!)))
  pendingQueue = []
}

client.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (err.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return client(originalRequest)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { refreshToken } = getStoredTokens()
        if (!refreshToken) throw new Error('no_refresh')

        const { data } = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        const newToken: string = data.access_token

        setStoredAccessToken(newToken)
        drainQueue(null, newToken)
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return client(originalRequest)
      } catch {
        const sessionErr = new Error('Session expired. Please log in again.')
        drainQueue(sessionErr, null)
        localStorage.removeItem(STORAGE_KEY)
        window.location.href = '/login'
        return Promise.reject(sessionErr)
      } finally {
        isRefreshing = false
      }
    }

    const message = err.response?.data?.error ?? err.message ?? 'Unknown error'
    return Promise.reject(new Error(message))
  }
)

export default client

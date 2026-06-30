export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error ?? '请求失败')
  }

  return payload as T
}

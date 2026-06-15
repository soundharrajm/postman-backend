import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetch } from 'undici'

interface ProxyRequest {
  url:      string
  method:   string
  headers?: Record<string, string>
  body?:    string | Record<string, unknown> | null
  timeout?: number
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes > 1024)        return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  const { url, method = 'GET', headers = {}, body, timeout = 30 } =
    (req.body ?? {}) as ProxyRequest

  if (!url) { res.status(400).json({ error: 'url is required' }); return }

  const t0 = Date.now()

  try {
    const reqHeaders: Record<string, string> = { ...headers }
    let requestBody: string | undefined

    if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
      if (typeof body === 'object') {
        requestBody = JSON.stringify(body)
        if (!reqHeaders['content-type'] && !reqHeaders['Content-Type'])
          reqHeaders['Content-Type'] = 'application/json'
      } else {
        requestBody = String(body)
      }
    }

    const response = await fetch(url, {
      method:  method.toUpperCase(),
      headers: reqHeaders,
      body:    requestBody,
      signal:  AbortSignal.timeout(timeout * 1000),
    })

    const buffer   = await response.arrayBuffer()
    const bytes    = Buffer.from(buffer)
    const bodyText = bytes.toString('utf-8')
    const elapsed  = Date.now() - t0

    const respHeaders: Record<string, string> = {}
    response.headers.forEach((v, k) => { respHeaders[k] = v })

    const cookies: string[] = []
    response.headers.getSetCookie?.().forEach(c => cookies.push(c))

    res.status(200).json({
      status:      response.status,
      status_text: response.statusText,
      headers:     respHeaders,
      body:        bodyText,
      size:        formatSize(bytes.length),
      elapsed_ms:  elapsed,
      cookies,
    })
  } catch (err: unknown) {
    const elapsed = Date.now() - t0
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = message.includes('TimeoutError') || message.includes('AbortError')
    const isConnect = message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')

    res.status(200).json({
      status:      0,
      status_text: isTimeout ? 'Timeout' : isConnect ? 'Connection Refused' : 'Error',
      headers:     {},
      body:        message,
      size:        '—',
      elapsed_ms:  elapsed,
      cookies:     [],
    })
  }
}

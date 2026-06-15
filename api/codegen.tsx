import type { VercelRequest, VercelResponse } from '@vercel/node'

interface CodegenRequest {
  url:      string
  method:   string
  headers?: Record<string, string>
  body?:    string
  language: string
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const { url, method = 'GET', headers = {}, body, language } =
    (req.body ?? {}) as CodegenRequest

  const h = Object.entries(headers)
    .map(([k, v]) => `  "${k}": "${v}"`)
    .join(',\n')

  const bodyStr = body
    ? (typeof body === 'object' ? JSON.stringify(body, null, 2) : body)
    : null

  let code = ''

  switch (language) {
    case 'fetch':
      code = `const response = await fetch("${url}", {\n  method: "${method}",\n  headers: {\n${h}\n  },${bodyStr ? `\n  body: JSON.stringify(${bodyStr}),` : ''}\n})\nconst data = await response.json()\nconsole.log(data)`
      break
    case 'axios':
      code = `import axios from 'axios'\n\nconst { data } = await axios.${method.toLowerCase()}("${url}", ${bodyStr ? `${bodyStr}, ` : ''}{\n  headers: {\n${h}\n  }\n})\nconsole.log(data)`
      break
    case 'curl':
      const curlH = Object.entries(headers).map(([k,v]) => `-H "${k}: ${v}"`).join(' \\\n  ')
      code = `curl -X ${method} "${url}" \\\n  ${curlH}${bodyStr ? ` \\\n  -d '${bodyStr}'` : ''}`
      break
    case 'python':
      code = `import requests\n\nresponse = requests.${method.toLowerCase()}(\n  "${url}",\n  headers=${JSON.stringify(headers, null, 2)},${bodyStr ? `\n  json=${bodyStr},` : ''}\n)\nprint(response.json())`
      break
    default:
      code = `// Unsupported language: ${language}`
  }

  res.status(200).json({ code })
}

#!/usr/bin/env node

import http from 'node:http'
import net from 'node:net'
import { mkdirSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const PUBLIC_HOST = '0.0.0.0'
const PUBLIC_PORT = Number(process.env.DSH_PUBLIC_PORT ?? 3080)
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = Number(process.env.DSH_BACKEND_PORT ?? 3081)
const DSH_HOME = process.env.DSH_HOME ?? '/data/dsh'
const WORKSPACE = process.env.DSH_WORKSPACE ?? '/data/workspace'
const CLI = process.env.DSH_CLI ?? '/opt/deepseek-harness/apps/cli/lib/bin.js'
const PATCH = process.env.DSH_PATCH ?? '/etc/dsh/ha.patch.yml'
const OPTIONS_PATH = process.env.DSH_OPTIONS_PATH ?? '/data/options.json'
const LOG_COMPONENTS = ['ingress', 'backend', 'websocket', 'lifecycle']

const describeError = (error) => error instanceof Error ? error.message : String(error)

let options = {}
let optionsError
try {
  options = JSON.parse(readFileSync(OPTIONS_PATH, 'utf8'))
} catch (error) {
  optionsError = error
}

const logging = Object.fromEntries(
  LOG_COMPONENTS.map((component) => [component, options?.logging?.[component] !== false]),
)

const log = (component, level, message, fields = undefined) => {
  if (!logging[component]) return

  let suffix = ''
  if (fields !== undefined) {
    try {
      suffix = ` ${JSON.stringify(fields)}`
    } catch {
      suffix = ''
    }
  }

  const line = `[${component}] ${message}${suffix}`
  if (level === 'error' || level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }
}

const safePath = (url) => {
  try {
    return new URL(url ?? '/', 'http://deepseek-harness.local').pathname
  } catch {
    return '/'
  }
}

const ingressBasePath = (headers) => {
  const raw = headers['x-ingress-path']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return undefined
  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, '')
  return path === '' ? '/' : `${path}/`
}

const escapeHtmlAttribute = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const rewriteIngressBase = (body, basePath) => {
  const html = body.toString('utf8')
  const base = `<base href="${escapeHtmlAttribute(basePath)}">`
  if (/<base\b[^>]*>/i.test(html)) return html.replace(/<base\b[^>]*>/i, base)
  return html.replace(/<head\b[^>]*>/i, match => `${match}${base}`)
}

const nextRequestId = (() => {
  let value = 0
  return () => String(++value)
})()

mkdirSync(DSH_HOME, { recursive: true })
mkdirSync(WORKSPACE, { recursive: true })

if (optionsError) {
  log('lifecycle', 'warn', 'Could not read app logging options; using defaults', {
    path: OPTIONS_PATH,
    error: describeError(optionsError),
  })
}

const proxyHeaders = (headers) => {
  const forwarded = { ...headers }
  delete forwarded.origin
  delete forwarded['sec-fetch-site']
  delete forwarded['x-forwarded-host']
  delete forwarded['x-forwarded-proto']
  forwarded['accept-encoding'] = 'identity'
  forwarded.host = `${BACKEND_HOST}:${BACKEND_PORT}`
  return forwarded
}

const server = http.createServer((request, response) => {
  const requestId = nextRequestId()
  const startedAt = Date.now()
  const path = safePath(request.url)
  const basePath = ingressBasePath(request.headers)

  log('ingress', 'info', 'http request', {
    requestId,
    method: request.method,
    path,
    ...(basePath === undefined ? {} : { ingressPath: basePath }),
  })

  let completed = false
  const complete = (status, level = 'info') => {
    if (completed) return
    completed = true
    log('ingress', level, 'http response', {
      requestId,
      method: request.method,
      path,
      status,
      durationMs: Date.now() - startedAt,
      ...(basePath === undefined ? {} : { ingressPath: basePath }),
    })
  }

  response.on('finish', () => complete(response.statusCode))
  response.on('close', () => {
    if (!completed) complete(response.statusCode || 499, 'warn')
  })

  const upstream = http.request({
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    method: request.method,
    path: request.url,
    headers: proxyHeaders(request.headers),
  }, (upstreamResponse) => {
    const contentType = upstreamResponse.headers['content-type']
    const rewriteHtml = request.method !== 'HEAD'
      && basePath !== undefined
      && typeof contentType === 'string'
      && contentType.toLowerCase().includes('text/html')
    if (rewriteHtml) {
      const chunks = []
      upstreamResponse.on('data', chunk => chunks.push(chunk))
      upstreamResponse.on('end', () => {
        const headers = { ...upstreamResponse.headers }
        delete headers['content-length']
        delete headers['content-encoding']
        delete headers.etag
        headers['cache-control'] = 'no-store'
        response.writeHead(upstreamResponse.statusCode ?? 502, headers)
        response.end(rewriteIngressBase(Buffer.concat(chunks), basePath))
      })
      upstreamResponse.on('error', error => response.destroy(error))
      return
    }
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })

  upstream.on('error', (error) => {
    log('ingress', 'error', 'backend proxy request failed', {
      requestId,
      method: request.method,
      path,
      error: describeError(error),
    })
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain' })
      response.end('DeepSeek Harness is starting\n')
    } else {
      response.destroy(error)
    }
    complete(502, 'error')
  })

  request.on('aborted', () => {
    log('ingress', 'warn', 'client aborted http request', { requestId, method: request.method, path })
    upstream.destroy()
  })
  request.on('error', (error) => {
    log('ingress', 'error', 'client http request failed', {
      requestId,
      method: request.method,
      path,
      error: describeError(error),
    })
    upstream.destroy(error)
  })
  request.pipe(upstream)
})

server.on('upgrade', (request, socket, head) => {
  const requestId = nextRequestId()
  const startedAt = Date.now()
  const path = safePath(request.url)

  log('websocket', 'info', 'websocket upgrade requested', {
    requestId,
    method: request.method,
    path,
  })

  let completed = false
  const complete = (event, level = 'info') => {
    if (completed) return
    completed = true
    log('websocket', level, 'websocket connection closed', {
      requestId,
      path,
      event,
      durationMs: Date.now() - startedAt,
    })
  }

  const upstream = net.connect(BACKEND_PORT, BACKEND_HOST, () => {
    log('websocket', 'info', 'websocket connected to backend', { requestId, path })

    const lines = [`${request.method} ${request.url ?? '/'} HTTP/1.1`]
    for (const [name, value] of Object.entries(request.headers)) {
      if (name === 'host' || name === 'origin' || name === 'sec-fetch-site') continue
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${name}: ${item}`)
      } else if (value !== undefined) {
        lines.push(`${name}: ${value}`)
      }
    }
    lines.push(`Host: ${BACKEND_HOST}:${BACKEND_PORT}`, '', '')
    upstream.write(lines.join('\r\n'))
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })

  const close = (event, error = undefined) => {
    if (error) {
      log('websocket', 'error', 'websocket proxy failed', {
        requestId,
        path,
        event,
        error: describeError(error),
      })
    }
    socket.destroy()
    upstream.destroy()
    complete(event, error ? 'error' : 'info')
  }

  upstream.on('error', (error) => close('backend error', error))
  upstream.on('close', () => complete('backend socket closed'))
  socket.on('error', (error) => {
    log('websocket', 'error', 'client websocket failed', {
      requestId,
      path,
      error: describeError(error),
    })
    upstream.destroy()
    complete('client error', 'error')
  })
  socket.on('close', () => {
    upstream.destroy()
    complete('client socket closed')
  })
})

let stopping = false
let backend

const shutdown = (signal, exitCode = 0) => {
  if (stopping) return
  stopping = true
  log('lifecycle', 'info', 'shutting down', { signal, exitCode })
  server.close(() => process.exit(exitCode))
  backend?.kill(signal)
  setTimeout(() => process.exit(exitCode), 5_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('uncaughtException', (error) => {
  log('lifecycle', 'error', 'uncaught exception', { error: describeError(error), stack: error?.stack })
  shutdown('SIGTERM', 1)
})
process.on('unhandledRejection', (error) => {
  log('lifecycle', 'error', 'unhandled rejection', { error: describeError(error) })
  shutdown('SIGTERM', 1)
})
server.on('error', (error) => {
  log('lifecycle', 'error', 'proxy server failed', { error: describeError(error) })
  shutdown('SIGTERM', 1)
})

const attachBackendOutput = (stream, source, level) => {
  let pending = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    pending += chunk
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) {
      if (line.length > 0) log('backend', level, `${source}: ${line}`)
    }
  })
  stream.on('end', () => {
    if (pending.length > 0) log('backend', level, `${source}: ${pending}`)
  })
}

server.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  log('lifecycle', 'info', 'proxy listening', {
    host: PUBLIC_HOST,
    port: PUBLIC_PORT,
    backend: `${BACKEND_HOST}:${BACKEND_PORT}`,
    enabledLogs: LOG_COMPONENTS.filter((component) => logging[component]),
  })

  backend = spawn(process.execPath, [
    CLI,
    'web',
    '--patch', PATCH,
    '--port', String(BACKEND_PORT),
  ], {
    cwd: WORKSPACE,
    env: {
      ...process.env,
      DSH_HOME,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED ?? '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backend.on('spawn', () => log('lifecycle', 'info', 'backend process started', { pid: backend.pid }))
  attachBackendOutput(backend.stdout, 'stdout', 'info')
  attachBackendOutput(backend.stderr, 'stderr', 'warn')
  backend.on('error', (error) => {
    log('lifecycle', 'error', 'backend process failed', { error: describeError(error) })
  })
  backend.on('exit', (code, signal) => {
    log('lifecycle', code === 0 ? 'info' : 'error', 'backend process exited', { code, signal })
    if (stopping) return
    shutdown('SIGTERM', code ?? 1)
  })
})

#!/usr/bin/env node

import http from 'node:http'
import net from 'node:net'
import { mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'

const PUBLIC_HOST = '0.0.0.0'
const PUBLIC_PORT = Number(process.env.DSH_PUBLIC_PORT ?? 3080)
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = Number(process.env.DSH_BACKEND_PORT ?? 3081)
const DSH_HOME = process.env.DSH_HOME ?? '/data/dsh'
const WORKSPACE = process.env.DSH_WORKSPACE ?? '/data/workspace'
const CLI = process.env.DSH_CLI ?? '/opt/deepseek-harness/apps/cli/lib/bin.js'
const PATCH = process.env.DSH_PATCH ?? '/etc/dsh/ha.patch.yml'

mkdirSync(DSH_HOME, { recursive: true })
mkdirSync(WORKSPACE, { recursive: true })

const proxyHeaders = (headers) => {
  const forwarded = { ...headers }
  delete forwarded.origin
  delete forwarded['sec-fetch-site']
  delete forwarded['x-forwarded-host']
  delete forwarded['x-forwarded-proto']
  forwarded.host = `${BACKEND_HOST}:${BACKEND_PORT}`
  return forwarded
}

const server = http.createServer((request, response) => {
  const upstream = http.request({
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    method: request.method,
    path: request.url,
    headers: proxyHeaders(request.headers),
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
    upstreamResponse.pipe(response)
  })

  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' })
    response.end('DeepSeek Harness is starting\n')
  })
  request.on('aborted', () => upstream.destroy())
  request.pipe(upstream)
})

server.on('upgrade', (request, socket, head) => {
  const upstream = net.connect(BACKEND_PORT, BACKEND_HOST, () => {
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

  const close = () => {
    socket.destroy()
    upstream.destroy()
  }
  upstream.on('error', close)
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
})

let stopping = false
let backend

const shutdown = (signal) => {
  if (stopping) return
  stopping = true
  server.close(() => process.exit(0))
  backend?.kill(signal)
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

server.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
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
    stdio: 'inherit',
  })

  backend.on('exit', (code) => {
    if (stopping) return
    stopping = true
    server.close()
    process.exit(code ?? 1)
  })
})

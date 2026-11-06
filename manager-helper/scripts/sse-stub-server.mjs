// Dev-only stub of POST /agent (AG-UI over SSE) for the HttpAgent spike (task 1.4).
// Not part of the extension build. Usage: node scripts/sse-stub-server.mjs [port]
import { createServer } from 'node:http'
import process from 'node:process'

const port = Number(process.argv[2] ?? 3999)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '600',
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const frame = (event) => `data: ${JSON.stringify(event)}\n\n`

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS).end()
    return
  }
  if (req.method !== 'POST' || req.url !== '/agent') {
    res.writeHead(404, CORS).end()
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const input = JSON.parse(raw)

  res.writeHead(200, {
    ...CORS,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  const messageId = 'msg-1'
  res.write(frame({ type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId }))
  res.write(frame({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' }))
  for (const delta of ['Привет, ', 'это ', 'ответ-заглушка.']) {
    await sleep(100)
    res.write(frame({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta }))
  }
  res.write(frame({ type: 'TEXT_MESSAGE_END', messageId }))
  res.write(frame({ type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId }))
  res.end()
})

server.listen(port, '127.0.0.1', () => {
  console.log(`SSE stub listening on http://127.0.0.1:${port}/agent`)
})

// Dev-only: connects HttpAgent from @ag-ui/client to the stub and prints events (task 1.4).
// Usage: node scripts/agent-spike.mjs [baseUrl]
import { HttpAgent } from '@ag-ui/client'
import process from 'node:process'

const base = process.argv[2] ?? 'http://127.0.0.1:3999'
const agent = new HttpAgent({ url: `${base}/agent`, threadId: 'thread-1' })
agent.messages = [{ id: 'u1', role: 'user', content: 'Привет' }]

const types = []
await agent.runAgent(
  {},
  {
    onEvent: ({ event }) => {
      types.push(event.type)
    },
  },
)
console.log('events:', types.join(' '))
console.log('assistant:', agent.messages.filter((m) => m.role === 'assistant').map((m) => m.content))

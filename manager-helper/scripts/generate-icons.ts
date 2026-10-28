import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const ICON_SIZES = [16, 48, 128]
const ICON_COLOR = { red: 37, green: 99, blue: 235 }
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function computeCrc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createChunk(type: string, payload: Buffer): Buffer {
  const typeAndPayload = Buffer.concat([Buffer.from(type, 'ascii'), payload])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(payload.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(computeCrc32(typeAndPayload))
  return Buffer.concat([length, typeAndPayload, crc])
}

function createSolidPng(size: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2

  const rowLength = 1 + size * 3
  const pixels = Buffer.alloc(rowLength * size)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const offset = row * rowLength + 1 + column * 3
      pixels[offset] = ICON_COLOR.red
      pixels[offset + 1] = ICON_COLOR.green
      pixels[offset + 2] = ICON_COLOR.blue
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk('IHDR', header),
    createChunk('IDAT', deflateSync(pixels)),
    createChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const size of ICON_SIZES) {
  writeFileSync(`public/icons/icon-${size}.png`, createSolidPng(size))
}

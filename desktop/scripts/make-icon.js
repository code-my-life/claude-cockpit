// Writes build/icon.png, the app icon, from the same ink ring as the tray
// icon: `node scripts/make-icon.js`. A minimal PNG encoder, no dependency.
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { trayIconBitmap } = require('../tray-model')

const ICON_SIZE = 256
const BYTES_PER_PIXEL = 4
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BIT_DEPTH = 8
const COLOUR_TYPE_RGBA = 6
const NO_FILTER = 0
const OUTPUT = path.join(__dirname, '..', 'build', 'icon.png')

const CRC_TABLE = Array.from({ length: 256 }, (unused, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

const crc32 = buffer => {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

// BGRA pixels (the tray layout) into PNG rows: RGBA, each led by its filter byte.
const rowsOf = (bgra, size) => {
  const rows = Buffer.alloc(size * (size * BYTES_PER_PIXEL + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * BYTES_PER_PIXEL + 1)
    rows[rowStart] = NO_FILTER
    for (let x = 0; x < size; x++) {
      const source = (y * size + x) * BYTES_PER_PIXEL
      const target = rowStart + 1 + x * BYTES_PER_PIXEL
      rows[target] = bgra[source + 2]
      rows[target + 1] = bgra[source + 1]
      rows[target + 2] = bgra[source]
      rows[target + 3] = bgra[source + 3]
    }
  }
  return rows
}

const pngOf = size => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.writeUInt8(BIT_DEPTH, 8)
  header.writeUInt8(COLOUR_TYPE_RGBA, 9)
  const pixels = zlib.deflateSync(rowsOf(trayIconBitmap(size), size))
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', pixels), chunk('IEND', Buffer.alloc(0))])
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
fs.writeFileSync(OUTPUT, pngOf(ICON_SIZE))
process.stdout.write(`${OUTPUT}\n`)

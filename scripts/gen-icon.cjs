#!/usr/bin/env node
/**
 * gen-icon.cjs — deterministischer Platzhalter-App-Icon-Generator (HR11-Script, mechanisch).
 * Erzeugt build/icon.ico (256px) und build/icon.png (512px) im RawaSuite-"Papier-Retro"-Stil:
 * terra-Quadrat mit Ink-Rand + Config-Regler-Motiv (3 Slider). Nur Node + zlib, keine Deps.
 * Farben aus src/renderer/styles/tokens.css: terra #e07040, papier #faf8f5, ink #3a2e26.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const BASE_SIZE = 256
let SIZE = BASE_SIZE
const TERRA = [224, 112, 64]
const CREME = [250, 248, 245]
const INK = [58, 46, 38]

// RGBA-Canvas (transparenter Hintergrund).
let buf = Buffer.alloc(SIZE * SIZE * 4, 0)

function resetCanvas(size) {
  SIZE = size
  buf = Buffer.alloc(SIZE * SIZE * 4, 0)
}

function scale(n) {
  return Math.round(n * SIZE / BASE_SIZE)
}

function setPx(x, y, [r, g, b], a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
}

// Abgerundetes Rechteck: fuellt [x0,x1)×[y0,y1) mit Eckenradius rad.
function fillRoundRect(x0, y0, x1, y1, rad, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = Math.min(x - x0, x1 - 1 - x)
      const dy = Math.min(y - y0, y1 - 1 - y)
      if (dx < rad && dy < rad) {
        const cx = x0 + rad, cy = y0 + rad
        const rx = x < cx ? cx - x : x - (x1 - 1 - rad)
        const ry = y < cy ? cy - y : y - (y1 - 1 - rad)
        if (rx > 0 && ry > 0 && (rx * rx + ry * ry) > rad * rad) continue
      }
      setPx(x, y, color)
    }
  }
}

function fillCircle(cx, cy, r, color) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r * r) setPx(x, y, color)
    }
  }
}

function drawIcon() {
  fillRoundRect(scale(18), scale(18), scale(238), scale(238), scale(54), INK)
  fillRoundRect(scale(26), scale(26), scale(230), scale(230), scale(47), TERRA)

  const tracks = [[96, 110], [128, 168], [160, 92]] // [y, knobCenterX]
  for (const [y, knobX] of tracks) {
    fillRoundRect(scale(70), scale(y - 6), scale(186), scale(y + 6), scale(6), CREME)
    fillCircle(scale(knobX), scale(y), scale(17), INK)
    fillCircle(scale(knobX), scale(y), scale(12), CREME)
  }
}

// --- PNG-Encoding (pure Node) ---
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()

function crc32(data) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8-bit RGBA
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
  for (let y = 0; y < SIZE; y++) {
    raw[y * (SIZE * 4 + 1)] = 0 // Filter: none
    buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function renderPng(size) {
  resetCanvas(size)
  drawIcon()
  return encodePng()
}

// --- ICO-Wrapper (1 Bild, PNG-embedded) ---
function wrapIco(png) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0 // 256×256, kein Palette
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12)
  return Buffer.concat([dir, entry, png])
}

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
const icoFile = path.join(outDir, 'icon.ico')
const pngFile = path.join(outDir, 'icon.png')
fs.writeFileSync(icoFile, wrapIco(renderPng(256)))
fs.writeFileSync(pngFile, renderPng(512))
console.log('[gen-icon] geschrieben:', icoFile, fs.statSync(icoFile).size, 'bytes')
console.log('[gen-icon] geschrieben:', pngFile, fs.statSync(pngFile).size, 'bytes')

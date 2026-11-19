// Imisoro bot connect server.
// Serves a QR pairing page on http://localhost:3010/ and, once scanned,
// keeps the WhatsApp socket live and routes DMs to brain.answerDM().
//
// Usage: node --env-file=.env connect-server.js
const http = require('http')
const fs = require('fs')
const path = require('path')
const QRCode = require('qrcode')
const P = require('pino')
const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const { answerDM } = require('./src/brain')

const PORT = Number(process.env.CONNECT_PORT || 3010)
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'data', 'auth-imisoro')
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true })

const logger = P({ level: 'warn' })
let state = { status: 'starting', qr: null, qrDataUrl: null, phone: null, since: Date.now(), error: null }
const sseClients = new Set()

function setState(patch) {
  state = { ...state, ...patch, since: Date.now() }
  const payload = JSON.stringify({ status: state.status, phone: state.phone, hasQr: !!state.qrDataUrl, error: state.error })
  for (const res of sseClients) {
    try { res.write(`data: ${payload}\n\n`) } catch {}
  }
}

async function makeQr(qr) {
  try {
    const dataUrl = await QRCode.toDataURL(qr, { margin: 1, scale: 8, color: { dark: '#0B2E2E', light: '#FFFFFF' } })
    return dataUrl
  } catch (e) {
    console.error('QR encode error:', e.message)
    return null
  }
}

let sock = null
async function startSock() {
  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 0] }))

  sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: Browsers.appropriate('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u
    if (qr) {
      const dataUrl = await makeQr(qr)
      setState({ status: 'awaiting-scan', qr, qrDataUrl: dataUrl, error: null })
      console.log('[imisoro] QR ready, waiting for scan...')
    }
    if (connection === 'open') {
      const me = sock.user
      const phone = me && me.id ? me.id.split(':')[0].split('@')[0] : null
      setState({ status: 'connected', qr: null, qrDataUrl: null, phone, error: null })
      console.log(`[imisoro] connected as +${phone}`)
    }
    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      setState({ status: loggedOut ? 'logged-out' : 'disconnected', error: lastDisconnect && lastDisconnect.error ? String(lastDisconnect.error.message || code) : null })
      console.log(`[imisoro] connection closed (code=${code} loggedOut=${loggedOut})`)
      if (!loggedOut) setTimeout(() => startSock().catch(console.error), 2000)
    }
  })

  sock.ev.on('messages.upsert', async (ev) => {
    if (ev.type !== 'notify') return
    for (const m of ev.messages || []) {
      try { await handleMessage(m) } catch (e) { console.error('[msg] error:', e.message) }
    }
  })
}

async function handleMessage(m) {
  if (!m.message || m.key.fromMe) return
  const chatId = m.key.remoteJid
  if (!chatId || chatId.endsWith('@g.us')) return // DM-only for MVP
  const text = m.message.conversation
    || (m.message.extendedTextMessage && m.message.extendedTextMessage.text)
    || (m.message.ephemeralMessage && m.message.ephemeralMessage.message && (m.message.ephemeralMessage.message.conversation || (m.message.ephemeralMessage.message.extendedTextMessage && m.message.ephemeralMessage.message.extendedTextMessage.text)))
    || ''
  if (!text.trim()) { console.log(`[dm] ${chatId}: <no text, keys=${Object.keys(m.message)}>`); return }
  const t0 = Date.now()
  console.log(`[dm<-] ${chatId} (${text.length}c): ${text.slice(0, 120)}`)
  let reply = ''
  try {
    // answerDM returns a plain string (the cleaned reply), not { reply, sources }
    reply = (await answerDM(text, [], '')) || ''
    console.log(`[brain] ok in ${Date.now() - t0}ms, reply=${reply.length}c`)
  } catch (e) {
    console.error(`[brain] ERROR in ${Date.now() - t0}ms:`, e.stack || e.message)
    reply = "Sorry, I hit a hiccup on my side. Can you try again?"
  }
  if (!reply.trim()) {
    console.log(`[brain] empty reply, using fallback`)
    reply = "Hi! I am the Imisoro AI assistant. Ask me about the app or about preparing your VAT return in the RRA eTax portal."
  }
  try {
    const t1 = Date.now()
    const res = await sock.sendMessage(chatId, { text: reply })
    console.log(`[dm->] sent in ${Date.now() - t1}ms, msgId=${res && res.key && res.key.id}`)
  } catch (e) {
    console.error(`[send] ERROR:`, e.stack || e.message)
  }
}

function serveFile(res, filePath, ctype) {
  fs.readFile(filePath, (e, data) => {
    if (e) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': ctype, 'Cache-Control': 'no-store' })
    res.end(data)
  })
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost')
  if (u.pathname === '/' || u.pathname === '/connect') {
    return serveFile(res, path.join(__dirname, 'public', 'connect.html'), 'text/html; charset=utf-8')
  }
  if (u.pathname === '/status.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    return res.end(JSON.stringify({ status: state.status, phone: state.phone, hasQr: !!state.qrDataUrl, error: state.error, since: state.since }))
  }
  if (u.pathname === '/qr.png') {
    if (!state.qrDataUrl) { res.writeHead(404); return res.end('no qr') }
    const b64 = state.qrDataUrl.split(',')[1]
    const buf = Buffer.from(b64, 'base64')
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
    return res.end(buf)
  }
  if (u.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    })
    res.write(`data: ${JSON.stringify({ status: state.status, phone: state.phone, hasQr: !!state.qrDataUrl, error: state.error })}\n\n`)
    sseClients.add(res)
    req.on('close', () => sseClients.delete(res))
    return
  }
  if (u.pathname === '/logout') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end('POST only') }
    ;(async () => {
      try { if (sock) await sock.logout() } catch {}
      try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); fs.mkdirSync(AUTH_DIR, { recursive: true }) } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      setTimeout(() => startSock().catch(console.error), 500)
    })()
    return
  }
  res.writeHead(404); res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`[imisoro] connect server on http://localhost:${PORT}/`)
})

startSock().catch((e) => {
  console.error('startSock fatal:', e)
  setState({ status: 'error', error: e.message })
})

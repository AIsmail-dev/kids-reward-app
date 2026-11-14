// Family Link test console: a local-only web app on top of the unofficial g-family-link library.
// Listens on 127.0.0.1 only. Cookies stay in cookies.json next to this file.
import http from 'node:http'
import { readFileSync, writeFileSync, existsSync, unlinkSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FamilyLink } from 'g-family-link'

const DIR = dirname(fileURLToPath(import.meta.url))
const COOKIE_FILE = process.env.COOKIE_FILE || join(DIR, 'cookies.json')
const PORT = Number(process.env.PORT || 4750)
const DEMO = process.env.DEMO === '1'
const AUTH_USER = Number(process.env.AUTH_USER || 0)

let writeEnabled = false
const log = [] // newest first
const record = (kind, text, ok = true) => { log.unshift({ time: new Date().toISOString(), kind, text, ok }); log.length = Math.min(log.length, 200) }

// Safety net: while write mode is off, no non-GET request can leave this computer.
const realFetch = globalThis.fetch
globalThis.fetch = (url, init = {}) => {
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET' && !writeEnabled) throw new Error('Blocked: write mode is off')
  return realFetch(url, init)
}

let client = null
function fl() {
  if (DEMO) return demoClient
  if (!client) {
    if (!existsSync(COOKIE_FILE)) throw Object.assign(new Error('No cookies loaded'), { status: 401 })
    client = FamilyLink.fromCookies(JSON.parse(readFileSync(COOKIE_FILE, 'utf-8')), AUTH_USER)
  }
  return client
}

// ---- actions the UI may call (whitelist) ----
const reads = {
  devices: (f, id) => f.getDevices(id),
  today: (f, id) => f.getDailyScreenTime(id),
  history: (f, id) => f.getScreenTimeByDay(id),
  limits: (f, id) => f.getAppliedTimeLimits(id),
  rules: (f, id) => f.getTimeLimitRules(id),
}
const int = (v, min, max, name) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw Object.assign(new Error(`${name} must be a whole number from ${min} to ${max}`), { status: 400 })
  return n
}
const hhmm = (v, name) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '')) throw Object.assign(new Error(`${name} must be HH:MM`), { status: 400 })
  return v
}
const need = (v, name) => { if (!v) throw Object.assign(new Error(`${name} is required`), { status: 400 }); return v }
const writes = {
  lock: (f, id, p) => f.lockDevice(id, need(p.deviceId, 'deviceId')),
  unlock: (f, id, p) => f.unlockDevice(id, need(p.deviceId, 'deviceId')),
  addBonus: (f, id, p) => f.addTimeBonus(id, need(p.deviceId, 'deviceId'), int(p.minutes, 1, 1440, 'minutes')),
  cancelBonus: (f, id, p) => f.cancelTimeBonus(id, need(p.overrideId, 'overrideId')),
  setDailyLimit: (f, id, p) => f.setDailyLimit(id, need(p.deviceId, 'deviceId'), int(p.minutes, 0, 1440, 'minutes')),
  enableDailyLimit: (f, id) => f.enableDailyLimit(id),
  disableDailyLimit: (f, id) => f.disableDailyLimit(id),
  enableBedtime: (f, id) => f.enableBedtime(id),
  disableBedtime: (f, id) => f.disableBedtime(id),
  setBedtime: (f, id, p) => f.setBedtime(id, hhmm(p.start, 'start'), hhmm(p.end, 'end'), int(p.day, 1, 7, 'day')),
  enableSchoolTime: (f, id) => f.enableSchoolTime(id),
  disableSchoolTime: (f, id) => f.disableSchoolTime(id),
}

// ---- HTTP plumbing ----
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
const readBody = req => new Promise((resolve, reject) => {
  let data = ''
  req.on('data', c => { data += c; if (data.length > 2e6) reject(Object.assign(new Error('Body too large'), { status: 413 })) })
  req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })) } })
})
const local = h => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(h || '')
const errStatus = e => e.status || (e.statusCode >= 400 ? e.statusCode : 500)
const errText = e => {
  if (e.statusCode === 401 || e.name === 'SessionExpiredError' || e.name === 'AuthenticationError') return 'Google rejected the cookies (expired or wrong account). Export them again.'
  return `${e.name && e.name !== 'Error' ? e.name + ': ' : ''}${e.message}`
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const path = url.pathname
  try {
    // Only this computer's browser may talk to the app (blocks other sites and DNS rebinding).
    if (!local(req.headers.host)) return send(res, 403, { error: 'Forbidden host' })
    if (req.method !== 'GET' && req.headers.origin && !local(new URL(req.headers.origin).host)) return send(res, 403, { error: 'Forbidden origin' })

    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(readFileSync(join(DIR, 'index.html')))
    }
    if (req.method === 'GET' && path === '/api/status')
      return send(res, 200, { hasCookies: DEMO || existsSync(COOKIE_FILE), writeEnabled, demo: DEMO, log })

    if (path === '/api/cookies' && req.method === 'POST') {
      const body = await readBody(req)
      const cookies = body.cookies
      if (!Array.isArray(cookies) || !cookies.some(c => c && c.name === 'SAPISID'))
        return send(res, 400, { error: 'That is not a Cookie-Editor JSON export containing the SAPISID cookie.' })
      writeFileSync(COOKIE_FILE, JSON.stringify(cookies), { mode: 0o600 }); chmodSync(COOKIE_FILE, 0o600)
      client = null; record('auth', `Loaded ${cookies.length} cookies`)
      return send(res, 200, { ok: true })
    }
    if (path === '/api/cookies' && req.method === 'DELETE') {
      if (existsSync(COOKIE_FILE)) unlinkSync(COOKIE_FILE)
      client = null; writeEnabled = false; record('auth', 'Cookies deleted')
      return send(res, 200, { ok: true })
    }
    if (path === '/api/write-mode' && req.method === 'POST') {
      writeEnabled = !!(await readBody(req)).enabled
      record('mode', writeEnabled ? 'Write mode ON' : 'Write mode OFF')
      return send(res, 200, { writeEnabled })
    }
    if (path === '/api/children' && req.method === 'GET') {
      const kids = await fl().getChildren()
      record('read', `getChildren → ${kids.length}`)
      return send(res, 200, kids.map(k => ({ id: k.userId, name: k.profile?.displayName || 'Child', photo: k.profile?.photoUrl || null })))
    }

    const m = path.match(/^\/api\/child\/([A-Za-z0-9_-]+)\/(overview|action)$/)
    if (m && m[2] === 'overview' && req.method === 'GET') {
      const f = fl(), out = {}, errors = {}
      await Promise.all(Object.entries(reads).map(async ([key, fn]) => {
        try { out[key] = await fn(f, m[1]) } catch (e) { errors[key] = errText(e) }
      }))
      const failed = Object.keys(errors)
      record('read', `overview → ${failed.length ? 'failed: ' + failed.join(', ') : 'ok'}`, !failed.length)
      return send(res, 200, { ...out, errors })
    }
    if (m && m[2] === 'action' && req.method === 'POST') {
      const p = await readBody(req)
      const fn = writes[p.action]
      if (!fn) return send(res, 400, { error: 'Unknown action' })
      if (!writeEnabled) return send(res, 403, { error: 'Write mode is off. Turn it on at the top of the page first.' })
      const detail = [p.action, p.minutes != null && `${p.minutes} min`, p.start && `${p.start}–${p.end} day ${p.day}`].filter(Boolean).join(' ')
      try {
        const result = await fn(fl(), m[1], p)
        record('write', `${detail} → ${result === false ? 'library returned false' : 'ok'}`, result !== false)
        return send(res, 200, { ok: result !== false, result })
      } catch (e) {
        record('write', `${detail} → ${errText(e)}`, false)
        throw e
      }
    }
    send(res, 404, { error: 'Not found' })
  } catch (e) {
    send(res, errStatus(e), { error: errText(e) })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Family Link test console: http://127.0.0.1:${PORT}${DEMO ? '  (demo data, no Google calls)' : ''}`)
  console.log('Press Ctrl+C to stop.')
})

// ---- demo data (npm run demo): lets you try the UI without touching Google ----
const demoState = { locked: {}, bonus: {}, limit: { d1: 120, d2: 90 }, limitOn: true, bed: true, school: false,
  bedSched: [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, start: [21, 0], end: [7, 0] })) }
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const st = (s, apps) => ({ totalSeconds: s, formatted: new Date(s * 1000).toISOString().slice(11, 19), hours: Math.floor(s / 3600), minutes: Math.floor(s % 3600 / 60), seconds: s % 60, appBreakdown: apps })
const demoApps = { 'com.google.android.youtube': 2520, 'com.roblox.client': 1800, 'com.duolingo': 900, 'com.android.chrome': 420, 'com.whatsapp': 300 }
const demoDevs = { c1: [{ deviceId: 'd1', name: 'Galaxy Tab A9', model: 'SM-X110' }], c2: [{ deviceId: 'd2', name: 'Pixel 7', model: 'Pixel 7' }], c3: [] }
const demoClient = {
  getChildren: async () => [['c1', 'Demo Child A'], ['c2', 'Demo Child B'], ['c3', 'Demo Child C']].map(([userId, displayName]) => ({ userId, profile: { displayName } })),
  getDevices: async id => demoDevs[id] || [],
  getDailyScreenTime: async id => demoDevs[id]?.length ? st(5940, demoApps) : st(0, {}),
  getScreenTimeByDay: async id => demoDevs[id]?.length ? Object.fromEntries([...Array(14)].map((_, i) => [day(i), st(1800 + ((i * 2671) % 7200), demoApps)])) : {},
  getAppliedTimeLimits: async id => ({
    deviceLockStates: Object.fromEntries((demoDevs[id] || []).map(d => [d.deviceId, !!demoState.locked[d.deviceId]])),
    devices: Object.fromEntries((demoDevs[id] || []).map(d => [d.deviceId, { totalAllowedMinutes: demoState.limit[d.deviceId], usedMinutes: 99, remainingMinutes: Math.max(0, demoState.limit[d.deviceId] - 99) + (demoState.bonus[d.deviceId] || 0),
      dailyLimitEnabled: demoState.limitOn, dailyLimitMinutes: demoState.limit[d.deviceId], bedtimeActive: false, schooltimeActive: false, bonusMinutes: demoState.bonus[d.deviceId] || 0, bonusOverrideId: demoState.bonus[d.deviceId] ? 'ov-' + d.deviceId : null }])) }),
  getTimeLimitRules: async () => ({ bedtimeEnabled: demoState.bed, schoolTimeEnabled: demoState.school, bedtimeSchedule: demoState.bedSched,
    schoolTimeSchedule: [1, 2, 3, 4, 5].map(d => ({ day: d, start: [8, 0], end: [14, 30] })), bedtimeRuleId: 'bed', schooltimeRuleId: 'school' }),
  lockDevice: async (_, d) => (demoState.locked[d] = true), unlockDevice: async (_, d) => { demoState.locked[d] = false; return true },
  addTimeBonus: async (_, d, m) => { demoState.bonus[d] = m; return true }, cancelTimeBonus: async (_, o) => { delete demoState.bonus[o.slice(3)]; return true },
  setDailyLimit: async (_, d, m) => { demoState.limit[d] = m; return true },
  enableDailyLimit: async () => (demoState.limitOn = true), disableDailyLimit: async () => { demoState.limitOn = false; return true },
  enableBedtime: async () => (demoState.bed = true), disableBedtime: async () => { demoState.bed = false; return true },
  setBedtime: async (_, s, e, d) => { const x = demoState.bedSched.find(r => r.day === d); x.start = s.split(':').map(Number); x.end = e.split(':').map(Number); return true },
  enableSchoolTime: async () => (demoState.school = true), disableSchoolTime: async () => { demoState.school = false; return true },
}

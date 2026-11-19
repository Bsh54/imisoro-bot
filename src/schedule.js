// Deterministic schedule tool.
// Produces a plain-text block injected into the LLM prompt so the brain never
// has to guess dates or deadlines. The lists below are empty in the public
// template: fill EVENTS and RECURRING for your deployment, or keep them empty
// if your bot does not need a schedule.

const fs = require('fs')
const path = require('path')

// Build a Date for a wall-clock time in CAT (UTC+2). Keeping the helper so
// deployments can add dated events easily.
function cat(y, m, d, hh = 0, mm = 0) { return new Date(Date.UTC(y, m - 1, d, hh - 2, mm)) }

// One-off dated events: deadlines, launches, milestones.
// Shape: { name, at (Date), link? (join URL), note? (extra copy) }
const EVENTS = []

// Weekly recurring sessions. 0 = Sunday, 6 = Saturday, wall-clock time in CAT.
// Shape: { name, weekday, time (display string), link?, from? (Date, optional start) }
const RECURRING = []

const _OVR_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'schedule-overrides.json')
function _loadOverrides() { try { return JSON.parse(fs.readFileSync(_OVR_FILE, 'utf8')) } catch { return [] } }
function cancelledByOverride(name, ymd) {
  const inc = (t, n) => !!t && !!n && n.toLowerCase().includes(String(t).toLowerCase())
  return _loadOverrides().some((o) =>
    (o.op === 'cancel' && inc(o.target, name) && (!o.date || o.date === ymd)) ||
    (o.op === 'reschedule' && inc(o.target, name) && o.date === ymd))
}

const _CAL_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'calendar.json')
function _customEventsOn(ymd) {
  let list = []
  try { list = JSON.parse(fs.readFileSync(_CAL_FILE, 'utf8')) } catch { return [] }
  if (!Array.isArray(list)) return []
  return list
    .filter((c) => c && c.date === ymd && c.type !== 'reminder' && !cancelledByOverride(c.title, ymd))
    .map((c) => `${c.title}${c.time ? ' at ' + c.time : ''}${c.link ? ' - ' + c.link : ''}`)
}

function ymdCAT(d) {
  const o = {}
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Maputo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).forEach((p) => (o[p.type] = p.value))
  return `${o.year}-${o.month}-${o.day}`
}
const dayName = (ymd) => new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(ymd + 'T12:00:00Z'))
const weekdayOf = (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay()

function sessionsOn(ymd) {
  const wd = weekdayOf(ymd)
  const out = []
  for (const r of RECURRING) {
    if (r.weekday === wd && (!r.from || ymd >= ymdCAT(r.from))) out.push(`${r.name} at ${r.time}${r.link ? ' - ' + r.link : ''}`)
  }
  for (const e of EVENTS) {
    if (ymdCAT(e.at) === ymd) out.push(`${e.name}${e.note ? ' (' + e.note + ')' : ''}${e.link ? ' - ' + e.link : ''}`)
  }
  for (const c of _customEventsOn(ymd)) out.push(c)
  return out
}

function nextOccurrence(weekday, from, todayYmd) {
  const start = new Date(todayYmd + 'T12:00:00Z').getTime()
  for (let i = 1; i <= 14; i++) {
    const ymd = new Date(start + i * 86400000).toISOString().slice(0, 10)
    if (weekdayOf(ymd) === weekday && (!from || ymd >= ymdCAT(from))) return ymd
  }
  return null
}

function computeSchedule(now = new Date()) {
  const today = ymdCAT(now)
  const base = new Date(today + 'T12:00:00Z')
  const tomo = ymdCAT(new Date(base.getTime() + 86400000))
  const todayList = sessionsOn(today)
  const tomoList = sessionsOn(tomo)

  const nextLines = RECURRING.map((r) => {
    const ymd = nextOccurrence(r.weekday, r.from, today)
    if (!ymd) return null
    const days = Math.round((new Date(ymd + 'T12:00:00Z') - base) / 86400000)
    const when = days === 1 ? 'tomorrow' : `in ${days} days`
    return `${r.name}: ${dayName(ymd)} ${ymd} (${when}) at ${r.time}`
  }).filter(Boolean)

  const soon = EVENTS.filter((e) => e.at >= now && e.at - now <= 21 * 86400000)
    .sort((a, b) => a.at - b.at)
    .map((e) => {
      const diff = e.at - now
      const days = Math.floor(diff / 86400000)
      const hrs = Math.floor(diff / 3600000)
      const when = days >= 2 ? `in ${days} days` : hrs >= 1 ? `in ${hrs}h` : 'very soon'
      return `${e.name} (${ymdCAT(e.at)}, ${when})`
    })

  const lines = ['COMPUTED SCHEDULE (deterministic reference, computed from the system clock. Use only when the user actually asks about dates, deadlines or what comes next):']
  lines.push(`- Today (${dayName(today)} ${today}): ${todayList.length ? todayList.join(' | ') : 'no scheduled session'}`)
  lines.push(`- Tomorrow (${dayName(tomo)} ${tomo}): ${tomoList.length ? tomoList.join(' | ') : 'no scheduled session'}`)
  if (nextLines.length) lines.push(`- Next recurring sessions: ${nextLines.join(' ; ')}`)
  if (soon.length) lines.push(`- Upcoming deadlines (next 21 days): ${soon.join(' ; ')}`)
  return lines.join('\n')
}

// No scheduled alerts by default. Return nothing so the bot stays quiet unless
// a deployment plugs in its own reminders.
function computeDueAlerts() { return [] }

module.exports = { computeSchedule, computeDueAlerts, EVENTS, RECURRING, cat }

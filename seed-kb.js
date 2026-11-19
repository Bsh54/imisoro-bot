// Loads the Imisoro seed KB (data/knowledge-imisoro.jsonl) into memory.db via addCurated().
// Idempotent: entries use stable msg_id prefixes, so re-running skips existing rows.
// Usage: node seed-kb.js [path/to/knowledge.jsonl]
const fs = require('fs')
const path = require('path')
const { addCurated, db } = require('./src/memory')

const file = process.argv[2] || path.join(__dirname, 'data', 'knowledge-imisoro.jsonl')
if (!fs.existsSync(file)) {
  console.error('KB file not found:', file)
  process.exit(1)
}

const now = Date.now()
const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
let added = 0, skipped = 0, errors = 0

for (const line of lines) {
  let row
  try { row = JSON.parse(line) } catch (e) { errors++; console.warn('bad JSON:', line.slice(0, 80)); continue }
  if (!row.text || !row.id) { errors++; continue }
  try {
    const id = addCurated({
      msg_id: row.id,
      ts: now,
      group_id: 'imisoro-seed',
      group_name: 'Imisoro seed',
      sender_id: 'seed',
      sender_name: 'Imisoro seed',
      text: row.text,
      source_role: 'admin',
      confidence: 0.95,
    })
    if (id) added++
    else skipped++
  } catch (e) {
    errors++
    console.warn('insert error for', row.id, e.message)
  }
}

const total = db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE msg_id LIKE 'seed:imisoro:%'`).get().n
console.log(`\nSeed done: added=${added} skipped=${skipped} errors=${errors}`)
console.log(`Total seed rows in DB: ${total}\n`)

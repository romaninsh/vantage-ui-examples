#!/usr/bin/env node
/**
 * schema/catalog/models.yaml -> data/silver/dim_platform.csv
 *
 * The platform is how a model is SERVED, which is a different question from who
 * built it. Claude through Bedrock lands on the AWS invoice; the same model
 * called directly lands on another. Six rows, one per line on the bill.
 *
 * NO BRIDGE TABLE. Which platforms can serve which models is derivable from
 * `serves` and nothing on any dashboard asks the question, so the routing stays
 * in the simulator and only the chosen route is stored — on the fact, where it
 * is a measurement rather than a possibility.
 *
 *   node scripts/silver/platforms.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = 'schema/catalog/models.yaml'
const doc = YAML.parse(readFileSync(resolve(ROOT, SRC), 'utf8'))
const [FROM, TO] = doc.meta.period.map(String)

const rows = doc.platforms.map(p => ({
  platform_id: p.code,
  platform_name: p.name,
  billed_by: p.billed_by,
  live_from_month: String(p.live_from),
  note: p.note.trim().replace(/\s+/g, ' '),
  // Denormalised so "which vendors does this route serve" is readable in
  // Metabase without parsing YAML. The simulator reads the YAML directly.
  serves_providers: p.serves.join(' | '),
  serves_count: p.serves.length,
  routing_weight: p.weight,
  // Internal reach per month, Jan..Jul. Text because nothing joins on it and a
  // 42-row bridge table would exist for a column no dashboard reads.
  availability: (p.availability ?? []).map(v => v.toFixed(2)).join(' | '),
  first_wave: p.first_wave?.length ? p.first_wave.join(' | ') : 'everyone',
  source_file: SRC,
}))

// ---------------------------------------------------------------- assertions
const fail = []
const ids = rows.map(r => r.platform_id)
if (new Set(ids).size !== ids.length) fail.push('duplicate platform_id')

const providers = new Set(doc.models.map(m => m.provider))
const served = new Set(doc.platforms.flatMap(p => p.serves))
for (const p of providers) if (!served.has(p)) fail.push(`provider ${p} has no platform that serves it`)
for (const p of served) if (!providers.has(p)) fail.push(`platform serves ${p}, which no model uses`)

// Column widths, asserted here rather than discovered by COPY. The loader runs
// AFTER the simulation, so a value that is too long costs a four-minute rebuild
// to find out about.
const WIDTH = { platform_name: 40, billed_by: 40, note: 400, serves_providers: 400, availability: 80, first_wave: 120 }
rows.forEach(r => {
  for (const [col, max] of Object.entries(WIDTH)) {
    if (String(r[col]).length > max) {
      fail.push(`${r.platform_id}.${col} is ${String(r[col]).length} chars, column holds ${max}`)
    }
  }
  if (r.live_from_month < FROM) fail.push(`${r.platform_name} goes live before the period`)
  if (r.live_from_month > TO) fail.push(`${r.platform_name} never goes live inside the period`)
  if (!(r.routing_weight > 0)) fail.push(`${r.platform_name} has no routing weight`)
})

// Availability must cover the period, never shrink, and be zero before the
// platform exists. A rollout that goes backwards means somebody's entitlement
// was revoked, which is not something this model represents.
doc.platforms.forEach(p => {
  const a = p.availability
  if (!a || a.length !== 7) { fail.push(`${p.code}: availability must have 7 months`); return }
  for (let i = 0; i < 7; i++) {
    if (a[i] < 0 || a[i] > 1) fail.push(`${p.code}: availability[${i}] is not a share`)
    if (i && a[i] < a[i - 1]) fail.push(`${p.code}: availability falls in month ${i + 1}`)
    const month = `2026-0${i + 1}`
    if (month < String(p.live_from) && a[i] > 0) {
      fail.push(`${p.code}: reachable in ${month}, before it goes live`)
    }
  }
  if (a[6] <= 0) fail.push(`${p.code}: never reachable by anyone`)
})

// The gateway is the whole June story. If it is not mid-period there is no
// step change to explain and the month series becomes a smooth ramp.
const gateway = rows.find(r => r.platform_id === 'aws-bedrock')
if (!gateway) fail.push('no aws-bedrock platform')
else if (gateway.live_from_month === FROM) {
  fail.push('the Bedrock gateway is live from month one — the June step has no cause')
}

// A model is callable from the later of its own release and its first live
// route. Amazon's models really are gated behind the gateway — you cannot call
// Nova without Bedrock — so this is not a defect to fix, it is the June story
// showing up in the catalogue. What WOULD be a defect is a model that is
// unreachable for the whole period.
const gatedByGateway = []
doc.models.forEach(m => {
  const routes = doc.platforms.filter(p => p.serves.includes(m.provider))
  if (!routes.length) { fail.push(`${m.id}: no platform serves ${m.provider}`); return }
  const opens = routes.map(p => String(p.live_from)).sort()[0]
  const callable = opens > String(m.released) ? opens : String(m.released)
  if (callable > TO) fail.push(`${m.id}: never callable inside the period`)
  if (opens > String(m.released)) gatedByGateway.push({ id: m.id, released: String(m.released), callable })
})

if (fail.length) { console.error('GENERATION FAILED\n  ' + fail.join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = Object.keys(rows[0])
const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
writeFileSync(resolve(ROOT, 'data/silver/dim_platform.csv'),
  COLS.join(',') + '\n' + rows.map(r => COLS.map(c => esc(r[c])).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
console.log(`${rows.length} platforms — the axis the invoice arrives on\n`)
console.log('platform'.padEnd(22) + 'billed by'.padEnd(14) + 'live'.padEnd(10)
  + pad('weight', 8) + '  serves')
console.log('-'.repeat(96))
rows.forEach(r => console.log(
  r.platform_name.padEnd(22) + r.billed_by.padEnd(14) + r.live_from_month.padEnd(10)
  + pad(r.routing_weight, 8) + '  '
  + (r.serves_count > 5 ? `${r.serves_count} providers` : r.serves_providers)))
console.log('-'.repeat(96))

console.log('\ninternal reach — share of the bank that can route through it')
console.log('platform'.padEnd(22) + ['Jan','Feb','Mar','Apr','May','Jun','Jul'].map(m => pad(m, 7)).join('')
  + '   first wave')
console.log('-'.repeat(96))
doc.platforms.forEach(p => console.log(
  p.name.padEnd(22)
  + (p.availability ?? []).map(v => pad(v ? (v * 100).toFixed(0) + '%' : '—', 7)).join('')
  + '   ' + (p.first_wave ? p.first_wave.join(', ') : 'everyone')))
console.log('-'.repeat(96))

const models = doc.models.length
const multi = doc.models.filter(m =>
  doc.platforms.filter(p => p.serves.includes(m.provider)).length > 1).length
console.log(`${multi} of ${models} models can be reached more than one way`)
console.log(`gateway opens ${gateway.live_from_month} — no Bedrock line on the invoice before it`)
if (gatedByGateway.length) {
  console.log(`${gatedByGateway.length} models are released but not callable until their route opens:`)
  console.log('  ' + gatedByGateway.map(g => `${g.id} (${g.callable})`).join(', '))
}

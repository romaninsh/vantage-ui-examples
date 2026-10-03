#!/usr/bin/env node
/**
 * schema/catalog/models.yaml -> data/silver/dim_model.csv
 *
 * Identity, lifecycle and price. No dim_rate: prices never change here.
 *
 *   node scripts/silver/models.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = 'schema/catalog/models.yaml'
const doc = YAML.parse(readFileSync(resolve(ROOT, SRC), 'utf8'))

const TIER_NAME = Object.fromEntries(doc.tiers.map(t => [t.code, t.name]))
// Negotiated rate is derived, not stored: keeping both in the YAML would let
// them drift the first time someone edits a discount.
const DISCOUNTS = doc.discounts
const netRate = m => Number(m.list) * (1 - (DISCOUNTS[m.provider] ?? DISCOUNTS.default))
const [FROM, TO] = doc.meta.period.map(String)

const rows = doc.models.map(m => ({
  model_id: m.id,
  model_name: m.name,
  provider: m.provider,
  provider_group: m.group,
  vendor: m.vendor,
  family: m.family,
  model_tier: m.tier,
  tier_name: TIER_NAME[m.tier],
  modality: m.modality,
  is_reasoning: Boolean(m.reasoning),
  context_window: m.context ?? 0,
  list_rate_per_1m: Number(m.list).toFixed(4),
  rate_per_1m: netRate(m).toFixed(4),
  released_month: String(m.released),
  retired_month: m.retired ? String(m.retired) : null,
  is_active: !m.retired,
  source_file: SRC,
}))

// The six reporting buckets, taken from the catalogue rather than restated —
// a typo in the YAML should fail here, not silently invent a seventh group.
const GROUPS = [...new Set(doc.models.map(m => m.group))]

// ---------------------------------------------------------------- assertions
const fail = []

const ids = rows.map(r => r.model_id)
if (new Set(ids).size !== ids.length) fail.push('duplicate model_id')
const names = rows.map(r => r.model_name)
if (new Set(names).size !== names.length) fail.push('duplicate model_name')
if (GROUPS.length !== 6) fail.push(`${GROUPS.length} provider groups, expected 6: ${GROUPS.join(', ')}`)

rows.forEach(r => {
  if (!TIER_NAME[r.model_tier]) fail.push(`${r.model_id}: unknown tier ${r.model_tier}`)
  if (r.retired_month && r.retired_month < r.released_month) fail.push(`${r.model_id} retires before it launches`)
  // A model that launches after the period, or retired before it, can never
  // appear in a fact row — it is dead weight in the catalogue.
  if (r.released_month > TO) fail.push(`${r.model_id} launches after the period`)
  if (r.retired_month && r.retired_month < FROM) fail.push(`${r.model_id} retired before the period`)
  if (r.is_reasoning && r.model_tier === 'untiered') fail.push(`${r.model_id} is untiered but flagged reasoning`)
  if (!(Number(r.rate_per_1m) > 0)) fail.push(`${r.model_id} has no rate`)
  if (Number(r.list_rate_per_1m) < Number(r.rate_per_1m)) fail.push(`${r.model_id} pays over list`)
})

// Price has to track tier, or "$/1M is caused by model mix" — which is the
// whole argument the executive page makes — stops being true.
const avgRate = t => {
  const set = rows.filter(r => r.model_tier === t)
  return set.reduce((s, r) => s + Number(r.rate_per_1m), 0) / set.length
}
if (avgRate('top') <= avgRate('high')) fail.push('top tier is not dearer than high balanced')
if (avgRate('high') <= avgRate('base')) fail.push('high balanced is not dearer than base')

// Lifecycle has to produce actual movement or the columns are decorative — the
// whole point is that tier trends get derived rather than typed.
const launched = rows.filter(r => r.released_month > FROM).length
const retired = rows.filter(r => r.retired_month).length
if (launched < 3) fail.push('almost nothing launches mid-period — the trend will be flat')
if (retired < 5) fail.push('almost nothing retires mid-period — the trend will be flat')

const liveIn = key => rows.filter(r =>
  r.released_month <= key && (!r.retired_month || r.retired_month >= key))

for (let m = 1; m <= 7; m++) {
  const key = `2026-${String(m).padStart(2, '0')}`
  if (liveIn(key).length < 20) fail.push(`only ${liveIn(key).length} models live in ${key}`)
}

if (fail.length) { console.error('GENERATION FAILED\n  ' + fail.join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = Object.keys(rows[0])
const esc = v => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
writeFileSync(resolve(ROOT, 'data/silver/dim_model.csv'),
  COLS.join(',') + '\n' + rows.map(r => COLS.map(c => esc(r[c])).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
console.log(`${rows.length} models · ${launched} launched mid-period · ${retired} retired mid-period\n`)

console.log('provider group'.padEnd(18) + pad('models', 8) + pad('providers', 11) + pad('families', 10))
console.log('-'.repeat(47))
GROUPS.forEach(g => {
  const set = rows.filter(r => r.provider_group === g)
  console.log(g.padEnd(18) + pad(set.length, 8)
    + pad(new Set(set.map(r => r.provider)).size, 11)
    + pad(new Set(set.map(r => r.family)).size, 10))
})

console.log('\ntier'.padEnd(19) + pad('models', 8) + pad('reasoning', 11) + pad('avg $/1M', 11) + pad('range', 18))
console.log('-'.repeat(67))
doc.tiers.forEach(t => {
  const set = rows.filter(r => r.model_tier === t.code)
  const rs = set.map(r => Number(r.rate_per_1m)).sort((a, b) => a - b)
  console.log(t.name.padEnd(18) + pad(set.length, 8) + pad(set.filter(r => r.is_reasoning).length, 11)
    + pad('$' + avgRate(t.code).toFixed(2), 11)
    + pad(`$${rs[0].toFixed(2)} - $${rs[rs.length - 1].toFixed(2)}`, 18))
})

const listSum = rows.reduce((s, r) => s + Number(r.list_rate_per_1m), 0)
const netSum = rows.reduce((s, r) => s + Number(r.rate_per_1m), 0)
console.log(`\nblended discount across the catalogue: ${((1 - netSum / listSum) * 100).toFixed(1)}%`)

console.log('\nmodels live per month')
console.log('-'.repeat(44))
for (let m = 1; m <= 7; m++) {
  const key = `2026-${String(m).padStart(2, '0')}`
  const inn = rows.filter(r => r.released_month === key).length
  const out = rows.filter(r => r.retired_month === key).length
  console.log(key.padEnd(12) + pad(liveIn(key).length, 6)
    + (inn ? `  +${inn} launched` : '') + (out ? `  -${out} retired` : ''))
}

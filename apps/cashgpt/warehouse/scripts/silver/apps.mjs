#!/usr/bin/env node
/**
 * schema/catalog/apps.yaml + data/silver/dim_org_unit.csv -> data/silver/dim_app.csv
 *
 * The only real work is resolving each app's owning department from business
 * names to the generated org_id. That lookup is the whole reason this is a
 * generator rather than a static CSV: department names are authored and stable,
 * org_ids are expanded and change whenever the tree is rebuilt.
 *
 *   node scripts/silver/apps.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = 'schema/catalog/apps.yaml'
const doc = YAML.parse(readFileSync(resolve(ROOT, SRC), 'utf8'))
const [FROM, TO] = doc.meta.period.map(String)

// ---------------------------------------------------------------- org lookup
const csv = readFileSync(resolve(ROOT, 'data/silver/dim_org_unit.csv'), 'utf8').trim().split('\n')
const head = csv[0].split(',')
function parseLine(line) {
  const out = []; let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return Object.fromEntries(out.map((v, i) => [head[i], v]))
}
const units = csv.slice(1).map(parseLine)

// Keyed on the full business path, not the department name alone — names repeat
// across the bank. "Data Products" exists in two different divisions.
const byPath = new Map(units
  .filter(u => u.org_level === '4')
  .map(u => [`${u.lob_name}|${u.division_name}|${u.department_name}`, u]))

// ---------------------------------------------------------------- build
const UNITS = doc.units.map(u => u.code)

// kind -> usage driver, inverted from the declaration so a kind cannot land in
// two buckets without the load failing.
const DRIVER_OF = {}
for (const [driver, kinds] of Object.entries(doc.usage_drivers)) {
  for (const k of kinds) {
    if (DRIVER_OF[k]) throw new Error(`kind ${k} is in two usage drivers`)
    DRIVER_OF[k] = driver
  }
}
for (const k of doc.kinds) if (!DRIVER_OF[k]) throw new Error(`kind ${k} has no usage driver`)

const fail = []

const rows = doc.apps.map(a => {
  const key = `${a.owner.lob}|${a.owner.division}|${a.owner.department}`
  const org = byPath.get(key)
  if (!org) {
    fail.push(`${a.name}: no department "${key.replace(/\|/g, ' / ')}"`)
    return null
  }
  return {
    app_id: a.id,
    app_name: a.name,
    description: a.description,
    owner_org_id: org.org_id,
    owner_department: org.department_name,
    owner_division: org.division_name,
    owner_lob_id: org.lob_id,
    owner_lob_name: org.lob_name,
    status: a.status,
    audience: a.audience,
    launched_month: String(a.launched),
    primary_unit: a.primary_unit,
    kind: a.kind,
    usage_driver: DRIVER_OF[a.kind],
    source_file: SRC,
  }
}).filter(Boolean)

// ---------------------------------------------------------------- assertions
const ids = rows.map(r => r.app_id)
if (new Set(ids).size !== ids.length) fail.push('duplicate app_id')
const names = rows.map(r => r.app_name)
if (new Set(names).size !== names.length) fail.push('duplicate app_name')

rows.forEach(r => {
  if (!doc.statuses.includes(r.status)) fail.push(`${r.app_name}: bad status ${r.status}`)
  if (!doc.audiences.includes(r.audience)) fail.push(`${r.app_name}: bad audience ${r.audience}`)
  if (!UNITS.includes(r.primary_unit)) fail.push(`${r.app_name}: bad unit ${r.primary_unit}`)
  // an app launching after the period can never appear in a fact row
  if (r.launched_month > TO) fail.push(`${r.app_name} launches after the period`)
  if (r.launched_month < FROM) fail.push(`${r.app_name} launched before the period starts`)
})

// A catalogue where everything is live and internal has no shape — the Use
// Cases page filters on both and would filter to nothing interesting.
const byStatus = s => rows.filter(r => r.status === s).length
if (byStatus('production') < 8) fail.push('too few production apps')
if (byStatus('pilot') + byStatus('development') < 2) fail.push('nothing in flight')
if (byStatus('sunset') < 1) fail.push('nothing being retired')
if (rows.filter(r => r.audience === 'customer_facing').length < 2) fail.push('no customer-facing apps')

// Owners have to spread across the bank, or "owner is not consumer" stops being
// a point worth making.
if (new Set(rows.map(r => r.owner_lob_id)).size < 8) fail.push('apps owned by too few lines of business')

if (fail.length) { console.error('GENERATION FAILED\n  ' + fail.join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = Object.keys(rows[0])
const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
writeFileSync(resolve(ROOT, 'data/silver/dim_app.csv'),
  COLS.join(',') + '\n' + rows.map(r => COLS.map(c => esc(r[c])).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
console.log(`${rows.length} apps, every owner resolved to a real department\n`)
console.log('app'.padEnd(20) + 'status'.padEnd(13) + 'audience'.padEnd(17)
  + 'unit'.padEnd(11) + 'from'.padEnd(9) + 'owning department')
console.log('-'.repeat(112))
rows.forEach(r => console.log(
  r.app_name.padEnd(20) + r.status.padEnd(13) + r.audience.padEnd(17)
  + r.primary_unit.padEnd(11) + r.launched_month.padEnd(9)
  + `${r.owner_lob_name} / ${r.owner_department}`))
console.log('-'.repeat(112))
console.log(`${new Set(rows.map(r => r.owner_lob_id)).size} of 13 lines of business own at least one app`)

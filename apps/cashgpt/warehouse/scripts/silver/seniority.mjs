#!/usr/bin/env node
/**
 * schema/org/seniority.yaml -> data/silver/dim_seniority.csv
 *
 * Loads the HR-fact columns only. ai_adoption and ai_intensity stay in the YAML
 * for the usage generators to read — see the note in dim_seniority.sql for why
 * they are not columns.
 *
 *   node scripts/silver/seniority.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = 'schema/org/seniority.yaml'
const doc = YAML.parse(readFileSync(resolve(ROOT, SRC), 'utf8'))

const rows = doc.levels.map(l => ({
  seniority_code: l.code,
  seniority_rank: l.rank,
  title: l.title,
  band_code: l.band,
  manager_eligible: l.manager_eligible,
  heads_org_level_min: l.heads_org_level ? l.heads_org_level[0] : null,
  heads_org_level_max: l.heads_org_level ? l.heads_org_level[1] : null,
  population_share: l.population_share.toFixed(5),
  source_file: SRC,
}))

// ---------------------------------------------------------------- assertions
const fail = []
const share = doc.levels.reduce((s, l) => s + l.population_share, 0)
// exact to the cent of a percent, because it is apportioned against 500,000
if (Math.abs(share - 1) > 1e-9) fail.push(`population_share sums to ${share}, not 1`)

const ranks = doc.levels.map(l => l.rank)
if (new Set(ranks).size !== ranks.length) fail.push('duplicate ranks')
if (Math.min(...ranks) !== 1 || Math.max(...ranks) !== doc.levels.length) fail.push('ranks are not 1..n')
doc.levels.forEach(l => {
  if (l.manager_eligible !== Boolean(l.heads_org_level)) {
    fail.push(`${l.code}: manager_eligible and heads_org_level disagree`)
  }
})
// the pyramid has to narrow — a grade cannot be more populous than the one below
for (let i = 1; i < doc.levels.length; i++) {
  if (doc.levels[i].population_share > doc.levels[i - 1].population_share) {
    fail.push(`${doc.levels[i].code} is more populous than ${doc.levels[i - 1].code}`)
  }
}
// seniority must buy scope, not lose it
for (let i = 1; i < doc.levels.length; i++) {
  const a = doc.levels[i - 1].heads_org_level, b = doc.levels[i].heads_org_level
  if (a && b && b[0] > a[0]) fail.push(`${doc.levels[i].code} heads a narrower scope than ${doc.levels[i - 1].code}`)
}
if (fail.length) { console.error('EXPANSION FAILED\n  ' + fail.join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = Object.keys(rows[0])
writeFileSync(resolve(ROOT, 'data/silver/dim_seniority.csv'),
  COLS.join(',') + '\n'
  + rows.map(r => COLS.map(c => (r[c] === null ? '' : String(r[c]))).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
const HC = doc.meta.headcount
console.log(`${rows.length} grades -> data/silver/dim_seniority.csv\n`)
console.log('rank  grade'.padEnd(32) + 'band'.padEnd(7) + pad('share', 8) + pad('headcount', 11) + '  heads')
console.log('-'.repeat(74))
doc.levels.forEach(l => console.log(
  `  ${l.rank}   ${l.title}`.padEnd(32) + l.band.padEnd(7)
  + pad((l.population_share * 100).toFixed(1) + '%', 8)
  + pad(Math.round(l.population_share * HC).toLocaleString('en-US'), 11)
  + '  ' + (l.heads_org_level ? `org level ${l.heads_org_level[0]}–${l.heads_org_level[1]}` : 'individual contributor')))
console.log('-'.repeat(74))
console.log('      TOTAL'.padEnd(39) + pad('100.0%', 8) + pad(HC.toLocaleString('en-US'), 11))

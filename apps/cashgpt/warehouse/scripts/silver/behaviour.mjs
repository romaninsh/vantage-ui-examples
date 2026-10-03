#!/usr/bin/env node
/**
 * schema/catalog/behaviour.yaml -> data/silver/dim_behaviour_profile.csv
 *
 *   node scripts/silver/behaviour.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = 'schema/catalog/behaviour.yaml'
const doc = YAML.parse(readFileSync(resolve(ROOT, SRC), 'utf8'))

const rows = doc.profiles.map(p => ({
  profile_code: p.code,
  profile_name: p.name,
  note: p.note.trim().replace(/\s+/g, ' '),
  adopt_prob: p.adopt.toFixed(3),
  start_month_min: p.start[0],
  start_month_max: p.start[1],
  churn_prob: p.churn.toFixed(3),
  intensity_median: p.intensity.median,
  intensity_sigma: p.intensity.sigma.toFixed(2),
  volatility: p.volatility.toFixed(2),
  models_min: p.breadth.models[0],
  models_max: p.breadth.models[1],
  apps_min: p.breadth.apps[0],
  apps_max: p.breadth.apps[1],
  novelty: p.novelty.toFixed(2),
  spike_prob: p.spike.prob.toFixed(3),
  spike_mult_min: p.spike.mult[0].toFixed(2),
  spike_mult_max: p.spike.mult[1].toFixed(2),
  source_file: SRC,
}))

const fail = []
const codes = rows.map(r => r.profile_code)
if (new Set(codes).size !== codes.length) fail.push('duplicate profile_code')
if (!codes.includes('ABSTAINER')) fail.push('no ABSTAINER — adoption would be imposed, not produced')

// every discipline must be able to draw every profile, or the assignment table
// has a typo that would silently skew a whole population
const wanted = new Set(codes)
for (const [wt, weights] of Object.entries(doc.assignment)) {
  for (const c of Object.keys(weights)) if (!wanted.has(c)) fail.push(`assignment ${wt}: unknown profile ${c}`)
  for (const c of wanted) if (!(c in weights)) fail.push(`assignment ${wt}: missing ${c}`)
}
for (const c of wanted) if (!(c in doc.seniority_modifier)) fail.push(`no seniority modifier for ${c}`)
if (doc.start_curve.length !== doc.meta.months) fail.push('start_curve is the wrong length')
const curveSum = doc.start_curve.reduce((a, b) => a + b, 0)
if (Math.abs(curveSum - 1) > 0.01) fail.push(`start_curve sums to ${curveSum.toFixed(3)}, not 1`)
if (doc.usage_ramp.length !== doc.meta.months) fail.push('usage_ramp is the wrong length')

// Every profile must have at least one month it can start in, or it silently
// contributes nobody and the adoption rate quietly drops.
doc.profiles.filter(p => p.adopt > 0).forEach(p => {
  const reachable = doc.start_curve.slice(p.start[0] - 1, p.start[1]).reduce((a, b) => a + b, 0)
  if (reachable <= 0) fail.push(`${p.code}: start_curve gives its window zero weight`)
})
if (doc.intensity_by_rank.length !== 8) fail.push('intensity_by_rank must cover all eight grades')

// the profiles have to actually differ, or this is one behaviour in a hat
const meds = rows.filter(r => r.intensity_median > 0).map(r => Number(r.intensity_median))
if (Math.max(...meds) / Math.min(...meds) < 50) fail.push('profiles are too alike to produce a tail')

if (fail.length) { console.error('GENERATION FAILED\n  ' + fail.join('\n  ')); process.exit(1) }

mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = Object.keys(rows[0])
const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
writeFileSync(resolve(ROOT, 'data/silver/dim_behaviour_profile.csv'),
  COLS.join(',') + '\n' + rows.map(r => COLS.map(c => esc(r[c])).join(',')).join('\n') + '\n')

const pad = (s, n) => String(s).padStart(n)
console.log(`${rows.length} behaviour profiles\n`)
console.log('profile'.padEnd(17) + pad('adopt', 7) + pad('churn', 7) + pad('tokens/mo', 12)
  + pad('vol', 6) + pad('spike', 8) + pad('start', 8))
console.log('-'.repeat(65))
doc.profiles.forEach(p => console.log(
  p.code.padEnd(17) + pad((p.adopt * 100).toFixed(0) + '%', 7)
  + pad((p.churn * 100).toFixed(0) + '%', 7)
  + pad(p.intensity.median ? (p.intensity.median / 1000).toFixed(0) + 'k' : '—', 12)
  + pad(p.volatility.toFixed(2), 6)
  + pad(p.spike.prob ? (p.spike.prob * 100).toFixed(0) + '%' : '—', 8)
  + pad(`M${p.start[0]}-${p.start[1]}`, 8)))

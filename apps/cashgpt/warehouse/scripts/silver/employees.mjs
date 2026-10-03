#!/usr/bin/env node
/**
 * data/silver/dim_org_unit.csv + schema/org/*.yaml -> data/silver/dim_employee.csv
 *
 * Fills a 500,000-person bank. Reads the expanded org tree rather than the YAML,
 * so employees land in exactly the teams that were loaded — no second walk that
 * could drift.
 *
 * THREE THINGS HAVE TO HOLD AT ONCE, and they pull against each other:
 *
 *   every team is exactly its headcount   from dim_org_unit
 *   every org unit has exactly one head   at a grade allowed to run that level
 *   grade totals match the pyramid        exactly, to the person
 *
 * Heads are allocated first, because their grades are constrained by what they
 * run. What is left becomes a global pool, and individual contributors are
 * drawn from it weighted by their department's seniority tilt — so a contact
 * centre fills with Analysts and a trading desk with VPs, while the bank-wide
 * totals still land on the pyramid.
 *
 *   node scripts/silver/employees.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260827)

/** Weighted pick over [key, weight] pairs. Returns null if every weight is 0. */
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return null
  let r = rnd() * total
  for (const [k, w] of pairs) { if ((r -= w) <= 0) return k }
  return pairs[pairs.length - 1][0]
}

function apportion(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map(w => (w / sum) * total)
  const base = exact.map(Math.floor)
  let left = total - base.reduce((a, b) => a + b, 0)
  exact.map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
    .forEach(({ i }) => { if (left-- > 0) base[i]++ })
  return base
}

// ---------------------------------------------------------------- names
//
// A person's name comes from the office they sit in, not from one global pool.
// Every site declares a mix of naming cultures; London is roughly three-fifths
// British and the rest is the actual city, Pune is Indian, New York is its own
// blend. That is the whole reason locations exist in this warehouse.
const nameDoc = YAML.parse(readFileSync(resolve(ROOT, 'schema/org/names.yaml'), 'utf8'))
const CULTURE = nameDoc.cultures
for (const c of Object.keys(CULTURE)) {
  const { first, last } = CULTURE[c]
  if (!first?.length || !last?.length) throw new Error(`culture ${c} has an empty pool`)
}

const INITIALS = 'ABCDEFGHJKLMNOPRSTVWZ'.split('')

const usedNames = new Set()
let dupes = 0

/**
 * Draw a name from a culture. Collisions fall back to a middle initial, then to
 * two — 500,000 people against pools of ~14,000 combinations each means the
 * tail is unavoidable, but it has to stay a tail or the list reads as generated.
 */
function newName(cultureCode) {
  const pool = CULTURE[cultureCode]
  const f = pool.first[Math.floor(rnd() * pool.first.length)]
  const l = pool.last[Math.floor(rnd() * pool.last.length)]
  let n = `${f} ${l}`
  if (!usedNames.has(n)) { usedNames.add(n); return n }
  for (let i = 0; i < 24; i++) {
    n = `${f} ${INITIALS[Math.floor(rnd() * INITIALS.length)]}. ${l}`
    if (!usedNames.has(n)) { usedNames.add(n); return n }
  }
  for (let i = 0; i < 40; i++) {
    const a = INITIALS[Math.floor(rnd() * INITIALS.length)]
    const b = INITIALS[Math.floor(rnd() * INITIALS.length)]
    n = `${f} ${a}. ${b}. ${l}`
    if (!usedNames.has(n)) { usedNames.add(n); return n }
  }
  dupes++
  return n
}

// ---------------------------------------------------------------- placement
const loc = YAML.parse(readFileSync(resolve(ROOT, 'schema/org/locations.yaml'), 'utf8'))
const SITE = new Map(loc.sites.map(s => [s.code, s]))
const HIRING = new Map(loc.hiring_profiles.map(h => [h.code, h]))

for (const s of loc.sites) {
  const sum = Object.values(s.name_mix).reduce((a, b) => a + b, 0)
  if (Math.abs(sum - 1) > 0.005) throw new Error(`${s.code} name_mix sums to ${sum}`)
  for (const c of Object.keys(s.name_mix)) {
    if (!CULTURE[c]) throw new Error(`${s.code} names unknown culture ${c}`)
  }
}

/**
 * Where one person sits. `co_location` of the team is at the team's own site;
 * the rest are redrawn from the hiring profile, which is what puts four Pune
 * engineers on a London-led platform team without pretending the team has no
 * home. India-only profiles collapse to a single site on their own.
 */
function drawSite(team) {
  const profile = HIRING.get(team.hiring_profile)
  if (!profile) return team.site_code
  if (rnd() < profile.co_location) return team.site_code
  const entries = Object.entries(profile.mix)
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let r = rnd() * total
  for (const [code, w] of entries) { r -= w; if (r <= 0) return code }
  return team.site_code
}

/** Which naming tradition this person's name comes from, given their office. */
function drawCulture(siteCode) {
  const mix = SITE.get(siteCode).name_mix
  let r = rnd()
  for (const [c, w] of Object.entries(mix)) { r -= w; if (r <= 0) return c }
  return Object.keys(mix)[0]
}

// ---------------------------------------------------------------- inputs
const org = YAML.parse(readFileSync(resolve(ROOT, 'schema/org/org-chart.yaml'), 'utf8'))
const sen = YAML.parse(readFileSync(resolve(ROOT, 'schema/org/seniority.yaml'), 'utf8'))
const GRADES = sen.levels
const byRank = Object.fromEntries(GRADES.map(g => [g.rank, g]))

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
const teams = units.filter(u => u.org_level === '6')

// ---------------------------------------------------------------- grade budget
const TOTAL = Number(org.meta.headcount)
const targetByRank = Object.fromEntries(
  apportion(TOTAL, GRADES.map(g => g.population_share)).map((n, i) => [GRADES[i].rank, n]))

// Which grades may run a unit at this level
const eligible = level => GRADES.filter(g =>
  g.heads_org_level && level >= g.heads_org_level[0] && level <= g.heads_org_level[1])

// Allocate head grades level by level, in proportion to how common each grade
// is. Done up front because a head's grade is constrained by what it runs,
// and ICs can absorb whatever is left over.
const headBudget = {}
for (const level of [1, 2, 3, 4, 5, 6]) {
  const n = units.filter(u => Number(u.org_level) === level).length
  const opts = eligible(level)
  const split = apportion(n, opts.map(g => g.population_share))
  opts.forEach((g, i) => { headBudget[`${level}:${g.rank}`] = split[i] })
}

// ---------------------------------------------------------------- ic pool
const pool = { ...targetByRank }
for (const [k, v] of Object.entries(headBudget)) pool[Number(k.split(':')[1])] -= v

const shortfall = Object.entries(pool).filter(([, v]) => v < 0)
if (shortfall.length) {
  console.error('GRADE BUDGET INFEASIBLE — more heads needed than the pyramid allows:')
  shortfall.forEach(([r, v]) => console.error(`  rank ${r}: short by ${-v}`))
  process.exit(1)
}

// ---------------------------------------------------------------- generate
const rows = []
let seq = 0
const nextId = () => `E${String(++seq).padStart(7, '0')}`

const TILT = org.seniority_tilt
const FN_MIX = org.function_mix

/** Draw an IC grade from the global pool, tilted by the department's discipline. */
function drawRank(workType) {
  const tilt = TILT[workType] ?? 1
  const pairs = GRADES.map(g => [g.rank, pool[g.rank] * Math.pow(tilt, g.rank - 3)])
  const r = weighted(pairs) ?? Number(Object.entries(pool).find(([, v]) => v > 0)[0])
  pool[r]--
  return r
}

function drawFunction(workType) {
  const mix = FN_MIX[workType]
  return mix ? weighted(Object.entries(mix)) : 'Operations'
}

const unitById = new Map(units.map(u => [u.org_id, u]))

// Heads first: one per org unit, at a grade allowed to run that level.
const headOf = new Map()
for (const u of units) {
  const level = Number(u.org_level)
  const opts = eligible(level)
  const pairs = opts.map(g => [g.rank, headBudget[`${level}:${g.rank}`]])
  const rank = weighted(pairs) ?? opts[0].rank
  headBudget[`${level}:${rank}`]--
  headOf.set(u.org_id, rank)
}

// Then fill every team. The head of a team sits inside its headcount; heads of
// everything above sit in one of the teams beneath them.
const higherHeads = units.filter(u => Number(u.org_level) < 6)
const teamOfHigher = new Map()
for (const u of higherHeads) {
  // put a section head in one of that section's teams, a division head in one
  // of the division's, and so on — so they are staffed where they work
  const mine = teams.filter(t => t.org_path.startsWith(u.org_path + '/'))
  const t = mine.length ? mine[Math.floor(rnd() * mine.length)] : teams[0]
  if (!teamOfHigher.has(t.org_id)) teamOfHigher.set(t.org_id, [])
  teamOfHigher.get(t.org_id).push(u)
}

for (const t of teams) {
  const size = Number(t.headcount)
  const wt = t.work_type
  const extras = teamOfHigher.get(t.org_id) ?? []

  const members = []
  // the team's own head
  members.push({ rank: headOf.get(t.org_id), heads: t.org_id })
  // heads of higher units who sit in this team
  for (const u of extras) members.push({ rank: headOf.get(u.org_id), heads: u.org_id })
  // and everyone else
  while (members.length < size) members.push({ rank: null, heads: null })

  // A team can be smaller than the number of managers parked in it. Rare, and
  // borrowing a seat from the pool beats moving a manager out of their own org.
  for (const m of members) {
    const rank = m.rank ?? drawRank(wt)
    const g = byRank[rank]
    const siteCode = drawSite(t)
    const site = SITE.get(siteCode)
    const culture = drawCulture(siteCode)
    rows.push({
      employee_id: nextId(),
      full_name: newName(culture),
      work_type: t.work_type,
      site_code: siteCode,
      city: site.city,
      country: site.country,
      location_region: site.region,
      name_culture: culture,
      team_org_id: t.org_id,
      team_code: t.team_code,
      seniority_code: g.code,
      seniority_rank: rank,
      job_function: drawFunction(wt),
      heads_org_id: m.heads ?? '',
      section_id: t.section_id,
      department_id: t.department_id,
      division_id: t.division_id,
      lob_id: t.lob_id,
      lob_name: t.lob_name,
      source_file: 'schema/org/org-chart.yaml',
    })
  }
}

// ---------------------------------------------------------------- assertions
const fail = []
if (rows.length !== TOTAL) fail.push(`${rows.length} employees, expected ${TOTAL}`)

const perTeam = new Map()
rows.forEach(r => perTeam.set(r.team_org_id, (perTeam.get(r.team_org_id) ?? 0) + 1))
let teamsOff = 0
teams.forEach(t => { if (perTeam.get(t.org_id) !== Number(t.headcount)) teamsOff++ })
if (teamsOff) fail.push(`${teamsOff} teams do not match their headcount`)

const heads = rows.filter(r => r.heads_org_id)
if (heads.length !== units.length) fail.push(`${heads.length} heads for ${units.length} org units`)
if (new Set(heads.map(r => r.heads_org_id)).size !== heads.length) fail.push('an org unit has two heads')
heads.forEach(r => {
  const level = Number(unitById.get(r.heads_org_id).org_level)
  const g = byRank[r.seniority_rank]
  if (!g.heads_org_level || level < g.heads_org_level[0] || level > g.heads_org_level[1]) {
    fail.push(`${r.full_name} (${g.code}) heads a level-${level} unit`)
  }
})

const gotByRank = {}
rows.forEach(r => { gotByRank[r.seniority_rank] = (gotByRank[r.seniority_rank] ?? 0) + 1 })
GRADES.forEach(g => {
  if (gotByRank[g.rank] !== targetByRank[g.rank]) {
    fail.push(`${g.code}: ${gotByRank[g.rank]} != ${targetByRank[g.rank]}`)
  }
})
if (dupes > TOTAL * 0.001) fail.push(`${dupes} duplicate names — widen the pools`)

// The brief: the build happens in India. Measured on people, not on teams,
// because individual placement moves it either way.
const engineers = rows.filter(r => r.work_type === 'engineering')
const engIndia = engineers.filter(r => r.location_region === 'India').length
if (engIndia / engineers.length < 0.50) {
  fail.push(`only ${(engIndia / engineers.length * 100).toFixed(1)}% of engineers are in India`)
}
if (rows.some(r => !r.site_code)) fail.push('employees with no site')

if (fail.length) { console.error('GENERATION FAILED\n  ' + fail.slice(0, 10).join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = Object.keys(rows[0])
const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
writeFileSync(resolve(ROOT, 'data/silver/dim_employee.csv'),
  COLS.join(',') + '\n' + rows.map(r => COLS.map(c => esc(r[c])).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
const n = v => v.toLocaleString('en-US')
console.log(`${n(rows.length)} employees · ${n(heads.length)} of them run an org unit\n`)
console.log('grade'.padEnd(28) + pad('people', 10) + pad('share', 8) + pad('heads', 8) + pad('ICs', 10))
console.log('-'.repeat(64))
GRADES.forEach(g => {
  const all = gotByRank[g.rank] ?? 0
  const h = heads.filter(r => r.seniority_rank === g.rank).length
  console.log(g.title.padEnd(28) + pad(n(all), 10)
    + pad((all / TOTAL * 100).toFixed(2) + '%', 8) + pad(n(h), 8) + pad(n(all - h), 10))
})
console.log('-'.repeat(64))
console.log('TOTAL'.padEnd(28) + pad(n(TOTAL), 10) + pad('100.00%', 8) + pad(n(heads.length), 8))

const fnCount = {}
rows.forEach(r => { fnCount[r.job_function] = (fnCount[r.job_function] ?? 0) + 1 })
console.log('\ntop job functions')
Object.entries(fnCount).sort((a, b) => b[1] - a[1]).slice(0, 6)
  .forEach(([k, v]) => console.log('  ' + k.padEnd(24) + pad(n(v), 9) + pad((v / TOTAL * 100).toFixed(1) + '%', 8)))
// ---- geography -----------------------------------------------------------
const cnt = (arr, key) => {
  const m = new Map()
  arr.forEach(r => m.set(r[key], (m.get(r[key]) ?? 0) + 1))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
console.log('\nwhere the bank sits')
console.log('region'.padEnd(24) + pad('people', 10) + pad('share', 9))
console.log('-'.repeat(43))
cnt(rows, 'location_region').forEach(([r, c]) =>
  console.log(String(r).padEnd(24) + pad(n(c), 10) + pad((c / TOTAL * 100).toFixed(1) + '%', 9)))

console.log('\ntop offices')
cnt(rows, 'city').slice(0, 10).forEach(([c, k]) =>
  console.log('  ' + String(c).padEnd(20) + pad(n(k), 9) + pad((k / TOTAL * 100).toFixed(1) + '%', 8)))

console.log('\nengineering')
const engBy = cnt(engineers, 'location_region')
engBy.slice(0, 5).forEach(([r, c]) =>
  console.log('  ' + String(r).padEnd(20) + pad(n(c), 9)
    + pad((c / engineers.length * 100).toFixed(1) + '%', 8)))
console.log(`  ${n(engIndia)} of ${n(engineers.length)} engineers in India`
  + ` — ${(engIndia / engineers.length * 100).toFixed(1)}%`)

console.log(`\nduplicate names: ${dupes}`)

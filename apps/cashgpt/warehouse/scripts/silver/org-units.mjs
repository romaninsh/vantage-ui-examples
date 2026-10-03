#!/usr/bin/env node
/**
 * schema/org/org-chart.yaml -> data/silver/dim_org_unit.csv
 *
 * The YAML is authored down to department because names carry meaning and a
 * generator cannot invent "Documentary Credits". Sections and teams are
 * expanded here because there are ~43,000 of them.
 *
 * HEADCOUNT CASCADES AND MUST CLOSE AT EVERY LEVEL. Departments take a share of
 * their division, teams take a draw from the span-of-control range, and both
 * are settled by largest remainder so a parent always equals the sum of its
 * children — right up to 500,000 at the root. Anything else and every rollup
 * on every dashboard is quietly wrong.
 *
 *   node scripts/silver/org-units.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = 'schema/org/org-chart.yaml'

// Deterministic: the same YAML always expands to the same 43,000 units, so
// team codes stay stable across runs and downstream generators can rely on them.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(20260826)
const between = (lo, hi) => lo + rnd() * (hi - lo)
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1))

/** Box-Muller. */
function normal() {
  let u = 0, v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Fill a headcount with teams drawn from the configured distribution.
 *
 * Drawing until the pool is exhausted, rather than fixing the team count and
 * apportioning, is what preserves the shape: apportionment rescales every draw
 * to hit a target and flattens the tail back out. The only intervention is
 * refusing to strand a stub of one or two people on the last team.
 */
function drawTeamSizes(total, cfg) {
  const mu = Math.log(cfg.median)
  const sizes = []
  let left = total
  while (left > 0) {
    let s = Math.round(Math.exp(mu + normal() * cfg.sigma))
    s = Math.max(cfg.min, Math.min(cfg.max, s))
    if (s > left || left - s < cfg.min) s = left
    sizes.push(s)
    left -= s
  }
  return sizes
}

/** Split `total` by weights into integers that sum to exactly `total`. */
function apportion(total, weights, min = 0) {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const exact = weights.map(w => (w / sum) * (total - min * weights.length))
  const base = exact.map(v => Math.floor(v) + min)
  let left = total - base.reduce((a, b) => a + b, 0)
  exact.map((v, i) => ({ i, f: v - Math.floor(v) }))
    .sort((a, b) => b.f - a.f)
    .forEach(({ i }) => { if (left-- > 0) base[i]++ })
  return base
}

const doc = YAML.parse(readFileSync(resolve(ROOT, SRC), 'utf8'))
const { span, regions, levels } = doc

// ---------------------------------------------------------------- locations
const loc = YAML.parse(readFileSync(resolve(ROOT, 'schema/org/locations.yaml'), 'utf8'))
const SITE = new Map(loc.sites.map(s => [s.code, s]))
const HIRING = new Map(loc.hiring_profiles.map(h => [h.code, h]))

for (const h of loc.hiring_profiles) {
  for (const code of Object.keys(h.mix)) {
    if (!SITE.has(code)) throw new Error(`hiring profile ${h.code} names unknown site ${code}`)
  }
}

// Most specific match wins: (lob, work_type), then (lob, any), then lob,
// then work_type, then the fallback.
const OVERRIDE = new Map(
  (loc.assignment.overrides ?? []).map(o => [`${o.lob}|${o.work_type}`, o.profile]))

function resolveProfile(lobId, workType) {
  return OVERRIDE.get(`${lobId}|${workType}`)
    ?? OVERRIDE.get(`${lobId}|any`)
    ?? loc.assignment.by_lob?.[lobId]
    ?? loc.assignment.by_work_type?.[workType]
    ?? loc.assignment.default
}

/**
 * A team's home office. Drawn from its hiring profile, so a TECH_INDIA_LED
 * team lands in Pune or Bengaluru roughly two times in three and in London
 * about one in nine. Individual placement happens in employees.mjs — this only
 * fixes where the team itself sits.
 */
function drawSite(profileCode) {
  const mix = HIRING.get(profileCode).mix
  const entries = Object.entries(mix)
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let r = rnd() * total
  for (const [code, w] of entries) { r -= w; if (r <= 0) return code }
  return entries[entries.length - 1][0]
}

// YAML aliases resolve to the SAME object, so a department's `teams` array is
// identity-equal to the vocabulary it was declared from. That is how the
// discipline is recovered without repeating it on 204 departments.
const VOCAB_OF = new Map(Object.entries(doc.vocab).map(([k, v]) => [v, k]))

const rows = []
let seq = { 3: 0, 4: 0, 5: 0, 6: 0 }
let teamCode = 10_001

const LEVEL_NAME = Object.fromEntries(
  Object.entries(levels).map(([k, v]) => [Number(k), v.name]))

function emit(o) {
  rows.push(o)
  return o
}

function id(level, n) {
  const p = { 3: 'D', 4: 'P', 5: 'S', 6: 'T' }[level]
  return `${p}-${String(n).padStart(6, '0')}`
}

/** Cycles stems, then regions, then ordinals — so names stay meaningful at scale. */
function nameAt(stems, i) {
  if (i < stems.length) return stems[i]
  const round = Math.floor(i / stems.length)
  const stem = stems[i % stems.length]
  return round <= regions.length
    ? `${stem} — ${regions[round - 1]}`
    : `${stem} — Group ${round - regions.length + 1}`
}

// ---------------------------------------------------------------- expand
const root = emit({
  org_id: 'GRP', parent_org_id: null, org_level: 1,
  org_name: doc.meta.company, team_code: null,
  lob_id: null, lob_name: null, division_id: null, division_name: null,
  department_id: null, department_name: null, section_id: null, section_name: null,
  org_path: 'GRP', resource_org: 'Group',
  headcount: doc.meta.headcount, is_leaf: false,
})

for (const lob of doc.lines_of_business) {
  const lobRow = emit({
    org_id: lob.id, parent_org_id: 'GRP', org_level: 2, org_name: lob.name,
    team_code: null,
    lob_id: lob.id, lob_name: lob.name,
    division_id: null, division_name: null,
    department_id: null, department_name: null, section_id: null, section_name: null,
    org_path: `GRP/${lob.id}`, resource_org: lob.resource_org,
    headcount: lob.headcount, is_leaf: false,
  })

  for (const div of lob.divisions) {
    const divId = id(3, ++seq[3])
    emit({
      org_id: divId, parent_org_id: lob.id, org_level: 3, org_name: div.name,
      team_code: null,
      lob_id: lob.id, lob_name: lob.name,
      division_id: divId, division_name: div.name,
      department_id: null, department_name: null, section_id: null, section_name: null,
      org_path: `${lobRow.org_path}/${divId}`, resource_org: lob.resource_org,
      headcount: div.headcount, is_leaf: false,
    })

    // departments take their declared share of the division, settled exactly
    const deptHc = apportion(div.headcount, div.departments.map(d => d.share), 1)

    div.departments.forEach((dept, di) => {
      const deptId = id(4, ++seq[4])
      const hc = deptHc[di]
      const deptWorkType = VOCAB_OF.get(dept.teams) ?? null
      const profile = resolveProfile(lob.id, deptWorkType)
      emit({
        org_id: deptId, parent_org_id: divId, org_level: 4, org_name: dept.name,
        team_code: null,
        lob_id: lob.id, lob_name: lob.name,
        division_id: divId, division_name: div.name,
        department_id: deptId, department_name: dept.name,
        section_id: null, section_name: null,
        org_path: `GRP/${lob.id}/${divId}/${deptId}`, resource_org: lob.resource_org,
        work_type: deptWorkType, hiring_profile: profile,
        site_code: '', city: '', country: '', location_region: '',
        headcount: hc, is_leaf: false,
      })

      // Draw every team in the department first, then chunk them into
      // sections. Sizing teams inside sections would cap the tail at whatever
      // a section happens to hold.
      const teamSizes = drawTeamSizes(hc, span.team)

      const teamsPerSection = []
      for (let i = 0; i < teamSizes.length;) {
        const take = Math.min(intBetween(span.section.teams_min, span.section.teams_max),
          teamSizes.length - i)
        // never leave a section of one behind
        const n = (teamSizes.length - i - take) === 1 ? take + 1 : take
        teamsPerSection.push(teamSizes.slice(i, i + n))
        i += n
      }
      const sectionHc = teamsPerSection.map(g => g.reduce((a, b) => a + b, 0))

      teamsPerSection.forEach((group, si) => {
        const nTeams = group.length
        const sectionId = id(5, ++seq[5])
        const sectionName = teamsPerSection.length === 1
          ? dept.name
          : (si < regions.length ? regions[si] : `Group ${si - regions.length + 1}`)
        emit({
          org_id: sectionId, parent_org_id: deptId, org_level: 5, org_name: sectionName,
          team_code: null,
          lob_id: lob.id, lob_name: lob.name,
          division_id: divId, division_name: div.name,
          department_id: deptId, department_name: dept.name,
          section_id: sectionId, section_name: sectionName,
          org_path: `GRP/${lob.id}/${divId}/${deptId}/${sectionId}`,
          resource_org: lob.resource_org,
          work_type: deptWorkType, hiring_profile: profile,
          site_code: '', city: '', country: '', location_region: '',
          headcount: sectionHc[si], is_leaf: false,
        })

        for (let t = 0; t < nTeams; t++) {
          const tId = id(6, ++seq[6])
          const siteCode = drawSite(profile)
          const site = SITE.get(siteCode)
          emit({
            org_id: tId, parent_org_id: sectionId, org_level: 6,
            org_name: nameAt(dept.teams, t),
            team_code: String(teamCode++),
            lob_id: lob.id, lob_name: lob.name,
            division_id: divId, division_name: div.name,
            department_id: deptId, department_name: dept.name,
            section_id: sectionId, section_name: sectionName,
            org_path: `GRP/${lob.id}/${divId}/${deptId}/${sectionId}/${tId}`,
            resource_org: lob.resource_org,
            work_type: deptWorkType, hiring_profile: profile,
            site_code: siteCode, city: site.city, country: site.country,
            location_region: site.region,
            headcount: group[t], is_leaf: true,
          })
        }
      })
    })
  }
}

// ---------------------------------------------------------------- assertions
const fail = []
const byId = new Map(rows.map(r => [r.org_id, r]))
const kids = new Map()
for (const r of rows) {
  if (!r.parent_org_id) continue
  if (!byId.has(r.parent_org_id)) fail.push(`${r.org_id} has no parent`)
  if (!kids.has(r.parent_org_id)) kids.set(r.parent_org_id, [])
  kids.get(r.parent_org_id).push(r)
}
// headcount must close at every single node, not just the root
for (const r of rows) {
  const k = kids.get(r.org_id)
  if (!k) { if (!r.is_leaf) fail.push(`${r.org_name} is not a leaf but has no children`); continue }
  const sum = k.reduce((s, c) => s + c.headcount, 0)
  if (sum !== r.headcount) fail.push(`${r.org_level_name ?? r.org_level} ${r.org_name}: children ${sum} != ${r.headcount}`)
}
if (byId.get('GRP').headcount !== doc.meta.headcount) fail.push('root headcount wrong')
const codes = rows.filter(r => r.team_code).map(r => r.team_code)
if (new Set(codes).size !== codes.length) fail.push('duplicate team codes')
if (rows.some(r => (r.org_level === 6) !== Boolean(r.team_code))) fail.push('team_code not aligned to level 6')
const teams = rows.filter(r => r.org_level === 6)
const tiny = teams.filter(t => t.headcount < span.team.min).length
if (tiny > 0) fail.push(`${tiny} teams below the ${span.team.min}-person floor`)
const big = teams.filter(t => t.headcount > span.team.max).length
if (big > 0) fail.push(`${big} teams above the ${span.team.max}-person cap`)
// the tail has to exist, but stay a tail
const over30 = teams.filter(t => t.headcount > 30).length / teams.length
if (over30 === 0) fail.push('no teams over 30 — the distribution has no tail')
if (over30 > 0.03) fail.push(`${(over30 * 100).toFixed(1)}% of teams over 30 — tail too fat`)
const noWork = rows.filter(r => r.org_level >= 4 && !r.work_type).length
if (noWork) fail.push(`${noWork} units at department level or below have no work_type`)
const noSite = teams.filter(t => !t.site_code).length
if (noSite) fail.push(`${noSite} teams have no site`)

// Regional shape. Teams are sized independently of where they sit, so the
// headcount split only approximates the declared mix — 4pp of slack, and the
// employee-level draw in employees.mjs moves it again.
const regionHc = new Map()
teams.forEach(t => regionHc.set(t.location_region,
  (regionHc.get(t.location_region) ?? 0) + t.headcount))
for (const [region, want] of Object.entries(loc.meta.region_targets)) {
  const got = (regionHc.get(region) ?? 0) / doc.meta.headcount
  if (Math.abs(got - want) > 0.025) {
    fail.push(`${region}: ${(got * 100).toFixed(1)}% of headcount, target ${(want * 100).toFixed(0)}%`)
  }
}
if (fail.length) { console.error('EXPANSION FAILED\n  ' + fail.slice(0, 12).join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = ['org_id', 'parent_org_id', 'org_level', 'org_level_name', 'org_name', 'team_code',
  'lob_id', 'lob_name', 'division_id', 'division_name', 'department_id', 'department_name',
  'section_id', 'section_name', 'org_path', 'resource_org', 'work_type',
  'hiring_profile', 'site_code', 'city', 'country', 'location_region',
  'headcount', 'is_leaf', 'source_file']
const esc = v => (v === null || v === undefined ? ''
  : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))

writeFileSync(resolve(ROOT, 'data/silver/dim_org_unit.csv'),
  COLS.join(',') + '\n'
  + rows.map(r => COLS.map(c =>
      c === 'org_level_name' ? esc(LEVEL_NAME[r.org_level])
        : c === 'source_file' ? esc(SRC)
          : esc(r[c])).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
const n = v => v.toLocaleString('en-US')
console.log(`${n(rows.length)} org units from ${SRC}\n`)
console.log('level'.padEnd(20) + pad('units', 9) + pad('headcount', 12) + pad('avg', 8))
console.log('-'.repeat(49))
for (let l = 1; l <= 6; l++) {
  const set = rows.filter(r => r.org_level === l)
  const hc = set.reduce((s, r) => s + r.headcount, 0)
  console.log(LEVEL_NAME[l].padEnd(20) + pad(n(set.length), 9) + pad(n(hc), 12)
    + pad(Math.round(hc / set.length), 8))
}
console.log('-'.repeat(49))
const tm = rows.filter(r => r.org_level === 6).map(r => r.headcount).sort((a, b) => a - b)
const q = f => tm[Math.floor(tm.length * f)]
console.log(`team size: min ${tm[0]} · p50 ${q(0.5)} · p90 ${q(0.9)} · p99 ${q(0.99)} · max ${tm[tm.length - 1]}`)
console.log(`  over 20: ${(tm.filter(x => x > 20).length / tm.length * 100).toFixed(1)}%`
  + ` · over 30: ${(tm.filter(x => x > 30).length / tm.length * 100).toFixed(2)}%`
  + ` · over 40: ${(tm.filter(x => x > 40).length / tm.length * 100).toFixed(2)}%`)
console.log(`team codes ${codes[0]}–${codes[codes.length - 1]}`)

console.log('\nregion'.padEnd(23) + pad('teams', 8) + pad('headcount', 12) + pad('share', 9)
  + pad('target', 9))
console.log('-'.repeat(61))
const byRegion = [...regionHc.entries()].sort((a, b) => b[1] - a[1])
for (const [region, hc] of byRegion) {
  const want = loc.meta.region_targets[region]
  console.log(region.padEnd(22) + pad(n(teams.filter(t => t.location_region === region).length), 8)
    + pad(n(hc), 12) + pad((hc / doc.meta.headcount * 100).toFixed(1) + '%', 9)
    + pad(want ? (want * 100).toFixed(0) + '%' : '—', 9))
}

// The one that matters: the build is in India.
const eng = teams.filter(t => t.work_type === 'engineering')
const engHc = eng.reduce((s, t) => s + t.headcount, 0)
const engIn = eng.filter(t => t.location_region === 'India').reduce((s, t) => s + t.headcount, 0)
console.log('-'.repeat(61))
console.log(`engineering teams sit ${(engIn / engHc * 100).toFixed(1)}% in India `
  + `(${n(engIn)} of ${n(engHc)}) — before individual placement`)
console.log('\nheadcount closes at every node')

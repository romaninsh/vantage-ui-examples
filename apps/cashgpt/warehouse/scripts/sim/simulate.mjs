#!/usr/bin/env node
/**
 * Usage simulator — plays one person's seven months out, decision by decision.
 *
 *   node scripts/sim/simulate.mjs --employee E0000123 --explain
 *   node scripts/sim/simulate.mjs --team 10042
 *   node scripts/sim/simulate.mjs --section S-000412
 *   node scripts/sim/simulate.mjs --lob LB-07 --limit 5000
 *   node scripts/sim/simulate.mjs --sample 20000
 *   node scripts/sim/simulate.mjs --all
 *
 *   --seed N      make a run reproducible; omit and every run differs
 *   --dry-run     simulate and report, write nothing
 *   --explain     narrate each month for the selected people (use with --employee)
 *   --keep        do not delete existing rows for these people first
 *
 * RE-RUNNING IS SCOPED. Whatever the selector matches gets deleted and rewritten
 * in one transaction; everyone else is untouched. That is the point — you can
 * re-roll one person a hundred times without disturbing the other 499,999.
 *
 * THE SIMULATION IS A SEQUENCE OF DECISIONS, NOT AN APPORTIONMENT. Each person
 * draws a behaviour profile, decides whether they ever adopt, when they start,
 * whether they quit, how heavy they personally are, which tools they can even
 * reach, which models were live that month, and whether this is the month
 * something ran away. Totals are what falls out — they are not an input.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
import pg from 'pg'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2)
const arg = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : undefined }
const has = n => argv.includes('--' + n)

const SEL = {
  employee: arg('employee'), team: arg('team'), section: arg('section'),
  lob: arg('lob'), department: arg('department'),
  sample: arg('sample') ? Number(arg('sample')) : undefined,
  all: has('all'),
}
const LIMIT = arg('limit') ? Number(arg('limit')) : undefined
const RUN_SEED = arg('seed') ? Number(arg('seed')) : (Date.now() % 2147483647)
const DRY = has('dry-run')
const EXPLAIN = has('explain')
const KEEP = has('keep')

if (!Object.values(SEL).some(Boolean)) {
  console.error('pick a scope: --employee | --team | --section | --department | --lob | --sample N | --all')
  process.exit(2)
}

// ---------------------------------------------------------------- randomness
// Seeded per employee, so --seed makes a run reproducible and one person's
// draw does not depend on how many people were simulated before them.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

function makeRng(seed) {
  const r = mulberry32(seed)
  return {
    next: r,
    between: (lo, hi) => lo + r() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + r() * (hi - lo + 1)),
    normal() {
      let u = 0, v = 0
      while (u === 0) u = r()
      while (v === 0) v = r()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    pick(pairs) {
      const total = pairs.reduce((s, [, w]) => s + w, 0)
      if (total <= 0) return null
      let x = r() * total
      for (const [k, w] of pairs) if ((x -= w) <= 0) return k
      return pairs[pairs.length - 1][0]
    },
    /** n distinct keys, without replacement */
    pickN(pairs, n) {
      const pool = pairs.slice()
      const out = []
      while (out.length < n && pool.length) {
        const k = this.pick(pool)
        if (k === null) break
        out.push(k)
        pool.splice(pool.findIndex(p => p[0] === k), 1)
      }
      return out
    },
  }
}

// ---------------------------------------------------------------- config
const beh = YAML.parse(readFileSync(resolve(ROOT, 'schema/catalog/behaviour.yaml'), 'utf8'))
const org = YAML.parse(readFileSync(resolve(ROOT, 'schema/org/org-chart.yaml'), 'utf8'))

const MONTHS = Array.from({ length: beh.meta.months }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
const PROFILE = Object.fromEntries(beh.profiles.map(p => [p.code, p]))

/**
 * How a model can be reached. A platform serves a set of providers and opens in
 * a given month, so the routes available for one model in one month are the
 * intersection — which is why Amazon's own models simply do not exist before
 * June, and why the Bedrock line on the invoice starts at zero.
 */
const cat = YAML.parse(readFileSync(resolve(ROOT, 'schema/catalog/models.yaml'), 'utf8'))
const PLATFORMS = cat.platforms

/** Procurement, not quality. See provider_pull in schema/catalog/models.yaml. */
const providerPull = m => cat.provider_pull[m.provider] ?? cat.provider_pull.default

/**
 * Copilot is a seat-licensed coding product, not a general gateway. Without
 * this it would serve chat and analysis traffic too and drift far past its
 * share of the bill.
 */
const PLATFORM_KINDS = { 'github-copilot': ['coding', 'agent'] }

/**
 * Does this person have this platform, in this month?
 *
 * ENTITLEMENTS ARE GRANTED TO PEOPLE, NOT RE-ROLLED. The draw is a stable hash
 * of (person, platform), compared against that month's internal reach — so
 * access is consistent from month to month and only ever widens as the rollout
 * proceeds. Re-rolling would give everybody intermittent access to everything,
 * which is neither how entitlement works nor what the month series looks like.
 *
 * `first_wave` is the rollout order. A gateway goes to the engineers who asked
 * for it first and becomes a general entitlement later, so everyone else is
 * held back until reach is well underway.
 */
function hasAccess(person, platform, monthIdx) {
  const reach = platform.availability?.[monthIdx] ?? 1
  if (reach <= 0) return false
  if (reach >= 1) return true

  let effective = reach
  if (platform.first_wave && !platform.first_wave.includes(person.work_type)) {
    // Outside the first wave, access lags: nothing until the rollout is a third
    // of the way in, then it catches up as the entitlement generalises.
    effective = Math.max(0, (reach - 0.33) / (1 - 0.33)) * reach
  }
  // Stable per (person, platform): the same pair always draws the same number.
  const draw = (hash(person.employee_id + '|' + platform.code) >>> 0) / 4294967296
  return draw < effective
}

const routeCache = new Map()
/**
 * Which platforms can serve this provider, this month, from this kind of app —
 * before entitlement. Cached because it is asked millions of times and depends
 * on nothing about the person.
 */
function platformsFor(providerName, month, kind) {
  const key = `${providerName}|${month}|${kind}`
  if (routeCache.has(key)) return routeCache.get(key)
  const out = PLATFORMS.filter(p =>
    p.serves.includes(providerName)
    && String(p.live_from) <= month
    && (!PLATFORM_KINDS[p.code] || PLATFORM_KINDS[p.code].includes(kind)))
  routeCache.set(key, out)
  return out
}

/** The routes this person can actually take. */
function routesFor(person, providerName, month, kind, monthIdx) {
  const open = platformsFor(providerName, month, kind)
  if (!open.length) return open
  return open.filter(p => hasAccess(person, p, monthIdx))
}

/**
 * Which model modalities a kind of app can actually route to. A coding tool
 * does not call Whisper; a research tool does reach for search and embeddings.
 * Mechanical, so it lives here rather than in the catalogue.
 */
const MODALITY_PULL = {
  coding:    { code: 4.0, agentic: 1.6, text: 1 },
  agent:     { agentic: 3.0, code: 1.6, text: 1 },
  assistant: { text: 1, multimodal: 1.2 },
  domain:    { text: 1, multimodal: 1.1, embedding: 0.6, unknown: 0.4 },
  analysis:  { text: 1, multimodal: 1.1, embedding: 0.8 },
  research:  { text: 1, multimodal: 1.1, search: 1.8, embedding: 0.8 },
}

const KIND_MODALITY = {
  coding: ['code', 'text', 'agentic'],
  assistant: ['text', 'multimodal'],
  domain: ['text', 'multimodal', 'embedding', 'unknown'],
  agent: ['text', 'agentic', 'code'],
  analysis: ['text', 'multimodal', 'embedding'],
  research: ['text', 'multimodal', 'search', 'embedding'],
}

// ---------------------------------------------------------------- db
// Connection from the PG* environment (PGHOST may be a socket directory);
// inside the warehouse image that is the init-phase server.
const db = new pg.Client()
await db.connect()

const where = []
const params = []
const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)) }
if (SEL.employee) add('e.employee_id = ?', SEL.employee)
if (SEL.team) add('e.team_code = ?', SEL.team)
if (SEL.section) add('e.section_id = ?', SEL.section)
if (SEL.department) add('e.department_id = ?', SEL.department)
if (SEL.lob) add('e.lob_id = ?', SEL.lob)

const people = (await db.query(`
  SELECT e.employee_id, e.full_name, e.seniority_rank, e.job_function,
         e.team_org_id, e.team_code, e.section_id, e.department_id, e.lob_id, e.lob_name,
         o.work_type
  FROM silver.dim_employee e
  JOIN silver.dim_org_unit o ON o.org_id = e.team_org_id
  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  ${SEL.sample ? 'ORDER BY md5(e.employee_id)' : 'ORDER BY e.employee_id'}
  ${SEL.sample ? `LIMIT ${SEL.sample}` : LIMIT ? `LIMIT ${LIMIT}` : ''}
`, params)).rows

if (!people.length) { console.error('no employees matched'); process.exit(1) }

const models = (await db.query('SELECT * FROM silver.dim_model')).rows
const apps = (await db.query('SELECT * FROM silver.dim_app')).rows
const appScope = YAML.parse(readFileSync(resolve(ROOT, 'schema/catalog/apps.yaml'), 'utf8'))
const SCOPE = Object.fromEntries(appScope.apps.map(a => [a.id, { kind: a.kind, scope: a.scope }]))

const MODEL = new Map(models.map(m => [m.model_id, m]))
const APP = new Map(apps.map(a => [a.app_id, a]))

// Model liveness is asked once per person-month; memoise it per month rather
// than re-filtering 60 models three million times.
const liveCache = new Map()
const liveModels = m => {
  if (!liveCache.has(m)) {
    liveCache.set(m, models.filter(x =>
      x.released_month <= m && (!x.retired_month || x.retired_month >= m)))
  }
  return liveCache.get(m)
}

const reachCache = new Map()
/** An app is reachable if it has launched and this person is inside its scope. */
function reachable(person, month) {
  const key = `${person.work_type}|${person.lob_id}|${month}`
  if (reachCache.has(key)) return reachCache.get(key)
  const out = apps.filter(a => {
    if (a.launched_month > month) return false
    const s = SCOPE[a.app_id].scope
    if (s.all) return true
    if (s.work_types) return s.work_types.includes(person.work_type)
    if (s.lobs) return s.lobs.includes(person.lob_id)
    return false
  })
  reachCache.set(key, out)
  return out
}

// ---------------------------------------------------------------- simulate
function simulate(person) {
  const rng = makeRng(hash(person.employee_id) ^ RUN_SEED)
  const wt = person.work_type
  const rank = person.seniority_rank
  const log = []

  // 1. which behaviour, tilted by discipline and by grade
  const weights = Object.entries(beh.assignment[wt] ?? beh.assignment.ops).map(([code, w]) => {
    const mod = beh.seniority_modifier[code]
    const t = (rank - 1) / 7
    return [code, w * (mod.rank1 + (mod.rank8 - mod.rank1) * t)]
  })
  const code = rng.pick(weights)
  const p = PROFILE[code]
  log.push(`profile ${code} (${wt}, grade ${rank})`)

  const blank = {
    employee_id: person.employee_id, profile_code: code, adopted: false,
    start_month: null, churn_month: null, active_months: 0,
    personal_tokens_pm: 0, spike_months: 0, peak_month: null,
    sim_seed: RUN_SEED, rows: [], log,
  }

  // 2. do they ever start
  if (rng.next() >= p.adopt) { log.push('never adopts'); return blank }

  // 3. when. Drawn from the bank-wide start curve, masked by this profile's own
  //    window and renormalised — so the overall adoption shape is one control
  //    while a late bloomer still cannot start in January.
  const window = []
  for (let m = p.start[0]; m <= Math.min(p.start[1], MONTHS.length); m++) {
    window.push([m, beh.start_curve[m - 1]])
  }
  const start = rng.pick(window)
  if (!start) { log.push('no month available to start in'); return blank }
  log.push(`starts ${MONTHS[start - 1]}`)

  // 4. their own level. Everything after this varies AROUND this number, which
  //    is what makes one person's chart look like a person.
  const personal = Math.round(
    p.intensity.median
    * Math.exp(rng.normal() * p.intensity.sigma)
    * beh.intensity_by_rank[rank - 1]
    * (org.ai_profile[wt]?.intensity ?? 1))
  log.push(`personal level ${(personal / 1000).toFixed(0)}k tokens/month`)

  const rows = []
  let churn = null, spikes = 0, peak = null, peakTokens = 0, active = 0

  for (let m = start; m <= MONTHS.length; m++) {
    const month = MONTHS[m - 1]
    if (churn) break

    // 5. gone for good?
    if (m > start && rng.next() < p.churn) {
      churn = month
      log.push(`${month}: stops`)
      break
    }

    // 5b. or just quiet this month. Not the same thing — a lapse keeps them a
    //     user, and without it the active base can only shrink after the ramp.
    if (m > start && rng.next() < (p.lapse ?? 0)) {
      log.push(`${month}: quiet`)
      continue
    }

    // 6. how much this month. The bank-wide intensity ramp is what makes June
    //    a step rather than another rung: the gateway went live and frontier
    //    models became reachable at volume for everyone at once.
    const ramp = beh.usage_ramp?.[m - 1] ?? 1
    let tokens = Math.round(personal * ramp * Math.exp(rng.normal() * p.volatility))
    let spiked = false
    if (rng.next() < p.spike.prob) {
      const mult = rng.between(p.spike.mult[0], p.spike.mult[1])
      tokens = Math.round(tokens * mult)
      spiked = true
      spikes++
      log.push(`${month}: SPIKE x${mult.toFixed(1)}`)
    }

    // Nobody gets throttled. A spike is not automatically an incident — a
    // security team scanning the whole estate, or an eval harness running
    // overnight, is legitimate work that happens to be expensive, and the
    // Watchtower exists to surface it for a human rather than to kill it.
    if (tokens < 1000) { log.push(`${month}: negligible`); continue }

    // 6c. can they reach ANY platform at all this month? In January most of
    //     the bank could not: the gateway did not exist, Claude was team-by-team
    //     API keys and Copilot was still being seated. This is why the early
    //     months are small — not because the people in them were feeble.
    const entitled = PLATFORMS.some(pl =>
      String(pl.live_from) <= month && hasAccess(person, pl, m - 1))
    if (!entitled) { log.push(`${month}: no platform available to them yet`); continue }

    // 7. which tools they can reach, weighted by what this profile wants
    const open = reachable(person, month)
    if (!open.length) { log.push(`${month}: no app available yet`); continue }
    const appPairs = open.map(a => [a.app_id, (p.kind_pref[SCOPE[a.app_id].kind] ?? 0.2)])
    const chosenApps = rng.pickN(appPairs, Math.min(rng.int(p.breadth.apps[0], p.breadth.apps[1]), open.length))
    if (!chosenApps.length) { log.push(`${month}: nothing they want`); continue }

    const live = liveModels(month)
    const appTokens = splitTokens(rng, tokens, chosenApps.length)

    chosenApps.forEach((appId, ai) => {
      const app = APP.get(appId)
      const kind = SCOPE[appId].kind
      const allowed = KIND_MODALITY[kind] ?? ['text']
      const candidates = live.filter(x =>
        allowed.includes(x.modality)
        && routesFor(person, x.provider, month, kind, m - 1).length)
      if (!candidates.length) return

      // 8. which models. Tier preference, plus a pull toward anything that
      //    launched this month for the novelty-seeking profiles — this is what
      //    produces the Opus 4.7 to 4.8 migration.
      const modelPairs = candidates.map(x => {
        let w = (p.tier_pref[x.model_tier] ?? 0.5)
          * (MODALITY_PULL[kind]?.[x.modality] ?? 1)
          * providerPull(x)
        // Novelty decays over three months rather than firing once. Boosting
        // only in the launch month made every migration a one-month spike that
        // fell straight back — a switcher switches and stays.
        const age = MONTHS.indexOf(month) - MONTHS.indexOf(x.released_month)
        if (age >= 0 && age <= 2) w *= 1 + p.novelty * [6, 4.5, 3][age]
        return [x.model_id, w]
      })
      const n = Math.min(rng.int(p.breadth.models[0], p.breadth.models[1]), candidates.length)
      const chosenModels = rng.pickN(modelPairs, Math.max(1, n))
      const modelTokens = splitTokens(rng, appTokens[ai], chosenModels.length)

      chosenModels.forEach((modelId, mi) => {
        const t = modelTokens[mi]
        if (t < 500) return
        const model = MODEL.get(modelId)

        // 8b. WHICH ROUTE. The same model reached two ways is two invoices, so
        //     this is drawn per row rather than derived from the model. A model
        //     with no live route this month cannot be called at all.
        const routes = routesFor(person, model.provider, month, kind, m - 1)
        if (!routes.length) return
        const platformId = rng.pick(routes.map(r => [r.code, r.weight]))

        const spend = (t * Number(model.rate_per_1m)) / 1e6
        const listSpend = (t * Number(model.list_rate_per_1m)) / 1e6

        // 9. how far the rollout got HERE. A newly launched app is a pilot in
        //    most orgs for a while, whatever the product page says.
        const age = MONTHS.indexOf(month) - MONTHS.indexOf(app.launched_month)
        const status = app.status === 'development' ? 'development'
          : age < 1 ? 'development'
            : age < 3 || app.status === 'pilot' ? 'pilot'
              : 'production'

        rows.push({
          month_key: month, employee_id: person.employee_id,
          model_id: modelId, app_id: appId, platform_id: platformId,
          tokens: t, spend_usd: spend.toFixed(6), list_spend_usd: listSpend.toFixed(6),
          rollout_status: status, is_spike: spiked,
        })
      })
    })

    active++
    if (tokens > peakTokens) { peakTokens = tokens; peak = month }
    log.push(`${month}: ${(tokens / 1000).toFixed(0)}k tokens over ${chosenApps.length} app(s)`)
  }

  return {
    employee_id: person.employee_id, profile_code: code, adopted: rows.length > 0,
    start_month: rows.length ? MONTHS[start - 1] : null, churn_month: churn,
    active_months: active, personal_tokens_pm: personal,
    spike_months: spikes, peak_month: peak, sim_seed: RUN_SEED, rows, log,
  }
}

/** Split a total into n uneven positive parts — never n equal slices. */
function splitTokens(rng, total, n) {
  if (n <= 1) return [total]
  const w = Array.from({ length: n }, () => Math.exp(rng.normal() * 0.6))
  const sum = w.reduce((a, b) => a + b, 0)
  const out = w.map(x => Math.floor((x / sum) * total))
  out[0] += total - out.reduce((a, b) => a + b, 0)
  return out
}

// ---------------------------------------------------------------- run
const results = people.map(simulate)
const factRows = results.flatMap(r => r.rows)

if (EXPLAIN) {
  for (const r of results.slice(0, 5)) {
    const p = people.find(x => x.employee_id === r.employee_id)
    console.log(`\n${p.full_name}  ${p.employee_id}  ${p.job_function}, ${p.lob_name}`)
    console.log('-'.repeat(70))
    r.log.forEach(l => console.log('  ' + l))
    if (r.rows.length) {
      const byMonth = {}
      r.rows.forEach(x => { byMonth[x.month_key] = (byMonth[x.month_key] ?? 0) + Number(x.spend_usd) })
      console.log('  ' + Object.entries(byMonth).map(([m, s]) => `${m.slice(5)} $${s.toFixed(0)}`).join('  '))
    }
  }
  console.log('')
}

// ---------------------------------------------------------------- write
if (!DRY) {
  const ids = results.map(r => r.employee_id)
  await db.query('BEGIN')
  try {
    if (!KEEP) {
      // Scoped replace: only these people. The other 499,999 are untouched.
      await db.query('DELETE FROM silver.fct_usage WHERE employee_id = ANY($1)', [ids])
      await db.query('DELETE FROM silver.dim_employee_behaviour WHERE employee_id = ANY($1)', [ids])
    }
    for (let i = 0; i < results.length; i += 5000) {
      const chunk = results.slice(i, i + 5000)
      const vals = [], ps = []
      chunk.forEach((r, k) => {
        const b = k * 10
        ps.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`)
        vals.push(r.employee_id, r.profile_code, r.adopted, r.start_month, r.churn_month,
          r.active_months, r.personal_tokens_pm, r.spike_months, r.peak_month, r.sim_seed)
      })
      await db.query(`INSERT INTO silver.dim_employee_behaviour
        (employee_id,profile_code,adopted,start_month,churn_month,active_months,
         personal_tokens_pm,spike_months,peak_month,sim_seed) VALUES ${ps.join(',')}`, vals)
    }
    for (let i = 0; i < factRows.length; i += 6000) {
      const chunk = factRows.slice(i, i + 6000)
      const vals = [], ps = []
      chunk.forEach((r, k) => {
        const b = k * 10
        ps.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`)
        vals.push(r.month_key, r.employee_id, r.model_id, r.app_id, r.platform_id,
          r.tokens, r.spend_usd, r.list_spend_usd, r.rollout_status, r.is_spike)
      })
      await db.query(`INSERT INTO silver.fct_usage
        (month_key,employee_id,model_id,app_id,platform_id,tokens,spend_usd,
         list_spend_usd,rollout_status,is_spike) VALUES ${ps.join(',')}`, vals)
    }
    await db.query('COMMIT')
  } catch (e) {
    await db.query('ROLLBACK')
    throw e
  }
}

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
const n = v => Math.round(v).toLocaleString('en-US')
const adopted = results.filter(r => r.adopted)
const spend = factRows.reduce((s, r) => s + Number(r.spend_usd), 0)
const tokens = factRows.reduce((s, r) => s + r.tokens, 0)

console.log(`${n(people.length)} simulated · ${n(adopted.length)} adopted `
  + `(${(adopted.length / people.length * 100).toFixed(1)}%) · seed ${RUN_SEED}${DRY ? ' · DRY RUN' : ''}`)
console.log(`${n(factRows.length)} fact rows · ${n(tokens / 1e6)}M tokens · $${n(spend)}`)

if (people.length > 1) {
  // Monthly shape, scaled to the whole bank when this was a sample — the
  // active-user curve is the thing worth watching while tuning.
  const scale = people.length / 500000
  const byMonth = {}
  factRows.forEach(r => {
    const b = byMonth[r.month_key] ??= { spend: 0, tokens: 0, who: new Set() }
    b.spend += Number(r.spend_usd); b.tokens += r.tokens; b.who.add(r.employee_id)
  })
  console.log('\nmonth'.padEnd(11) + pad('active', 11) + pad('spend', 12) + pad('tokens', 10)
    + (scale < 1 ? '   (scaled to 500k)' : ''))
  console.log('-'.repeat(44))
  Object.keys(byMonth).sort().forEach(m => {
    const b = byMonth[m]
    console.log(m.padEnd(11) + pad(n(b.who.size / scale), 11)
      + pad('$' + (b.spend / scale / 1e6).toFixed(2) + 'M', 12)
      + pad((b.tokens / scale / 1e12).toFixed(2) + 'T', 10))
  })

  const byProfile = {}
  results.forEach(r => {
    const b = byProfile[r.profile_code] ??= { people: 0, spend: 0 }
    b.people++
  })
  // Map, not find: at 500k people and 4.4M rows a linear scan per row is
  // 2.2 trillion comparisons and the process never returns.
  const profileOf = new Map(results.map(r => [r.employee_id, r.profile_code]))
  factRows.forEach(r => { byProfile[profileOf.get(r.employee_id)].spend += Number(r.spend_usd) })
  console.log('\nprofile'.padEnd(18) + pad('people', 9) + pad('share', 8) + pad('spend', 13) + pad('$/person', 11))
  console.log('-'.repeat(59))
  Object.entries(byProfile).sort((a, b) => b[1].spend - a[1].spend).forEach(([c, b]) =>
    console.log(c.padEnd(18) + pad(n(b.people), 9)
      + pad((b.people / people.length * 100).toFixed(1) + '%', 8)
      + pad('$' + n(b.spend), 13) + pad('$' + n(b.spend / b.people), 11)))
}

await db.end()

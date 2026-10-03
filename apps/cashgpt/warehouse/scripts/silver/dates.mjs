#!/usr/bin/env node
/**
 * -> data/silver/dim_date.csv   (1 Jan – 31 Jul 2026, 212 rows)
 *
 * No YAML: a calendar is derivable, and the only authored part is the holiday
 * list below. Everything else is computed, so there is nothing to keep in sync.
 *
 *   node scripts/silver/dates.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FROM = '2026-01-01'
const TO = '2026-07-31'

/**
 * England and Wales bank holidays falling in range. Scotland (2 Jan, first
 * Monday in August) and Northern Ireland (17 Mar, 12 Jul) differ — a real
 * multi-country calendar would be its own dimension keyed by jurisdiction, and
 * this bank does have Dublin and Frankfurt staff who work different days.
 * Not worth it while every dashboard is monthly.
 */
const HOLIDAYS = {
  '2026-01-01': "New Year's Day",
  '2026-04-03': 'Good Friday',
  '2026-04-06': 'Easter Monday',
  '2026-05-04': 'Early May bank holiday',
  '2026-05-25': 'Spring bank holiday',
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const iso = d => d.toISOString().slice(0, 10)

/** ISO-8601 week: the week containing the year's first Thursday is week 1. */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - jan1) / 86400000 + 1) / 7)
}

const rows = []
for (let d = new Date(FROM + 'T00:00:00Z'); iso(d) <= TO; d.setUTCDate(d.getUTCDate() + 1)) {
  const key = iso(d)
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay()      // ISO: Monday = 1
  const isWeekend = dow >= 6
  const holiday = HOLIDAYS[key] ?? null
  const y = d.getUTCFullYear(), m = d.getUTCMonth()
  const monthEnd = new Date(Date.UTC(y, m + 1, 0))

  rows.push({
    date_key: key,
    year_num: y,
    quarter_num: Math.floor(m / 3) + 1,
    month_num: m + 1,
    month_key: key.slice(0, 7),
    month_name: MONTHS[m],
    month_short: MONTHS[m].slice(0, 3),
    month_start: iso(new Date(Date.UTC(y, m, 1))),
    month_end: iso(monthEnd),
    days_in_month: monthEnd.getUTCDate(),
    day_of_month: d.getUTCDate(),
    day_of_week: dow,
    day_name: DAYS[dow - 1],
    iso_week: isoWeek(d),
    is_weekend: isWeekend,
    is_holiday: holiday !== null,
    holiday_name: holiday,
    is_working_day: !isWeekend && holiday === null,
  })
}

// Second pass: working-day position and per-month totals need the whole month.
const byMonth = new Map()
rows.forEach(r => {
  if (!byMonth.has(r.month_key)) byMonth.set(r.month_key, [])
  byMonth.get(r.month_key).push(r)
})
for (const [, days] of byMonth) {
  const working = days.filter(r => r.is_working_day)
  working.forEach((r, i) => { r.working_day_of_month = i + 1 })
  days.forEach(r => { r.working_days_in_month = working.length })
}

// ---------------------------------------------------------------- assertions
const fail = []
if (rows.length !== 212) fail.push(`${rows.length} days, expected 212 for Jan-Jul 2026`)
if (rows.filter(r => r.is_holiday).length !== Object.keys(HOLIDAYS).length) {
  fail.push('a declared holiday falls outside the range')
}
rows.forEach(r => {
  if (r.is_working_day !== (!r.is_weekend && !r.is_holiday)) fail.push(`${r.date_key}: working day is wrong`)
  if (r.is_weekend !== (r.day_of_week >= 6)) fail.push(`${r.date_key}: weekend flag is wrong`)
})
// the whole point of the working-day columns is that months differ; if they do
// not, the columns are dead weight
const wd = [...byMonth.values()].map(d => d[0].working_days_in_month)
if (Math.max(...wd) - Math.min(...wd) < 2) fail.push('working days per month barely vary — the columns buy nothing')
if (fail.length) { console.error('GENERATION FAILED\n  ' + fail.join('\n  ')); process.exit(1) }

// ---------------------------------------------------------------- emit
mkdirSync(resolve(ROOT, 'data/silver'), { recursive: true })
const COLS = ['date_key', 'year_num', 'quarter_num', 'month_num', 'month_key', 'month_name',
  'month_short', 'month_start', 'month_end', 'days_in_month', 'day_of_month', 'day_of_week',
  'day_name', 'iso_week', 'is_weekend', 'is_holiday', 'holiday_name', 'is_working_day',
  'working_day_of_month', 'working_days_in_month', 'source_file']
const esc = v => (v === null || v === undefined ? ''
  : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
writeFileSync(resolve(ROOT, 'data/silver/dim_date.csv'),
  COLS.join(',') + '\n'
  + rows.map(r => COLS.map(c => esc(c === 'source_file' ? 'scripts/silver/dates.mjs' : r[c])).join(',')).join('\n') + '\n')

// ---------------------------------------------------------------- report
const pad = (s, n) => String(s).padStart(n)
console.log(`${rows.length} days · ${rows.filter(r => r.is_working_day).length} working\n`)
console.log('month'.padEnd(12) + pad('days', 6) + pad('working', 9) + pad('weekend', 9) + '  holidays')
console.log('-'.repeat(58))
for (const [k, days] of byMonth) {
  const hol = days.filter(d => d.is_holiday)
  console.log(days[0].month_name.padEnd(12) + pad(days.length, 6)
    + pad(days[0].working_days_in_month, 9)
    + pad(days.filter(d => d.is_weekend).length, 9)
    + '  ' + hol.map(h => h.holiday_name).join(', '))
}
console.log('-'.repeat(58))
console.log(`working days range ${Math.min(...wd)}–${Math.max(...wd)} — a ${((Math.max(...wd) / Math.min(...wd) - 1) * 100).toFixed(0)}% swing between months on calendar alone`)

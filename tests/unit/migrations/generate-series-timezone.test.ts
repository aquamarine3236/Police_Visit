/**
 * Regression guard for the production error:
 *
 *   "function generate_series(time without time zone, time without time zone,
 *    interval) does not exist"
 *
 * PostgreSQL has NO generate_series() overload for the `time` type. The
 * scheduling-settings clock columns (morning_start_time, morning_end_time,
 * afternoon_start_time, afternoon_end_time) are all `TIME`, so any
 * generate_series() call that receives those columns directly is invalid and
 * WILL fail at runtime.
 *
 * The correct pattern (migrations 00018 / 00025) anchors the TIME onto a fixed
 * dummy DATE first, so generate_series runs over `timestamp`:
 *
 *   generate_series(v_anchor + settings.morning_start_time, ..., v_interval)
 *
 * This test statically scans every migration file to make sure the LATEST
 * definition of fn_assign_time_slot never reintroduces the raw-TIME pattern.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../supabase/migrations');

/** TIME columns from scheduling_settings that must never be passed to generate_series directly. */
const TIME_COLUMNS = [
  'morning_start_time',
  'morning_end_time',
  'afternoon_start_time',
  'afternoon_end_time',
];

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // numeric prefixes sort chronologically
}

/**
 * Extract every generate_series(...) argument list from SQL text, handling
 * nested parentheses so we capture the full call.
 */
function extractGenerateSeriesCalls(sql: string): string[] {
  const calls: string[] = [];
  const lower = sql.toLowerCase();
  let searchFrom = 0;

  for (;;) {
    const idx = lower.indexOf('generate_series', searchFrom);
    if (idx === -1) break;

    const open = sql.indexOf('(', idx);
    if (open === -1) break;

    let depth = 0;
    let end = -1;
    for (let i = open; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;

    calls.push(sql.slice(open + 1, end));
    searchFrom = end + 1;
  }

  return calls;
}

/**
 * A generate_series call is "raw TIME" (invalid) when it references a TIME
 * column WITHOUT anchoring it onto a date (i.e. no `+ <time column>` against a
 * date/timestamp anchor). We treat the presence of a bare TIME column that is
 * not immediately preceded by a `+` as the invalid form.
 */
function usesRawTimeColumn(call: string): boolean {
  for (const col of TIME_COLUMNS) {
    const re = new RegExp(`([+\\-]\\s*)?settings\\.${col}`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(call)) !== null) {
      const operator = m[1]?.trim();
      // Anchored form is `v_anchor + settings.morning_start_time` → preceded by '+'.
      // The `- v_interval` after it is fine. Only a column that is NOT anchored
      // by a preceding '+' (relative to a date) is the invalid raw-TIME form.
      if (operator !== '+') {
        return true;
      }
    }
  }
  return false;
}

describe('migrations: generate_series never uses raw TIME columns', () => {
  it('every generate_series() call anchors TIME columns onto a DATE', () => {
    const offenders: Array<{ file: string; call: string }> = [];

    for (const file of listMigrationFiles()) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      for (const call of extractGenerateSeriesCalls(sql)) {
        if (usesRawTimeColumn(call)) {
          offenders.push({ file, call: call.replace(/\s+/g, ' ').trim() });
        }
      }
    }

    // NOTE: historical migrations 00010/00015/00024 contain the invalid pattern
    // but are SUPERSEDED by a later CREATE OR REPLACE. What matters for
    // production is the FINAL definition (see the next test). This test asserts
    // that NO migration numbered at or after the latest fix reintroduces it.
    const LATEST_FIX = '00025';
    const activeOffenders = offenders.filter(
      (o) => o.file.slice(0, 5) >= LATEST_FIX,
    );

    expect(
      activeOffenders,
      `generate_series over raw TIME columns reintroduced in: ${activeOffenders
        .map((o) => o.file)
        .join(', ')}`,
    ).toEqual([]);
  });

  it('the final fn_assign_time_slot definition uses the anchored-timestamp pattern', () => {
    const files = listMigrationFiles();

    // Find the last migration that (re)defines fn_assign_time_slot.
    let finalDefFile: string | null = null;
    let finalDefSql = '';
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      if (/create\s+or\s+replace\s+function\s+fn_assign_time_slot/i.test(sql)) {
        finalDefFile = file;
        finalDefSql = sql;
      }
    }

    expect(finalDefFile, 'no migration defines fn_assign_time_slot').not.toBeNull();

    // The winning definition must anchor onto a DATE and cast slots back to time.
    const calls = extractGenerateSeriesCalls(finalDefSql);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        usesRawTimeColumn(call),
        `final definition (${finalDefFile}) still passes a raw TIME column to generate_series: ${call
          .replace(/\s+/g, ' ')
          .trim()}`,
      ).toBe(false);
    }
  });
});

#!/usr/bin/env node
/**
 * @file check-coverage.cjs
 * @description Check test coverage against defined thresholds per folder
 * @path .github/scripts/check-coverage.cjs
 */

const fs = require('fs');
const path = require('path');

function readCoverageSummary(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Coverage summary not found at: ${filePath}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return data;
}

function normalizePath(p) {
  const rel = path.relative(process.cwd(), p);
  return rel.split(path.sep).join('/');
}

function loadThresholds() {
  const defaultPath = path.join(process.cwd(), '.github', 'constants', 'thresholds.json');
  const thresholdsPath = process.env.THRESHOLDS_FILE || defaultPath;
  if (!fs.existsSync(thresholdsPath)) {
    console.error(`Thresholds config not found at: ${thresholdsPath}`);
    process.exit(1);
  }
  try {
    const raw = JSON.parse(fs.readFileSync(thresholdsPath, 'utf8'));
    if (!Array.isArray(raw)) {
      console.error('Thresholds config must be an array of rules.');
      process.exit(1);
    }
    return raw.map((rule, idx) => {
      const name = rule.name || `group-${idx + 1}`;
      const mode = (rule.match_mode || 'prefix').toLowerCase();
      const matchExpr = rule.match || '';
      let matcher;
      if (mode === 'regex') {
        const re = new RegExp(matchExpr);
        matcher = (p) => re.test(p);
      } else {
        matcher = (p) => p.startsWith(matchExpr);
      }
      const min = rule.min || {};
      for (const k of ['branches', 'functions', 'lines', 'statements']) {
        if (typeof min[k] !== 'number') {
          console.error(`Thresholds config '${name}' missing numeric 'min.${k}'.`);
          process.exit(1);
        }
      }
      return { name, match: matcher, min };
    });
  } catch (e) {
    console.error('Failed to read thresholds config:', e.message);
    process.exit(1);
  }
}

const thresholds = loadThresholds();

function aggregate(files) {
  const agg = {
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 },
    statements: { covered: 0, total: 0 }
  };
  for (const f of files) {
    for (const key of ['branches', 'functions', 'lines', 'statements']) {
      const s = f[key];
      if (!s) continue;
      agg[key].covered += Number(s.covered || 0);
      agg[key].total += Number(s.total || 0);
    }
  }
  const pct = {};
  for (const key of Object.keys(agg)) {
    const { covered, total } = agg[key];
    pct[key] = total > 0 ? (covered / total) * 100 : 100;
  }
  return { agg, pct };
}

function main() {
  const summaryPath = process.env.COVERAGE_SUMMARY || path.join(process.cwd(), 'coverage', 'coverage-summary.json');
  const summary = readCoverageSummary(summaryPath);

  const entries = Object.entries(summary)
    .filter(([k]) => k !== 'total')
    .map(([file, data]) => ({ file: normalizePath(file), ...data }));

  let failed = false;
  for (const group of thresholds) {
    const groupFiles = entries.filter((e) => group.match(e.file));
    if (groupFiles.length === 0) {
      console.log(`Coverage check: group '${group.name}' — no matching files, skipping.`);
      continue;
    }
    const { pct } = aggregate(groupFiles);
    const results = {};
    for (const metric of ['branches', 'functions', 'lines', 'statements']) {
      const value = pct[metric];
      const min = group.min[metric];
      const ok = value >= min;
      results[metric] = { value: Number(value.toFixed(2)), min, ok };
      if (!ok) failed = true;
    }
    console.log(`Coverage check: group '${group.name}'`);
    console.table(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { pct: v.value, required: v.min, pass: v.ok }])));
  }

  if (failed) {
    console.error('Per-folder coverage thresholds not met. Failing.');
    process.exit(1);
  } else {
    console.log('Per-folder coverage thresholds met.');
  }
}

main();

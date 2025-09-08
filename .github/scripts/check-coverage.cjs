#!/usr/bin/env node
/**
 * @file check-coverage.cjs
 * @description Check test coverage against defined thresholds per folder
 * @path .github/scripts/check-coverage.cjs
 */

const fs = require('fs');
const path = require('path');

/**
 * Maximum directory search depth when scanning for coverage-summary.json
 * relative to the repository root.
 * This avoids deep traversal into node_modules or .git directories.
 */
const MAX_SEARCH_DEPTH = 4;

function readCoverageSummary(filePath) {
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data;
  }
  return null;
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

function findCoverageSummary() {
  const candidates = [];

  if (process.env.COVERAGE_SUMMARY) candidates.push(process.env.COVERAGE_SUMMARY);

  // Common location relative to current working directory
  candidates.push(path.join(process.cwd(), 'coverage', 'coverage-summary.json'));

  // When script is run from .github/scripts, move up to repo root
  const repoRoot = path.resolve(__dirname, '..', '..');
  candidates.push(path.join(repoRoot, 'coverage', 'coverage-summary.json'));

  // Fallback: try one level up from repo root (in case of worktrees/CI checkout differences)
  candidates.push(path.join(repoRoot, '..', 'coverage', 'coverage-summary.json'));

  for (const c of candidates) {
    const resolved = path.resolve(c);
    const data = readCoverageSummary(resolved);
    if (data) return { data, path: resolved };
  }

  // Fallback: scan repo root for any coverage-summary.json (avoid deep traversal in node_modules/.git)
  const searchRoot = path.resolve(__dirname, '..', '..');
  let foundPath = null;
  try {
    const queue = [searchRoot];
    while (queue.length && !foundPath) {
      const dir = queue.shift();
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const max_search_depth = process.env.MAX_SEARCH_DEPTH ? Number(process.env.MAX_SEARCH_DEPTH) : MAX_SEARCH_DEPTH;
          // Only descend a limited depth: relative depth <= max_search_depth
          const depth = full.replace(searchRoot, '').split(path.sep).filter(Boolean).length;
          if (depth <= max_search_depth) queue.push(full);
        } else if (entry.name === 'coverage-summary.json' && /coverage/.test(full)) {
          foundPath = full;
          break;
        }
      }
    }
  } catch {
    // ignore scanning errors
  }
  if (foundPath) {
    const data = readCoverageSummary(foundPath);
    if (data) return { data, path: foundPath };
  }

  return { data: null, tried: candidates.map((c) => path.resolve(c)) };
}

function main() {
  const found = findCoverageSummary();
  if (!found.data) {
    console.error('Coverage summary not found. Tried the following paths:');
    for (const p of found.tried) console.error(` - ${p}`);
    process.exit(1);
  }
  const summary = found.data;

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

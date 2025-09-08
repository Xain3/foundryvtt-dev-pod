/**
 * @file check-file-headers.mjs
 * @description CLI utility that verifies JavaScript source files include the
 * required JSDoc header block (e.g. `@file`, `@description`, `@path`).
 *
 * The script supports an optional JSON config to override required fields and
 * ignore globs, tolerates a leading shebang, and performs a best-effort
 * validation of `@file` and `@path` tag values. It exits with a non-zero
 * status when any file fails validation which makes it suitable for CI checks
 * and pre-commit hooks.
 *
 * @path scripts/check-file-headers.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_FIELDS = [
  '@file',
  '@description',
  '@path'
];

/**
 * Print usage information to the console.
 */
function usage() {
  console.log(`Usage: node scripts/check-file-headers.mjs [--config optional-json] <file ...>

Examples:
  node scripts/check-file-headers.mjs src/foo.js
  git diff --name-only origin/main...HEAD | grep -E '\\.(m?js|cjs)$' | xargs node scripts/check-file-headers.mjs

Options:
  --config <file>   Optional JSON file to override requiredFields and ignoreGlobs.
`);
}

/**
 * Load configuration from a JSON file.
 * @param {string} customConfigPath - Path to the JSON config file.
 * @returns {object} Parsed config object or empty object if no path provided.
 */
function loadConfig(customConfigPath) {
  if (!customConfigPath) return {};
  try {
    const raw = fs.readFileSync(customConfigPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[headers][error] Failed to load config '${customConfigPath}': ${err.message}`);
    process.exit(2);
  }
}

/**
 * Check if the file path corresponds to a JavaScript source file.
 * @param {string} filePath - The file path to check.
 * @returns {boolean} True if the file is a JS source file (.js, .mjs, .cjs).
 */
function isSourceFile(filePath) {
  return /(\.m?js|\.cjs)$/i.test(filePath);
}

/**
 * Read the first bytes of a file as a string.
 * @param {string} filePath - Path to the file to read.
 * @param {number} maxBytes - Maximum number of bytes to read (default 4096).
 * @returns {string} The content of the first bytes as a UTF-8 string.
 */
function readFirstBytes(filePath, maxBytes = 4096) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(maxBytes);
  const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
  fs.closeSync(fd);
  return buffer.slice(0, bytesRead).toString('utf8');
}

/**
 * Extract the JSDoc header block from file content.
 * @param {string} content - The file content as a string.
 * @returns {string[]|null} Array of header lines or null if no header found.
 */
function extractHeaderBlock(content) {
  const lines = content.split(/\n/);
  let i = 0;
  // Skip shebang if present
  if (lines[i] && lines[i].startsWith('#!')) i++;
  // Skip leading blank lines
  while (i < lines.length && lines[i].trim() === '') i++;
  if (!lines[i] || !lines[i].trim().startsWith('/**')) return null;
  const headerLines = [];
  for (; i < lines.length; i++) {
    headerLines.push(lines[i].trim());
    if (lines[i].includes('*/')) break;
  }
  if (!headerLines[headerLines.length - 1].includes('*/')) return null;
  return headerLines;
}

/**
 * Validate the JSDoc header lines against required fields.
 * @param {string} filePath - Path to the file being validated.
 * @param {string[]} headerLines - Array of header lines.
 * @param {string[]} requiredFields - Array of required JSDoc tags.
 * @returns {string[]} Array of error messages.
 */
function validateHeader(filePath, headerLines, requiredFields) {
  const errors = [];
  if (!headerLines) {
    errors.push('Missing JSDoc header block starting at first line.');
    return errors;
  }
  for (const field of requiredFields) {
    if (!headerLines.some(l => l.includes(field))) {
      errors.push(`Missing required tag '${field}'.`);
    }
  }
  // Validate @file value matches basename
  const fileTagLine = headerLines.find(l => l.startsWith('* @file'));
  if (fileTagLine) {
    const value = fileTagLine.replace('* @file', '').trim();
    const base = path.basename(filePath);
    if (value && value !== base) {
      errors.push(`@file tag mismatch: expected '${base}' got '${value}'.`);
    }
  } else {
    errors.push('No @file tag line found.');
  }
  // Validate @path contains relative path within repo (best effort)
  const pathTagLine = headerLines.find(l => l.startsWith('* @path'));
  if (pathTagLine) {
    const value = pathTagLine.replace('* @path', '').trim();
    if (!value) {
      errors.push('@path tag empty.');
    }
  } else {
    errors.push('No @path tag line found.');
  }
  return errors;
}

/**
 * Main entry point for the header validation script.
 * @param {string[]} argv - Command line arguments.
 */
function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(0);
  }

  let configPath;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--config') {
      configPath = args[++i];
    } else {
      files.push(a);
    }
  }

  const config = loadConfig(configPath);
  const requiredFields = config.requiredFields || REQUIRED_FIELDS;
  const ignoreGlobs = config.ignoreGlobs || [];

  const micromatch = (patterns, value) => {
    // Minimal matcher: only supports '*' wildcard for this script to avoid new dep.
    return patterns.some(p => {
      const regex = new RegExp('^' + p.split('*').map(s => s.replace(/[-/\\^$+?.()|[\]{}]/g, r => '\\' + r)).join('.*') + '$');
      return regex.test(value);
    });
  };

  let hadErrors = false;
  for (const f of files) {
    if (!isSourceFile(f)) continue;
    if (ignoreGlobs.length && micromatch(ignoreGlobs, f)) continue;
    if (!fs.existsSync(f)) {
      console.warn(`[headers][warn] Skipping missing file ${f}`);
      continue;
    }
    const content = readFirstBytes(f);
    const header = extractHeaderBlock(content);
    const errors = validateHeader(f, header, requiredFields);
    if (errors.length) {
      hadErrors = true;
      console.error(`\n[headers][fail] ${f}`);
      errors.forEach(e => console.error(`  - ${e}`));
    } else {
      console.log(`[headers][ok] ${f}`);
    }
  }

  if (hadErrors) {
    console.error('\n[headers] Validation failed.');
    process.exit(1);
  } else {
    console.log('\n[headers] All files passed.');
  }
}

main(process.argv);

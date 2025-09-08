/**
 * @file hc-check-headers-changed-files.cjs
 * @description Determine changed JS files vs a base ref and run header checks + emit GitHub Actions outputs.
 * @path .github/scripts/hc-check-headers-changed-files.cjs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Determines changed files between the current HEAD and a specified base ref,
 * filtered by an optional regex pattern.
 * @param {string} baseRef - The base ref to compare against (e.g., 'main').
 * @param {string} [matchPattern='\\.(m?js|cjs)$'] - Regex pattern to filter files.
 * @returns {string[]} Array of changed file paths matching the pattern.
 */
function determineChangedFiles(baseRef, matchPattern = '\\.(m?js|cjs)$') {
  try {
    // Fetch the base ref
    execSync(`git fetch origin ${baseRef} --depth=1`, { stdio: 'inherit' });

    // Get changed files as null-delimited string
    const changedRaw = execSync(`git diff --name-only -z origin/${baseRef}...HEAD`, { encoding: 'utf8' });

    // Split by null, filter by pattern, and return as array
    const changedFiles = changedRaw
      .split('\0')
      .filter(file => file && new RegExp(matchPattern).test(file));

    return changedFiles;
  } catch (error) {
    console.error('Error determining changed files:', error.message);
    return [];
  }
}

/**
 * Writes a formatted Markdown summary to the GitHub step summary file if available.
 * @param {string[]} changedFiles - Array of changed file paths.
 */
function writeSummary(changedFiles) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return; // Not in CI, skip

  const summary = `# Changed Files Summary\n\n` +
    `Found ${changedFiles.length} changed file(s) matching the pattern.\n\n` +
    (changedFiles.length > 0
      ? changedFiles.map(file => `- \`${file}\``).join('\n')
      : 'No changes detected.');

  try {
    fs.appendFileSync(summaryPath, summary + '\n\n');
  } catch (error) {
    console.error('Error writing to summary:', error.message);
  }
}

/**
 * Sets the GitHub output by appending the changed files to the GITHUB_OUTPUT file.
 * @param {Array|string|Object} changedFiles - The list or object of changed files to be serialized and output.
 */
function setGitHubOutput(changedFiles) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    try {
      fs.appendFileSync(outputPath, `changed-files=${JSON.stringify(changedFiles)}\n`);
    } catch (error) {
      console.error('Error writing to output:', error.message);
    }
  }
}

/**
 * Run the header check script for the provided list of files.
 * @param {string[]} files - Array of file paths to check.
 * @param {string} configPath - Optional path to header-check config JSON.
 * @returns {boolean} True if checks passed, false if any failed.
 */
function runHeaderChecks(files, configPath) {
  if (!files || files.length === 0) return true;
  try {
    // Ensure we're running from the project root (two levels up from this script)
    process.chdir(path.join(__dirname, '..', '..'));
    const escapedFiles = files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(' ');
    const cfg = configPath ? `--config ${configPath} ` : '';
    const cmd = `node scripts/check-file-headers.mjs ${cfg}${escapedFiles}`;
    console.log(`[hc] Running header check: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('[hc][error] Header check failed:', error.message);
    return false;
  }
}

/**
 * Main entry point for the script that determines changed files based on a base reference.
 *
 * This function expects command-line arguments: a base reference (e.g., a Git commit or branch)
 * and an optional match pattern for file extensions. It calls `determineChangedFiles` to get
 * the list of changed files, then outputs the result as JSON to the console.
 * If running in GitHub Actions, it also writes a formatted summary.
 *
 * Usage: node scripts/determine-changed-files.cjs <base-ref> [match-pattern]
 *
 * @param {string} baseRef - The base Git reference (e.g., commit SHA or branch name) to compare against.
 * @param {string} [matchPattern='\\.(m?js|cjs)$'] - Optional regex pattern to match file extensions (defaults to JS/JSX/CJS files).
 * @throws {Error} If fewer than 2 command-line arguments are provided, exits with code 1 and logs usage error.
 */
function main() {
  if (process.argv.length < 3) {
    console.error('Usage: node scripts/determine-changed-files.cjs <base-ref> [match-pattern]');
    process.exit(1);
  }
  const baseRef = process.argv[2];
  const matchPattern = process.argv[3] || '\\.(m?js|cjs)$';
  // Optional fourth arg: path to header-check config JSON
  const headerConfig = process.argv[4] || process.env.HEADER_CHECK_CONFIG || 'header-check.config.json';
  const changedFiles = determineChangedFiles(baseRef, matchPattern);

  // Set output for GitHub Actions
  setGitHubOutput(changedFiles);

  // Write formatted summary if in CI
  writeSummary(changedFiles);

  // If there are changed files, run the header check directly here.
  if (changedFiles.length > 0) {
    const ok = runHeaderChecks(changedFiles, headerConfig);
    if (!ok) process.exit(1);
  } else {
    console.log('[hc] No changed files matching pattern; skipping header checks.');
  }
}

if (require.main === module) {
  main();
}

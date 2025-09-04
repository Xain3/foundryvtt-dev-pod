#!/usr/bin/env node
/**
 * Parses command-line arguments for procedural number and patch name.
 *
 * @param {string} [defaultNumber="00"] - The default value for `--procedural-number` if not provided.
 * @param {string} [defaultName="patch"] - The default value for `--patch-name` if not provided.
 * @returns {{ procNum: string, patchName: string, args: string[] }} An object containing:
 *   - procNum: The procedural number argument or the default.
 *   - patchName: The patch name argument or the default.
 *   - args: The full array of parsed arguments.
 *
 * @example
 * const { procNum, patchName, args } = parsePatchArgs("01", "myPatch");
 */
export function parsePatchArgs(defaultNumber = "00", defaultName = "patch") {
  const ARGS = process.argv.slice(2);
  const getArg = (name) => {
    const i = ARGS.indexOf(name);
    return i >= 0 ? ARGS[i + 1] : undefined;
  };
  const procNum = getArg("--procedural-number") || defaultNumber;
  const patchName = getArg("--patch-name") || defaultName;
  return { procNum, patchName, args: ARGS };
}

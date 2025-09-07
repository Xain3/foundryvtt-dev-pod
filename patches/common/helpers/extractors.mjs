/**
 * @file extractors.mjs
 * @description Utilities for extracting tar archives from buffers
 * @path patches/common/helpers/extractors.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

import { stripNullTerminated } from './helpers/stripNullTerminated.js';

function ensureDirSync(dir) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function parseOctal(str) {
	// tar sizes are stored as octal ASCII, possibly null/space padded
	const s = stripNullTerminated(String(str));
	const m = s.match(/[0-7]+/);
	return m ? parseInt(m[0], 8) : 0;
}

/**
 * Extract a tar archive from a buffer to a destination directory.
 * @param {Buffer} buf - Buffer containing tar archive data
 * @param {string} destDir - Destination directory path
 * @returns {Promise<void>} Promise that resolves when extraction is complete
 * @export
 */
export async function extractTarBuffer(buf, destDir) {
	ensureDirSync(destDir);
	let offset = 0;
	const BLOCK = 512;
	while (offset + BLOCK <= buf.length) {
		const header = buf.slice(offset, offset + BLOCK);
		offset += BLOCK;
		// End of archive: two consecutive zero blocks
		if (header.every((b) => b === 0)) break;

		const name = stripNullTerminated(header.slice(0, 100).toString('utf8'));
		const size = parseOctal(header.slice(124, 136).toString('utf8'));
		const typeflag = header[156];
		const prefix = stripNullTerminated(header.slice(345, 500).toString('utf8'));
		const fullName = prefix ? path.join(destDir, prefix, name) : path.join(destDir, name);

		if (typeflag === 53 /* '5' */) {
			ensureDirSync(fullName);
		} else if (typeflag === 48 /* '0' */ || typeflag === 0) {
			ensureDirSync(path.dirname(fullName));
			const fileData = buf.slice(offset, offset + size);
			fs.writeFileSync(fullName, fileData);
			// Advance to next 512 boundary
			const pad = (BLOCK - (size % BLOCK)) % BLOCK;
			offset += size + pad;
		} else {
			// Skip other types, but consume data area if any
			const pad = (BLOCK - (size % BLOCK)) % BLOCK;
			offset += size + pad;
		}
	}
}

/**
 * Extract a gzipped tar archive to a destination directory.
 * @param {string} filePath - Path to the .tar.gz file
 * @param {string} destDir - Destination directory path
 * @returns {Promise<object>} Result object with success status
 * @export
 */
export async function extractTarGz(filePath, destDir) {
	const compressed = fs.readFileSync(filePath);
	const buf = zlib.gunzipSync(compressed);
	await extractTarBuffer(buf, destDir);
	return { success: true };
}

/**
 * Extract a tar archive to a destination directory.
 * @param {string} filePath - Path to the .tar file
 * @param {string} destDir - Destination directory path
 * @returns {Promise<object>} Result object with success status
 * @export
 */
export async function extractTar(filePath, destDir) {
	const buf = fs.readFileSync(filePath);
	await extractTarBuffer(buf, destDir);
	return { success: true };
}

/**
 * Extract various archive formats using Node.js built-in modules.
 * @param {string} archivePath - Path to the archive file
 * @param {string} destDir - Destination directory path
 * @param {string} sourceName - Source name for format detection
 * @param {object} options - Extraction options
 * @param {boolean} options.debug - Enable debug logging (default: false)
 * @returns {Promise<object>} Result object with success/error status
 * @export
 */
export async function extractArchiveNode(archivePath, destDir, sourceName, { debug = false } = {}) {
	const lower = (sourceName || archivePath).toLowerCase();
	if (/(\.tar\.gz|\.tgz)$/.test(lower)) {
		if (debug) console.log(`[patch][debug] node-extract tgz: ${archivePath} -> ${destDir}`);
		await extractTarGz(archivePath, destDir);
		return { success: true };
	}
	if (/\.tar$/.test(lower)) {
		if (debug) console.log(`[patch][debug] node-extract tar: ${archivePath} -> ${destDir}`);
		await extractTar(archivePath, destDir);
		return { success: true };
	}
	if (/(\.tar\.(bz2|xz)|\.tbz2|\.txz)$/.test(lower)) {
		return { success: false, error: 'node-extract: bzip2/xz not supported' };
	}
	if (/\.zip$/.test(lower)) {
		return { success: false, error: 'node-extract: zip not supported in pure Node fallback' };
	}
	return { success: false, error: 'node-extract: unknown archive format' };
}

export { stripNullTerminated };

export default { extractArchiveNode };

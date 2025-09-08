/**
 * @file extractors.mjs
 * @description Utilities for extracting tar archives from buffers
 * @path patches/common/helpers/extractors.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Null character used by tar header fields as padding/terminator.
 * Tar header fields are fixed-width and any unused bytes are filled
 * with NUL (\u0000). Splitting on this character yields the
 * meaningful string value without padding.
 * @constant {string}
 */
const NULL_CHAR = '\u0000'; // Null character for string termination

function ensureDirSync(dir) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Parse an octal ASCII field from a tar header and return a number.
 * Tar headers store numeric values (like file size) as ASCII octal
 * strings in fixed-width fields that may be NUL- or space-padded.
 *
 * The function accepts either a Buffer or string. It converts to
 * string, truncates at the first NUL (\u0000) to remove padding,
 * trims whitespace, then matches the octal digits and parses them.
 *
 * @param {Buffer|string} str - Raw header slice (buffer) or string
 * @returns {number} Decoded integer value (0 on parse failure)
 * @example
 * // header.slice(124, 136) yields the size field; pass to parseOctal
 * const size = parseOctal(header.slice(124, 136));
 */
function parseOctal(str) {
	// tar sizes are stored as octal ASCII, possibly null/space padded
	const s = String(str).split(NULL_CHAR)[0].trim();
	const m = s.match(/[0-7]+/);
	return m ? parseInt(m[0], 8) : 0;
}

/**
 * Extract a tar archive that is already loaded into a Buffer.
 *
 * This is a minimal pure-Node implementation of tar extraction suitable
 * for small archives and environments where bringing in native
 * dependencies is undesirable. It supports regular files (type '0' or
 * NUL) and directories (type '5'). Other entry types are skipped.
 *
 * The function reads the archive one 512-byte header block at a time
 * and then consumes the following data blocks according to the size
 * field in the header. It writes extracted files to `destDir`,
 * preserving any `prefix` field used by GNU tar for long paths.
 *
 * Note: This implementation does not perform security hardening such
 * as symlink handling, path traversal checks, or file metadata
 * restoration (permissions, mtime). Callers should validate inputs
 * and sanitize `destDir` if working with untrusted archives.
 *
 * @param {Buffer} buf - Buffer containing an entire tar archive
 * @param {string} destDir - Destination directory path to extract into
 * @returns {Promise<void>} Resolves when extraction completes
 * @example
 * // extract a .tar file previously read into a buffer
 * const buf = fs.readFileSync('archive.tar');
 * await extractTarBuffer(buf, '/tmp/extract');
 */
export async function extractTarBuffer(buf, destDir) {
	ensureDirSync(destDir);
	let offset = 0;
	const BLOCK = 512;
	while (offset + BLOCK <= buf.length) {
		const header = buf.slice(offset, offset + BLOCK);
		offset += BLOCK;
		// End of archive: two consecutive zero blocks -- check header
		if (header.every((b) => b === 0)) break;

		// name field: bytes 0..99
		const name = header.slice(0, 100).toString('utf8').split(NULL_CHAR)[0];
		// size field: bytes 124..135 (12 bytes) as octal ASCII
		const size = parseOctal(header.slice(124, 136).toString('utf8'));
		// typeflag: byte 156
		const typeflag = header[156];
		// prefix (for long paths): bytes 345..499
		const prefix = header.slice(345, 500).toString('utf8').split(NULL_CHAR)[0];
		const fullName = prefix ? path.join(destDir, prefix, name) : path.join(destDir, name);

		if (typeflag === 53 /* '5' */) {
			// Directory
			ensureDirSync(fullName);
		} else if (typeflag === 48 /* '0' */ || typeflag === 0) {
			// Regular file (type '0' or NUL)
			ensureDirSync(path.dirname(fullName));
			const fileData = buf.slice(offset, offset + size);
			fs.writeFileSync(fullName, fileData);
			// Advance to next 512 boundary
			const pad = (BLOCK - (size % BLOCK)) % BLOCK;
			offset += size + pad;
		} else {
			// Other types (symlinks, devices, etc.) are not supported.
			// Consume their data blocks (if any) and continue.
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

export default { extractArchiveNode };

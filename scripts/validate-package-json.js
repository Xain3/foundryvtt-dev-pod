#!/usr/bin/env node
/**
 * @file validate-package-json.js
 * @description Validate package.json against the SchemaStore package.json schema
 * @path scripts/validate-package-json.js
 */
import fs from 'fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

async function main() {
  const schemaUrl = 'https://json.schemastore.org/package.json';
  const localSchemaPath = './schemas/package.schema.json';
  const pkgText = await fs.readFile('package.json', 'utf8');
  let pkg;
  try {
    pkg = JSON.parse(pkgText);
  } catch (err) {
    console.error('package.json is not valid JSON:', err.message);
    process.exitCode = 2;
    return;
  }

  const fetchFn = (typeof fetch !== 'undefined') ? fetch : null;
  if (!fetchFn) {
    console.error('Global fetch is not available in this Node runtime. Use Node >=18 or install node-fetch and adjust the script.');
    process.exitCode = 5;
    return;
  }
  let schema = null;
  const useLocal = process.env.USE_LOCAL_SCHEMA === '1';
  if (!useLocal) {
    try {
      const res = await fetchFn(schemaUrl);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      schema = await res.json();
    } catch (err) {
      console.warn(`Could not fetch remote schema: ${err.message}`);
    }
  }
  if (!schema) {
    try {
      const localText = await fs.readFile(localSchemaPath, 'utf8');
      schema = JSON.parse(localText);
      console.log('Using local package.json schema fallback');
    } catch (err) {
      console.error('Failed to load local fallback schema:', err.message);
      process.exitCode = 6;
      return;
    }
  }
  // Recursively fetch referenced schemas (BFS) and add them to Ajv so $ref resolution works
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const seen = new Set();
  const queue = [];

  // helper to enqueue refs found within an object
  function collectRefs(obj) {
    const refs = [];
    if (!obj || typeof obj !== 'object') return refs;
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$ref' && typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'))) {
        refs.push(v);
      } else if (typeof v === 'object') {
        refs.push(...collectRefs(v));
      }
    }
    return refs;
  }

  // seed queue with refs from root schema
  for (const r of collectRefs(schema)) {
    if (!seen.has(r)) {
      seen.add(r);
      queue.push(r);
    }
  }

  // register root schema with Ajv under its URL
  ajv.addSchema(schema, schema.$id || schemaUrl);

  while (queue.length) {
    const refUrl = queue.shift();
    try {
      const r = await fetchFn(refUrl);
      if (!r.ok) {
        console.warn(`Warning: failed to fetch referenced schema ${refUrl} (${r.status})`);
        continue;
      }
      const refSchema = await r.json();
      const id = refSchema.$id || refUrl;
      ajv.addSchema(refSchema, id);
      // find nested refs inside this fetched schema and enqueue
      for (const nested of collectRefs(refSchema)) {
        if (!seen.has(nested)) {
          seen.add(nested);
          queue.push(nested);
        }
      }
    } catch (err) {
      console.warn(`Warning: error fetching referenced schema ${refUrl}: ${err.message}`);
    }
  }

  const validate = ajv.compile(schema);
  const valid = validate(pkg);
  if (valid) {
    console.log('OK: package.json matches SchemaStore schema');
    return;
  }
  console.error('package.json schema validation errors:');
  for (const err of validate.errors || []) {
    console.error(`- ${err.instancePath || '/'} ${err.message}`);
  }
  process.exitCode = 4;
}

main().catch(err => {
  console.error('Unexpected error during validation:', err);
  process.exitCode = 10;
});

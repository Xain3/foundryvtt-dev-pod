/* eslint-disable no-unused-vars */

/**
 * @file manifestParser.test.js
 * @description Unit tests for ManifestParser class.
 * @path config/helpers/manifestParser.test.js
*/

import { jest, describe, it, expect, afterEach, beforeEach } from '@jest/globals';

const REQUIRED_ATTRIBUTES_ARRAY = ['name', 'version'];
const REQUIRED_ATTRIBUTES_OBJECT = { name: true, version: true };

const VALID_MANIFEST = { name: 'Test', version: '1.0.0', extra: 'foo' };
const INCOMPLETE_MANIFEST = { name: 'Test' };

let constantsMock;

beforeEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.resetModules();
  jest.restoreAllMocks();
});

function getParserWithConstants(requiredManifestAttributes, manifest) {
  jest.unstable_mockModule('../constants.js', () => ({
    __esModule: true,
    default: { requiredManifestAttributes }
  }));
  return import('./manifestParser.js').then(mod => mod.default).then(ManifestParser => new ManifestParser(manifest));
}

describe('ManifestParser', () => {
  it('constructs with manifest and required attributes from constants', async () => {
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_ARRAY, VALID_MANIFEST);
    expect(parser.manifest).toEqual(VALID_MANIFEST);
    expect(parser.requiredAttributes).toEqual(REQUIRED_ATTRIBUTES_ARRAY);
  });

  it('treats undefined required attributes as empty array', async () => {
    const parser = await getParserWithConstants(undefined, VALID_MANIFEST);
    expect(parser.requiredAttributes).toEqual([]);
  });

  it('throws if required attributes are null', async () => {
    const parser = await getParserWithConstants(null, VALID_MANIFEST);
    expect(() => parser.validateRequiredManifestAttributes()).toThrow(/not defined/i);
  });

  it('throws if manifest is missing', async () => {
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_ARRAY, null);
    expect(() => parser.validateImportedManifest()).toThrow(/not available/i);
  });

  it('throws if manifest is not an object', async () => {
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_ARRAY, 'not-an-object');
    expect(() => parser.validateImportedManifest()).toThrow(/not an object/i);
  });

  it('validates array-based required attributes: all strings', async () => {
    const parser = await getParserWithConstants(['name', 'version'], VALID_MANIFEST);
    expect(() => parser.validateManifestAttributesArray()).not.toThrow();
  });

  it('throws if array-based required attribute is not a string', async () => {
    const parser = await getParserWithConstants(['name', 42], VALID_MANIFEST);
    expect(() => parser.validateManifestAttributesArray()).toThrow(/not a string/i);
  });

  it('validates object-based required attributes: manifest has all keys', async () => {
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_OBJECT, VALID_MANIFEST);
    expect(() => parser.validateManifestAttributesObject()).not.toThrow();
  });

  it('throws if object-based required attribute is missing', async () => {
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_OBJECT, INCOMPLETE_MANIFEST);
    expect(() => parser.validateManifestAttributesObject()).toThrow(/missing required attribute/i);
  });

  it('skips validation if required attributes are empty array', async () => {
    const parser = await getParserWithConstants([], VALID_MANIFEST);
    expect(() => parser.validateManifestHasRequiredAttributes()).not.toThrow();
  });

  it('skips validation if required attributes are empty object', async () => {
    const parser = await getParserWithConstants({}, VALID_MANIFEST);
    expect(() => parser.validateManifestHasRequiredAttributes()).not.toThrow();
  });

  it('throws if required attributes is neither array nor object', async () => {
    const parser = await getParserWithConstants('invalid', VALID_MANIFEST);
    expect(() => parser.validateManifestHasRequiredAttributes()).toThrow(/must be an array or an object/i);
  });

  it('throws if manifest is missing required attribute (array)', async () => {
    const parser = await getParserWithConstants(['name', 'version'], INCOMPLETE_MANIFEST);
    expect(() => parser.validateManifestHasRequiredAttributes()).toThrow(/missing required attribute/i);
  });

  it('freezes manifest and nested objects', async () => {
    const manifest = { name: 'Test', version: '1.0.0', nested: { foo: 'bar' } };
    const parser = await getParserWithConstants([], manifest);
    parser.freezeManifest();
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.nested)).toBe(true);
  });

  it('getValidatedManifest returns frozen manifest after validation', async () => {
    const manifest = { name: 'Test', version: '1.0.0', nested: { foo: 'bar' } };
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_ARRAY, manifest);
    const result = parser.getValidatedManifest();
    expect(result).toEqual(manifest);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.nested)).toBe(true);
  });

  it('getValidatedManifest throws if validation fails', async () => {
    const parser = await getParserWithConstants(REQUIRED_ATTRIBUTES_ARRAY, INCOMPLETE_MANIFEST);
    expect(() => parser.getValidatedManifest()).toThrow(/missing required attribute/i);
  });
});
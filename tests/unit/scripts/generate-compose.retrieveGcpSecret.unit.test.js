/**
 * @file generate-compose.retrieveGcpSecret.unit.test.js
 * @description Unit tests for hardened retrieveGcpSecret in generate-compose.js
 * @path tests/unit/scripts/generate-compose.retrieveGcpSecret.unit.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { retrieveGcpSecret } from '../../../scripts/generate-compose.js';

function mockExecSuccess(expectedArgs, output = 'secret-value\n') {
  return (cmd, args, opts) => {
    expect(cmd).toBe('gcloud');
    expect(args).toEqual(expectedArgs);
    expect(opts).toMatchObject({ encoding: 'utf8' });
    return output;
  };
}

function mockExecFailure(message = 'boom') {
  return () => { const e = new Error(message); throw e; };
}

describe('retrieveGcpSecret', () => {
  test('retrieves and trims secret output', () => {
    const args = ['secrets','versions','access','latest','--secret=mySecret','--project=myProj'];
    const secret = retrieveGcpSecret(' myProj ', ' mySecret ', mockExecSuccess(args, 'value-with-newline\n'));
    expect(secret).toBe('value-with-newline');
  });

  test('throws on empty project', () => {
    expect(() => retrieveGcpSecret('   ', 'name', mockExecSuccess([]))).toThrow('GCP project must be a non-empty string');
  });

  test('throws on empty secret name', () => {
    expect(() => retrieveGcpSecret('proj', '   ', mockExecSuccess([]))).toThrow('GCP secret name must be a non-empty string');
  });

  test('wraps exec errors with context', () => {
    expect(() => retrieveGcpSecret('proj', 'name', mockExecFailure('not found')))
      .toThrow('GCP secret retrieval failed (project=proj, secret=name): not found');
  });
});

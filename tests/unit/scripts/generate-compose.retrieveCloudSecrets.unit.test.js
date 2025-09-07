/**
 * @file generate-compose.retrieveCloudSecrets.unit.test.js
 * @description Tests for Azure and AWS secret retrieval hardening.
 * @path tests/unit/scripts/generate-compose.retrieveCloudSecrets.unit.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { retrieveAzureSecret, retrieveAwsSecret } from '../../../scripts/generate-compose.js';

function mockExec(expectedCmd, expectedArgs, output='value\n') {
  return (cmd, args, opts) => {
    expect(cmd).toBe(expectedCmd);
    expect(args).toEqual(expectedArgs);
    expect(opts).toMatchObject({ encoding: 'utf8' });
    return output;
  };
}

function mockFail(msg='fail') { return () => { throw new Error(msg); }; }

describe('retrieveAzureSecret', () => {
  test('retrieves and trims secret', () => {
    const args = ['keyvault','secret','show','--vault-name','myVault','--name','mySecret','--query','value','--output','tsv'];
    const val = retrieveAzureSecret(' myVault ', ' mySecret ', mockExec('az', args, 'azureVal\n'));
    expect(val).toBe('azureVal');
  });
  test('validates vault', () => {
    expect(() => retrieveAzureSecret('   ', 's', mockExec('az', []))).toThrow('Azure vault name must be a non-empty string');
  });
  test('validates secret name', () => {
    expect(() => retrieveAzureSecret('vault', '   ', mockExec('az', []))).toThrow('Azure secret name must be a non-empty string');
  });
  test('wraps errors', () => {
    expect(() => retrieveAzureSecret('vault', 'sec', mockFail('boom'))).toThrow('Azure secret retrieval failed (vault=vault, secret=sec): boom');
  });
});

describe('retrieveAwsSecret', () => {
  test('retrieves and trims secret', () => {
    const args = ['secretsmanager','get-secret-value','--region','us-east-1','--secret-id','mySecret','--query','SecretString','--output','text'];
    const val = retrieveAwsSecret(' us-east-1 ', ' mySecret ', mockExec('aws', args, 'awsVal\n'));
    expect(val).toBe('awsVal');
  });
  test('validates region', () => {
    expect(() => retrieveAwsSecret('  ', 's', mockExec('aws', []))).toThrow('AWS region must be a non-empty string');
  });
  test('validates secret name', () => {
    expect(() => retrieveAwsSecret('us-east-1', '   ', mockExec('aws', []))).toThrow('AWS secret name must be a non-empty string');
  });
  test('wraps errors', () => {
    expect(() => retrieveAwsSecret('us-east-1', 'sec', mockFail('err'))).toThrow('AWS secret retrieval failed (region=us-east-1, secret=sec): err');
  });
});

/**
 * @file constants.unit.test.js
 * @description Tests for constants module export behavior.
 * @path config/constants.unit.test.js
 */

import { jest, describe, it, expect } from '@jest/globals';

const mockObject = { testConstant: 'testValue' };
const mockBuilderInstance = { asObject: mockObject };

const BuilderMock = jest.fn(() => mockBuilderInstance);

jest.unstable_mockModule('./helpers/constantsBuilder.js', () => ({
  __esModule: true,
  default: BuilderMock
}));

describe('constants.js module', () => {
  it('exports frozen constants object from builder', async () => {
    const mod = await import('./constants.js');
    const constants = mod.default;
    expect(constants.testConstant).toBe('testValue');
    expect(Object.isFrozen(constants)).toBe(true);
    expect(BuilderMock).toHaveBeenCalledTimes(1);
  });
});

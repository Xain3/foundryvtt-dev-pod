module.exports = {
  testEnvironment: 'node',
  transform: {
    // Use babel-jest to allow requiring .mjs ESM helper modules in tests via CommonJS require.
    '^.+\\.m?js$': require.resolve('babel-jest')
  },
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov']
};

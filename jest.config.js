export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  transform: {
    // Only transform .mjs files with babel for legacy compatibility
    '^.+\\.mjs$': ['babel-jest', { configFile: './babel.config.cjs' }]
  },
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov']
};

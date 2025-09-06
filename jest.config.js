export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    // Map Vite-style raw YAML asset imports (e.g., file.yaml?raw) to a stub
    '(?<!.)^.+\\.yaml\\?raw$': '<rootDir>/tests/unit/utils/rawYamlStub.js'
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov']
};

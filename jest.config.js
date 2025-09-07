export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'json', 'node'],
  testPathIgnorePatterns: ['/node_modules/'],
  moduleNameMapper: {
    // Map path aliases from jsconfig.json
    '^#/(.*)$': '<rootDir>/$1',
    '^#scripts/(.*)$': '<rootDir>/scripts/$1',
    '^#helpers/(.*)$': '<rootDir>/helpers/$1',
    '^#config/(.*)$': '<rootDir>/config/$1',
    '^#patches/(.*)$': '<rootDir>/patches/$1',
    '^#patches/entrypoint/(.*)$': '<rootDir>/patches/entrypoint/$1',
    '^#patches/common/(.*)$': '<rootDir>/patches/common/$1',
    '^#tests/unit/(.*)$': '<rootDir>/tests/unit/$1',
    '^#tests/integration/(.*)$': '<rootDir>/tests/integration/$1',
    '^#tests/utils/(.*)$': '<rootDir>/tests/utils/$1',
    '^#docs/(.*)$': '<rootDir>/docs/$1',
    '^#examples/(.*)$': '<rootDir>/examples/$1',
    '^#schemas/(.*)$': '<rootDir>/schemas/$1',
    // Map Vite-style raw YAML asset imports (e.g., file.yaml?raw) to a stub
    '(?<!.)^.+\\.yaml\\?raw$': '<rootDir>/tests/unit/utils/rawYamlStub.js'
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'json-summary', 'lcov']
};

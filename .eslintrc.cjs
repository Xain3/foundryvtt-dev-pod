module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script'
  },
  overrides: [
    {
      files: ['**/*.mjs'],
      parserOptions: { sourceType: 'module' }
    }
  ],
  extends: [
    'eslint:recommended'
  ],
  rules: {
    // Keep it lightweight: only catch real syntax/logic issues; no style noise.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'error'
  }
};

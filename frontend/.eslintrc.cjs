module.exports = {
  root: true,
  env: {
    es2022: true,
    browser: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  ignorePatterns: [
    'dist/**',
    'coverage/**',
    'node_modules/**',
    'test-results/**',
    '.playwright-browsers/**'
  ],
  plugins: ['react'],
  extends: ['eslint:recommended'],
  settings: {
    react: {
      version: 'detect'
    }
  },
  globals: {
    vi: 'readonly',
    describe: 'readonly',
    test: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    beforeAll: 'readonly',
    afterAll: 'readonly'
  },
  rules: {
    'react/jsx-uses-vars': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }]
  }
};

module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  ignorePatterns: [
    'coverage/**',
    'node_modules/**',
    'backups/**',
    '*.sqlite'
  ],
  extends: ['eslint:recommended'],
  rules: {
    'no-console': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }]
  }
};

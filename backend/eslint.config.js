export default [{ files: ['**/*.js'], rules: {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-undef': 'error', 'eqeqeq': 'error', 'no-unreachable': 'error'
}, languageOptions: { globals: {
  process: 'readonly', console: 'readonly', URL: 'readonly',
  AbortController: 'readonly', fetch: 'readonly', setTimeout: 'readonly', TextDecoder: 'readonly'
} } }];

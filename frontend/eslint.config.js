export default [{ ignores: ['dist/**'] }, { files: ['**/*.js'], rules: {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  'no-undef': 'error', 'eqeqeq': 'error', 'no-unreachable': 'error'
}, languageOptions: { globals: {
  process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly',
  document: 'readonly', window: 'readonly', EventSource: 'readonly',
  requestAnimationFrame: 'readonly', setInterval: 'readonly', AbortController: 'readonly', TextDecoder: 'readonly'
} } }];

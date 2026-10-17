export default {
  extends: ['@commitlint/config-conventional'],
  // Rebase merges put every commit on main, so fixup!, squash! and raw Revert commits must fail.
  defaultIgnores: false,
  ignores: [(message) => /^Merge branch '.+' into /.test(message)],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['engine', 'art', 'share', 'sim', 'render', 'ui', 'ci', 'docs', 'deps'],
    ],
  },
};

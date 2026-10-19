// @ts-check
const base = require('./playwright.config');

module.exports = {
  ...base,
  testDir: './e2e',
  testMatch: 'ui-layout.spec.js',
};

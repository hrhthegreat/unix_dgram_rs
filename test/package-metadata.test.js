'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = require('../package.json');

test('package publishes its TypeScript declarations', () => {
  assert.equal(pkg.types, 'index.d.ts');
  assert.ok(pkg.files.includes(pkg.types));
  assert.ok(fs.existsSync(path.join(root, pkg.types)));
  assert.ok(fs.statSync(path.join(root, pkg.types)).size > 0);
});

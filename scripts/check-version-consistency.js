'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJson(relativePath) {
  const fullPath = path.join(__dirname, '..', relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function readCargoVersion() {
  const cargoToml = fs.readFileSync(
    path.join(__dirname, '..', 'Cargo.toml'),
    'utf8'
  );
  const match = cargoToml.match(/^version = "([^"]+)"$/m);
  if (!match) {
    throw new Error('Unable to find version in Cargo.toml');
  }
  return match[1];
}

const rootPackage = readJson('package.json');
const expectedVersion = rootPackage.version;
const packageVersions = [
  ['package.json', expectedVersion],
  ['Cargo.toml', readCargoVersion()],
  ...[
    'npm/darwin-arm64/package.json',
    'npm/darwin-x64/package.json',
    'npm/linux-arm64-gnu/package.json',
    'npm/linux-x64-gnu/package.json',
    'npm/win32-arm64-msvc/package.json',
    'npm/win32-x64-msvc/package.json'
  ].map((relativePath) => [relativePath, readJson(relativePath).version])
];

const mismatches = packageVersions.filter(
  ([, version]) => version !== expectedVersion
);

if (mismatches.length > 0) {
  const details = mismatches
    .map(([file, version]) => `${file}: expected ${expectedVersion}, found ${version}`)
    .join('\n');
  throw new Error(`Version mismatch detected:\n${details}`);
}

console.log(`Version consistency OK: ${expectedVersion}`);

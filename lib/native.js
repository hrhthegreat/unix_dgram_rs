'use strict';

const path = require('node:path');

function resolveBinding() {
  const localCandidates = [
    path.join(__dirname, '..', 'unix_dgram_rs.node'),
    path.join(__dirname, '..', 'unix_dgram_rs.darwin-arm64.node'),
    path.join(__dirname, '..', 'unix_dgram_rs.darwin-x64.node'),
    path.join(__dirname, '..', 'unix_dgram_rs.linux-arm64-gnu.node'),
    path.join(__dirname, '..', 'unix_dgram_rs.linux-x64-gnu.node'),
    path.join(__dirname, '..', 'unix_dgram_rs.win32-x64-msvc.node'),
    path.join(__dirname, '..', 'unix_dgram_rs.win32-arm64-msvc.node')
  ];

  for (const candidate of localCandidates) {
    try {
      return require(candidate);
    } catch {
      // Try next.
    }
  }

  const key = `${process.platform}-${process.arch}`;
  const optionalPackages = {
    'darwin-arm64': 'unix_dgram_rs-darwin-arm64',
    'darwin-x64': 'unix_dgram_rs-darwin-x64',
    'linux-arm64': 'unix_dgram_rs-linux-arm64-gnu',
    'linux-x64': 'unix_dgram_rs-linux-x64-gnu',
    'win32-x64': 'unix_dgram_rs-win32-x64-msvc',
    'win32-arm64': 'unix_dgram_rs-win32-arm64-msvc'
  };

  const pkg = optionalPackages[key];
  if (!pkg) {
    throw new Error(`Unsupported platform/arch: ${key}`);
  }
  return require(pkg);
}

module.exports = resolveBinding();

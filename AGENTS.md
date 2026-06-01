# Repository Guide

## Project Overview

`unix_dgram_rs` is an alpha npm native addon that provides `unix-dgram`-style
UNIX datagram sockets for Node.js. The native implementation is written in Rust
with `napi-rs`; a CommonJS wrapper preserves the compatibility-oriented API.
Supported release targets use prebuilt `.node` binaries so consumers do not
need `node-gyp`.

Windows packages are intentional install/build stubs. UNIX datagram runtime
operations remain unsupported on Windows.

## Architecture Map

- `src/lib.rs`: Rust Node-API binding. The UNIX implementation owns socket
  operations and the receive thread; the Windows implementation returns
  `ENOTSUP` for runtime operations.
- `index.js`: public CommonJS compatibility wrapper. It delegates `udp4` and
  `udp6` sockets to Node's built-in `dgram` module.
- `lib/native.js`: native binding resolver. It tries local build artifacts
  before the platform-specific optional npm package.
- `API_COMPAT.md`: supported public surface and known differences from
  `unix-dgram`.
- `test/compat.test.js` and `test/upstream/`: compatibility and upstream-style
  JavaScript tests.
- `npm/*/`: six platform package manifests for prebuilt binaries.
- `.github/workflows/ci.yml`: native build and runtime test matrix.
- `.github/workflows/build.yml`: multi-platform artifact build and npm publish
  workflow.

## Compatibility Rules

- Read `API_COMPAT.md` before changing socket behavior or the public API.
- Preserve `createSocket('udp4' | 'udp6', listener)` delegation to Node
  `dgram`.
- Preserve the Windows stub behavior unless implementing and testing real
  Windows support.
- Keep the optional package names and generated binary names aligned with
  `package.json`, `lib/native.js`, and the manifests under `npm/*/`.
- Add or update compatibility tests for observable behavior changes.

## Development Workflow

Run native commands in a Linux or WSL environment:

```bash
cargo check
cargo test
```

When Node.js and npm are available, build the native binary before running the
JavaScript suite:

```bash
npm ci
npm run build
npm test
```

Use `cargo fmt -- --check` when touching Rust code. Do not commit generated
`.node` binaries, `target/`, `node_modules/`, npm tarballs, or artifact
directories.

## Release Checklist

1. Keep the version synchronized in `Cargo.toml`, root `package.json`, and all
   six `npm/*/package.json` platform manifests.
2. Run the Rust checks and the JavaScript suite on a supported UNIX platform.
3. Verify every configured target produces the expected `.node` filename.
4. Verify each optional package receives its matching artifact before publish.
5. Inspect package contents with `npm pack --dry-run`.

## Repository Skill

Use `.agents/skills/maintain-unix-dgram-rs/SKILL.md` for the focused
maintain-and-release workflow.

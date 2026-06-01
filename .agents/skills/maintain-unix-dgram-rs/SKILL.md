---
name: maintain-unix-dgram-rs
description: Maintain and release the unix_dgram_rs Node.js native addon. Use when changing Rust socket behavior, the CommonJS compatibility wrapper, native binding resolution, compatibility tests, CI artifacts, platform npm packages, or release versioning.
---

# Maintain unix_dgram_rs

## Start Here

1. Read `AGENTS.md` for the repository map and required checks.
2. Read `API_COMPAT.md` before changing public API or socket behavior.
3. Inspect `IMPROVEMENTS.md` when selecting follow-up hardening work.

## Route The Change

- Native socket behavior, receive threads, or Windows stubs: edit `src/lib.rs`.
- Public events, overloads, congestion behavior, or UDP delegation: edit
  `index.js`.
- Native binary discovery or platform errors: edit `lib/native.js`.
- Observable behavior: add coverage in `test/compat.test.js` or
  `test/upstream/`.
- Build targets, artifacts, or publishing: inspect `package.json`,
  `npm/*/package.json`, and `.github/workflows/`.

Keep the compatibility wrapper and native layer aligned. Preserve
`createSocket('udp4' | 'udp6')` delegation and the documented Windows stubs
unless the task explicitly changes them.

## Verify Changes

For Rust changes, run:

```bash
cargo fmt -- --check
cargo check
cargo test
```

For JavaScript behavior changes, first build a local native binary, then run:

```bash
npm ci
npm run build
npm test
```

JavaScript tests cannot run successfully without Node.js, npm, and a locally
built or installed platform binding.

## Release Checks

1. Synchronize the version in `Cargo.toml`, root `package.json`, and every
   `npm/*/package.json`.
2. Confirm target package names and `.node` filenames remain aligned with
   `lib/native.js`.
3. Run the supported-platform checks and inspect `npm pack --dry-run`.
4. Confirm publish artifacts exist for all configured targets before release.

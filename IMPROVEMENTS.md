# Improvement Backlog

`unix_dgram_rs` is an alpha compatibility rewrite. These improvements are
ordered by expected impact and should be implemented with compatibility tests.

## 1. Socket Lifecycle And Safety

- Prevent `bind()` from deleting arbitrary existing files. Only remove stale
  paths when it is safe to do so.
- Remove socket paths owned by the process during `close()` and native
  teardown.
- Ensure listener threads always stop cleanly, including error and teardown
  paths.
- Propagate receive-loop failures to JavaScript.
- Distinguish connected-send failures from congestion instead of treating all
  connected errors as backpressure.

## 2. Package Usability

- Preserve useful native-loader diagnostics instead of silently swallowing all
  local binding failures.

## 3. Quality And Release Confidence

- Add lifecycle, failure-path, and unsupported-Windows tests.
- Decide whether Linux musl binaries are required.
- Consolidate overlapping CI build coverage where practical.

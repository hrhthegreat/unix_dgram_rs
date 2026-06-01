# unix_dgram_rs

UNIX datagram sockets for Node.js, rewritten with Rust + Node-API (`napi-rs`) and distributed as prebuilt binaries so users do not need `node-gyp` on supported targets.

## Why this rewrite

- Avoid per-install native compilation on common platforms.
- Use ABI-stable Node-API bindings for fewer rebuilds across Node versions.
- Improve native safety and maintainability with Rust.

## Install

```bash
npm i unix_dgram_rs
```

On supported platforms (`darwin-x64`, `darwin-arm64`, `linux-x64-gnu`, `linux-arm64-gnu`, `win32-x64-msvc`, `win32-arm64-msvc`), prebuilt binaries are downloaded through optional platform packages.

Windows binaries are currently dummy/stub implementations to keep install/build flows working; `unix_dgram` runtime operations are not supported on Windows yet.

## Usage

```js
const unix = require('unix_dgram_rs');

const server = unix.createSocket('unix_dgram', (buf) => {
  console.log('received', buf.toString());
});

server.bind('/tmp/unix-dgram-rs.sock');

const client = unix.createSocket('unix_dgram');
const msg = Buffer.from('ping');
client.send(msg, 0, msg.length, '/tmp/unix-dgram-rs.sock');
client.close();
```

## API

See `API_COMPAT.md`.

## Improvement backlog

See `IMPROVEMENTS.md` for the prioritized hardening and release-confidence
roadmap.

## Development

```bash
npm i
npm run build
npm test
```

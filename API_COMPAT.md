# API Compatibility Spec

This package targets compatibility with `unix-dgram` for common usage.

## Supported Surface

- `createSocket('unix_dgram', [listener])`
- `socket.bind(path)`
- `socket.connect(path)`
- `socket.send(buf, [callback])` on connected socket
- `socket.send(buf, offset, length, path, [callback])`
- `socket.send_to(buf, offset, length, path, [callback])`
- `socket.sendto(buf, offset, length, path, [callback])` (legacy alias)
- `socket.close()`
- `createSocket('udp4' | 'udp6', [listener])` delegates to Node `dgram`.

## Events

- `message`: emitted with `(Buffer, rinfo)` where `rinfo.path` is provided when available.
- `listening`: emitted after successful `bind`.
- `connect`: emitted after successful `connect`.
- `error`: emitted on runtime receive errors.
- `congestion` and `writable`: best-effort compatibility on send backpressure (`EWOULDBLOCK` path).

## Known Differences vs Original

- Congestion signaling is best effort and platform-dependent.

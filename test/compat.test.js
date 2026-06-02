'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const unix = require('../index.js');

function socketPath(name) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const dir = process.platform === 'win32' ? os.tmpdir() : '/tmp';
  return path.join(dir, `udn-${name}-${suffix}.sock`);
}

function waitForEvent(emitter, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      timeoutMs
    );
    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
    emitter.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

test('send_to delivers message to bound socket', async () => {
  const serverPath = socketPath('send_to');
  const server = unix.createSocket('unix_dgram');
  server.bind(serverPath);

  const messageP = waitForEvent(server, 'message');
  const client = unix.createSocket('unix_dgram');
  client.send(Buffer.from('ping'), 0, 4, serverPath);
  const [buf] = await messageP;
  assert.equal(buf.toString(), 'ping');

  client.close();
  server.close();
  if (fs.existsSync(serverPath)) fs.unlinkSync(serverPath);
});

test('connect + send works', async () => {
  const serverPath = socketPath('connect-send');
  const server = unix.createSocket('unix_dgram');
  server.bind(serverPath);

  const messageP = waitForEvent(server, 'message');
  const client = unix.createSocket('unix_dgram');
  client.connect(serverPath);
  client.send(Buffer.from('pong'));
  const [buf] = await messageP;
  assert.equal(buf.toString(), 'pong');

  client.close();
  server.close();
  if (fs.existsSync(serverPath)) fs.unlinkSync(serverPath);
});

test('send_to alias works with offset/length', async () => {
  const serverPath = socketPath('send_to-alias');
  const server = unix.createSocket('unix_dgram');
  server.bind(serverPath);

  const messageP = waitForEvent(server, 'message');
  const client = unix.createSocket('unix_dgram');
  client.send_to(Buffer.from('foobarbaz'), 3, 4, serverPath);
  const [buf] = await messageP;
  assert.equal(buf.toString(), 'barb');

  client.close();
  server.close();
  if (fs.existsSync(serverPath)) fs.unlinkSync(serverPath);
});

test('bind to existing path emits error with EADDRINUSE', async (t) => {
  if (process.platform === 'win32') {
    t.skip('UNIX datagram bind is unsupported on Windows');
  }

  const serverPath = socketPath('bind-in-use');
  const first = unix.createSocket('unix_dgram');
  first.bind(serverPath);
  first.close();

  const second = unix.createSocket('unix_dgram');
  let sawListening = false;
  const errorP = new Promise((resolve) => {
    second.once('error', resolve);
    second.once('listening', () => {
      sawListening = true;
    });
  });
  second.bind(serverPath);
  const err = await errorP;

  assert.equal(sawListening, false);
  assert.equal(err.syscall, 'bind');
  assert.equal(err.code, -os.constants.errno.EADDRINUSE);
  assert.equal(err.errno, -os.constants.errno.EADDRINUSE);

  second.close();
  if (fs.existsSync(serverPath)) fs.unlinkSync(serverPath);
});

test('congestion/writable compatibility path emits events', async () => {
  const sock = unix.createSocket('unix_dgram');
  const congestionP = waitForEvent(sock, 'congestion');
  const writableP = waitForEvent(sock, 'writable');
  const native = sock._native;
  sock._native = {
    send() {
      throw new Error('Resource temporarily unavailable');
    },
    send_to() {
      throw new Error('Resource temporarily unavailable');
    },
    recv() {
      return null;
    },
    close() {}
  };

  sock.send(Buffer.from('x'));
  await congestionP;
  await writableP;

  sock._native = native;
  sock.close();
});

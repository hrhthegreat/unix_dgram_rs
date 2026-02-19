'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const unix = require('../index.js');

function socketPath(name) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return path.join('/tmp', `udn-${name}-${suffix}.sock`);
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

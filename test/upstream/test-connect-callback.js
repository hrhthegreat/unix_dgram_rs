'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const unix = require('../../index.js');

const suffix = `${process.pid}-${Date.now()}`;
const TMPDIR = process.platform === 'win32' ? os.tmpdir() : '/tmp';
const SOCKNAME = path.join(TMPDIR, `unix_dgram_${suffix}.sock`);

let sentCount = 0;
let seenCount = 0;
const expected = 300;

process.on('exit', function() {
  assert.equal(seenCount, sentCount);
});

try { fs.unlinkSync(SOCKNAME); } catch (_) {}

const server = unix.createSocket('unix_dgram', function(buf) {
  assert.equal(String(buf), `PING${seenCount}`);
  if (++seenCount === expected) {
    server.close();
    client.close();
    try { fs.unlinkSync(SOCKNAME); } catch (_) {}
  }
});
server.bind(SOCKNAME);

const client = unix.createSocket('unix_dgram', function() {
  assert.fail('client should not receive message');
});

client.on('error', function(err) {
  console.error(err);
  assert.fail('unexpected client error');
});

client.on('connect', function() {
  client.on('congestion', function() {
    throw new Error('Should not emit congestion');
  });

  client.on('writable', function() {
    // swallow
  });

  function send() {
    const msg = Buffer.from(`PING${sentCount}`);
    client.send(msg, function(err) {
      if (!err) {
        ++sentCount;
        if (sentCount < expected) {
          setImmediate(send);
        }
      } else if (err.code < 0) {
        throw new Error(err);
      } else {
        client.once('writable', send);
      }
    });
  }

  send();
});

client.connect(SOCKNAME);

'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const unix = require('../../index.js');

const suffix = `${process.pid}-${Date.now()}`;
const TMPDIR = process.platform === 'win32' ? os.tmpdir() : '/tmp';
const SOCKNAME = path.join(TMPDIR, `unix_dgram_${suffix}.sock`);
const SOCKNAME_CLIENT = path.join(TMPDIR, `unix_dgram_client_${suffix}.sock`);

let sentPing1 = false;
let sentPing2 = false;
let seenPing1 = false;
let seenPing2 = false;

process.on('exit', function() {
  assert.equal(sentPing1, true);
  assert.equal(sentPing2, true);
  assert.equal(seenPing1, true);
  assert.equal(seenPing2, true);
});

try { fs.unlinkSync(SOCKNAME); } catch (_) {}
try { fs.unlinkSync(SOCKNAME_CLIENT); } catch (_) {}

let n = 0;

const server = unix.createSocket('unix_dgram', function(buf, rinfo) {
  switch (++n) {
    case 1:
      assert.equal(String(buf), 'PING1');
      assert.equal(rinfo.path, null);
      seenPing1 = true;
      client.bind(SOCKNAME_CLIENT);
      client.send(Buffer.from('PING2'), 0, 5, SOCKNAME, function() {
        sentPing2 = true;
      });
      break;
    case 2:
      assert.equal(String(buf), 'PING2');
      assert.equal(rinfo.path, SOCKNAME_CLIENT);
      seenPing2 = true;
      server.close();
      client.close();
      try { fs.unlinkSync(SOCKNAME); } catch (_) {}
      try { fs.unlinkSync(SOCKNAME_CLIENT); } catch (_) {}
      break;
    default:
      break;
  }
});
server.bind(SOCKNAME);

const client = unix.createSocket('unix_dgram', function() {
  assert.fail('client should not receive message');
});

client.send(Buffer.from('PING1'), 0, 5, SOCKNAME, function() {
  sentPing1 = true;
});

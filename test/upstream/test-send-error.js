'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const unix = require('../../index.js');

const suffix = `${process.pid}-${Date.now()}`;
const SOCKNAME = `/tmp/unix_dgram_${suffix}.sock`;

try { fs.unlinkSync(SOCKNAME); } catch (_) {}

const client = unix.createSocket('unix_dgram', function() {
  assert.fail('client should not receive message');
});

client.once('error', function(err) {
  assert.ok(err);
  client.once('error', function(nextErr) {
    assert.ifError(nextErr);
  });

  client.send(Buffer.from('ERROR2'), 0, 6, SOCKNAME, function(cbErr) {
    assert.ok(cbErr);
    client.close();
  });
});

client.send(Buffer.from('ERROR1'), 0, 6, SOCKNAME);

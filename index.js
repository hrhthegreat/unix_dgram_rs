'use strict';

const { EventEmitter } = require('node:events');
const dgram = require('node:dgram');
const { NativeSocket } = require('./lib/native');

function errnoException(err, syscall) {
  const e = new Error(`${syscall} ${err.code || err.message || err}`);
  e.code = err.code || -1;
  e.errno = e.code;
  e.syscall = syscall;
  return e;
}

function internalError(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

function isWouldBlock(err) {
  const value = String((err && (err.code || err.message)) || '');
  return /EAGAIN|EWOULDBLOCK|temporarily unavailable|would block/i.test(value);
}

class UnixDgramSocket extends EventEmitter {
  constructor(type, listener) {
    super();
    if (type !== 'unix_dgram') {
      throw new Error(`Unsupported socket type: ${type}`);
    }
    this._native = new NativeSocket();
    this._closed = false;
    this._recvStarted = false;
    this._writableScheduled = false;
    this.connected = false;
    this.fd = 0;
    this.type = type;

    if (typeof listener === 'function') {
      this.on('message', listener);
    }
  }

  _startReceiveLoop() {
    if (this._recvStarted || this._closed) {
      return;
    }
    this._native.start_message_loop((err, packet) => {
      if (err) {
        this.emit('error', errnoException(err, 'recv'));
        return;
      }
      if (!packet || this._closed) {
        return;
      }
      try {
        const rinfo = {
          size: packet.data.length,
          address: {},
          path: packet.path === undefined ? null : packet.path
        };
        this.emit('message', Buffer.from(packet.data), rinfo);
      } catch (err) {
        this.emit('error', err);
      }
    });
    this._recvStarted = true;
  }

  _scheduleWritable() {
    if (this._writableScheduled || this._closed) {
      return;
    }
    this._writableScheduled = true;
    setTimeout(() => {
      this._writableScheduled = false;
      this.emit('writable');
    }, 4);
  }

  bind(socketPath) {
    try {
      this._native.bind(socketPath);
      this._startReceiveLoop();
      this.emit('listening');
    } catch (err) {
      this.emit('error', errnoException(err, 'bind'));
    }
  }

  connect(socketPath) {
    try {
      this._native.connect(socketPath);
      this.connected = true;
      this._startReceiveLoop();
      this.emit('connect');
    } catch (err) {
      this.emit('error', errnoException(err, 'connect'));
    }
  }

  send(buf, offset, length, socketPath, callback) {
    let payload = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    let cb = callback;

    try {
      let status = 0;
      if (this.connected) {
        cb = offset;
        status = this._native.send(payload);
      } else {
        payload = payload.subarray(offset, offset + length);
        status = this._native.send_to(payload, socketPath);
      }

      if (status === 1) {
        if (typeof cb === 'function') {
          cb(internalError(1, 'congestion'));
        } else {
          this.emit('congestion', payload);
        }
        this._scheduleWritable();
        return;
      }

      if (typeof cb === 'function') {
        cb();
      }
    } catch (err) {
      if (this.connected || isWouldBlock(err)) {
        if (typeof cb === 'function') {
          cb(internalError(1, 'congestion'));
        } else {
          this.emit('congestion', payload);
        }
        this._scheduleWritable();
        return;
      }

      const wrapped = errnoException(err, 'send');
      if (typeof cb === 'function') {
        cb(wrapped);
      } else {
        this.emit('error', wrapped);
      }
    }
  }

  send_to(buf, offset, length, socketPath, callback) {
    return this.send(buf, offset, length, socketPath, callback);
  }

  sendto(buf, offset, length, socketPath, callback) {
    return this.send(buf, offset, length, socketPath, callback);
  }

  close() {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._native.close();
    this._recvStarted = false;
    this.fd = -1;
  }

  address() {
    throw new Error('not implemented');
  }

  setTTL() {
    throw new Error('not implemented');
  }

  setBroadcast() {
    throw new Error('not implemented');
  }

  setMulticastTTL() {
    throw new Error('not implemented');
  }

  setMulticastLoopback() {
    throw new Error('not implemented');
  }

  addMembership() {
    throw new Error('not implemented');
  }

  dropMembership() {
    throw new Error('not implemented');
  }
}

function createSocket(type, listener) {
  if (type === 'udp4' || type === 'udp6') {
    return dgram.createSocket(type, listener);
  }
  return new UnixDgramSocket(type, listener);
}

module.exports = {
  Socket: UnixDgramSocket,
  createSocket
};

import unix = require('../..');

const server = unix.createSocket('unix_dgram', (message, remoteInfo) => {
  message.toString();
  remoteInfo.size.toFixed();
  remoteInfo.path?.toUpperCase();
});

server.on('listening', () => {});
server.on('connect', () => {});
server.on('error', (error) => {
  error.code;
  error.errno;
  error.syscall;
});
server.on('congestion', (message) => {
  message.toString();
});
server.on('writable', () => {});

server.bind('/tmp/unix-dgram-rs.sock');
server.connect('/tmp/unix-dgram-rs.sock');
server.send(Buffer.from('ping'));
server.send(Buffer.from('ping'), (error) => {
  error?.code;
});
server.send(Buffer.from('ping'), 0, 4, '/tmp/unix-dgram-rs.sock');
server.send(Buffer.from('ping'), 0, 4, '/tmp/unix-dgram-rs.sock', (error) => {
  error?.code;
});
server.sendto(Buffer.from('ping'), 0, 4, '/tmp/unix-dgram-rs.sock');
server.close();

const udp = unix.createSocket('udp4');
udp.bind(41234);
udp.close();

new unix.Socket('unix_dgram').close();

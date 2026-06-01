import { EventEmitter } from 'node:events';
import type { Buffer } from 'node:buffer';
import type { Socket as DgramSocket } from 'node:dgram';

export interface UnixDgramError extends Error {
  code?: string | number;
  errno?: string | number;
  syscall?: string;
}

export interface RemoteInfo {
  size: number;
  address: Record<string, never>;
  path: string | null;
}

export type MessageListener = (message: Buffer, remoteInfo: RemoteInfo) => void;
export type SendCallback = (error?: UnixDgramError) => void;

export class Socket extends EventEmitter {
  constructor(type: 'unix_dgram', listener?: MessageListener);

  connected: boolean;
  fd: number;
  type: 'unix_dgram';

  bind(path: string): void;
  connect(path: string): void;
  send(buffer: Uint8Array, callback?: SendCallback): void;
  send(
    buffer: Uint8Array,
    offset: number,
    length: number,
    path: string,
    callback?: SendCallback
  ): void;
  send_to(
    buffer: Uint8Array,
    offset: number,
    length: number,
    path: string,
    callback?: SendCallback
  ): void;
  sendto(
    buffer: Uint8Array,
    offset: number,
    length: number,
    path: string,
    callback?: SendCallback
  ): void;
  close(): void;

  on(event: 'message', listener: MessageListener): this;
  on(event: 'listening' | 'connect' | 'writable', listener: () => void): this;
  on(event: 'congestion', listener: (buffer: Buffer) => void): this;
  on(event: 'error', listener: (error: UnixDgramError) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: 'message', listener: MessageListener): this;
  once(event: 'listening' | 'connect' | 'writable', listener: () => void): this;
  once(event: 'congestion', listener: (buffer: Buffer) => void): this;
  once(event: 'error', listener: (error: UnixDgramError) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

export function createSocket(
  type: 'unix_dgram',
  listener?: MessageListener
): Socket;
export function createSocket(
  type: 'udp4' | 'udp6',
  listener?: (message: Buffer, remoteInfo: import('node:dgram').RemoteInfo) => void
): DgramSocket;

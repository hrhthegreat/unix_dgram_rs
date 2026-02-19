use std::io::ErrorKind;
use std::os::fd::AsRawFd;
use std::os::unix::net::UnixDatagram;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

struct ListenerHandle {
  stop: Arc<AtomicBool>,
  thread: JoinHandle<()>,
}

#[napi]
pub struct NativeSocket {
  socket: Mutex<Option<UnixDatagram>>,
  listener: Mutex<Option<ListenerHandle>>,
}

#[napi(object)]
pub struct RecvPacket {
  pub data: Buffer,
  pub path: Option<String>,
}

fn io_to_napi(err: std::io::Error) -> Error {
  Error::from_reason(err.to_string())
}

impl NativeSocket {
  fn stop_listener(&self) -> Result<()> {
    let listener = {
      let mut guard = self
        .listener
        .lock()
        .map_err(|_| Error::from_reason("failed to lock listener".to_string()))?;
      guard.take()
    };
    if let Some(listener) = listener {
      listener.stop.store(true, Ordering::Relaxed);
      let _ = listener.thread.join();
    }
    Ok(())
  }
}

#[napi]
impl NativeSocket {
  #[napi(constructor)]
  pub fn new() -> Result<Self> {
    let sock = UnixDatagram::unbound().map_err(io_to_napi)?;
    sock.set_nonblocking(true).map_err(io_to_napi)?;
    Ok(Self {
      socket: Mutex::new(Some(sock)),
      listener: Mutex::new(None),
    })
  }

  #[napi]
  pub fn bind(&self, path: String) -> Result<()> {
    self.stop_listener()?;
    let socket_path = Path::new(&path);
    if socket_path.exists() {
      std::fs::remove_file(socket_path).map_err(io_to_napi)?;
    }
    let sock = UnixDatagram::bind(socket_path).map_err(io_to_napi)?;
    sock.set_nonblocking(true).map_err(io_to_napi)?;
    let mut guard = self
      .socket
      .lock()
      .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
    *guard = Some(sock);
    Ok(())
  }

  #[napi]
  pub fn connect(&self, path: String) -> Result<()> {
    let mut guard = self
      .socket
      .lock()
      .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
    if guard.is_none() {
      let sock = UnixDatagram::unbound().map_err(io_to_napi)?;
      sock.set_nonblocking(true).map_err(io_to_napi)?;
      *guard = Some(sock);
    }
    if let Some(sock) = guard.as_ref() {
      sock.connect(path).map_err(io_to_napi)?;
      Ok(())
    } else {
      Err(Error::from_reason("socket is closed".to_string()))
    }
  }

  #[napi]
  pub fn send(&self, data: Buffer) -> Result<i32> {
    let guard = self
      .socket
      .lock()
      .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
    if let Some(sock) = guard.as_ref() {
      match sock.send(data.as_ref()) {
        Ok(_) => Ok(0),
        Err(err) if err.kind() == ErrorKind::WouldBlock => Ok(1),
        Err(err) => Err(io_to_napi(err)),
      }
    } else {
      Err(Error::from_reason("socket is closed".to_string()))
    }
  }

  #[napi(js_name = "send_to")]
  pub fn send_to(&self, data: Buffer, path: String) -> Result<i32> {
    let guard = self
      .socket
      .lock()
      .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
    if let Some(sock) = guard.as_ref() {
      match sock.send_to(data.as_ref(), path) {
        Ok(_) => Ok(0),
        Err(err) if err.kind() == ErrorKind::WouldBlock => Ok(1),
        Err(err) => Err(io_to_napi(err)),
      }
    } else {
      Err(Error::from_reason("socket is closed".to_string()))
    }
  }

  #[napi(js_name = "start_message_loop")]
  pub fn start_message_loop(&self, callback: JsFunction) -> Result<()> {
    {
      let guard = self
        .listener
        .lock()
        .map_err(|_| Error::from_reason("failed to lock listener".to_string()))?;
      if guard.is_some() {
        return Ok(());
      }
    }

    let recv_sock = {
      let guard = self
        .socket
        .lock()
        .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
      let sock = guard
        .as_ref()
        .ok_or_else(|| Error::from_reason("socket is closed".to_string()))?;
      sock.try_clone().map_err(io_to_napi)?
    };

    let fd = recv_sock.as_raw_fd();
    let tsfn: ThreadsafeFunction<RecvPacket> =
      callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_thread = Arc::clone(&stop);
    let thread = std::thread::spawn(move || {
      let mut buf = vec![0u8; 64 * 1024];
      while !stop_for_thread.load(Ordering::Relaxed) {
        let mut pfd = libc::pollfd {
          fd,
          events: libc::POLLIN,
          revents: 0,
        };
        let rc = unsafe { libc::poll(&mut pfd, 1, 250) };
        if rc < 0 {
          let err = std::io::Error::last_os_error();
          if err.kind() == ErrorKind::Interrupted {
            continue;
          }
          break;
        }
        if rc == 0 {
          continue;
        }
        if (pfd.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL)) != 0 {
          break;
        }
        if (pfd.revents & libc::POLLIN) == 0 {
          continue;
        }

        loop {
          match recv_sock.recv_from(&mut buf) {
            Ok((size, addr)) => {
              let path = addr
                .as_pathname()
                .map(|p| p.to_string_lossy().to_string());
              let packet = RecvPacket {
                data: Buffer::from(buf[..size].to_vec()),
                path,
              };
              let status = tsfn.call(Ok(packet), ThreadsafeFunctionCallMode::NonBlocking);
              if status != Status::Ok {
                return;
              }
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock => break,
            Err(err) if err.kind() == ErrorKind::Interrupted => continue,
            Err(_) => return,
          }
        }
      }
      let _ = tsfn.abort();
    });

    let mut guard = self
      .listener
      .lock()
      .map_err(|_| Error::from_reason("failed to lock listener".to_string()))?;
    *guard = Some(ListenerHandle { stop, thread });
    Ok(())
  }

  #[napi]
  pub fn recv(&self, max_len: Option<u32>) -> Result<Option<RecvPacket>> {
    let guard = self
      .socket
      .lock()
      .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
    let sock = guard
      .as_ref()
      .ok_or_else(|| Error::from_reason("socket is closed".to_string()))?;
    let mut buf = vec![0u8; max_len.unwrap_or(64 * 1024) as usize];
    match sock.recv_from(&mut buf) {
      Ok((size, addr)) => {
        buf.truncate(size);
        let path = addr
          .as_pathname()
          .map(|p| p.to_string_lossy().to_string());
        Ok(Some(RecvPacket {
          data: Buffer::from(buf),
          path,
        }))
      }
      Err(err) if err.kind() == ErrorKind::WouldBlock => Ok(None),
      Err(err) => Err(io_to_napi(err)),
    }
  }

  #[napi]
  pub fn close(&self) -> Result<()> {
    self.stop_listener()?;
    let mut guard = self
      .socket
      .lock()
      .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
    *guard = None;
    Ok(())
  }
}

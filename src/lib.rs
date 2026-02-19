use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct RecvPacket {
  pub data: Buffer,
  pub path: Option<String>,
}

#[cfg(unix)]
mod imp {
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

  use crate::RecvPacket;

  struct ListenerHandle {
    stop: Arc<AtomicBool>,
    thread: JoinHandle<()>,
  }

  #[napi]
  pub struct NativeSocket {
    socket: Mutex<Option<UnixDatagram>>,
    listener: Mutex<Option<ListenerHandle>>,
    bound_path: Mutex<Option<String>>,
  }

  fn io_to_napi(err: std::io::Error) -> Error {
    Error::from_reason(err.to_string())
  }

  impl NativeSocket {
    fn send_wake_signal(&self) {
      let path = match self.bound_path.lock() {
        Ok(guard) => guard.clone(),
        Err(_) => None,
      };
      if let Some(path) = path {
        if let Ok(waker) = UnixDatagram::unbound() {
          let _ = waker.send_to(&[0], path);
        }
      }
    }

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
        self.send_wake_signal();
        let _ = listener.thread.join();
      }
      Ok(())
    }

    fn send_nonblocking(fd: i32, bytes: &[u8]) -> Result<i32> {
      let rc = unsafe {
        libc::send(
          fd,
          bytes.as_ptr() as *const libc::c_void,
          bytes.len(),
          libc::MSG_DONTWAIT,
        )
      };
      if rc >= 0 {
        return Ok(0);
      }
      let err = std::io::Error::last_os_error();
      if err.kind() == ErrorKind::WouldBlock {
        Ok(1)
      } else {
        Err(io_to_napi(err))
      }
    }

    fn send_to_nonblocking(fd: i32, bytes: &[u8], path: &str) -> Result<i32> {
      let path_bytes = path.as_bytes();
      if path_bytes.len() >= 108 {
        return Err(Error::from_reason("socket path too long".to_string()));
      }
      let mut addr: libc::sockaddr_un = unsafe { std::mem::zeroed() };
      addr.sun_family = libc::AF_UNIX as libc::sa_family_t;
      for (idx, byte) in path_bytes.iter().enumerate() {
        addr.sun_path[idx] = *byte as libc::c_char;
      }
      addr.sun_path[path_bytes.len()] = 0;

      let base = &addr as *const libc::sockaddr_un as usize;
      let path_offset = &addr.sun_path as *const _ as usize - base;
      let addr_len = (path_offset + path_bytes.len() + 1) as libc::socklen_t;

      let rc = unsafe {
        libc::sendto(
          fd,
          bytes.as_ptr() as *const libc::c_void,
          bytes.len(),
          libc::MSG_DONTWAIT,
          &addr as *const libc::sockaddr_un as *const libc::sockaddr,
          addr_len,
        )
      };
      if rc >= 0 {
        return Ok(0);
      }
      let err = std::io::Error::last_os_error();
      if err.kind() == ErrorKind::WouldBlock {
        Ok(1)
      } else {
        Err(io_to_napi(err))
      }
    }
  }

  #[napi]
  impl NativeSocket {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
      let sock = UnixDatagram::unbound().map_err(io_to_napi)?;
      sock.set_nonblocking(false).map_err(io_to_napi)?;
      Ok(Self {
        socket: Mutex::new(Some(sock)),
        listener: Mutex::new(None),
        bound_path: Mutex::new(None),
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
      sock.set_nonblocking(false).map_err(io_to_napi)?;
      let mut guard = self
        .socket
        .lock()
        .map_err(|_| Error::from_reason("failed to lock socket".to_string()))?;
      *guard = Some(sock);
      let mut path_guard = self
        .bound_path
        .lock()
        .map_err(|_| Error::from_reason("failed to lock bound path".to_string()))?;
      *path_guard = Some(path);
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
        sock.set_nonblocking(false).map_err(io_to_napi)?;
        *guard = Some(sock);
      }
      if let Some(sock) = guard.as_ref() {
        sock.connect(path).map_err(io_to_napi)?;
        let mut path_guard = self
          .bound_path
          .lock()
          .map_err(|_| Error::from_reason("failed to lock bound path".to_string()))?;
        *path_guard = None;
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
        Self::send_nonblocking(sock.as_raw_fd(), data.as_ref())
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
        Self::send_to_nonblocking(sock.as_raw_fd(), data.as_ref(), &path)
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

      let tsfn: ThreadsafeFunction<RecvPacket> =
        callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
      let stop = Arc::new(AtomicBool::new(false));
      let stop_for_thread = Arc::clone(&stop);
      let thread = std::thread::spawn(move || {
        let mut buf = vec![0u8; 64 * 1024];
        while !stop_for_thread.load(Ordering::Relaxed) {
          match recv_sock.recv_from(&mut buf) {
            Ok((size, addr)) => {
              if stop_for_thread.load(Ordering::Relaxed) {
                break;
              }
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
            Err(err) if err.kind() == ErrorKind::Interrupted => continue,
            Err(_) => return,
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
      let mut path_guard = self
        .bound_path
        .lock()
        .map_err(|_| Error::from_reason("failed to lock bound path".to_string()))?;
      *path_guard = None;
      Ok(())
    }
  }
}

#[cfg(windows)]
mod imp {
  use napi::bindgen_prelude::*;
  use napi_derive::napi;

  use crate::RecvPacket;

  #[napi]
  pub struct NativeSocket;

  fn not_supported() -> Error {
    Error::from_reason("ENOTSUP: unix_dgram is not supported on win32 in this build".to_string())
  }

  #[napi]
  impl NativeSocket {
    #[napi(constructor)]
    pub fn new() -> Result<Self> {
      Ok(Self)
    }

    #[napi]
    pub fn bind(&self, _path: String) -> Result<()> {
      Err(not_supported())
    }

    #[napi]
    pub fn connect(&self, _path: String) -> Result<()> {
      Err(not_supported())
    }

    #[napi]
    pub fn send(&self, _data: Buffer) -> Result<i32> {
      Err(not_supported())
    }

    #[napi(js_name = "send_to")]
    pub fn send_to(&self, _data: Buffer, _path: String) -> Result<i32> {
      Err(not_supported())
    }

    #[napi(js_name = "start_message_loop")]
    pub fn start_message_loop(&self, _callback: JsFunction) -> Result<()> {
      Err(not_supported())
    }

    #[napi]
    pub fn recv(&self, _max_len: Option<u32>) -> Result<Option<RecvPacket>> {
      Err(not_supported())
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
      Ok(())
    }
  }
}

pub use imp::NativeSocket;

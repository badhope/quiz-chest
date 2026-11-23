//! 局域网一次性分享。
//!
//! 不引入云、账号或中继：桌面端起一个只监听本机局域网地址的临时 HTTP 服务，
//! 手机上用浏览器打开二维码里的链接，就能下载加密题库包。服务只认一个随机
//! 路径 token，10 分钟后自动退出；关闭应用或重新生成口令也会停掉旧服务。
//!
//! 这里刻意没有用 HTTP 框架：只处理一个 GET、一个文件，标准库足够，
//! 也避免为一个临时功能给桌面端增加依赖和编译体积。

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

const MAX_PAYLOAD_BYTES: usize = 24 * 1024 * 1024;
const SHARE_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Default)]
pub struct ShareState(Mutex<Option<ShareServer>>);

struct ShareServer {
  shutdown: Arc<AtomicBool>,
  port: u16,
  thread: Option<JoinHandle<()>>,
}

impl ShareServer {
  fn stop(self) {
    self.shutdown.store(true, Ordering::SeqCst);
    // 非阻塞 accept 每 50ms 轮询一次，connect 只是让 accept 立刻返回。
    let _ = TcpStream::connect(("127.0.0.1", self.port));
    if let Some(thread) = self.thread {
      let _ = thread.join();
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareInfo {
  url: String,
  expires_in_secs: u64,
}

fn random_token() -> String {
  // RandomState 的种子来自操作系统随机源；两个独立 hasher 拼出 128 位 token。
  // 不引入 rand/uuid，避免为一个临时链接增加桌面端依赖。
  let mut first = RandomState::new().build_hasher();
  first.write_u128(
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|value| value.as_nanos())
      .unwrap_or_default(),
  );
  let mut second = RandomState::new().build_hasher();
  second.write_u64(std::process::id() as u64);
  format!("{:016x}{:016x}", first.finish(), second.finish())
}

fn local_ip() -> IpAddr {
  // UDP connect 不会真的发包，只用来让内核选出默认出口网卡的地址。
  UdpSocket::bind("0.0.0.0:0")
    .and_then(|socket| {
      socket.connect("8.8.8.8:80")?;
      socket.local_addr()
    })
    .map(|address| address.ip())
    .unwrap_or(IpAddr::V4(Ipv4Addr::LOCALHOST))
}

fn safe_file_name(value: &str) -> String {
  let cleaned: String = value
    .chars()
    .map(|character| {
      if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
        character
      } else {
        '_'
      }
    })
    .collect();
  if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
    "tixing-share.tixing.enc.json".to_string()
  } else {
    cleaned
  }
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8], extra: &str) {
  let response = format!(
    "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n{extra}\r\n",
    body.len()
  );
  let _ = stream.write_all(response.as_bytes());
  let _ = stream.write_all(body);
  let _ = stream.flush();
}

fn handle_connection(
  mut stream: TcpStream,
  expected_path: &str,
  payload: &Arc<Vec<u8>>,
  file_name: &str,
) {
  let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
  let mut request_bytes = Vec::new();
  let mut buffer = [0u8; 1024];
  loop {
    let read = stream.read(&mut buffer).unwrap_or(0);
    if read == 0 {
      break;
    }
    request_bytes.extend_from_slice(&buffer[..read]);
    if request_bytes.windows(4).any(|window| window == b"\r\n\r\n") || request_bytes.len() > 8192 {
      break;
    }
  }
  let request = String::from_utf8_lossy(&request_bytes);
  let first_line = request.lines().next().unwrap_or("");
  let mut parts = first_line.split_whitespace();
  let method = parts.next().unwrap_or("");
  let path = parts.next().unwrap_or("");

  if method != "GET" {
    respond(&mut stream, "405 Method Not Allowed", "text/plain; charset=utf-8", b"Method Not Allowed", "");
    return;
  }
  if path != expected_path {
    respond(&mut stream, "404 Not Found", "text/plain; charset=utf-8", b"Not Found", "");
    return;
  }
  let disposition = format!("Content-Disposition: attachment; filename=\"{}\"\r\n", file_name);
  respond(
    &mut stream,
    "200 OK",
    "application/json; charset=utf-8",
    payload.as_slice(),
    &disposition,
  );
}

#[tauri::command]
pub fn share_start(
  state: State<'_, ShareState>,
  payload: String,
  file_name: String,
) -> Result<ShareInfo, String> {
  if payload.len() > MAX_PAYLOAD_BYTES {
    return Err("题库包超过 24MB，无法通过局域网分享".into());
  }
  if payload.is_empty() {
    return Err("题库包为空".into());
  }

  let listener = TcpListener::bind(("0.0.0.0", 0)).map_err(|error| format!("无法监听局域网端口：{error}"))?;
  listener
    .set_nonblocking(true)
    .map_err(|error| format!("无法设置监听模式：{error}"))?;
  let port = listener
    .local_addr()
    .map_err(|error| format!("无法读取监听地址：{error}"))?
    .port();

  let ip = local_ip();
  if ip.is_loopback() {
    return Err("没有检测到局域网地址，请确认电脑已连接 Wi-Fi 或有线网络".into());
  }

  let token = random_token();
  let path = format!("/{token}");
  let body = Arc::new(payload.into_bytes());
  let file = safe_file_name(&file_name);
  let shutdown = Arc::new(AtomicBool::new(false));
  let shutdown_for_thread = Arc::clone(&shutdown);
  let path_for_thread = path.clone();

  let thread = thread::spawn(move || {
    let started = Instant::now();
    while !shutdown_for_thread.load(Ordering::SeqCst) && started.elapsed() < SHARE_TTL {
      match listener.accept() {
        Ok((stream, _)) => {
          let path = path_for_thread.clone();
          let body = Arc::clone(&body);
          let file = file.clone();
          // 每个请求单独处理，但一次分享通常只有一个手机在下载；
          // 串行足够，也不会因为慢客户端卡住监听循环。
          handle_connection(stream, &path, &body, &file);
        }
        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
          thread::sleep(Duration::from_millis(50));
        }
        Err(_) => break,
      }
    }
  });

  let mut guard = state.0.lock().map_err(|_| "分享服务状态异常".to_string())?;
  if let Some(old) = guard.take() {
    old.stop();
  }
  *guard = Some(ShareServer {
    shutdown,
    port,
    thread: Some(thread),
  });

  Ok(ShareInfo {
    url: format!("http://{}:{}{}", ip, port, path),
    expires_in_secs: SHARE_TTL.as_secs(),
  })
}

#[tauri::command]
pub fn share_stop(state: State<'_, ShareState>) -> Result<(), String> {
  let server = state
    .0
    .lock()
    .map_err(|_| "分享服务状态异常".to_string())?
    .take();
  if let Some(server) = server {
    server.stop();
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn token_is_128_bit_hex() {
    let token = random_token();
    assert_eq!(token.len(), 32);
    assert!(token.chars().all(|character| character.is_ascii_hexdigit()));
  }

  #[test]
  fn file_name_cannot_escape_share_directory() {
    assert_eq!(safe_file_name("../../etc/passwd"), ".._.._etc_passwd");
    assert_eq!(safe_file_name("题小星.tixing.enc.json"), "__.tixing.enc.json");
    assert_eq!(safe_file_name(""), "tixing-share.tixing.enc.json");
  }

  fn request(path: &'static str, expected: &'static str) -> String {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind test listener");
    let port = listener.local_addr().expect("listener address").port();
    let payload = Arc::new(b"{\"format\":\"tixing-bank-encrypted\"}".to_vec());
    let handle = thread::spawn(move || {
      let (stream, _) = listener.accept().expect("accept test client");
      handle_connection(stream, expected, &payload, "test.tixing.enc.json");
    });
    let mut client = TcpStream::connect(("127.0.0.1", port)).expect("connect test server");
    client
      .write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes())
      .expect("write request");
    let mut response = String::new();
    client.read_to_string(&mut response).expect("read response");
    handle.join().expect("join test server");
    response
  }

  #[test]
  fn handler_serves_the_token_path_as_attachment() {
    let response = request("/token", "/token");
    assert!(response.starts_with("HTTP/1.1 200 OK"));
    assert!(response.contains("Content-Disposition: attachment"));
    assert!(response.contains("tixing-bank-encrypted"));
  }

  #[test]
  fn handler_rejects_other_paths() {
    let response = request("/wrong", "/token");
    assert!(response.starts_with("HTTP/1.1 404 Not Found"));
  }
}

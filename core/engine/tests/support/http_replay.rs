use serde::Deserialize;
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{mpsc, oneshot},
    task::JoinHandle,
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Transcript {
    version: u8,
    protocol: String,
    source: String,
    responses: Vec<Response>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    expect: BTreeMap<String, Value>,
    chunks: Vec<String>,
    #[serde(default)]
    truncated: bool,
    #[serde(default)]
    hold: bool,
    #[serde(default)]
    cancelled: bool,
}

pub struct HttpReplay {
    pub endpoint: String,
    requests: mpsc::UnboundedReceiver<(usize, Value)>,
    releases: Vec<Option<oneshot::Sender<()>>>,
    server: Option<JoinHandle<()>>,
}

impl HttpReplay {
    pub async fn start(input: &str) -> Self {
        let transcript: Transcript = serde_json::from_str(input).unwrap();
        assert_eq!(transcript.version, 1);
        assert_eq!(transcript.protocol, "chat-completions");
        assert_eq!(transcript.source, "synthetic");
        assert!(!transcript.responses.is_empty());
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let endpoint = format!("http://{}/", listener.local_addr().unwrap());
        let (observed, requests) = mpsc::unbounded_channel();
        let (releases, gates): (Vec<_>, Vec<_>) = transcript
            .responses
            .iter()
            .map(|_| {
                let (tx, rx) = oneshot::channel();
                (Some(tx), rx)
            })
            .unzip();
        let server = tokio::spawn(async move {
            for (index, (response, gate)) in transcript.responses.into_iter().zip(gates).enumerate()
            {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0; 4096];
                let request = loop {
                    let count = socket.read(&mut buffer).await.unwrap();
                    assert_ne!(count, 0, "request {index} ended before its body");
                    bytes.extend_from_slice(&buffer[..count]);
                    assert!(
                        bytes.len() < 2 * 1024 * 1024,
                        "unexpected replay request size"
                    );
                    if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = std::str::from_utf8(&bytes[..end]).unwrap();
                        let length: usize = headers
                            .lines()
                            .find_map(|line| {
                                let (key, value) = line.split_once(':')?;
                                key.eq_ignore_ascii_case("content-length")
                                    .then(|| value.trim().parse().unwrap())
                            })
                            .expect("replay requires Content-Length requests");
                        if bytes.len() >= end + 4 + length {
                            break serde_json::from_slice::<Value>(
                                &bytes[end + 4..end + 4 + length],
                            )
                            .unwrap();
                        }
                    }
                };
                for (pointer, expected) in &response.expect {
                    assert_eq!(
                        request.pointer(pointer),
                        Some(expected),
                        "request {index}: {pointer}"
                    );
                }
                observed.send((index, request)).unwrap();
                if response.hold {
                    gate.await.expect("replay gate abandoned");
                }
                let length: usize = response.chunks.iter().map(String::len).sum();
                let result = async {
                    // 故意多报长度模拟 HTTP 截断；SSE 的 finish_reason 不能替代传输完成。
                    socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", length + usize::from(response.truncated) * 100).as_bytes()).await?;
                    for chunk in response.chunks {
                        socket.write_all(chunk.as_bytes()).await?;
                    }
                    socket.shutdown().await
                }.await;
                if !response.cancelled {
                    result.unwrap();
                }
            }
        });
        Self {
            endpoint,
            requests,
            releases,
            server: Some(server),
        }
    }

    pub async fn request(&mut self, expected_index: usize) -> Value {
        let (index, value) = tokio::time::timeout(Duration::from_secs(10), self.requests.recv())
            .await
            .expect("request milestone timed out")
            .expect("replay server stopped");
        assert_eq!(index, expected_index);
        value
    }

    pub fn release(&mut self, index: usize) {
        self.releases[index]
            .take()
            .expect("gate already released")
            .send(())
            .unwrap();
    }

    pub async fn finish(&mut self) {
        tokio::time::timeout(Duration::from_secs(10), self.server.as_mut().unwrap())
            .await
            .expect("replay did not consume its transcript")
            .unwrap();
        self.server.take();
    }
}

impl Drop for HttpReplay {
    fn drop(&mut self) {
        if let Some(server) = self.server.take() {
            server.abort();
        }
    }
}

//! 网络重试策略；环境变量由 Config 解析，Engine 只接收显式配置。

use crate::model;
use std::time::Duration;
use tokio::time::Instant;

pub(crate) struct ResponseDeadline {
    first_event: Option<Instant>,
    stream_idle_timeout: Duration,
}

impl ResponseDeadline {
    pub(crate) fn new(request_timeout: Duration, stream_idle_timeout: Duration) -> Self {
        Self {
            first_event: Some(Instant::now() + request_timeout),
            stream_idle_timeout,
        }
    }

    pub(crate) fn deadline(&self) -> Instant {
        self.first_event
            .unwrap_or_else(|| Instant::now() + self.stream_idle_timeout)
    }

    pub(crate) fn observe_event(&mut self) {
        self.first_event = None;
    }

    pub(crate) fn idle_error(&self, purpose: &str) -> anyhow::Error {
        let phase = if self.first_event.is_some() {
            "request"
        } else {
            "stream"
        };
        idle_error(&format!("{purpose} {phase}"))
    }
}

pub(crate) fn retry_delay(
    disabled: bool,
    error: &anyhow::Error,
    retries: usize,
) -> Option<Duration> {
    if disabled || !model::is_network_error(error) {
        return None;
    }
    // 次数不设上限；指数退避封顶，避免长时间故障后的移位溢出或忙循环。
    Some(Duration::from_millis(
        (250u64 << retries.min(7)).min(30_000),
    ))
}

pub(crate) fn idle_error(phase: &str) -> anyhow::Error {
    anyhow::Error::new(model::ModelFailure::ResponseTimeout)
        .context(format!("{phase} idle timeout"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arbitrarily_many_network_retries_have_a_bounded_backoff() {
        let error = model::ModelFailure::Transport.into();
        assert_eq!(
            retry_delay(false, &error, usize::MAX),
            Some(Duration::from_secs(30))
        );
        assert_eq!(retry_delay(true, &error, usize::MAX), None);
    }
}

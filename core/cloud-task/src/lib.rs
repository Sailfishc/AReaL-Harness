//! 独立执行环境任务契约；Core/Runtime 仍拥有容器内的模型与工具循环。
mod artifacts;
mod broker;
pub mod cli;
mod docker;
mod ledger;
mod source;
mod worker;

pub use artifacts::{Artifact, Manifest};
pub use docker::{Backend, Docker, Resource};
pub use ledger::{BackendTarget, Event, Phase, Store, Task, TaskInput};
pub use source::{Plan, prepare};
pub use worker::{cancel, collect, execute};
#[cfg(test)]
mod tests;

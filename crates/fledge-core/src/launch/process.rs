//! Spawn and track the Minecraft Java process.

use crate::error::{CoreError, CoreResult};
use std::path::Path;
use std::process::Stdio;
use tokio::process::{Child, Command};

pub struct GameProcess {
    child: Child,
}

impl GameProcess {
    pub fn spawn(java_args: &[String], cwd: &Path) -> CoreResult<Self> {
        if java_args.is_empty() {
            return Err(CoreError::msg("empty java command"));
        }
        let program = &java_args[0];
        let args = &java_args[1..];
        let mut cmd = Command::new(program);
        cmd.args(args)
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .kill_on_drop(false);
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        let child = cmd.spawn().map_err(|e| CoreError::msg(e.to_string()))?;
        Ok(Self { child })
    }

    pub fn id(&self) -> Option<u32> {
        self.child.id()
    }

    pub fn take_stdout(&mut self) -> Option<tokio::process::ChildStdout> {
        self.child.stdout.take()
    }

    pub fn take_stderr(&mut self) -> Option<tokio::process::ChildStderr> {
        self.child.stderr.take()
    }

    pub async fn wait(&mut self) -> CoreResult<Option<i32>> {
        let status = self
            .child
            .wait()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))?;
        Ok(status.code())
    }

    pub async fn kill(&mut self) -> CoreResult<()> {
        self.child
            .kill()
            .await
            .map_err(|e| CoreError::msg(e.to_string()))
    }

    pub fn start_kill(&mut self) {
        let _ = self.child.start_kill();
    }
}

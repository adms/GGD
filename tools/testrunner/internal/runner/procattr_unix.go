//go:build unix

package runner

import (
	"os/exec"
	"syscall"
)

// setProcAttr puts each suite in its own process group and kills the whole
// group on cancel, so pnpm/node/go child processes don't outlive the suite.
func setProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return nil
		}
		// Negative pid = the process group.
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
}

//go:build !unix

package runner

import "os/exec"

// setProcAttr is a no-op on non-unix platforms (context cancel still kills the
// direct child process).
func setProcAttr(cmd *exec.Cmd) {}

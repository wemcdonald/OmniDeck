//go:build darwin

package commands

import (
	"fmt"
	"os/exec"
	"strings"
)

type darwinCommander struct{}

func newPlatformCommander() Commander {
	return &darwinCommander{}
}

func (c *darwinCommander) Execute(command string, params map[string]string) (string, error) {
	switch command {
	case "launch_app":
		app := params["app"]
		if app == "" {
			return "", fmt.Errorf("missing app param")
		}
		cmd := exec.Command("open", "-a", app)
		if out, err := cmd.CombinedOutput(); err != nil {
			return "", fmt.Errorf("launch_app %q: %w: %s", app, err, strings.TrimSpace(string(out)))
		}
		return "launched", nil

	case "key_press":
		// Stub: will be implemented in Task 13 with AppleScript
		return "", fmt.Errorf("key_press not yet implemented on darwin")

	case "set_volume":
		level := params["level"]
		if level == "" {
			return "", fmt.Errorf("missing level param")
		}
		script := fmt.Sprintf("set volume output volume %s", level)
		cmd := exec.Command("osascript", "-e", script)
		if out, err := cmd.CombinedOutput(); err != nil {
			return "", fmt.Errorf("set_volume: %w: %s", err, strings.TrimSpace(string(out)))
		}
		return "ok", nil

	default:
		return "", fmt.Errorf("unknown command: %s", command)
	}
}

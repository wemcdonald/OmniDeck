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
		return c.launchApp(params["app"])
	case "focus_app":
		return c.focusApp(params["app"])
	case "get_active_window":
		return c.getActiveWindow()
	case "send_keystroke":
		return c.sendKeystroke(params["keys"])
	case "set_volume":
		return c.setVolume(params["level"])
	case "set_mic_volume":
		return c.setMicVolume(params["level"])
	case "get_volume":
		return c.getVolume()
	case "sleep":
		return c.sleep()
	case "lock":
		return c.lock()
	default:
		return "", fmt.Errorf("unknown command: %s", command)
	}
}

func (c *darwinCommander) launchApp(app string) (string, error) {
	if app == "" {
		return "", fmt.Errorf("missing app param")
	}
	if err := exec.Command("open", "-a", app).Run(); err != nil {
		return "", fmt.Errorf("launch %s: %w", app, err)
	}
	return "launched", nil
}

func (c *darwinCommander) focusApp(app string) (string, error) {
	if app == "" {
		return "", fmt.Errorf("missing app param")
	}
	script := fmt.Sprintf(`tell application "%s" to activate`, app)
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		return "", fmt.Errorf("focus %s: %w", app, err)
	}
	return "focused", nil
}

func (c *darwinCommander) getActiveWindow() (string, error) {
	script := `tell application "System Events" to get name of first application process whose frontmost is true`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return "", fmt.Errorf("get active window: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func (c *darwinCommander) sendKeystroke(keys string) (string, error) {
	if keys == "" {
		return "", fmt.Errorf("missing keys param")
	}
	// keys is a comma-separated list like "ctrl,shift,d"
	// last token is the key; preceding tokens are modifiers
	parts := strings.Split(keys, ",")
	key := parts[len(parts)-1]
	modifiers := parts[:len(parts)-1]

	var modStr string
	if len(modifiers) > 0 {
		asModifiers := make([]string, 0, len(modifiers))
		for _, m := range modifiers {
			switch strings.TrimSpace(m) {
			case "ctrl", "control":
				asModifiers = append(asModifiers, "control down")
			case "shift":
				asModifiers = append(asModifiers, "shift down")
			case "alt", "option":
				asModifiers = append(asModifiers, "option down")
			case "cmd", "command":
				asModifiers = append(asModifiers, "command down")
			}
		}
		modStr = " using {" + strings.Join(asModifiers, ", ") + "}"
	}

	script := fmt.Sprintf(`tell application "System Events" to keystroke "%s"%s`, strings.TrimSpace(key), modStr)
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		return "", fmt.Errorf("send keystroke: %w", err)
	}
	return "sent", nil
}

func (c *darwinCommander) setVolume(level string) (string, error) {
	if level == "" {
		return "", fmt.Errorf("missing level param")
	}
	script := fmt.Sprintf(`set volume output volume %s`, level)
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		return "", fmt.Errorf("set volume: %w", err)
	}
	return "set", nil
}

func (c *darwinCommander) setMicVolume(level string) (string, error) {
	if level == "" {
		return "", fmt.Errorf("missing level param")
	}
	script := fmt.Sprintf(`set volume input volume %s`, level)
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		return "", fmt.Errorf("set mic volume: %w", err)
	}
	return "set", nil
}

func (c *darwinCommander) getVolume() (string, error) {
	script := `output volume of (get volume settings)`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		return "", fmt.Errorf("get volume: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func (c *darwinCommander) sleep() (string, error) {
	if err := exec.Command("pmset", "sleepnow").Run(); err != nil {
		return "", fmt.Errorf("sleep: %w", err)
	}
	return "sleeping", nil
}

func (c *darwinCommander) lock() (string, error) {
	script := `tell application "System Events" to keystroke "q" using {control down, command down}`
	if err := exec.Command("osascript", "-e", script).Run(); err != nil {
		return "", fmt.Errorf("lock: %w", err)
	}
	return "locked", nil
}

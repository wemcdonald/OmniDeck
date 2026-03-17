//go:build darwin

package state

import (
	"os/exec"
	"strconv"
	"strings"
)

type darwinPoller struct{}

func newPlatformPoller() PlatformPoller {
	return &darwinPoller{}
}

func (p *darwinPoller) Poll() PollResult {
	var result PollResult

	// Active window application name
	if out, err := exec.Command("osascript", "-e",
		`tell application "System Events" to get name of first application process whose frontmost is true`,
	).Output(); err == nil {
		result.ActiveWindowApp = strings.TrimSpace(string(out))
	}

	// Idle time via IOHIDSystem (nanoseconds → milliseconds)
	if out, err := exec.Command("ioreg", "-c", "IOHIDSystem").Output(); err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			if strings.Contains(line, "HIDIdleTime") {
				parts := strings.Split(line, "=")
				if len(parts) == 2 {
					ns, _ := strconv.ParseUint(strings.TrimSpace(parts[1]), 10, 64)
					result.IdleTimeMs = ns / 1_000_000
				}
				break
			}
		}
	}

	// Output volume (0-100)
	if out, err := exec.Command("osascript", "-e",
		`output volume of (get volume settings)`,
	).Output(); err == nil {
		vol, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		result.Volume = vol
	}

	// Mic volume (0-100)
	if out, err := exec.Command("osascript", "-e",
		`input volume of (get volume settings)`,
	).Output(); err == nil {
		vol, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		result.MicVolume = vol
	}

	// Output muted
	if out, err := exec.Command("osascript", "-e",
		`output muted of (get volume settings)`,
	).Output(); err == nil {
		result.IsMuted = strings.TrimSpace(string(out)) == "true"
	}

	return result
}

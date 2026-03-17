//go:build windows

package commands

import "fmt"

type windowsCommander struct{}

func newPlatformCommander() Commander {
	return &windowsCommander{}
}

func (c *windowsCommander) Execute(command string, params map[string]string) (string, error) {
	switch command {
	default:
		return "", fmt.Errorf("unknown command: %s", command)
	}
}

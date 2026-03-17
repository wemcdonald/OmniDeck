//go:build linux

package commands

import "fmt"

type linuxCommander struct{}

func newPlatformCommander() Commander {
	return &linuxCommander{}
}

func (c *linuxCommander) Execute(command string, params map[string]string) (string, error) {
	return "", fmt.Errorf("command not supported on linux: %s", command)
}

package commands

// Commander executes platform-specific commands on behalf of the hub.
type Commander interface {
	Execute(command string, params map[string]string) (string, error)
}

// NewCommander returns the platform-specific Commander implementation.
// Each platform provides its own newPlatformCommander() in a build-tagged file.
func NewCommander() Commander {
	return newPlatformCommander()
}

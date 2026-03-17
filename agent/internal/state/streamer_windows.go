//go:build windows

package state

type windowsPoller struct{}

func newPlatformPoller() PlatformPoller {
	return &windowsPoller{}
}

func (p *windowsPoller) Poll() PollResult {
	return PollResult{}
}

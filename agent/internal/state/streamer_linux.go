//go:build linux

package state

type linuxPoller struct{}

func newPlatformPoller() PlatformPoller {
	return &linuxPoller{}
}

func (p *linuxPoller) Poll() PollResult {
	return PollResult{}
}

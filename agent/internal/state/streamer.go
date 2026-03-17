package state

import (
	"context"
	"time"

	"github.com/willcl-ark/omnideck/agent/internal/ws"
)

// PlatformPoller is implemented per-OS to gather system state.
type PlatformPoller interface {
	Poll() PollResult
}

// PollResult holds the data gathered by a single poll cycle.
type PollResult struct {
	ActiveWindowTitle string
	ActiveWindowApp   string
	IdleTimeMs        uint64
	Volume            float64
	MicVolume         float64
	IsMuted           bool
	MicMuted          bool
}

// Streamer periodically polls platform state and pushes updates via the ws.Client.
type Streamer struct {
	client   *ws.Client
	interval time.Duration
	poller   PlatformPoller
}

// NewStreamer creates a Streamer using the platform-specific poller.
func NewStreamer(client *ws.Client, interval time.Duration) *Streamer {
	return &Streamer{
		client:   client,
		interval: interval,
		poller:   newPlatformPoller(),
	}
}

// Run polls on each tick until ctx is cancelled.
func (s *Streamer) Run(ctx context.Context) {
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			result := s.poller.Poll()
			s.client.UpdateState(func(state *ws.AgentStateData) {
				state.ActiveWindowTitle = result.ActiveWindowTitle
				state.ActiveWindowApp = result.ActiveWindowApp
				state.IdleTimeMs = result.IdleTimeMs
				state.Volume = result.Volume
				state.MicVolume = result.MicVolume
				state.IsMuted = result.IsMuted
				state.MicMuted = result.MicMuted
			})
			_ = s.client.SendState(ctx)
		}
	}
}

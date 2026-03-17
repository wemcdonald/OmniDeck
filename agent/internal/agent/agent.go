package agent

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"runtime"

	"github.com/willcl-ark/omnideck/agent/internal/commands"
	"github.com/willcl-ark/omnideck/agent/internal/ws"
)

type Agent struct {
	config    *Config
	client    *ws.Client
	commander commands.Commander
	log       *slog.Logger
}

func New(cfg *Config) *Agent {
	return &Agent{
		config:    cfg,
		commander: commands.NewCommander(),
		log:       slog.Default().With("component", "agent"),
	}
}

func (a *Agent) Run(ctx context.Context) error {
	hostname, _ := os.Hostname()
	state := &ws.AgentStateData{
		Hostname:     hostname,
		Platform:     runtime.GOOS,
		AgentVersion: "0.1.0",
	}

	a.client = ws.NewClient(a.config.HubURL, state, func(command string, params map[string]string) (string, error) {
		return a.commander.Execute(command, params)
	})

	if err := a.client.Connect(ctx); err != nil {
		return fmt.Errorf("connect to hub: %w", err)
	}
	a.log.Info("agent running", "hostname", hostname, "platform", runtime.GOOS)

	<-ctx.Done()
	return a.client.Close()
}

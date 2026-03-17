package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/willcl-ark/omnideck/agent/internal/agent"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := agent.LoadConfig()
	if err != nil {
		slog.Warn("no config found, using defaults", "err", err)
		cfg = agent.DefaultConfig()
	}

	// Allow env override for hub URL
	if url := os.Getenv("OMNIDECK_HUB_URL"); url != "" {
		cfg.HubURL = url
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	a := agent.New(cfg)
	if err := a.Run(ctx); err != nil {
		slog.Error("agent failed", "err", err)
		os.Exit(1)
	}
}

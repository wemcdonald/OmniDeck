package discovery

import (
	"fmt"
	"log/slog"
	"os"

	"github.com/hashicorp/mdns"
)

// Discovery advertises this agent via mDNS as "_omnideck-agent._tcp".
type Discovery struct {
	server *mdns.Server
	log    *slog.Logger
}

// New creates and starts an mDNS advertisement on the given port.
func New(port int) (*Discovery, error) {
	hostname, _ := os.Hostname()

	service, err := mdns.NewMDNSService(
		hostname,
		"_omnideck-agent._tcp",
		"",
		"",
		port,
		nil,
		[]string{fmt.Sprintf("omnideck-agent v0.1.0 on %s", hostname)},
	)
	if err != nil {
		return nil, fmt.Errorf("create mDNS service: %w", err)
	}

	server, err := mdns.NewServer(&mdns.Config{Zone: service})
	if err != nil {
		return nil, fmt.Errorf("start mDNS server: %w", err)
	}

	slog.Info("mDNS advertisement started", "hostname", hostname, "port", port)
	return &Discovery{server: server, log: slog.Default()}, nil
}

// Shutdown stops the mDNS advertisement.
func (d *Discovery) Shutdown() {
	if d.server != nil {
		d.server.Shutdown()
	}
}

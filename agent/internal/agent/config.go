package agent

import (
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

type Config struct {
	HubURL     string `toml:"hub_url"`
	DeviceName string `toml:"device_name"`
	HubID      string `toml:"hub_id"`
	Secret     string `toml:"secret"`
}

func LoadConfig() (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(home, ".omnideck", "agent.toml")

	var cfg Config
	_, err = toml.DecodeFile(path, &cfg)
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

func DefaultConfig() *Config {
	return &Config{
		HubURL: "ws://omnideck.local:9200",
	}
}

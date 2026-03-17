package ws

import (
	"encoding/json"
	"time"
)

type Message struct {
	V    uint32          `json:"v"`
	Type string          `json:"type"`
	ID   string          `json:"id,omitempty"`
	Data json.RawMessage `json:"data"`
	Ts   string          `json:"ts"`
}

type CommandRequestData struct {
	Command string            `json:"command"`
	Params  map[string]string `json:"params"`
}

type CommandResponseData struct {
	Success bool   `json:"success"`
	Result  string `json:"result,omitempty"`
	Error   string `json:"error,omitempty"`
}

type AgentStateData struct {
	Hostname          string  `json:"hostname"`
	Platform          string  `json:"platform"`
	ActiveWindowTitle string  `json:"active_window_title,omitempty"`
	ActiveWindowApp   string  `json:"active_window_app,omitempty"`
	IdleTimeMs        uint64  `json:"idle_time_ms,omitempty"`
	Volume            float64 `json:"volume,omitempty"`
	MicVolume         float64 `json:"mic_volume,omitempty"`
	IsMuted           bool    `json:"is_muted,omitempty"`
	MicMuted          bool    `json:"mic_muted,omitempty"`
	AgentVersion      string  `json:"agent_version"`
}

func NewMessage(msgType string, data interface{}, id string) ([]byte, error) {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	msg := Message{
		V:    1,
		Type: msgType,
		ID:   id,
		Data: dataBytes,
		Ts:   time.Now().UTC().Format(time.RFC3339),
	}
	return json.Marshal(msg)
}

func ParseMessage(raw []byte) (*Message, error) {
	var msg Message
	if err := json.Unmarshal(raw, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

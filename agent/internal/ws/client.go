package ws

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"nhooyr.io/websocket"
)

type CommandHandler func(command string, params map[string]string) (string, error)

type Client struct {
	hubURL    string
	conn      *websocket.Conn
	onCommand CommandHandler
	state     *AgentStateData
	mu        sync.Mutex
	done      chan struct{}
	log       *slog.Logger
}

func NewClient(hubURL string, state *AgentStateData, handler CommandHandler) *Client {
	return &Client{
		hubURL:    hubURL,
		onCommand: handler,
		state:     state,
		done:      make(chan struct{}),
		log:       slog.Default().With("component", "ws-client"),
	}
}

func (c *Client) Connect(ctx context.Context) error {
	conn, _, err := websocket.Dial(ctx, c.hubURL, nil)
	if err != nil {
		return fmt.Errorf("dial hub: %w", err)
	}
	c.conn = conn
	c.log.Info("connected to hub", "url", c.hubURL)

	// Send initial state
	if err := c.SendState(ctx); err != nil {
		return fmt.Errorf("send initial state: %w", err)
	}

	go c.readLoop(ctx)
	go c.heartbeatLoop(ctx)

	return nil
}

func (c *Client) SendState(ctx context.Context) error {
	c.mu.Lock()
	stateCopy := *c.state
	c.mu.Unlock()

	data, err := NewMessage("agent_state", stateCopy, "")
	if err != nil {
		return err
	}
	return c.conn.Write(ctx, websocket.MessageText, data)
}

func (c *Client) UpdateState(fn func(s *AgentStateData)) {
	c.mu.Lock()
	fn(c.state)
	c.mu.Unlock()
}

func (c *Client) Close() error {
	close(c.done)
	if c.conn != nil {
		return c.conn.Close(websocket.StatusNormalClosure, "agent shutting down")
	}
	return nil
}

func (c *Client) readLoop(ctx context.Context) {
	for {
		select {
		case <-c.done:
			return
		default:
		}

		_, data, err := c.conn.Read(ctx)
		if err != nil {
			c.log.Error("read error", "err", err)
			return
		}

		msg, err := ParseMessage(data)
		if err != nil {
			c.log.Error("parse message", "err", err)
			continue
		}

		switch msg.Type {
		case "command":
			go c.handleCommand(ctx, msg)
		default:
			c.log.Warn("unknown message type", "type", msg.Type)
		}
	}
}

func (c *Client) handleCommand(ctx context.Context, msg *Message) {
	var cmd CommandRequestData
	if err := json.Unmarshal(msg.Data, &cmd); err != nil {
		c.log.Error("unmarshal command", "err", err)
		return
	}

	result, err := c.onCommand(cmd.Command, cmd.Params)

	resp := CommandResponseData{Success: err == nil, Result: result}
	if err != nil {
		resp.Error = err.Error()
	}

	respData, marshalErr := NewMessage("command_response", resp, msg.ID)
	if marshalErr != nil {
		c.log.Error("marshal response", "err", marshalErr)
		return
	}
	if writeErr := c.conn.Write(ctx, websocket.MessageText, respData); writeErr != nil {
		c.log.Error("write response", "err", writeErr)
	}
}

func (c *Client) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.done:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.SendState(ctx); err != nil {
				c.log.Error("heartbeat send state", "err", err)
				return
			}
		}
	}
}

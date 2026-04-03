# Getting Started

## Prerequisites

- **Raspberry Pi 4 or 5** (3B+ works but is slower for button rendering)
- **Node.js 22+** on the Pi (the install script handles this)
- **Elgato Stream Deck** — any USB model (MK.2, XL, Mini, +, Neo)
- A local network the Pi and your Mac/PC share

## Install the hub

Run the install script on your Raspberry Pi:

```bash
curl -sSf https://raw.githubusercontent.com/wemcdonald/OmniDeck/main/deploy/install.sh | bash
```

The script will:
1. Install Node.js 22 via nvm if not already present
2. Clone OmniDeck to `~/OmniDeck`
3. Install dependencies (`pnpm install`)
4. Set up udev rules for Stream Deck USB access (no root required)
5. Install and enable a systemd service (`omnideck-hub`)
6. Create `~/.omnideck/` with a starter `config.yaml`

The hub starts immediately and on every boot. Check the status with:

```bash
systemctl status omnideck-hub
journalctl -u omnideck-hub -f
```

<!-- TODO: screenshot: terminal showing hub startup output with "Config loaded", "Web server started on :28120" -->

### Manual install (fallback)

If you prefer to install manually or the script fails:

```bash
git clone https://github.com/wemcdonald/OmniDeck.git ~/OmniDeck
cd ~/OmniDeck
pnpm install

# System dependencies for button rendering
sudo apt install -y fontconfig

# udev rules for Stream Deck USB (no root required at runtime)
sudo cp deploy/udev/50-stream-deck.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules

# Build the hub
pnpm --filter hub build

# Start it
pnpm --filter hub start
```

To run as a service, copy the unit file and enable it:

```bash
sudo cp deploy/systemd/omnideck-hub.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now omnideck-hub
```

## Open the web UI

Once the hub is running, open a browser on any device on your network:

```
http://<pi-hostname>.local:28120
```

Replace `<pi-hostname>` with your Pi's hostname (default is `raspberrypi`). If mDNS isn't working on your network, use the Pi's IP address instead.

<!-- TODO: screenshot: web UI home screen showing empty deck grid with "No pages yet" and sidebar -->

## Install the agent

The agent runs on each Mac or PC you want to control. Install it from the hub:

1. Open the web UI
2. Go to **Agents** in the sidebar
3. Click **Download Agent** and choose your platform
4. Run the installer on your Mac/PC
5. The agent appears in your system tray / menu bar and connects to the hub automatically

The agent discovers the hub via mDNS. If discovery fails (e.g., on a network that blocks mDNS), enter the hub's IP address manually in the agent's settings.

<!-- TODO: screenshot: Agents page showing one connected agent with green status dot -->

## Install your first plugin

1. Open the web UI and go to **Plugins** in the sidebar
2. Click **Install Plugin**
3. Browse the plugin list and click one to see its description and requirements
4. Click **Install** — the plugin downloads and activates immediately
5. Click the plugin row to expand it, fill in the config fields, and click **Save**

<!-- TODO: screenshot: Plugins page with install modal open showing plugin list -->

## Add a button to a page

1. Go to **Pages** and open (or create) a page
2. In the plugin browser on the right, find a preset for your newly installed plugin
3. Drag it onto a button slot in the deck grid (or tap the slot, then tap the preset)
4. The button config panel opens — adjust the label or params as needed
5. Click **Save** — the button appears on your physical deck within a second

<!-- TODO: screenshot: PageEditor showing a button being dragged from plugin browser onto the deck grid -->

## Troubleshooting

**Stream Deck not detected**

The most common cause is missing udev rules. Run:

```bash
sudo cp ~/OmniDeck/deploy/udev/50-stream-deck.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
```

Then unplug and replug the deck. If the hub is running as a service, restart it after:

```bash
sudo systemctl restart omnideck-hub
```

**Web UI not reachable**

- Check the hub is running: `systemctl status omnideck-hub`
- Check firewall rules: port **28120** (web UI + WebSocket) must be open
- Try the IP address directly if mDNS (`<hostname>.local`) doesn't resolve

**Agent not connecting**

- Port **28121** (agent WebSocket) must be reachable from the agent's machine
- Check the agent's settings for the correct hub address
- On Windows, allow the agent through Windows Firewall when prompted

**Buttons not rendering**

Make sure `fontconfig` is installed on the Pi:

```bash
sudo apt install -y fontconfig
fc-cache -f
```

Then restart the hub.

## Upgrading

Re-run the install script with the `--upgrade` flag:

```bash
curl -sSf https://raw.githubusercontent.com/wemcdonald/OmniDeck/main/deploy/install.sh | bash -s -- --upgrade
```

This pulls the latest code, rebuilds, and restarts the service. Your config in `~/.omnideck/` is not touched.

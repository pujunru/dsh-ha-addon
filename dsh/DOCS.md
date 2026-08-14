# Home Assistant App: DeepSeek Harness

## Access

Open the app from Home Assistant. It is served through Home Assistant ingress and does not require a host port or a separate reverse proxy.

## Persistent data

- `/data/dsh` stores DeepSeek Harness state and configuration.
- `/data/workspace` is the default workspace used by the web application.

## Logs

The app aggregates the proxy, backend process, WebSocket bridge, and lifecycle
messages into the Home Assistant app log. Each line has a component prefix:

- `[ingress]` — HTTP requests, responses, and proxy failures.
- `[backend]` — DeepSeek Harness stdout and stderr.
- `[websocket]` — WebSocket upgrades, connections, closes, and errors.
- `[lifecycle]` — startup, shutdown, process, and fatal runtime events.

The `logging` settings in the app configuration control which components are
visible. They default to enabled. For example, set `backend` to `false` to
hide DeepSeek Harness stdout/stderr while retaining proxy and lifecycle logs.

## Security

DeepSeek Harness can run tools and commands in its workspace. Only install it for trusted users and keep Home Assistant authentication and ingress enabled.

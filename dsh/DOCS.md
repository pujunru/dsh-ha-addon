# Home Assistant App: DeepSeek Harness

## Access

Open the app from Home Assistant. It is served through Home Assistant ingress and does not require a host port or a separate reverse proxy.

## Persistent data

- `/data/dsh` stores DeepSeek Harness state and configuration.
- `/data/workspace` is the default workspace used by the web application.

## Security

DeepSeek Harness can run tools and commands in its workspace. Only install it for trusted users and keep Home Assistant authentication and ingress enabled.

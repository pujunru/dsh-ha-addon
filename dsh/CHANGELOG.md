## 0.1.3

- Make Home Assistant ingress paths available to the browser through the
  `X-Ingress-Path` header and rewrite the frontend base URL accordingly.
- Keep HMR, API, WebSocket, plugin, and session-export requests under the
  ingress prefix without requiring an additional Nginx proxy.

## 0.1.2

- Add a browser UUID fallback for Home Assistant HTTP ingress origins that do
  not expose `crypto.randomUUID()`.

## 0.1.1

- Aggregate app logs with `[component]` prefixes for ingress, backend,
  WebSocket, and lifecycle events.
- Add per-component logging feature flags to the app configuration.

## 0.1.0

- Initial Home Assistant app packaging for DeepSeek Harness.
- Add Home Assistant ingress support and multi-architecture image builds.

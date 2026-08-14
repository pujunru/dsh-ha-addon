# DeepSeek Harness app

This app runs the upstream DeepSeek Harness web experience behind Home Assistant ingress. The upstream source is pinned in [`deepseek-harness`](deepseek-harness).

The app does not publish a host port by default. Home Assistant ingress is the intended access path and provides the access boundary for the DSH interface.

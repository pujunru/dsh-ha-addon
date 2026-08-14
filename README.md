# DeepSeek Harness for Home Assistant

This repository packages [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) as a Home Assistant app. The upstream project is pinned as a Git submodule at [`dsh/deepseek-harness`](dsh/deepseek-harness).

## Install

1. In Home Assistant, open **Settings → Apps → App store**.
2. Add `https://github.com/pujunru/dsh-ha-addon` as a custom repository.
3. Install **DeepSeek Harness** and open it through Home Assistant.

The app is served through Home Assistant ingress and keeps its DSH data under the app's persistent `/data` mount. Configure providers and models from the DSH interface; no API keys are stored in this repository.

DeepSeek Harness can execute tools and commands in its workspace. Only expose it to trusted Home Assistant users.

## Development

The GitHub Actions workflow builds and publishes a multi-architecture image to GHCR for pushes to `main`. To update the upstream pin:

```sh
git -C dsh/deepseek-harness fetch origin master
git -C dsh/deepseek-harness checkout origin/master
git add dsh/deepseek-harness
git commit -m "Update DeepSeek Harness"
```

To build the app image locally:

```sh
docker build -f dsh/Dockerfile dsh
```

# DeepSeek Harness for Home Assistant

This repository packages [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) as a Home Assistant app. The upstream project is pinned as a Git submodule at [`dsh/deepseek-harness`](dsh/deepseek-harness).

[![Open your Home Assistant instance and show the app store with this repository pre-filled.](https://my.home-assistant.io/badges/supervisor_store.svg)](https://my.home-assistant.io/redirect/supervisor_store/?repository_url=https%3A%2F%2Fgithub.com%2Fpujunru%2Fdsh-ha-addon)

![Supports aarch64 Architecture](https://img.shields.io/badge/aarch64-yes-green.svg)
![Supports amd64 Architecture](https://img.shields.io/badge/amd64-yes-green.svg)

## Install

The badge above is the Home Assistant “one-click” entry point. It opens your Home Assistant app store with this repository URL filled in; you still confirm adding the repository and installing the app.

You can also do it manually:

1. In Home Assistant, open **Settings → Apps → App store**.
2. Add `https://github.com/pujunru/dsh-ha-addon` as a custom repository.
3. Install **DeepSeek Harness** and open it through Home Assistant ingress.

On install, Home Assistant reads [`repository.yaml`](repository.yaml), discovers [`dsh/config.yaml`](dsh/config.yaml), and pulls the matching architecture from the multi-architecture GHCR image. The GHCR package must be public for Home Assistant to pull it without registry credentials.

The app keeps DSH data under `/data/dsh` and uses `/data/workspace` as its working directory. Configure providers and models from the DSH interface; no API keys are stored in this repository.

DeepSeek Harness can execute tools and commands in its workspace. Only expose it to trusted Home Assistant users.

## How updates work

The `Builder` workflow watches app metadata, the Dockerfile, root filesystem, patches, and the pinned DSH submodule. A push to `main` builds amd64 and aarch64 images, publishes them to GHCR, and creates the multi-architecture manifest used by Home Assistant. Bump [`dsh/config.yaml`](dsh/config.yaml)'s `version` when releasing an app change.

Pull requests run the same image build without publishing, plus the Home Assistant app linter.

## Development

To update the upstream pin:

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

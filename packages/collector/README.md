# @esyion/vakatime

Command-line collector for Vakatime AI coding analytics. It installs hooks for AI coding agents and uploads normalized heartbeats to a Vakatime server.

## Install

```sh
npm install -g @esyion/vakatime
```

## Login

Create an API key in your Vakatime dashboard, then configure the collector:

```sh
vakatime login --endpoint https://your-vakatime-domain.example --api-key vkt_xxx
```

## Configure agent hooks

```sh
vakatime setup claude-code
vakatime setup codex
vakatime setup cursor
vakatime setup opencode
vakatime setup gemini-cli
vakatime setup zcode
```

## Remove agent hooks

```sh
vakatime remove claude-code   # also: codex | cursor | opencode | gemini-cli | zcode
```

Removes only the hooks vakatime registered; your own hooks and other tools'
hooks are left untouched. A `.backup` copy is written next to each modified
file.

## Status overview

```sh
vakatime status            # config + per-agent hook state + activity heatmap
vakatime status --weeks 26 # wider heatmap
```

The heatmap is built from the local hook log. Inside a terminal it renders a
GitHub-style grid; piped output falls back to a plain-text summary.

`vakatime setup` without an agent argument opens an interactive multi-select
picker (arrow keys, space to toggle, enter to confirm). Agents already
configured are pre-checked and labelled `(configured)`.

## Commands

```sh
vakatime status
vakatime flush
vakatime heartbeat --entity src/index.ts --project my-project --language TypeScript --write
```
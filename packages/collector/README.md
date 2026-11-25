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
```

## Commands

```sh
vakatime status
vakatime flush
vakatime heartbeat --entity src/index.ts --project my-project --language TypeScript --write
```
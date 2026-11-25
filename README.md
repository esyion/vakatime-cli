# Vakatime CLI

npm packages for [Vakatime](https://github.com/esyion/vakatime) AI coding analytics.

## Packages

| Package | Description |
|---|---|
| [`@esyion/vakatime`](./packages/collector) | CLI collector — installs hooks for AI coding agents (Claude Code, Codex, Cursor, OpenCode, Gemini CLI) and uploads heartbeats to a Vakatime server |
| [`@esyion/vakatime-core`](./packages/core) | Pure TypeScript domain logic: heartbeat, agent event, usage, and summary calculations |

## Install

```sh
npm install -g @esyion/vakatime
```

## Usage

```sh
vakatime login --endpoint https://your-vakatime-domain.example --api-key vkt_xxx
vakatime setup claude-code   # also: codex | cursor | opencode | gemini-cli
```

## Development

```sh
pnpm install
pnpm --filter @esyion/vakatime-core test
pnpm --filter @esyion/vakatime test
pnpm -r build
```

## Publishing

Push a `v*.*.*` tag to trigger the [npm publish workflow](./.github/workflows/npm-publish.yml). Both package versions are bumped together. See [docs/npm-publishing.md](https://github.com/esyion/vakatime/blob/master/docs/npm-publishing.md) in the app repo for the runbook.

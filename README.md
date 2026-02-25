<h1 align="center">@astroanywhere/cli</h1>
<p align="center">
  <strong>Command-line interface for the Astro platform.</strong>
  <br />
  <br />
  <a href="https://www.npmjs.com/package/@astroanywhere/cli"><img src="https://img.shields.io/npm/v/@astroanywhere/cli?style=flat-square&color=0a0a1a&labelColor=0a0a1a&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@astroanywhere/cli"><img src="https://img.shields.io/npm/dm/@astroanywhere/cli?style=flat-square&color=0a0a1a&labelColor=0a0a1a&logo=npm&logoColor=white" alt="npm downloads"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-0a0a1a?style=flat-square&labelColor=0a0a1a&logo=node.js&logoColor=white" alt="node version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-BSL--1.1-0a0a1a?style=flat-square&labelColor=0a0a1a" alt="license"></a>
  <br />
  <br />
  <a href="https://astroanywhere.com/landing/">Website</a>
  &nbsp;&middot;&nbsp;
  <a href="https://astroanywhere.com">Dashboard</a>
  &nbsp;&middot;&nbsp;
  <a href="#install">Get Started</a>
  <br />
  <br />
</p>

---

Manage [Astro](https://astroanywhere.com/landing/) projects, plans, tasks, and environments from the terminal.

## Install

```bash
npm install -g @astroanywhere/cli
```

## Usage

```bash
# Configure server connection
astro-cli config set server-url http://localhost:3001

# Authenticate (for remote servers)
astro-cli login

# List projects
astro-cli project list

# View plan as a tree
astro-cli plan tree --project-id <id>

# Dispatch a task
astro-cli task dispatch <nodeId> --project-id <id>

# Watch task output in real time
astro-cli task watch <executionId>
```

## Commands

| Command | Description |
|---------|-------------|
| `project list\|show\|create\|update\|delete\|stats` | Manage projects |
| `plan tree\|list\|show\|create-node\|update-node\|delete-node\|stats\|export` | Manage plan graphs |
| `task list\|show\|dispatch\|cancel\|steer\|watch\|update-status` | Manage tasks |
| `env list\|show\|remove\|set-default\|status\|providers\|clusters` | Manage environments and machines |
| `search <query>` | Search across projects, tasks, executions |
| `activity list\|watch` | View activity feed |
| `trace show\|observations\|summary\|stats` | View execution traces |
| `config show\|set\|get` | Manage CLI configuration |
| `login\|logout\|whoami` | Authentication |
| `completion` | Generate shell completions (bash, zsh, fish) |

All commands support `--json` for machine-readable output.

## Configuration

Config is stored at `~/.astro/config.json` (permissions 0600).

| Setting | Env var | Description |
|---------|---------|-------------|
| `serverUrl` | `ASTRO_SERVER_URL` | Astro server URL |
| `authToken` | — | Access token (set via `login`) |
| `defaultMachineId` | — | Default machine for dispatch |

Resolution order: CLI flag `--server-url` > env var > config file > default.

## Programmatic Usage

```typescript
import { AstroClient } from '@astroanywhere/cli/client'

const client = new AstroClient({ serverUrl: 'http://localhost:3001' })
const projects = await client.listProjects()
```

## License

[BSL-1.1](./LICENSE) — converts to Apache 2.0 on 2030-02-25.

---

<p align="center">
  <a href="https://astroanywhere.com/landing/">astroanywhere.com</a>
</p>

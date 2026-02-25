# @astroanywhere/cli

CLI for managing [Astro](https://github.com/astro-anywhere) projects, plans, tasks, and environments.

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

# View plan
astro-cli plan tree --project-id <id>

# Dispatch a task
astro-cli task dispatch <nodeId> --project-id <id>

# Watch task output
astro-cli task watch <executionId>
```

## Commands

| Command | Description |
|---------|-------------|
| `project list\|show\|create\|delete` | Manage projects |
| `plan tree\|create-node\|update-node` | Manage plan graphs |
| `task list\|show\|dispatch\|cancel\|steer\|watch` | Manage tasks |
| `env list\|show\|revoke` | Manage environments and machines |
| `search <query>` | Search across projects, tasks, executions |
| `activity` | View activity feed |
| `trace` | View execution traces |
| `config` | Manage CLI configuration |
| `login\|logout\|whoami` | Authentication |

## Configuration

Config is stored at `~/.astro/config.json`.

| Setting | Env var | Description |
|---------|---------|-------------|
| `serverUrl` | `ASTRO_SERVER_URL` | Astro server URL |
| `authToken` | — | Access token (set via `login`) |

## License

MIT

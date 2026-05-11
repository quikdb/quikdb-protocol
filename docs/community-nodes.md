# Community Nodes

## How It Works

Any machine can join the QuikDB network as a compute node:

1. Install the QuikDB CLI
2. Register your device — CLI generates a keypair and registers on-chain via `register_node`
3. Start heartbeating — CLI reports system metrics every 2 minutes
4. Earn tokens — QUIKS minted for uptime, epoch bonuses for leaderboard placement
5. Serve deployments — orchestrator routes containers to your node based on score

## Node Types

| Type | Description | Deployments |
|------|-------------|-------------|
| EKS | Platform-managed runner pods on AWS EKS with Docker-in-Docker | Yes |
| External | Community-contributed machines (any Linux/macOS/Windows) | Yes (after approval) |

## Security

Every container deployed on a community node runs with:
- Read-only root filesystem
- Dropped Linux capabilities
- No privilege escalation
- Isolated Docker network
- Per-deployment system user
- CPU, RAM, and storage limits enforced

## Scoring and Selection

The orchestrator picks nodes based on:
1. On-chain score (0-100) from heartbeat data
2. Geographic diversity — one node per unique region first
3. Resource availability — enough CPU/RAM/disk for the requested tier
4. Heartbeat freshness — must have reported within last 5 minutes

## Earning

| Reward Type | Rate | Mechanism |
|-------------|------|-----------|
| Heartbeat | 1 QUIKS per 30 heartbeats (~1/hour) | Operator claims on-chain |
| Epoch bonus | Share of reward pool for top 100 nodes | Authority distributes by rank |
| Referral bonus | +1% per referral on epoch rewards (max 5%) | Applied at distribution time |

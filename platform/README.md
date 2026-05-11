# Platform (Off-Chain)

Representative code from the QuikDB off-chain infrastructure that the Solana programs integrate with. The full platform runs across 20+ private repositories.

## edge-router/

Cloudflare Worker that routes all `*.quikdb.net` traffic to the correct container on community nodes. Handles round-robin backend selection, deployment status pages (sleeping/waking/building), and custom domain support.

**Production:** Routes real traffic at `*.quikdb.net` and `*.quikdb.com`.

## cli/server/

Go HTTP server running on each community node (port 4222, exposed via Cloudflare Tunnel). Receives deploy requests from the orchestrator, clones repos (or downloads AI-generated tarballs from R2), builds Docker images via DinD sidecar, and starts containers with security hardening.

**Production:** 3 EKS runner pods + 100 monitor nodes.

## How This Connects to Solana

1. When a node registers via the CLI, the orchestrator calls `register_node` on the node-registry program
2. Every 2 minutes, heartbeat data is batched and written on-chain via `record_heartbeat`
3. When a deployment is placed on a node, `record_deployment` creates an on-chain record
4. Node operators claim QUIKS tokens from the quiks-rewards program based on heartbeat count
5. Top 100 leaderboard nodes receive epoch bonus distributions on-chain

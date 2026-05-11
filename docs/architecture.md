# Architecture

## Overview

QuikDB is a community-powered cloud platform. The off-chain layer handles deployment orchestration — selecting nodes, building containers, routing traffic. The on-chain layer (these Solana programs) handles trust, transparency, and incentives — who contributed compute, how much they earned, and who referred whom.

## Off-Chain (existing platform)

1. **Node operators** install the QuikDB CLI and register their machine
2. **Orchestrator** (Node.js/Express) receives deploy requests and selects the best nodes based on heartbeat scores (CPU, RAM, disk, network, uptime)
3. **CLI runners** (Go) on each node clone repos, build Docker images, and start containers
4. **Edge router** (Cloudflare Worker) proxies all `*.quikdb.net` traffic to the correct container through Cloudflare Tunnels
5. **Auto-sleep/wake** suspends idle hobby-tier deployments and wakes them on incoming requests

## On-Chain (these programs)

### Data Flow

```
Node starts heartbeating (off-chain, every 2 min)
  -> Orchestrator batches heartbeats
  -> Calls record_heartbeat on node-registry (on-chain)
    -> Score updated, heartbeat count incremented

Operator crosses 30 heartbeats
  -> Calls claim_heartbeat_rewards on quiks-rewards
  -> 1 QUIKS minted to operator's token account

End of epoch
  -> Authority reads leaderboard (off-chain)
  -> Calls distribute_epoch_bonus for top 100 nodes
  -> Weighted by rank, boosted by referral bonus

User refers someone
  -> Referee calls apply_referral (on-chain)
  -> Authority verifies -> verify_and_reward mints reward tokens
  -> Referrer's bonus_bps increases (+1% per referral, max 5%)
```

### Program Interactions

```
node-registry          quiks-rewards          referral
     |                      |                     |
     |-- heartbeat data --> |                     |
     |                      |-- epoch bonus bps <-|
     |                      |                     |
     v                      v                     v
  NodeAccount          RewardTracker        ReferralAccount
  DeploymentRecord     RewardState          ReferralLink
  RegistryState                             ReferralState
```

The rewards program reads heartbeat counts from reward trackers (not directly from node-registry accounts) to keep programs loosely coupled. The referral bonus_bps is passed as an argument to distribute_epoch_bonus rather than doing CPI.

## Node Scoring

Each heartbeat updates the node's on-chain score (0-100):

| Factor | Max Points | Calculation |
|--------|-----------|-------------|
| Available RAM | 30 | `min(ram_mb * 30 / 4096, 30)` |
| CPU idle % | 30 | `min(cpu_idle * 30 / 100, 30)` |
| Disk space | 20 | `min(disk_gb * 20 / 100, 20)` |
| Download speed | 10 | `min(speed_mbps * 10 / 100, 10)` |
| Uptime history | 10 | `min(heartbeats * 10 / 1000, 10)` |

The off-chain orchestrator uses this score (along with geographic diversity) to select which nodes receive deployments.

## Reward Economics

**Heartbeat rewards:** 1 QUIKS per 30 heartbeats. Heartbeats arrive every 2 minutes, so a continuously online node earns 1 QUIKS per hour.

**Epoch bonus:** A configurable reward pool is distributed to the top N nodes each epoch. Rank 1 gets the largest share, rank N gets the smallest (linear weighting). Referral bonus adds up to 5% on top.

**Referral tiers:**
- Bronze (0-4 referrals): 1x base reward
- Silver (5-14): 1.25x
- Gold (15-49): 1.5x
- Platinum (50+): 2x

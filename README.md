# QuikDB Protocol

On-chain programs for QuikDB — community-powered cloud infrastructure.

Anyone can contribute their machine as a compute node and earn token rewards. Developers and businesses deploy applications on that shared infrastructure. These programs handle the on-chain layer: node registration, token rewards, and referral tracking.

## Devnet Deployment

| Resource         | Address                                          |
|------------------|--------------------------------------------------|
| Deploy Authority | `ELQSFet2DZgP1vB9BkWnwGojrRsG4W4rysoVCPR6cQLH` |
| Cluster          | Devnet                                           |

> Program IDs and QUIKS token mint will be populated after `anchor deploy`.

## Programs

### node-registry

Tracks community nodes that contribute compute to the network. Handles node registration, heartbeat recording, deployment tracking, and performance scoring.

- Nodes register with metadata hash, provider type (EKS/External), and region
- Heartbeats report CPU, RAM, disk, and network speed every 2 minutes
- On-chain scoring (0-100): RAM(30) + CPU(30) + Disk(20) + Speed(10) + Uptime(10)
- Deployment records link apps to the community nodes that serve them

### quiks-rewards

SPL token (QUIKS) minted as rewards to node operators for uptime.

- 1 QUIKS per 30 heartbeats — operators claim when threshold is met
- Top 100 leaderboard nodes earn epoch bonus distributions (weighted by rank)
- Referral bonus applied as basis points on epoch rewards (max 5%)
- Mint authority is the program PDA — no centralized minting

### referral

On-chain referral tracking with tier-based reward multipliers.

- Users generate unique referral codes (hash of pubkey + timestamp)
- Referees apply codes, authority verifies and distributes rewards
- Tiers: Bronze (1x), Silver (1.25x at 5 refs), Gold (1.5x at 15), Platinum (2x at 50)
- Each referral adds +1% bonus to epoch token distribution (capped at 5%)

## Architecture

```
User deploys app
  -> QuikDB orchestrator selects community nodes (off-chain)
  -> Containers built and started on community nodes (off-chain)
  -> Node registration + deployment records written on-chain
  -> Node operators earn QUIKS tokens for uptime
  -> Referral bonuses distributed on-chain
```

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

## Deploy

```bash
# full setup: airdrop, build, deploy, create token
bash scripts/setup-devnet.sh

# or step by step
anchor build
anchor deploy --provider.cluster devnet
bash scripts/create-quiks-token.sh
```

## Project Structure

```
programs/
  node-registry/    — community node registration, heartbeats, deployments
  quiks-rewards/    — QUIKS token minting and reward distribution
  referral/         — referral codes, verification, tier-based rewards
tests/              — TypeScript test suites for all programs
scripts/            — devnet setup and token creation
```

## Tech Stack

Rust, Anchor 0.30.1, SPL Token, TypeScript, Mocha/Chai

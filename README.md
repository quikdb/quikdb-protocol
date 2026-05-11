# QuikDB Protocol

Solana programs for QuikDB — community-powered cloud infrastructure.

Anyone can contribute their machine as a compute node and earn token rewards. Developers and businesses deploy applications on that shared infrastructure. These Solana programs handle the on-chain layer: node registration, token rewards, and referral tracking.

## Programs

### node-registry

Tracks community nodes that contribute compute to the network. Handles node registration, heartbeat recording, deployment tracking, and performance scoring.

### quiks-rewards

SPL token (QUIKS) minted as rewards to node operators for uptime. 1 QUIKS per 30 heartbeats. Top 100 leaderboard nodes earn additional epoch distributions.

### referral

On-chain referral tracking with tier-based reward multipliers. Referrers earn +1% bonus on token distribution per verified referral (max 5%).

## Architecture

```
User deploys app
  -> QuikDB orchestrator selects community nodes (off-chain)
  -> Containers built and started on community nodes (off-chain)
  -> Node registration + deployment records written to Solana (on-chain)
  -> Node operators earn QUIKS tokens for uptime (on-chain)
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

## Deploy (devnet)

```bash
anchor deploy --provider.cluster devnet
```

## Tech Stack

Rust, Anchor 0.30.1, Solana, SPL Token, TypeScript (tests)

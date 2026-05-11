#!/bin/bash
# Full devnet setup: airdrop SOL, create QUIKS token, initialize all programs.
set -e

CLUSTER="devnet"

echo "=== QuikDB Protocol — Devnet Setup ==="
echo ""

# check balance
BALANCE=$(solana balance --url $CLUSTER | awk '{print $1}')
echo "Wallet: $(solana address)"
echo "Balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 1" | bc -l) )); then
  echo "Requesting airdrop..."
  solana airdrop 2 --url $CLUSTER || solana airdrop 1 --url $CLUSTER
  echo "New balance: $(solana balance --url $CLUSTER)"
fi

echo ""
echo "1. Building programs..."
anchor build

echo ""
echo "2. Deploying to devnet..."
anchor deploy --provider.cluster $CLUSTER

echo ""
echo "3. Creating QUIKS token..."
bash scripts/create-quiks-token.sh

echo ""
echo "=== Setup complete ==="
echo "Run 'anchor test --provider.cluster devnet' to verify"

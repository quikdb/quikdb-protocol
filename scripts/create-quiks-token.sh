#!/bin/bash
# Creates the QUIKS SPL token on Solana devnet.
# Run once to create the mint, then record the address in Anchor.toml and README.

set -e

CLUSTER="devnet"
DECIMALS=6
TOKEN_NAME="QuikDB Token"
TOKEN_SYMBOL="QUIKS"

echo "Creating QUIKS SPL token on $CLUSTER..."
echo "Wallet: $(solana address)"
echo "Balance: $(solana balance --url $CLUSTER)"

# create token mint
MINT=$(spl-token create-token \
  --decimals $DECIMALS \
  --url $CLUSTER \
  2>&1 | grep "Creating token" | awk '{print $3}')

echo ""
echo "QUIKS Token Mint: $MINT"
echo ""

# create token account for authority
ACCOUNT=$(spl-token create-account $MINT --url $CLUSTER 2>&1 | grep "Creating account" | awk '{print $3}')
echo "Token Account: $ACCOUNT"

# mint initial supply (1,000,000 QUIKS for reward pool)
spl-token mint $MINT 1000000 --url $CLUSTER
echo ""
echo "Minted 1,000,000 QUIKS to authority"
echo ""
echo "Supply: $(spl-token supply $MINT --url $CLUSTER)"
echo ""
echo "Add this to Anchor.toml and README.md:"
echo "  QUIKS Mint: $MINT"
echo "  Authority:  $(solana address)"

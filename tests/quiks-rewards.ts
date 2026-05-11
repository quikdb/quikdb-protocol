import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("quiks-rewards", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.QuiksRewards as Program;
  const authority = provider.wallet;

  let rewardState: PublicKey;
  let mint: PublicKey;
  const operator = Keypair.generate();
  let operatorTokenAccount: any;
  let rewardTracker: PublicKey;

  const EPOCH_POOL = 25_000; // 25k tokens per epoch
  const DECIMALS = 1_000_000;

  before(async () => {
    // airdrop to operator
    const sig = await provider.connection.requestAirdrop(
      operator.publicKey,
      2_000_000_000
    );
    await provider.connection.confirmTransaction(sig);

    [rewardState] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward-state")],
      program.programId
    );

    // create QUIKS mint with reward_state as mint authority
    mint = await createMint(
      provider.connection,
      (authority as any).payer,
      rewardState, // mint authority = PDA
      null,
      6
    );

    // create operator token account
    operatorTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer,
      mint,
      operator.publicKey
    );

    [rewardTracker] = PublicKey.findProgramAddressSync(
      [Buffer.from("tracker"), operator.publicKey.toBuffer()],
      program.programId
    );
  });

  it("initializes the reward state", async () => {
    await program.methods
      .initialize(new anchor.BN(EPOCH_POOL), 100)
      .accounts({
        rewardState,
        mint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.rewardState.fetch(rewardState);
    expect(state.epochRewardPool.toNumber()).to.equal(EPOCH_POOL);
    expect(state.topN).to.equal(100);
    expect(state.totalMinted.toNumber()).to.equal(0);
  });

  it("initializes a reward tracker for operator", async () => {
    await program.methods
      .initRewardTracker()
      .accounts({
        rewardState,
        rewardTracker,
        operator: operator.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const tracker = await program.account.rewardTracker.fetch(rewardTracker);
    expect(tracker.operator.toString()).to.equal(operator.publicKey.toString());
    expect(tracker.totalHeartbeats.toNumber()).to.equal(0);
  });

  it("records heartbeats via authority", async () => {
    await program.methods
      .recordHeartbeats(new anchor.BN(45))
      .accounts({
        rewardState,
        rewardTracker,
        authority: authority.publicKey,
      })
      .rpc();

    const tracker = await program.account.rewardTracker.fetch(rewardTracker);
    expect(tracker.totalHeartbeats.toNumber()).to.equal(45);
    expect(tracker.heartbeatsSinceLastClaim.toNumber()).to.equal(45);
  });

  it("claims heartbeat rewards (45 heartbeats = 1 QUIKS, 15 remainder)", async () => {
    await program.methods
      .claimHeartbeatRewards()
      .accounts({
        rewardState,
        rewardTracker,
        mint,
        operatorTokenAccount: operatorTokenAccount.address,
        operator: operator.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([operator])
      .rpc();

    const tracker = await program.account.rewardTracker.fetch(rewardTracker);
    expect(tracker.heartbeatsSinceLastClaim.toNumber()).to.equal(15); // remainder
    expect(tracker.totalClaimed.toNumber()).to.equal(1); // 1 token

    // check actual token balance
    const tokenAccount = await getAccount(
      provider.connection,
      operatorTokenAccount.address
    );
    expect(Number(tokenAccount.amount)).to.equal(1 * DECIMALS);
  });

  it("rejects claim with insufficient heartbeats", async () => {
    // only 15 heartbeats remaining, need 30
    try {
      await program.methods
        .claimHeartbeatRewards()
        .accounts({
          rewardState,
          rewardTracker,
          mint,
          operatorTokenAccount: operatorTokenAccount.address,
          operator: operator.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .signers([operator])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err.toString()).to.include("InsufficientHeartbeats");
    }
  });

  it("distributes epoch bonus to ranked node", async () => {
    await program.methods
      .distributeEpochBonus(
        1,  // rank 1 (top node)
        200 // 2% referral bonus
      )
      .accounts({
        rewardState,
        rewardTracker,
        mint,
        operatorTokenAccount: operatorTokenAccount.address,
        operator: operator.publicKey,
        authority: authority.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const tracker = await program.account.rewardTracker.fetch(rewardTracker);
    expect(tracker.epochBonusClaimed.toNumber()).to.be.greaterThan(0);

    const state = await program.account.rewardState.fetch(rewardState);
    expect(state.currentEpoch.toNumber()).to.equal(1);
  });
});

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("referral", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Referral as Program;
  const authority = provider.wallet;

  let referralState: PublicKey;
  let mint: PublicKey;

  const referrer = Keypair.generate();
  const referee = Keypair.generate();

  let referrerAccount: PublicKey;
  let referrerTokenAccount: any;
  let referralLink: PublicKey;

  const BASE_REWARD = 10_000_000; // 10 QUIKS (6 decimals)

  before(async () => {
    // airdrop to both users
    for (const kp of [referrer, referee]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2_000_000_000
      );
      await provider.connection.confirmTransaction(sig);
    }

    [referralState] = PublicKey.findProgramAddressSync(
      [Buffer.from("referral-state")],
      program.programId
    );

    // create mint with referral_state as authority
    mint = await createMint(
      provider.connection,
      (authority as any).payer,
      referralState,
      null,
      6
    );

    referrerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (authority as any).payer,
      mint,
      referrer.publicKey
    );

    [referrerAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("referral"), referrer.publicKey.toBuffer()],
      program.programId
    );

    [referralLink] = PublicKey.findProgramAddressSync(
      [Buffer.from("ref-link"), referee.publicKey.toBuffer()],
      program.programId
    );
  });

  it("initializes the referral state", async () => {
    await program.methods
      .initialize(new anchor.BN(BASE_REWARD))
      .accounts({
        referralState,
        mint,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.referralState.fetch(referralState);
    expect(state.baseReward.toNumber()).to.equal(BASE_REWARD);
    expect(state.totalReferrals.toNumber()).to.equal(0);
  });

  it("generates a referral code", async () => {
    await program.methods
      .generateCode()
      .accounts({
        referralAccount: referrerAccount,
        user: referrer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([referrer])
      .rpc();

    const account = await program.account.referralAccount.fetch(referrerAccount);
    expect(account.user.toString()).to.equal(referrer.publicKey.toString());
    expect(account.referralCount).to.equal(0);
    expect(account.tier).to.deep.include({ bronze: {} });
  });

  it("applies a referral link", async () => {
    await program.methods
      .applyReferral()
      .accounts({
        referralAccount: referrerAccount,
        referralLink,
        referee: referee.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([referee])
      .rpc();

    const link = await program.account.referralLink.fetch(referralLink);
    expect(link.referee.toString()).to.equal(referee.publicKey.toString());
    expect(link.referrer.toString()).to.equal(referrer.publicKey.toString());
    expect(link.isVerified).to.be.false;
  });

  it("verifies referral and distributes reward", async () => {
    await program.methods
      .verifyAndReward()
      .accounts({
        referralState,
        referralAccount: referrerAccount,
        referralLink,
        mint,
        referrerTokenAccount: referrerTokenAccount.address,
        authority: authority.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const link = await program.account.referralLink.fetch(referralLink);
    expect(link.isVerified).to.be.true;

    const account = await program.account.referralAccount.fetch(referrerAccount);
    expect(account.referralCount).to.equal(1);
    expect(account.totalEarned.toNumber()).to.equal(BASE_REWARD); // bronze = 1x

    // check token balance
    const tokenAccount = await getAccount(
      provider.connection,
      referrerTokenAccount.address
    );
    expect(Number(tokenAccount.amount)).to.equal(BASE_REWARD);

    const state = await program.account.referralState.fetch(referralState);
    expect(state.totalReferrals.toNumber()).to.equal(1);
    expect(state.totalRewardsPaid.toNumber()).to.equal(BASE_REWARD);
  });

  it("rejects double verification", async () => {
    try {
      await program.methods
        .verifyAndReward()
        .accounts({
          referralState,
          referralAccount: referrerAccount,
          referralLink,
          mint,
          referrerTokenAccount: referrerTokenAccount.address,
          authority: authority.publicKey,
          tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        })
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err.toString()).to.include("AlreadyVerified");
    }
  });

  it("returns correct bonus bps", async () => {
    // with 1 referral, bonus should be 100 bps (1%)
    await program.methods
      .getBonusBps()
      .accounts({
        referralAccount: referrerAccount,
      })
      .rpc();

    const account = await program.account.referralAccount.fetch(referrerAccount);
    const expectedBps = Math.min(account.referralCount * 100, 500);
    expect(expectedBps).to.equal(100);
  });
});

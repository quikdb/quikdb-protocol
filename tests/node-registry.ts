import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

describe("node-registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NodeRegistry as Program;
  const authority = provider.wallet;

  let registryState: PublicKey;
  let registryBump: number;

  const operator = Keypair.generate();
  let nodeAccount: PublicKey;

  before(async () => {
    [registryState, registryBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry-state")],
      program.programId
    );
  });

  it("initializes the registry", async () => {
    await program.methods
      .initialize()
      .accounts({
        registryState,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.registryState.fetch(registryState);
    expect(state.authority.toString()).to.equal(authority.publicKey.toString());
    expect(state.totalNodes.toNumber()).to.equal(0);
    expect(state.totalDeployments.toNumber()).to.equal(0);
  });

  it("registers a community node", async () => {
    const metadataHash = Buffer.alloc(32);
    Buffer.from("node-metadata-hash-test").copy(metadataHash);

    [nodeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("node"), operator.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .registerNode(
        Array.from(metadataHash),
        { eks: {} },
        "us-east-1"
      )
      .accounts({
        registryState,
        nodeAccount,
        operator: operator.publicKey,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const node = await program.account.nodeAccount.fetch(nodeAccount);
    expect(node.operator.toString()).to.equal(operator.publicKey.toString());
    expect(node.region).to.equal("us-east-1");
    expect(node.isActive).to.be.true;
    expect(node.totalHeartbeats.toNumber()).to.equal(0);
    expect(node.deploymentsServed.toNumber()).to.equal(0);

    const state = await program.account.registryState.fetch(registryState);
    expect(state.totalNodes.toNumber()).to.equal(1);
  });

  it("records heartbeats and updates score", async () => {
    // fund operator for signing
    const sig = await provider.connection.requestAirdrop(
      operator.publicKey,
      1_000_000_000
    );
    await provider.connection.confirmTransaction(sig);

    await program.methods
      .recordHeartbeat(
        80,   // cpu_idle: 80%
        2048, // memory_available_mb: 2GB
        50,   // disk_available_gb: 50GB
        75    // download_speed_mbps: 75Mbps
      )
      .accounts({
        nodeAccount,
        operator: operator.publicKey,
      })
      .signers([operator])
      .rpc();

    const node = await program.account.nodeAccount.fetch(nodeAccount);
    expect(node.totalHeartbeats.toNumber()).to.equal(1);
    expect(node.score).to.be.greaterThan(0);
    expect(node.lastHeartbeatAt.toNumber()).to.be.greaterThan(0);
  });

  it("records a deployment on a node", async () => {
    const deploymentId = Buffer.alloc(32);
    Buffer.from("deploy-001").copy(deploymentId);

    const appHash = Buffer.alloc(32);
    Buffer.from("app-hash-001").copy(appHash);

    const deployer = Keypair.generate().publicKey;

    const [deploymentRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("deployment"), deploymentId],
      program.programId
    );

    await program.methods
      .recordDeployment(
        Array.from(deploymentId),
        deployer,
        Array.from(appHash)
      )
      .accounts({
        registryState,
        deploymentRecord,
        nodeAccount,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const record = await program.account.deploymentRecord.fetch(deploymentRecord);
    expect(record.deployer.toString()).to.equal(deployer.toString());
    expect(record.status).to.deep.include({ pending: {} });

    const node = await program.account.nodeAccount.fetch(nodeAccount);
    expect(node.deploymentsServed.toNumber()).to.equal(1);

    const state = await program.account.registryState.fetch(registryState);
    expect(state.totalDeployments.toNumber()).to.equal(1);
  });

  it("rejects heartbeat from inactive node", async () => {
    // deactivate first
    await program.methods
      .deactivateNode()
      .accounts({
        nodeAccount,
        operator: operator.publicKey,
      })
      .signers([operator])
      .rpc();

    const node = await program.account.nodeAccount.fetch(nodeAccount);
    expect(node.isActive).to.be.false;

    try {
      await program.methods
        .recordHeartbeat(50, 1024, 20, 50)
        .accounts({
          nodeAccount,
          operator: operator.publicKey,
        })
        .signers([operator])
        .rpc();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err.toString()).to.include("NodeInactive");
    }
  });
});

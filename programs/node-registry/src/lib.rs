use anchor_lang::prelude::*;

declare_id!("QNreg1stryXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod node_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.registry_state;
        state.authority = ctx.accounts.authority.key();
        state.total_nodes = 0;
        state.total_deployments = 0;
        state.bump = ctx.bumps.registry_state;
        Ok(())
    }

    pub fn register_node(
        ctx: Context<RegisterNode>,
        metadata_hash: [u8; 32],
        provider_type: ProviderType,
        region: String,
    ) -> Result<()> {
        require!(region.len() <= 32, ErrorCode::RegionTooLong);

        let node = &mut ctx.accounts.node_account;
        node.operator = ctx.accounts.operator.key();
        node.metadata_hash = metadata_hash;
        node.provider_type = provider_type;
        node.region = region;
        node.total_heartbeats = 0;
        node.uptime_seconds = 0;
        node.score = 0;
        node.is_active = true;
        node.registered_at = Clock::get()?.unix_timestamp;
        node.last_heartbeat_at = 0;
        node.deployments_served = 0;
        node.bump = ctx.bumps.node_account;

        let state = &mut ctx.accounts.registry_state;
        state.total_nodes += 1;

        emit!(NodeRegistered {
            operator: node.operator,
            metadata_hash,
            provider_type,
            timestamp: node.registered_at,
        });

        Ok(())
    }

    pub fn record_heartbeat(
        ctx: Context<RecordHeartbeat>,
        cpu_idle: u8,
        memory_available_mb: u32,
        disk_available_gb: u16,
        download_speed_mbps: u16,
    ) -> Result<()> {
        let node = &mut ctx.accounts.node_account;
        require!(node.is_active, ErrorCode::NodeInactive);

        let now = Clock::get()?.unix_timestamp;

        node.total_heartbeats += 1;
        if node.last_heartbeat_at > 0 {
            let elapsed = now - node.last_heartbeat_at;
            if elapsed <= 300 {
                node.uptime_seconds += elapsed as u64;
            }
        }
        node.last_heartbeat_at = now;

        // score out of 100: RAM(30) + CPU(30) + disk(20) + speed(10) + uptime(10)
        let ram_score: u64 = std::cmp::min((memory_available_mb as u64 * 30) / 4096, 30);
        let cpu_score: u64 = std::cmp::min((cpu_idle as u64 * 30) / 100, 30);
        let disk_score: u64 = std::cmp::min((disk_available_gb as u64 * 20) / 100, 20);
        let speed_score: u64 = std::cmp::min((download_speed_mbps as u64 * 10) / 100, 10);
        let uptime_score: u64 = if node.total_heartbeats > 1000 {
            10
        } else {
            (node.total_heartbeats * 10) / 1000
        };

        node.score = (ram_score + cpu_score + disk_score + speed_score + uptime_score) as u16;

        emit!(HeartbeatRecorded {
            node: node.operator,
            total_heartbeats: node.total_heartbeats,
            score: node.score,
            timestamp: now,
        });

        Ok(())
    }

    pub fn record_deployment(
        ctx: Context<RecordDeployment>,
        deployment_id: [u8; 32],
        deployer: Pubkey,
        app_hash: [u8; 32],
    ) -> Result<()> {
        let record = &mut ctx.accounts.deployment_record;
        record.deployment_id = deployment_id;
        record.deployer = deployer;
        record.node = ctx.accounts.node_account.key();
        record.app_hash = app_hash;
        record.status = DeploymentStatus::Pending;
        record.created_at = Clock::get()?.unix_timestamp;
        record.updated_at = record.created_at;
        record.bump = ctx.bumps.deployment_record;

        let node = &mut ctx.accounts.node_account;
        node.deployments_served += 1;

        let state = &mut ctx.accounts.registry_state;
        state.total_deployments += 1;

        emit!(DeploymentRecorded {
            deployment_id,
            deployer,
            node: node.operator,
            timestamp: record.created_at,
        });

        Ok(())
    }

    pub fn update_deployment_status(
        ctx: Context<UpdateDeploymentStatus>,
        status: DeploymentStatus,
    ) -> Result<()> {
        let record = &mut ctx.accounts.deployment_record;
        record.status = status;
        record.updated_at = Clock::get()?.unix_timestamp;

        emit!(DeploymentStatusUpdated {
            deployment_id: record.deployment_id,
            status,
            timestamp: record.updated_at,
        });

        Ok(())
    }

    pub fn deactivate_node(ctx: Context<DeactivateNode>) -> Result<()> {
        let node = &mut ctx.accounts.node_account;
        node.is_active = false;

        emit!(NodeDeactivated {
            operator: node.operator,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ─── Accounts ───

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RegistryState::INIT_SPACE,
        seeds = [b"registry-state"],
        bump,
    )]
    pub registry_state: Account<'info, RegistryState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterNode<'info> {
    #[account(
        mut,
        seeds = [b"registry-state"],
        bump = registry_state.bump,
        has_one = authority,
    )]
    pub registry_state: Account<'info, RegistryState>,
    #[account(
        init,
        payer = authority,
        space = 8 + NodeAccount::INIT_SPACE,
        seeds = [b"node", operator.key().as_ref()],
        bump,
    )]
    pub node_account: Account<'info, NodeAccount>,
    /// CHECK: the node operator wallet
    pub operator: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordHeartbeat<'info> {
    #[account(
        mut,
        seeds = [b"node", operator.key().as_ref()],
        bump = node_account.bump,
        has_one = operator,
    )]
    pub node_account: Account<'info, NodeAccount>,
    pub operator: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(deployment_id: [u8; 32])]
pub struct RecordDeployment<'info> {
    #[account(
        mut,
        seeds = [b"registry-state"],
        bump = registry_state.bump,
        has_one = authority,
    )]
    pub registry_state: Account<'info, RegistryState>,
    #[account(
        init,
        payer = authority,
        space = 8 + DeploymentRecord::INIT_SPACE,
        seeds = [b"deployment", deployment_id.as_ref()],
        bump,
    )]
    pub deployment_record: Account<'info, DeploymentRecord>,
    #[account(
        mut,
        seeds = [b"node", node_account.operator.as_ref()],
        bump = node_account.bump,
    )]
    pub node_account: Account<'info, NodeAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateDeploymentStatus<'info> {
    #[account(mut)]
    pub deployment_record: Account<'info, DeploymentRecord>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DeactivateNode<'info> {
    #[account(
        mut,
        seeds = [b"node", operator.key().as_ref()],
        bump = node_account.bump,
        has_one = operator,
    )]
    pub node_account: Account<'info, NodeAccount>,
    pub operator: Signer<'info>,
}

// ─── State ───

#[account]
#[derive(InitSpace)]
pub struct RegistryState {
    pub authority: Pubkey,
    pub total_nodes: u64,
    pub total_deployments: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct NodeAccount {
    pub operator: Pubkey,
    pub metadata_hash: [u8; 32],
    pub provider_type: ProviderType,
    #[max_len(32)]
    pub region: String,
    pub total_heartbeats: u64,
    pub uptime_seconds: u64,
    pub score: u16,
    pub is_active: bool,
    pub registered_at: i64,
    pub last_heartbeat_at: i64,
    pub deployments_served: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DeploymentRecord {
    pub deployment_id: [u8; 32],
    pub deployer: Pubkey,
    pub node: Pubkey,
    pub app_hash: [u8; 32],
    pub status: DeploymentStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

// ─── Enums ───

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ProviderType {
    Eks,
    External,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum DeploymentStatus {
    Pending,
    Building,
    Live,
    Failed,
    Stopped,
}

// ─── Events ───

#[event]
pub struct NodeRegistered {
    pub operator: Pubkey,
    pub metadata_hash: [u8; 32],
    pub provider_type: ProviderType,
    pub timestamp: i64,
}

#[event]
pub struct HeartbeatRecorded {
    pub node: Pubkey,
    pub total_heartbeats: u64,
    pub score: u16,
    pub timestamp: i64,
}

#[event]
pub struct DeploymentRecorded {
    pub deployment_id: [u8; 32],
    pub deployer: Pubkey,
    pub node: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DeploymentStatusUpdated {
    pub deployment_id: [u8; 32],
    pub status: DeploymentStatus,
    pub timestamp: i64,
}

#[event]
pub struct NodeDeactivated {
    pub operator: Pubkey,
    pub timestamp: i64,
}

// ─── Errors ───

#[error_code]
pub enum ErrorCode {
    #[msg("Node is not active")]
    NodeInactive,
    #[msg("Region string too long (max 32 chars)")]
    RegionTooLong,
}

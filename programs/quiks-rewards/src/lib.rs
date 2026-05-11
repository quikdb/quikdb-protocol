use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

declare_id!("QKrwrdsXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

const HEARTBEATS_PER_TOKEN: u64 = 30;
const DECIMALS: u64 = 1_000_000; // 6 decimal places

#[program]
pub mod quiks_rewards {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        epoch_reward_pool: u64,
        top_n: u16,
    ) -> Result<()> {
        let state = &mut ctx.accounts.reward_state;
        state.authority = ctx.accounts.authority.key();
        state.mint = ctx.accounts.mint.key();
        state.epoch_reward_pool = epoch_reward_pool;
        state.top_n = top_n;
        state.current_epoch = 0;
        state.total_minted = 0;
        state.bump = ctx.bumps.reward_state;
        Ok(())
    }

    /// Called by the orchestrator after each heartbeat batch.
    /// Mints tokens to operators who crossed the 30-heartbeat threshold.
    pub fn claim_heartbeat_rewards(ctx: Context<ClaimHeartbeatRewards>) -> Result<()> {
        let tracker = &mut ctx.accounts.reward_tracker;
        let node_heartbeats = tracker.heartbeats_since_last_claim;

        let tokens_earned = node_heartbeats / HEARTBEATS_PER_TOKEN;
        require!(tokens_earned > 0, ErrorCode::InsufficientHeartbeats);

        let remainder = node_heartbeats % HEARTBEATS_PER_TOKEN;
        tracker.heartbeats_since_last_claim = remainder;
        tracker.total_claimed += tokens_earned;
        tracker.last_claimed_at = Clock::get()?.unix_timestamp;

        let mint_amount = tokens_earned * DECIMALS;

        let state = &ctx.accounts.reward_state;
        let seeds = &[b"reward-state".as_ref(), &[state.bump]];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.operator_token_account.to_account_info(),
                    authority: ctx.accounts.reward_state.to_account_info(),
                },
                signer_seeds,
            ),
            mint_amount,
        )?;

        let state = &mut ctx.accounts.reward_state;
        state.total_minted += mint_amount;

        emit!(HeartbeatRewardClaimed {
            operator: ctx.accounts.operator.key(),
            tokens_earned,
            mint_amount,
            remainder_heartbeats: remainder,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Record heartbeats for a node operator (called by authority after off-chain heartbeat verification)
    pub fn record_heartbeats(
        ctx: Context<RecordHeartbeats>,
        count: u64,
    ) -> Result<()> {
        let tracker = &mut ctx.accounts.reward_tracker;
        tracker.heartbeats_since_last_claim += count;
        tracker.total_heartbeats += count;

        Ok(())
    }

    /// Initialize a reward tracker for a new node operator
    pub fn init_reward_tracker(ctx: Context<InitRewardTracker>) -> Result<()> {
        let tracker = &mut ctx.accounts.reward_tracker;
        tracker.operator = ctx.accounts.operator.key();
        tracker.total_heartbeats = 0;
        tracker.heartbeats_since_last_claim = 0;
        tracker.total_claimed = 0;
        tracker.epoch_bonus_claimed = 0;
        tracker.last_claimed_at = 0;
        tracker.bump = ctx.bumps.reward_tracker;
        Ok(())
    }

    /// Distribute epoch bonus to top-N leaderboard nodes.
    /// Authority calls this once per epoch with the ranked list.
    pub fn distribute_epoch_bonus(
        ctx: Context<DistributeEpochBonus>,
        rank: u16,
        referral_bonus_bps: u16,
    ) -> Result<()> {
        let state = &ctx.accounts.reward_state;
        require!(rank > 0 && rank <= state.top_n, ErrorCode::InvalidRank);
        require!(referral_bonus_bps <= 500, ErrorCode::BonusTooHigh); // max 5%

        // linear distribution: rank 1 gets most, rank N gets least
        // share = pool * (N - rank + 1) / sum(1..N)
        let n = state.top_n as u64;
        let weight = n - rank as u64 + 1;
        let total_weight = n * (n + 1) / 2;
        let base_amount = (state.epoch_reward_pool * weight * DECIMALS) / total_weight;

        // apply referral bonus
        let bonus = (base_amount * referral_bonus_bps as u64) / 10_000;
        let total_amount = base_amount + bonus;

        let seeds = &[b"reward-state".as_ref(), &[state.bump]];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.operator_token_account.to_account_info(),
                    authority: ctx.accounts.reward_state.to_account_info(),
                },
                signer_seeds,
            ),
            total_amount,
        )?;

        let tracker = &mut ctx.accounts.reward_tracker;
        tracker.epoch_bonus_claimed += total_amount;

        let state = &mut ctx.accounts.reward_state;
        state.total_minted += total_amount;
        state.current_epoch += 1;

        emit!(EpochBonusDistributed {
            operator: ctx.accounts.operator.key(),
            rank,
            base_amount,
            referral_bonus_bps,
            total_amount,
            epoch: state.current_epoch,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn update_epoch_pool(ctx: Context<UpdateConfig>, new_pool: u64) -> Result<()> {
        ctx.accounts.reward_state.epoch_reward_pool = new_pool;
        Ok(())
    }
}

// ─── Accounts ───

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + RewardState::INIT_SPACE,
        seeds = [b"reward-state"],
        bump,
    )]
    pub reward_state: Account<'info, RewardState>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitRewardTracker<'info> {
    #[account(
        seeds = [b"reward-state"],
        bump = reward_state.bump,
        has_one = authority,
    )]
    pub reward_state: Account<'info, RewardState>,
    #[account(
        init,
        payer = authority,
        space = 8 + RewardTracker::INIT_SPACE,
        seeds = [b"tracker", operator.key().as_ref()],
        bump,
    )]
    pub reward_tracker: Account<'info, RewardTracker>,
    /// CHECK: node operator wallet
    pub operator: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordHeartbeats<'info> {
    #[account(
        seeds = [b"reward-state"],
        bump = reward_state.bump,
        has_one = authority,
    )]
    pub reward_state: Account<'info, RewardState>,
    #[account(
        mut,
        seeds = [b"tracker", reward_tracker.operator.as_ref()],
        bump = reward_tracker.bump,
    )]
    pub reward_tracker: Account<'info, RewardTracker>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimHeartbeatRewards<'info> {
    #[account(
        mut,
        seeds = [b"reward-state"],
        bump = reward_state.bump,
    )]
    pub reward_state: Account<'info, RewardState>,
    #[account(
        mut,
        seeds = [b"tracker", operator.key().as_ref()],
        bump = reward_tracker.bump,
        has_one = operator,
    )]
    pub reward_tracker: Account<'info, RewardTracker>,
    #[account(
        mut,
        constraint = mint.key() == reward_state.mint,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = operator_token_account.owner == operator.key(),
        constraint = operator_token_account.mint == mint.key(),
    )]
    pub operator_token_account: Account<'info, TokenAccount>,
    pub operator: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeEpochBonus<'info> {
    #[account(
        mut,
        seeds = [b"reward-state"],
        bump = reward_state.bump,
        has_one = authority,
    )]
    pub reward_state: Account<'info, RewardState>,
    #[account(
        mut,
        seeds = [b"tracker", operator.key().as_ref()],
        bump = reward_tracker.bump,
        has_one = operator,
    )]
    pub reward_tracker: Account<'info, RewardTracker>,
    #[account(
        mut,
        constraint = mint.key() == reward_state.mint,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = operator_token_account.owner == operator.key(),
        constraint = operator_token_account.mint == mint.key(),
    )]
    pub operator_token_account: Account<'info, TokenAccount>,
    /// CHECK: node operator wallet
    pub operator: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"reward-state"],
        bump = reward_state.bump,
        has_one = authority,
    )]
    pub reward_state: Account<'info, RewardState>,
    pub authority: Signer<'info>,
}

// ─── State ───

#[account]
#[derive(InitSpace)]
pub struct RewardState {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub epoch_reward_pool: u64,
    pub top_n: u16,
    pub current_epoch: u64,
    pub total_minted: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RewardTracker {
    pub operator: Pubkey,
    pub total_heartbeats: u64,
    pub heartbeats_since_last_claim: u64,
    pub total_claimed: u64,
    pub epoch_bonus_claimed: u64,
    pub last_claimed_at: i64,
    pub bump: u8,
}

// ─── Events ───

#[event]
pub struct HeartbeatRewardClaimed {
    pub operator: Pubkey,
    pub tokens_earned: u64,
    pub mint_amount: u64,
    pub remainder_heartbeats: u64,
    pub timestamp: i64,
}

#[event]
pub struct EpochBonusDistributed {
    pub operator: Pubkey,
    pub rank: u16,
    pub base_amount: u64,
    pub referral_bonus_bps: u16,
    pub total_amount: u64,
    pub epoch: u64,
    pub timestamp: i64,
}

// ─── Errors ───

#[error_code]
pub enum ErrorCode {
    #[msg("Not enough heartbeats to claim (need at least 30)")]
    InsufficientHeartbeats,
    #[msg("Rank must be between 1 and top_n")]
    InvalidRank,
    #[msg("Referral bonus cannot exceed 500 bps (5%)")]
    BonusTooHigh,
}

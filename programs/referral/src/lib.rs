use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

declare_id!("QKrefrrXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

const MAX_BONUS_BPS: u16 = 500; // 5%
const BPS_PER_REFERRAL: u16 = 100; // 1% per referral

#[program]
pub mod referral {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, base_reward: u64) -> Result<()> {
        let state = &mut ctx.accounts.referral_state;
        state.authority = ctx.accounts.authority.key();
        state.mint = ctx.accounts.mint.key();
        state.base_reward = base_reward;
        state.total_referrals = 0;
        state.total_rewards_paid = 0;
        state.bump = ctx.bumps.referral_state;
        Ok(())
    }

    /// Generate a referral code for a user. Code = hash of user + timestamp.
    pub fn generate_code(ctx: Context<GenerateCode>) -> Result<()> {
        let referral_account = &mut ctx.accounts.referral_account;
        let user = ctx.accounts.user.key();
        let now = Clock::get()?.unix_timestamp;

        let code = anchor_lang::solana_program::hash::hashv(&[
            user.as_ref(),
            &now.to_le_bytes(),
        ]);

        referral_account.user = user;
        referral_account.code = code.to_bytes();
        referral_account.referral_count = 0;
        referral_account.tier = ReferralTier::Bronze;
        referral_account.total_earned = 0;
        referral_account.created_at = now;
        referral_account.bump = ctx.bumps.referral_account;

        emit!(ReferralCodeGenerated {
            user,
            code: code.to_bytes(),
            timestamp: now,
        });

        Ok(())
    }

    /// Apply a referral: link referee to referrer.
    pub fn apply_referral(ctx: Context<ApplyReferral>) -> Result<()> {
        let link = &mut ctx.accounts.referral_link;
        link.referee = ctx.accounts.referee.key();
        link.referrer = ctx.accounts.referral_account.user;
        link.is_verified = false;
        link.applied_at = Clock::get()?.unix_timestamp;
        link.verified_at = 0;
        link.bump = ctx.bumps.referral_link;

        emit!(ReferralApplied {
            referee: link.referee,
            referrer: link.referrer,
            timestamp: link.applied_at,
        });

        Ok(())
    }

    /// Verify a referral and distribute reward to referrer.
    pub fn verify_and_reward(ctx: Context<VerifyAndReward>) -> Result<()> {
        let link = &mut ctx.accounts.referral_link;
        require!(!link.is_verified, ErrorCode::AlreadyVerified);

        link.is_verified = true;
        link.verified_at = Clock::get()?.unix_timestamp;

        let referral_account = &mut ctx.accounts.referral_account;
        referral_account.referral_count += 1;

        // update tier
        let count = referral_account.referral_count;
        referral_account.tier = if count >= 50 {
            ReferralTier::Platinum
        } else if count >= 15 {
            ReferralTier::Gold
        } else if count >= 5 {
            ReferralTier::Silver
        } else {
            ReferralTier::Bronze
        };

        // calculate reward with tier multiplier
        let state = &ctx.accounts.referral_state;
        let multiplier = match referral_account.tier {
            ReferralTier::Bronze => 100,   // 1x
            ReferralTier::Silver => 125,   // 1.25x
            ReferralTier::Gold => 150,     // 1.5x
            ReferralTier::Platinum => 200, // 2x
        };
        let reward = (state.base_reward * multiplier) / 100;

        // mint reward tokens
        let seeds = &[b"referral-state".as_ref(), &[state.bump]];
        let signer_seeds = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.referrer_token_account.to_account_info(),
                    authority: ctx.accounts.referral_state.to_account_info(),
                },
                signer_seeds,
            ),
            reward,
        )?;

        referral_account.total_earned += reward;

        let state = &mut ctx.accounts.referral_state;
        state.total_referrals += 1;
        state.total_rewards_paid += reward;

        emit!(ReferralVerified {
            referee: link.referee,
            referrer: referral_account.user,
            tier: referral_account.tier,
            reward,
            timestamp: link.verified_at,
        });

        Ok(())
    }

    /// Get the bonus basis points for a referrer (used by rewards program)
    pub fn get_bonus_bps(ctx: Context<GetBonusBps>) -> Result<()> {
        let account = &ctx.accounts.referral_account;
        let bps = std::cmp::min(
            account.referral_count as u16 * BPS_PER_REFERRAL,
            MAX_BONUS_BPS,
        );

        emit!(BonusQueried {
            user: account.user,
            referral_count: account.referral_count,
            bonus_bps: bps,
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
        space = 8 + ReferralState::INIT_SPACE,
        seeds = [b"referral-state"],
        bump,
    )]
    pub referral_state: Account<'info, ReferralState>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GenerateCode<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + ReferralAccount::INIT_SPACE,
        seeds = [b"referral", user.key().as_ref()],
        bump,
    )]
    pub referral_account: Account<'info, ReferralAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApplyReferral<'info> {
    #[account(
        seeds = [b"referral", referral_account.user.as_ref()],
        bump = referral_account.bump,
    )]
    pub referral_account: Account<'info, ReferralAccount>,
    #[account(
        init,
        payer = referee,
        space = 8 + ReferralLink::INIT_SPACE,
        seeds = [b"ref-link", referee.key().as_ref()],
        bump,
    )]
    pub referral_link: Account<'info, ReferralLink>,
    #[account(mut)]
    pub referee: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VerifyAndReward<'info> {
    #[account(
        mut,
        seeds = [b"referral-state"],
        bump = referral_state.bump,
        has_one = authority,
    )]
    pub referral_state: Account<'info, ReferralState>,
    #[account(
        mut,
        seeds = [b"referral", referral_account.user.as_ref()],
        bump = referral_account.bump,
    )]
    pub referral_account: Account<'info, ReferralAccount>,
    #[account(
        mut,
        seeds = [b"ref-link", referral_link.referee.as_ref()],
        bump = referral_link.bump,
    )]
    pub referral_link: Account<'info, ReferralLink>,
    #[account(
        mut,
        constraint = mint.key() == referral_state.mint,
    )]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        constraint = referrer_token_account.owner == referral_account.user,
        constraint = referrer_token_account.mint == mint.key(),
    )]
    pub referrer_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct GetBonusBps<'info> {
    #[account(
        seeds = [b"referral", referral_account.user.as_ref()],
        bump = referral_account.bump,
    )]
    pub referral_account: Account<'info, ReferralAccount>,
}

// ─── State ───

#[account]
#[derive(InitSpace)]
pub struct ReferralState {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub base_reward: u64,
    pub total_referrals: u64,
    pub total_rewards_paid: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReferralAccount {
    pub user: Pubkey,
    pub code: [u8; 32],
    pub referral_count: u32,
    pub tier: ReferralTier,
    pub total_earned: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReferralLink {
    pub referee: Pubkey,
    pub referrer: Pubkey,
    pub is_verified: bool,
    pub applied_at: i64,
    pub verified_at: i64,
    pub bump: u8,
}

// ─── Enums ───

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ReferralTier {
    Bronze,
    Silver,
    Gold,
    Platinum,
}

// ─── Events ───

#[event]
pub struct ReferralCodeGenerated {
    pub user: Pubkey,
    pub code: [u8; 32],
    pub timestamp: i64,
}

#[event]
pub struct ReferralApplied {
    pub referee: Pubkey,
    pub referrer: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ReferralVerified {
    pub referee: Pubkey,
    pub referrer: Pubkey,
    pub tier: ReferralTier,
    pub reward: u64,
    pub timestamp: i64,
}

#[event]
pub struct BonusQueried {
    pub user: Pubkey,
    pub referral_count: u32,
    pub bonus_bps: u16,
}

// ─── Errors ───

#[error_code]
pub enum ErrorCode {
    #[msg("Referral has already been verified")]
    AlreadyVerified,
}

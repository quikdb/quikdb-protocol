import { SubscriptionTier } from './deployment';

export interface TierLimits {
  maxContainers: number;
  cpuPerContainer: string;
  memoryPerContainer: string;
  storagePerContainer: string;
  totalRamCap: string;
  totalCpuCap: string;
  maxReplicas: number;
  customDomains: number | 'unlimited';
  alwaysOn: boolean;
  logRetentionDays: number;
  egressCap: string;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  hobby: {
    maxContainers: 3,
    cpuPerContainer: '0.5 vCPU',
    memoryPerContainer: '512 MB',
    storagePerContainer: '2 GB',
    totalRamCap: '1,536 MB',
    totalCpuCap: '1.5 vCPU',
    maxReplicas: 1,
    customDomains: 0,
    alwaysOn: false,
    logRetentionDays: 1,
    egressCap: '50 GB',
  },
  builder: {
    maxContainers: 5,
    cpuPerContainer: '1 vCPU',
    memoryPerContainer: '1,024 MB',
    storagePerContainer: '5 GB',
    totalRamCap: '5,120 MB',
    totalCpuCap: '5 vCPU',
    maxReplicas: 2,
    customDomains: 1,
    alwaysOn: false,
    logRetentionDays: 3,
    egressCap: '200 GB',
  },
  startup: {
    maxContainers: 10,
    cpuPerContainer: '2 vCPU',
    memoryPerContainer: '2,048 MB',
    storagePerContainer: '10 GB',
    totalRamCap: '20,480 MB',
    totalCpuCap: '20 vCPU',
    maxReplicas: 3,
    customDomains: 5,
    alwaysOn: true,
    logRetentionDays: 7,
    egressCap: '1 TB',
  },
  team: {
    maxContainers: 20,
    cpuPerContainer: '2 vCPU',
    memoryPerContainer: '4,096 MB',
    storagePerContainer: '20 GB',
    totalRamCap: '40,960 MB',
    totalCpuCap: '40 vCPU',
    maxReplicas: 5,
    customDomains: 'unlimited',
    alwaysOn: true,
    logRetentionDays: 30,
    egressCap: '5 TB',
  },
};

export interface Subscription {
  tier: SubscriptionTier;
  status: 'active' | 'cancelling' | 'cancelled' | 'past_due' | 'expired';
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  usage: {
    activeContainers: number;
    totalRam: number;
    totalCpu: number;
    totalStorage: number;
  };
}

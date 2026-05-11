export type DeploymentStatus =
  | 'pending'
  | 'reserving_nodes'
  | 'building'
  | 'deploying'
  | 'live'
  | 'partial'
  | 'failed'
  | 'stopped'
  | 'sleeping'
  | 'waking'
  | 'restarting'
  | 'queued';

export type SubscriptionTier = 'hobby' | 'builder' | 'startup' | 'team';

export interface Replica {
  nodeId: string;
  status: 'pending' | 'building' | 'live' | 'failed';
  tunnelUrl: string;
  internalPort: number;
  commitHash?: string;
  region?: string;
}

export interface AutoDeploy {
  enabled: boolean;
  branch: string;
  lastDeployedCommit: string | null;
  lastDeployTriggeredAt: string | null;
}

export interface CustomDomain {
  id: string;
  domain: string;
  status: 'pending' | 'dns_verified' | 'ssl_provisioning' | 'active' | 'failed';
  createdAt: string;
}

export interface Deployment {
  _id: string;
  deploymentId: string;
  walletAddress: string;
  name: string;
  subdomain: string;
  repositoryUrl: string;
  repositoryBranch: string;
  status: DeploymentStatus;
  replicas: Replica[];
  replicaCount: number;
  config: {
    buildCommand: string;
    startCommand: string;
    port: number;
    cpu: string;
    memory: string;
    storage: string;
  };
  autoDeploy: AutoDeploy;
  customDomains: CustomDomain[];
  tier: SubscriptionTier;
  commitHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentLog {
  _id: string;
  deploymentId: string;
  type: 'build' | 'runtime' | 'system';
  message: string;
  timestamp: string;
  errorClass?: 'USER_ERROR' | 'SYSTEM_TRANSIENT' | 'SYSTEM_FAULT';
}

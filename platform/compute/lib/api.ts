import axios from 'axios';
import { parseCookies } from 'nookies';
import type { Deployment, DeploymentLog } from '../types/deployment';
import type { Subscription } from '../types/subscription';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://device.quikdb.net';

function getClient() {
  const cookies = parseCookies();
  return axios.create({
    baseURL: `${API_URL}/api/v1`,
    headers: {
      Authorization: `Bearer ${cookies.compute_access_token}`,
    },
  });
}

// ─── Deployments ───

export async function listDeployments(): Promise<Deployment[]> {
  const { data } = await getClient().get('/deployment/list');
  return data.deployments;
}

export async function getDeployment(id: string): Promise<Deployment> {
  const { data } = await getClient().get(`/deployment/${id}`);
  return data.deployment;
}

export async function createDeployment(params: {
  name: string;
  repositoryUrl: string;
  repositoryBranch: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  cpu: string;
  memory: string;
  replicaCount: number;
}): Promise<{ deploymentId: string; subdomain: string }> {
  const { data } = await getClient().post('/deployment/create', params);
  return data;
}

export async function stopDeployment(id: string): Promise<void> {
  await getClient().post(`/deployment/${id}/stop`);
}

export async function restartDeployment(id: string): Promise<void> {
  await getClient().post(`/deployment/${id}/restart`);
}

export async function redeployDeployment(id: string): Promise<void> {
  await getClient().post(`/deployment/${id}/redeploy`);
}

// ─── Logs ───

export async function getDeploymentLogs(
  id: string,
  type?: 'build' | 'runtime'
): Promise<DeploymentLog[]> {
  const params = type ? { type } : {};
  const { data } = await getClient().get(`/deployment/${id}/logs`, { params });
  return data.logs;
}

// ─── Config Detection ───

export async function detectConfig(
  repositoryUrl: string,
  branch: string
): Promise<{
  buildCommand: string;
  startCommand: string;
  port: number;
  stack: string;
  configWarnings: string[];
}> {
  const { data } = await getClient().post('/deployment/detect-config', {
    repositoryUrl,
    branch,
  });
  return data;
}

// ─── Git ───

export async function listRepos(): Promise<
  Array<{ name: string; fullName: string; defaultBranch: string; private: boolean }>
> {
  const { data } = await getClient().get('/git/repos');
  return data.repos;
}

export async function listBranches(
  owner: string,
  repo: string
): Promise<Array<{ name: string }>> {
  const { data } = await getClient().get(`/git/repos/${owner}/${repo}/branches`);
  return data.branches;
}

// ─── Subscription ───

export async function getSubscription(): Promise<Subscription> {
  const { data } = await getClient().get('/subscription');
  return data;
}

export async function createCheckout(
  tier: string
): Promise<{ sessionId: string; url: string }> {
  const { data } = await getClient().post('/subscription/checkout', { tier });
  return data;
}

// ─── Environment Variables ───

export async function getEnvVars(
  deploymentId: string
): Promise<Array<{ key: string; createdAt: string }>> {
  const { data } = await getClient().get(`/deployment/${deploymentId}/env`);
  return data.variables;
}

export async function setEnvVars(
  deploymentId: string,
  variables: Record<string, string>
): Promise<void> {
  await getClient().put(`/deployment/${deploymentId}/env`, { variables });
}

// ─── Custom Domains ───

export async function addDomain(
  deploymentId: string,
  domain: string
): Promise<{ dnsInstructions: string }> {
  const { data } = await getClient().post(
    `/deployments/${deploymentId}/domains`,
    { domain }
  );
  return data;
}

export async function verifyDomain(
  deploymentId: string,
  domainId: string
): Promise<{ status: string }> {
  const { data } = await getClient().post(
    `/deployments/${deploymentId}/domains/${domainId}/verify`
  );
  return data;
}

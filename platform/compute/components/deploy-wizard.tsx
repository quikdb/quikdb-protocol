'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createDeployment, detectConfig, listRepos, listBranches } from '../lib/api';

type Step = 'repo' | 'config' | 'review';

interface RepoSelection {
  fullName: string;
  defaultBranch: string;
}

interface DeployConfig {
  name: string;
  repositoryUrl: string;
  repositoryBranch: string;
  buildCommand: string;
  startCommand: string;
  port: number;
  cpu: string;
  memory: string;
  replicaCount: number;
}

export function DeployWizard({ onComplete }: { onComplete: (id: string) => void }) {
  const [step, setStep] = useState<Step>('repo');
  const [selectedRepo, setSelectedRepo] = useState<RepoSelection | null>(null);
  const [config, setConfig] = useState<DeployConfig>({
    name: '',
    repositoryUrl: '',
    repositoryBranch: '',
    buildCommand: '',
    startCommand: '',
    port: 3000,
    cpu: '0.5',
    memory: '512',
    replicaCount: 1,
  });
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);

  const deploy = useMutation({
    mutationFn: createDeployment,
    onSuccess: (data) => onComplete(data.deploymentId),
  });

  const handleRepoSelect = async (repo: RepoSelection) => {
    setSelectedRepo(repo);

    const repoUrl = `https://github.com/${repo.fullName}`;
    setConfig((c) => ({
      ...c,
      name: repo.fullName.split('/')[1],
      repositoryUrl: repoUrl,
      repositoryBranch: repo.defaultBranch,
    }));

    // auto-detect build config
    try {
      const detected = await detectConfig(repoUrl, repo.defaultBranch);
      setConfig((c) => ({
        ...c,
        buildCommand: detected.buildCommand,
        startCommand: detected.startCommand,
        port: detected.port,
      }));
      setConfigWarnings(detected.configWarnings || []);
    } catch {
      // user will configure manually
    }

    setStep('config');
  };

  const handleDeploy = () => {
    deploy.mutate(config);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-4">
        {(['repo', 'config', 'review'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step === s
                  ? 'bg-white text-black'
                  : i < ['repo', 'config', 'review'].indexOf(step)
                  ? 'bg-green-500 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {i + 1}
            </div>
            <span className={step === s ? 'text-white' : 'text-zinc-500'}>
              {s === 'repo' ? 'Select Repo' : s === 'config' ? 'Configure' : 'Review'}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: Repo selection */}
      {step === 'repo' && (
        <RepoSelector onSelect={handleRepoSelect} />
      )}

      {/* Step 2: Configuration */}
      {step === 'config' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-white">Configure Deployment</h2>

          {configWarnings.length > 0 && (
            <div className="rounded-md bg-yellow-900/30 border border-yellow-700 p-3">
              {configWarnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-400">{w}</p>
              ))}
            </div>
          )}

          <label className="block">
            <span className="text-sm text-zinc-400">App Name</span>
            <input
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-white"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-400">Build Command</span>
            <input
              value={config.buildCommand}
              onChange={(e) => setConfig({ ...config, buildCommand: e.target.value })}
              className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-white font-mono text-sm"
              placeholder="npm run build"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-400">Start Command</span>
            <input
              value={config.startCommand}
              onChange={(e) => setConfig({ ...config, startCommand: e.target.value })}
              className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-white font-mono text-sm"
              placeholder="npm start"
            />
          </label>

          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm text-zinc-400">Port</span>
              <input
                type="number"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">CPU (vCPU)</span>
              <input
                value={config.cpu}
                onChange={(e) => setConfig({ ...config, cpu: e.target.value })}
                className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-white"
              />
            </label>
            <label className="block">
              <span className="text-sm text-zinc-400">Memory (MB)</span>
              <input
                value={config.memory}
                onChange={(e) => setConfig({ ...config, memory: e.target.value })}
                className="mt-1 w-full rounded-md bg-zinc-800 px-3 py-2 text-white"
              />
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setStep('repo')}
              className="rounded-md bg-zinc-800 px-4 py-2 text-white"
            >
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              className="rounded-md bg-white px-4 py-2 font-medium text-black"
            >
              Review
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-white">Review & Deploy</h2>

          <div className="rounded-md bg-zinc-800 p-4 space-y-2 text-sm">
            <Row label="Repository" value={selectedRepo?.fullName || ''} />
            <Row label="Branch" value={config.repositoryBranch} />
            <Row label="Build" value={config.buildCommand} mono />
            <Row label="Start" value={config.startCommand} mono />
            <Row label="Port" value={String(config.port)} />
            <Row label="Resources" value={`${config.cpu} vCPU / ${config.memory} MB`} />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setStep('config')}
              className="rounded-md bg-zinc-800 px-4 py-2 text-white"
            >
              Back
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploy.isPending}
              className="rounded-md bg-white px-4 py-2 font-medium text-black disabled:opacity-50"
            >
              {deploy.isPending ? 'Deploying...' : 'Deploy to Community Nodes'}
            </button>
          </div>

          {deploy.isError && (
            <p className="text-sm text-red-400">
              {(deploy.error as any)?.response?.data?.message || 'Deploy failed'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className={`text-white ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function RepoSelector({ onSelect }: { onSelect: (repo: RepoSelection) => void }) {
  // simplified — full version uses useQuery + search + pagination
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium text-white">Select Repository</h2>
      <p className="text-sm text-zinc-400">
        Connect your GitHub account and select a repository to deploy.
      </p>
      <div className="rounded-md border border-dashed border-zinc-700 p-8 text-center text-zinc-500">
        Repository list loads from GitHub OAuth connection
      </div>
    </div>
  );
}

'use client';

import { ExternalLink, RotateCw, Square, RefreshCw } from 'lucide-react';
import type { Deployment, DeploymentStatus } from '../types/deployment';

const STATUS_COLORS: Record<DeploymentStatus, string> = {
  live: 'bg-green-500',
  partial: 'bg-yellow-500',
  building: 'bg-blue-500 animate-pulse',
  deploying: 'bg-blue-500 animate-pulse',
  pending: 'bg-gray-400 animate-pulse',
  reserving_nodes: 'bg-gray-400 animate-pulse',
  restarting: 'bg-blue-500 animate-pulse',
  waking: 'bg-yellow-500 animate-pulse',
  sleeping: 'bg-gray-500',
  queued: 'bg-gray-400',
  failed: 'bg-red-500',
  stopped: 'bg-gray-600',
};

interface DeploymentCardProps {
  deployment: Deployment;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onRedeploy: (id: string) => void;
}

export function DeploymentCard({
  deployment,
  onStop,
  onRestart,
  onRedeploy,
}: DeploymentCardProps) {
  const isActive = ['live', 'partial'].includes(deployment.status);
  const isInProgress = [
    'pending',
    'reserving_nodes',
    'building',
    'deploying',
    'restarting',
    'waking',
  ].includes(deployment.status);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[deployment.status]}`} />
          <div>
            <h3 className="font-medium text-white">{deployment.name}</h3>
            <p className="text-sm text-zinc-400">
              {deployment.subdomain}.quikdb.net
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isActive && (
            <a
              href={`https://${deployment.subdomain}.quikdb.net`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <ExternalLink size={16} />
            </a>
          )}

          {isActive && (
            <>
              <button
                onClick={() => onRestart(deployment.deploymentId)}
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                title="Restart (zero-downtime)"
              >
                <RotateCw size={16} />
              </button>
              <button
                onClick={() => onStop(deployment.deploymentId)}
                className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                title="Stop"
              >
                <Square size={16} />
              </button>
            </>
          )}

          {['failed', 'stopped'].includes(deployment.status) && (
            <button
              onClick={() => onRedeploy(deployment.deploymentId)}
              className="rounded-md p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              title="Redeploy"
            >
              <RefreshCw size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
        <span>{deployment.repositoryBranch}</span>
        <span>{deployment.replicas.filter((r) => r.status === 'live').length}/{deployment.replicaCount} replicas</span>
        <span>{deployment.tier}</span>
        {deployment.commitHash && (
          <span className="font-mono">{deployment.commitHash.slice(0, 7)}</span>
        )}
        {isInProgress && <span className="text-blue-400">In progress...</span>}
      </div>
    </div>
  );
}

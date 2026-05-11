'use client';

import { useParams } from 'next/navigation';
import { useDeployment, useStopDeployment, useRestartDeployment } from '../../../hooks/use-deployment';
import { useDeploymentLogs } from '../../../hooks/use-logs';
import { LogViewer } from '../../../components/log-viewer';
import { parseCookies } from 'nookies';
import { ExternalLink, RotateCw, Square, Globe, GitBranch } from 'lucide-react';

export default function DeploymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deployment, isLoading } = useDeployment(id);
  const cookies = parseCookies();
  const { logs, connected } = useDeploymentLogs(id, cookies.compute_access_token);
  const stop = useStopDeployment();
  const restart = useRestartDeployment();

  if (isLoading || !deployment) {
    return <div className="animate-pulse h-96 rounded-lg bg-zinc-800" />;
  }

  const isLive = deployment.status === 'live' || deployment.status === 'partial';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{deployment.name}</h1>
          <p className="text-sm text-zinc-400">
            {deployment.subdomain}.quikdb.net
          </p>
        </div>
        <div className="flex gap-2">
          {isLive && (
            <>
              <a
                href={`https://${deployment.subdomain}.quikdb.net`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                <ExternalLink size={14} /> Visit
              </a>
              <button
                onClick={() => restart.mutate(id)}
                className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm text-white hover:bg-zinc-700"
              >
                <RotateCw size={14} /> Restart
              </button>
              <button
                onClick={() => stop.mutate(id)}
                className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-sm text-red-400 hover:bg-zinc-700"
              >
                <Square size={14} /> Stop
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <InfoCard icon={<StatusDot status={deployment.status} />} label="Status" value={deployment.status} />
        <InfoCard icon={<GitBranch size={14} />} label="Branch" value={deployment.repositoryBranch} />
        <InfoCard icon={<Globe size={14} />} label="Replicas" value={`${deployment.replicas.filter(r => r.status === 'live').length}/${deployment.replicaCount}`} />
        <InfoCard label="Tier" value={deployment.tier} />
      </div>

      {/* Replicas */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Replicas</h2>
        <div className="space-y-2">
          {deployment.replicas.map((replica, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-md bg-zinc-900 border border-zinc-800 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <StatusDot status={replica.status} />
                <span className="text-sm text-white">Replica {i + 1}</span>
                {replica.region && (
                  <span className="text-xs text-zinc-500">{replica.region}</span>
                )}
              </div>
              {replica.commitHash && (
                <span className="font-mono text-xs text-zinc-500">
                  {replica.commitHash.slice(0, 7)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Logs */}
      <LogViewer logs={logs} connected={connected} />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'live'
      ? 'bg-green-500'
      : status === 'failed'
      ? 'bg-red-500'
      : 'bg-yellow-500 animate-pulse';
  return <div className={`h-2 w-2 rounded-full ${color}`} />;
}

function InfoCard({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-white capitalize">{value}</p>
    </div>
  );
}

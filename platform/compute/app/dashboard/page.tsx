'use client';

import { useDeployments } from '../../hooks/use-deployment';
import { DeploymentCard } from '../../components/deployment-card';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { data: deployments, isLoading } = useDeployments();

  const liveCount = deployments?.filter((d) => d.status === 'live').length || 0;
  const totalReplicas =
    deployments?.reduce(
      (sum, d) => sum + d.replicas.filter((r) => r.status === 'live').length,
      0
    ) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <button
          onClick={() => router.push('/builder/create')}
          className="flex items-center gap-2 rounded-md bg-white px-4 py-2 font-medium text-black"
        >
          <Plus size={16} />
          New Deployment
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Deployments" value={deployments?.length || 0} />
        <StatCard label="Live" value={liveCount} />
        <StatCard label="Active Replicas" value={totalReplicas} />
      </div>

      {/* Deployment list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      ) : deployments?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-700 p-12 text-center">
          <p className="text-zinc-400">No deployments yet</p>
          <p className="mt-1 text-sm text-zinc-600">
            Deploy your first app to community nodes
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {deployments?.map((d) => (
            <DeploymentCard
              key={d.deploymentId}
              deployment={d}
              onStop={() => {}}
              onRestart={() => {}}
              onRedeploy={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

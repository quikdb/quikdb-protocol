import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDeployment,
  listDeployments,
  stopDeployment,
  restartDeployment,
  redeployDeployment,
} from '../lib/api';
import type { DeploymentStatus } from '../types/deployment';

const ACTIVE_STATUSES: DeploymentStatus[] = [
  'pending',
  'reserving_nodes',
  'building',
  'deploying',
  'restarting',
  'waking',
];

export function useDeployments() {
  return useQuery({
    queryKey: ['deployments'],
    queryFn: listDeployments,
    refetchInterval: 30_000,
  });
}

export function useDeployment(id: string) {
  return useQuery({
    queryKey: ['deployment', id],
    queryFn: () => getDeployment(id),
    // poll every 5s while deployment is in an active state
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && ACTIVE_STATUSES.includes(status)) return 5_000;
      return 30_000;
    },
  });
}

export function useStopDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: stopDeployment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deployments'] }),
  });
}

export function useRestartDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restartDeployment,
    onSuccess: (_, id) =>
      qc.invalidateQueries({ queryKey: ['deployment', id] }),
  });
}

export function useRedeployDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: redeployDeployment,
    onSuccess: (_, id) =>
      qc.invalidateQueries({ queryKey: ['deployment', id] }),
  });
}

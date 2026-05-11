import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { DeploymentLog } from '../types/deployment';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://device.quikdb.net';

/**
 * Streams real-time deployment logs via Socket.io.
 * Falls back to REST polling if socket connection fails.
 */
export function useDeploymentLogs(deploymentId: string, token: string) {
  const [logs, setLogs] = useState<DeploymentLog[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!deploymentId || !token) return;

    const socket = io(`${API_URL}/logs`, {
      auth: { token },
      query: { deploymentId },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('log', (entry: DeploymentLog) => {
      setLogs((prev) => [...prev, entry]);
    });

    socket.on('log:batch', (entries: DeploymentLog[]) => {
      setLogs((prev) => [...prev, ...entries]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deploymentId, token]);

  const clearLogs = () => setLogs([]);

  return { logs, connected, clearLogs };
}

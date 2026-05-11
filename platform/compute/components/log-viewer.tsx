'use client';

import { useEffect, useRef } from 'react';
import type { DeploymentLog } from '../types/deployment';

interface LogViewerProps {
  logs: DeploymentLog[];
  connected: boolean;
  autoScroll?: boolean;
}

const LOG_COLORS: Record<string, string> = {
  build: 'text-blue-400',
  runtime: 'text-zinc-300',
  system: 'text-yellow-400',
};

const ERROR_COLORS: Record<string, string> = {
  USER_ERROR: 'text-red-400',
  SYSTEM_TRANSIENT: 'text-orange-400',
  SYSTEM_FAULT: 'text-red-500',
};

export function LogViewer({ logs, connected, autoScroll = true }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-black">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-medium text-zinc-400">Logs</span>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-xs text-zinc-500">
            {connected ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-96 overflow-y-auto p-4 font-mono text-xs leading-5"
      >
        {logs.length === 0 ? (
          <p className="text-zinc-600">Waiting for logs...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3">
              <span className="shrink-0 text-zinc-600">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span
                className={
                  log.errorClass
                    ? ERROR_COLORS[log.errorClass]
                    : LOG_COLORS[log.type] || 'text-zinc-300'
                }
              >
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

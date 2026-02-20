'use client';

export function ConnectionStatus({ connected }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-argo-success animate-pulse' : 'bg-argo-error'}`} />
      <span className="text-xs text-argo-muted">{connected ? 'Connected' : 'Disconnected'}</span>
    </div>
  );
}

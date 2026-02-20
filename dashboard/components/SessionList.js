'use client';

import { useSessionStore } from '../stores/sessionStore';
import { ArrowLeft, Clock, Activity, Pause, StopCircle } from 'lucide-react';

const statusConfig = {
  running: { color: 'text-argo-success', bg: 'bg-argo-success/20', icon: Activity, label: 'Running' },
  idle: { color: 'text-argo-warning', bg: 'bg-argo-warning/20', icon: Pause, label: 'Idle' },
  ended: { color: 'text-argo-muted', bg: 'bg-argo-muted/20', icon: StopCircle, label: 'Ended' },
};

function SessionRow({ session, onClick }) {
  const getComputedStatus = useSessionStore((state) => state.getComputedStatus);
  const status = getComputedStatus(session);
  const config = statusConfig[status] || statusConfig.ended;
  const Icon = config.icon;
  const time = new Date(session.lastActivity).toLocaleTimeString();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-argo-card/50 transition-colors text-left border border-argo-border/50"
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.bg}`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-argo-text truncate">{session.id.slice(0, 16)}...</div>
        <div className="text-xs text-argo-muted">{session.eventCount} events</div>
      </div>
      <div className="text-right">
        <div className={`text-xs ${config.color}`}>{config.label}</div>
        <div className="text-xs text-argo-muted flex items-center gap-1">
          <Clock className="w-3 h-3" />{time}
        </div>
      </div>
    </button>
  );
}

export function SessionList({ sessions = [], projectName }) {
  const { goBack, setActiveSession } = useSessionStore();

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goBack} className="p-1 rounded hover:bg-argo-card text-argo-muted hover:text-argo-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold text-argo-text">{projectName}</h2>
        <span className="text-sm text-argo-muted">({sessions.length} sessions)</span>
      </div>
      <div className="space-y-2">
        {sessions.map(session => (
          <SessionRow key={session.id} session={session} onClick={() => setActiveSession(session.id)} />
        ))}
      </div>
    </div>
  );
}

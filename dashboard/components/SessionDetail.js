'use client';

import { useSessionStore } from '../stores/sessionStore';
import { useEventStore } from '../stores/eventStore';
import { ArrowLeft, Clock, Activity, Pause, StopCircle, Cpu, Layers, Wrench } from 'lucide-react';
import { HorizontalTree } from './HorizontalTree';

const statusConfig = {
  running: { color: 'text-argo-success', bg: 'bg-argo-success/20', icon: Activity, label: 'Running' },
  idle: { color: 'text-argo-warning', bg: 'bg-argo-warning/20', icon: Pause, label: 'Idle' },
  ended: { color: 'text-argo-muted', bg: 'bg-argo-muted/20', icon: StopCircle, label: 'Ended' },
};

function StatCard({ icon: Icon, label, value, color = 'text-argo-text' }) {
  return (
    <div className="bg-argo-card border border-argo-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-argo-muted" />
        <span className="text-xs text-argo-muted">{label}</span>
      </div>
      <div className={`text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function formatDuration(startTime) {
  if (!startTime) return '—';
  const ms = Date.now() - new Date(startTime).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function SessionDetail() {
  const { activeSessionId, sessions, goBack, getComputedStatus } = useSessionStore();
  const { events, getTreeData } = useEventStore();

  const session = sessions[activeSessionId];
  if (!session) {
    return (
      <div className="p-6">
        <button onClick={goBack} className="flex items-center gap-2 text-argo-muted hover:text-argo-text mb-4">
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="text-center text-argo-muted py-12">
          <p>Session not found</p>
        </div>
      </div>
    );
  }

  const status = getComputedStatus(session);
  const config = statusConfig[status] || statusConfig.ended;
  const StatusIcon = config.icon;
  const sessionEvents = events.filter(e => e.session_id === activeSessionId);
  const treeData = getTreeData();

  const agentCount = sessionEvents.filter(e => e.type === 'agent_start').length;
  const toolCount = sessionEvents.filter(e => e.type === 'tool_start').length;

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={goBack} className="p-1 rounded hover:bg-argo-card text-argo-muted hover:text-argo-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-argo-text">
            Session: {activeSessionId.slice(0, 16)}...
          </h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-argo-muted">{session.project || 'unknown'}</span>
            <div className={`flex items-center gap-1 text-xs ${config.color}`}>
              <StatusIcon className="w-3 h-3" />
              {config.label}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Activity} label="Events" value={session.eventCount || 0} />
        <StatCard icon={Layers} label="Agents" value={agentCount} color="text-argo-accent" />
        <StatCard icon={Wrench} label="Tool Calls" value={toolCount} color="text-argo-warning" />
        <StatCard icon={Clock} label="Duration" value={formatDuration(session.startTime)} />
      </div>

      {treeData && treeData.children && treeData.children.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-argo-text mb-3">Execution Tree</h3>
          <div className="bg-argo-card border border-argo-border rounded-lg p-4 overflow-auto">
            <HorizontalTree data={treeData} />
          </div>
        </div>
      )}

      {sessionEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-argo-text mb-3">Recent Events</h3>
          <div className="bg-argo-card border border-argo-border rounded-lg overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {sessionEvents.slice(-30).map((event, idx) => {
                const name = event.skill_name || event.agent_type?.split(':')[1] || event.tool_name || event.type;
                const time = new Date(event.timestamp).toLocaleTimeString();
                return (
                  <div key={event.id || idx} className="flex items-center gap-3 px-4 py-2 border-b border-argo-border/30 last:border-0">
                    <span className="text-xs text-argo-muted w-16">{event.type?.split('_')[0]}</span>
                    <span className="text-xs text-argo-text flex-1 truncate">{name}</span>
                    <span className="text-xs text-argo-muted">{time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

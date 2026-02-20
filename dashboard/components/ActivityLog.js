'use client';

import { useRef, useEffect } from 'react';
import { Zap, Play, Square, Wrench, Filter, RefreshCw, Users } from 'lucide-react';
import { shortenToolName, getDetailPreview } from '../utils/toolNames';

const typeIcons = {
  skill_start: Play,
  skill_end: Square,
  agent_start: Play,
  agent_end: Square,
  tool_start: Wrench,
  tool_end: Wrench,
  routing: Filter,
  compaction: RefreshCw,
  req_start: Users,
  req_end: Square,
};

const typeColors = {
  skill_start: 'text-argo-accent',
  skill_end: 'text-argo-muted',
  agent_start: 'text-argo-success',
  agent_end: 'text-argo-muted',
  tool_start: 'text-argo-warning',
  tool_end: 'text-argo-muted',
  routing: 'text-indigo-400',
  compaction: 'text-yellow-400',
  req_start: 'text-blue-400',
  req_end: 'text-argo-muted',
};

export function ActivityLog({ events = [] }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-argo-muted">
        <div className="text-center">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No activity yet...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-2">
      {events.slice(-100).map((event, idx) => {
        const Icon = typeIcons[event.type] || Zap;
        const color = typeColors[event.type] || 'text-argo-muted';
        const rawName = event.type === 'routing'
          ? `Route: ${event.tasks || ''}${event.team_recommended ? ' [Team]' : ''}`
          : event.type === 'compaction'
          ? 'Context Compacted'
          : event.type === 'req_start'
          ? (event.summary || 'Request')
          : event.skill_name || event.agent_type?.split(':')[1] || event.tool_name || event.type;
        const name = event.tool_name ? shortenToolName(rawName) : rawName;
        const time = new Date(event.timestamp).toLocaleTimeString();

        return (
          <div key={event.id || idx} className="flex items-center gap-3 py-1.5 border-b border-argo-border/30">
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
            <span className="text-xs text-argo-text truncate" title={event.tool_name || rawName}>{name}</span>
            {event.detail && (
              <span className="text-[10px] text-argo-muted truncate flex-1 opacity-60" title={event.detail}>
                {getDetailPreview(event.detail, 30)}
              </span>
            )}
            {!event.detail && <span className="flex-1" />}
            <span className="text-xs text-argo-muted flex-shrink-0">{time}</span>
          </div>
        );
      })}
    </div>
  );
}

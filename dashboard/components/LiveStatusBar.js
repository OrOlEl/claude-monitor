'use client';

import { Zap, Play, Wrench, Clock } from 'lucide-react';

function formatElapsed(timestamp) {
  if (!timestamp) return '';
  const ms = Date.now() - new Date(timestamp).getTime();
  if (ms < 0) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

function LiveItem({ icon: Icon, name, model, timestamp, color, bgColor, borderColor }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${borderColor} ${bgColor}`}>
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${color.replace('text-', 'bg-')}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${color.replace('text-', 'bg-')}`}></span>
      </span>
      <Icon className={`w-3 h-3 ${color}`} />
      <span className={color}>{name}</span>
      {model && (
        <span className="text-[10px] opacity-60">{model}</span>
      )}
      {timestamp && (
        <span className="text-[10px] opacity-50 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {formatElapsed(timestamp)}
        </span>
      )}
    </div>
  );
}

export function LiveStatusBar({ status }) {
  const { runningSkills, runningAgents, runningTools } = status;
  const hasActivity = runningSkills.length > 0 || runningAgents.length > 0 || runningTools.length > 0;

  if (!hasActivity) return null;

  return (
    <div className="px-6 py-2 border-t border-argo-border/50 bg-zinc-900/50 flex items-center gap-2 flex-wrap overflow-x-auto">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium mr-1">LIVE</span>
      {runningSkills.map((skill, i) => (
        <LiveItem
          key={`skill-${i}`}
          icon={Zap}
          name={skill.name}
          timestamp={skill.timestamp}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
          borderColor="border-purple-500/30"
        />
      ))}
      {runningAgents.map((agent, i) => (
        <LiveItem
          key={`agent-${i}`}
          icon={Play}
          name={agent.name}
          model={agent.model}
          timestamp={agent.timestamp}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
          borderColor="border-emerald-500/30"
        />
      ))}
      {runningTools.map((tool, i) => (
        <LiveItem
          key={`tool-${i}`}
          icon={Wrench}
          name={tool.name}
          timestamp={tool.timestamp}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          borderColor="border-amber-500/30"
        />
      ))}
    </div>
  );
}

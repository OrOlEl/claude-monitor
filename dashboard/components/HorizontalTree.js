'use client';

import { useState, useEffect } from 'react';
import { Activity, Wrench, Zap, Play, CheckCircle, XCircle, Repeat, Clock, MessageSquare, Cpu, ChevronDown, ChevronRight, MoreHorizontal, X, Ban, Brain, MessageCircle, Filter, RefreshCw, Copy, Users, Crown, Bot, Flag, Sparkles } from 'lucide-react';
import { shortenToolName, getDetailPreview } from '../utils/toolNames';
import { useEventStore } from '../stores/eventStore';

/* ── Theme ── */
const T = {
  req:     { icon: MessageSquare, border: 'border-blue-500', bg: 'bg-blue-500/10', dot: 'bg-blue-500', text: 'text-blue-300', dim: 'border-blue-900/50 bg-blue-950/30 text-blue-500' },
  task:    { icon: Cpu,      border: 'border-teal-500', bg: 'bg-teal-500/10', dot: 'bg-teal-500', text: 'text-teal-300', dim: 'border-teal-900/50 bg-teal-950/30 text-teal-500' },
  skill:   { icon: Zap,      border: 'border-purple-500', bg: 'bg-purple-500/10', dot: 'bg-purple-500', text: 'text-purple-300', dim: 'border-purple-900/50 bg-purple-950/30 text-purple-500' },
  agent:   { icon: Play,     border: 'border-emerald-500', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-300', dim: 'border-emerald-900/50 bg-emerald-950/30 text-emerald-500' },
  tool:     { icon: Wrench,        border: 'border-amber-500', bg: 'bg-amber-500/10', dot: 'bg-amber-500', text: 'text-amber-300', dim: 'border-zinc-700 bg-zinc-800/50 text-zinc-500' },
  thinking: { icon: Brain,         border: 'border-pink-500', bg: 'bg-pink-500/10', dot: 'bg-pink-500', text: 'text-pink-300', dim: 'border-pink-900/50 bg-pink-950/30 text-pink-500' },
  response:   { icon: MessageCircle, border: 'border-cyan-500', bg: 'bg-cyan-500/10', dot: 'bg-cyan-500', text: 'text-cyan-300', dim: 'border-cyan-900/50 bg-cyan-950/30 text-cyan-500' },
  routing:    { icon: Filter,        border: 'border-indigo-500', bg: 'bg-indigo-500/10', dot: 'bg-indigo-500', text: 'text-indigo-300', dim: 'border-indigo-900/50 bg-indigo-950/30 text-indigo-500' },
  compaction: { icon: RefreshCw,     border: 'border-yellow-500', bg: 'bg-yellow-500/10', dot: 'bg-yellow-500', text: 'text-yellow-300', dim: 'border-yellow-900/50 bg-yellow-950/30 text-yellow-500' },
  session:    { icon: Activity,      border: 'border-sky-500', bg: 'bg-sky-500/10', dot: 'bg-sky-500', text: 'text-sky-300', dim: 'border-zinc-700 bg-zinc-800/50 text-zinc-500' },
};
const MC = { haiku: 'text-sky-400 bg-sky-500/10', sonnet: 'text-violet-400 bg-violet-500/10', opus: 'text-orange-400 bg-orange-500/10' };
const MAX_VISIBLE = 15;

/* ── Status config ── */
const STATUS = {
  running:   { icon: Activity,      color: 'text-blue-400',   bg: 'bg-blue-500/10',   label: 'Running' },
  completed: { icon: CheckCircle,   color: 'text-zinc-500',   bg: 'bg-zinc-700/20',   label: 'Done' },
  error:     { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',     label: 'Error' },
  cancelled:  { icon: Ban,           color: 'text-orange-400', bg: 'bg-orange-500/10',  label: 'Cancelled' },
  compacting: { icon: RefreshCw,     color: 'text-yellow-400', bg: 'bg-yellow-500/10',  label: 'Compacting...' },
};

/* ── SuperClaude agent type → display config ── */
const SC_AGENTS = {
  'frontend-architect': { label: 'Frontend', color: 'text-cyan-300 bg-cyan-500/15' },
  'backend-architect': { label: 'Backend', color: 'text-blue-300 bg-blue-500/15' },
  'system-architect': { label: 'SysArch', color: 'text-sky-300 bg-sky-500/15' },
  'security-engineer': { label: 'Security', color: 'text-red-300 bg-red-500/15' },
  'performance-engineer': { label: 'Perf', color: 'text-amber-300 bg-amber-500/15' },
  'quality-engineer': { label: 'QA', color: 'text-green-300 bg-green-500/15' },
  'devops-architect': { label: 'DevOps', color: 'text-orange-300 bg-orange-500/15' },
  'refactoring-expert': { label: 'Refactor', color: 'text-purple-300 bg-purple-500/15' },
  'root-cause-analyst': { label: 'RCA', color: 'text-rose-300 bg-rose-500/15' },
  'deep-research-agent': { label: 'Research', color: 'text-indigo-300 bg-indigo-500/15' },
  'python-expert': { label: 'Python', color: 'text-yellow-300 bg-yellow-500/15' },
  'technical-writer': { label: 'Docs', color: 'text-teal-300 bg-teal-500/15' },
  'learning-guide': { label: 'Learn', color: 'text-lime-300 bg-lime-500/15' },
  'pm-agent': { label: 'PM', color: 'text-fuchsia-300 bg-fuchsia-500/15' },
};

const SC_FLAGS = {
  '--ultrathink': { label: 'Ultra', color: 'text-rose-300 bg-rose-500/15' },
  '--verbose': { label: 'Verbose', color: 'text-amber-300 bg-amber-500/15' },
  '--aggressive': { label: 'Aggr', color: 'text-red-300 bg-red-500/15' },
  '--safe-mode': { label: 'Safe', color: 'text-green-300 bg-green-500/15' },
  '--loop': { label: 'Loop', color: 'text-purple-300 bg-purple-500/15' },
  '--interactive': { label: 'Inter', color: 'text-cyan-300 bg-cyan-500/15' },
  '--all-mcp': { label: 'MCP', color: 'text-blue-300 bg-blue-500/15' },
};

/* ── Synthetic item themes: custom icons for enriched worker column items ── */
const SYNTH = {
  Report:       { icon: MessageSquare, theme: 'agent' },
  Directive:    { icon: MessageCircle, theme: 'response' },
  TaskPlan:     { icon: Cpu, theme: 'task' },
  AgentOutput:  { icon: CheckCircle, theme: 'agent' },
  AgentMission: { icon: Zap, theme: 'skill' },
};

/* ── Live Timer: re-renders every second for running items ── */
function LiveTimer({ startTs, endTs, status }) {
  const [now, setNow] = useState(Date.now());
  const isLive = status === 'running';

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  if (!startTs) return null;
  const start = typeof startTs === 'number' ? startTs : new Date(startTs).getTime();
  const end = isLive ? now : (endTs || now);
  const ms = end - start;
  if (ms < 0) return null;

  const seconds = Math.floor(ms / 1000);
  let display;
  if (seconds === 0) display = '<1s';
  else if (seconds < 60) display = `${seconds}s`;
  else if (seconds < 3600) display = `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  else display = `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;

  return (
    <span className={`flex items-center gap-0.5 text-[9px] px-1 rounded font-mono tabular-nums ${
      isLive ? 'text-cyan-400 bg-cyan-500/10' : 'text-zinc-500 bg-zinc-700/20'
    }`}>
      <Clock className="w-2 h-2" />{display}
    </span>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.running;
  const Icon = cfg.icon;
  const isCompacting = status === 'compacting';
  return (
    <span className={`flex items-center gap-0.5 text-[8px] font-bold px-1 rounded ${cfg.color} ${cfg.bg} ${isCompacting ? 'animate-pulse' : ''}`}>
      <Icon className={`w-2.5 h-2.5 ${isCompacting ? 'animate-spin' : ''}`} />{cfg.label}
    </span>
  );
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts : new Date(ts).getTime());
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ── Build summary for container nodes (task) from children ── */
function buildContainerSummary(node) {
  if (!node.children || node.children.length === 0) return null;
  const counts = {};
  const names = [];
  for (const child of node.children) {
    counts[child.type] = (counts[child.type] || 0) + 1;
    if (child.name && names.length < 8) names.push(child.name);
  }
  const parts = [];
  if (counts.skill) parts.push(`${counts.skill} skill${counts.skill > 1 ? 's' : ''}`);
  if (counts.agent) parts.push(`${counts.agent} agent${counts.agent > 1 ? 's' : ''}`);
  if (counts.tool) parts.push(`${counts.tool} tool${counts.tool > 1 ? 's' : ''}`);
  return { summary: parts.join(', '), items: names };
}

/* ── Argo Node (card) with expandable detail ── */
function ArgoBox({ node }) {
  const [expanded, setExpanded] = useState(false);
  const synth = node.tool_name && SYNTH[node.tool_name];
  const t = (synth ? T[synth.theme] : null) || T[node.type] || T.tool;
  const Icon = (synth && synth.icon) || t.icon;
  const live = node.status === 'running';
  const containerInfo = node.type === 'task' ? buildContainerSummary(node) : null;
  const hasDetail = !!(node.detail || node.output || containerInfo);

  // Dynamic display name for task nodes based on status
  const displayName = node.type === 'task'
    ? (live ? 'Processing' : node.status === 'completed' ? 'Done' : node.status === 'cancelled' ? 'Cancelled' : node.name)
    : (node.type === 'tool' ? shortenToolName(node.name) : node.name);

  // P3: Completed tools get compact layout, thinking/response get wider
  const isCompactTool = node.type === 'tool' && !live;
  const widthClass = node.type === 'req'
    ? 'min-w-[140px] max-w-[280px]'
    : (node.type === 'thinking' || node.type === 'response')
      ? 'min-w-[140px] max-w-[350px]'
      : isCompactTool
        ? 'min-w-[80px] max-w-[250px]'
        : 'min-w-[100px] max-w-[250px]';

  let labelBadge = null;
  if (node.type === 'req') {
    labelBadge = <span className="text-[8px] font-bold px-1 rounded bg-blue-500/20 text-blue-300">REQ</span>;
  } else if (node.type === 'task') {
    labelBadge = <span className="text-[8px] font-bold px-1 rounded bg-teal-500/20 text-teal-300">TASK</span>;
  } else if (node.type === 'thinking') {
    labelBadge = <span className="text-[8px] font-bold px-1 rounded bg-pink-500/20 text-pink-300">THINK</span>;
  } else if (node.type === 'response') {
    labelBadge = <span className="text-[8px] font-bold px-1 rounded bg-cyan-500/20 text-cyan-300">RESP</span>;
  } else if (node.type === 'routing') {
    labelBadge = <span className="text-[8px] font-bold px-1 rounded bg-indigo-500/20 text-indigo-300">ROUTE</span>;
  } else if (node.type === 'compaction') {
    labelBadge = <span className="text-[8px] font-bold px-1 rounded bg-yellow-500/20 text-yellow-300">COMPACT</span>;
  }

  return (
    <div data-node-status={node.status} data-node-type={node.type} className={`relative rounded-lg border-2 ${expanded ? 'max-w-[400px]' : widthClass}
      ${live ? `${t.border} ${t.bg}` : t.dim} transition-all`}>
      <div
        className={`flex items-center gap-2 px-3 py-2 whitespace-nowrap ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={hasDetail ? () => setExpanded(!expanded) : undefined}
      >
        {live && (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className={`animate-ping absolute h-full w-full rounded-full ${t.dot} opacity-60`} />
            <span className={`relative rounded-full h-2.5 w-2.5 ${t.dot}`} />
          </span>
        )}
        {!live && node.status === 'error' && <XCircle className="absolute -top-1 -right-1 w-3.5 h-3.5 text-red-500" />}
        {!live && node.status === 'cancelled' && <Ban className="absolute -top-1 -right-1 w-3.5 h-3.5 text-orange-500" />}
        {!live && node.status === 'completed' && <CheckCircle className="absolute -top-1 -right-1 w-3.5 h-3.5 text-zinc-600" />}

        <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${live ? t.text : 'text-zinc-500'}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-mono font-semibold truncate ${live ? t.text : 'text-zinc-500'}`} title={node.name}>
            {displayName}
          </div>
          {/* P1: Detail preview for tools */}
          {node.type === 'tool' && node.detail && (
            <div className={`text-[9px] font-mono truncate ${live ? 'text-amber-200/60' : 'text-zinc-600'}`} title={node.detail}>
              {getDetailPreview(node.detail)}
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            {labelBadge}
            {node.model && (
              <span className={`text-[9px] px-1 rounded ${MC[node.model] || 'text-zinc-400 bg-zinc-700/30'}`}>
                {node.model}
              </span>
            )}
            {node.iteration > 1 && (
              <span className="flex items-center text-[9px] font-bold text-rose-400 bg-rose-500/10 px-1 rounded">
                <Repeat className="w-2 h-2 mr-px" />{node.iteration}
              </span>
            )}
            {/* Agent flags badge */}
            {node.type === 'agent' && node.flags && node.flags.length > 0 && (
              <span className="flex items-center gap-0.5">
                <Flag className="w-2 h-2 text-rose-400" />
                {node.flags.slice(0, 3).map((flag, i) => {
                  const cfg = SC_FLAGS[flag] || { label: flag.replace('--', ''), color: 'text-zinc-400 bg-zinc-700/30' };
                  return (
                    <span key={`af-${i}`} className={`text-[7px] px-0.5 py-0.5 rounded font-mono font-bold ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  );
                })}
              </span>
            )}
            {/* SuperClaude agent indicator */}
            {node.type === 'agent' && SC_AGENTS[node.agent_type] && (
              <span className={`text-[7px] px-1 py-0.5 rounded font-bold flex items-center gap-0.5 ${SC_AGENTS[node.agent_type].color}`}>
                <Sparkles className="w-2 h-2" />{SC_AGENTS[node.agent_type].label}
              </span>
            )}
            <LiveTimer startTs={node.timestamp} endTs={node.endTimestamp} status={node.status} />
            {hasDetail && (
              <span className="text-[8px] text-zinc-500">
                {expanded ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expandable detail panel */}
      {expanded && hasDetail && (
        <div className="border-t border-zinc-700/50 px-3 py-2 max-h-[200px] overflow-y-auto">
          {containerInfo && (
            <div className="mb-1.5">
              <span className="text-[8px] font-bold text-zinc-500 uppercase">Contents</span>
              <div className="text-[10px] text-teal-300 font-mono mt-0.5">{containerInfo.summary}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {containerInfo.items.map((name, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 font-mono">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {node.detail && (
            <div className="mb-1.5">
              <span className="text-[8px] font-bold text-zinc-500 uppercase">
                {node.type === 'thinking' ? 'Reasoning' :
                 node.type === 'response' ? 'Response' :
                 node.type === 'agent' ? 'Agent' :
                 node.type === 'skill' ? 'Skill' : 'Input'}
              </span>
              <pre className={`text-[10px] font-mono whitespace-pre-wrap break-all mt-0.5 leading-tight ${
                node.type === 'thinking' ? 'text-pink-200' :
                node.type === 'response' ? 'text-cyan-200' : 'text-zinc-300'
              }`}>
                {node.detail}
              </pre>
            </div>
          )}
          {node.output && (
            <div>
              <span className="text-[8px] font-bold text-zinc-500 uppercase">Output</span>
              <pre className="text-[10px] text-zinc-400 font-mono whitespace-pre-wrap break-all mt-0.5 leading-tight">
                {node.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Recursive tree row: DESC order (newest top, oldest bottom) ── */
function TreeRow({ node, depth = 1 }) {
  // DESC: newest first (top) for real-time monitoring
  const kids = [...(node.children || [])].reverse();
  const [expanded, setExpanded] = useState(false);

  // Children will be at depth+1. User wants folding from level 3+:
  // - Parent depth 1 (task): children at level 2 → no fold
  // - Parent depth 2+ (agent/skill): children at level 3+ → fold to 2
  const foldLimit = depth >= 2 ? 2 : MAX_VISIBLE;
  const visibleKids = kids.length > foldLimit && !expanded
    ? kids.slice(0, foldLimit)
    : kids;
  const hiddenCount = kids.length - foldLimit;

  return (
    <div className="flex items-start">
      <div className="flex-shrink-0 pt-0.5">
        <ArgoBox node={node} />
      </div>

      {kids.length > 0 && (
        <>
          <div className="w-6 mt-4 h-px bg-zinc-600 relative flex-shrink-0">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0
              border-t-[3px] border-t-transparent
              border-b-[3px] border-b-transparent
              border-l-[5px] border-l-zinc-600" />
          </div>

          {visibleKids.length === 1 && kids.length <= foldLimit ? (
            <TreeRow node={visibleKids[0]} depth={depth + 1} />
          ) : (
            <div className="flex flex-col">
              {visibleKids.map((child, i) => {
                const isFirst = i === 0;
                const isLast = i === visibleKids.length - 1 && hiddenCount <= 0;
                return (
                  <div key={child.id || i} className={`relative flex items-start ${isFirst ? '' : 'mt-1'}`}>
                    {!(isFirst && isLast) && (
                      <div className={`absolute left-0 w-px bg-zinc-600 ${
                        isFirst ? 'top-4 -bottom-1' :
                        isLast  ? 'top-0 h-4' :
                                  'top-0 -bottom-1'
                      }`} />
                    )}
                    <div className="w-4 mt-4 h-px bg-zinc-600 flex-shrink-0 relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0
                        border-t-[2px] border-t-transparent
                        border-b-[2px] border-b-transparent
                        border-l-[3px] border-l-zinc-600" />
                    </div>
                    <TreeRow node={child} depth={depth + 1} />
                  </div>
                );
              })}
              {hiddenCount > 0 && (
                <div className="relative flex items-center mt-1">
                  <div className="absolute left-0 w-px bg-zinc-600 top-0 h-4" />
                  <div className="w-4 mt-4 h-px bg-zinc-600 flex-shrink-0" />
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-dashed border-zinc-600
                      text-[10px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-400 transition-colors mt-4"
                  >
                    <MoreHorizontal className="w-3 h-3" />
                    {expanded ? 'Collapse' : `+${hiddenCount} more...`}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Helper: get latest activity timestamp from tree ── */
function getLatestTimestamp(node) {
  let latest = node.endTimestamp || node.timestamp || 0;
  if (typeof latest === 'string') latest = new Date(latest).getTime();
  for (const child of (node.children || [])) {
    const childLatest = getLatestTimestamp(child);
    if (childLatest > latest) latest = childLatest;
  }
  return latest;
}

/* ── Log Export: structured execution log for debugging ── */
function generateRequestLog(reqNode) {
  const startTs = typeof reqNode.timestamp === 'number' ? reqNode.timestamp : new Date(reqNode.timestamp).getTime();

  function relTime(ts) {
    if (!ts) return '??';
    const ms = (typeof ts === 'number' ? ts : new Date(ts).getTime()) - startTs;
    const s = Math.max(0, Math.floor(ms / 1000));
    return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  }

  function dur(node) {
    if (!node.endTimestamp || !node.timestamp) return '';
    const s = Math.round(((typeof node.endTimestamp === 'number' ? node.endTimestamp : new Date(node.endTimestamp).getTime()) - (typeof node.timestamp === 'number' ? node.timestamp : new Date(node.timestamp).getTime())) / 1000);
    return s > 0 ? ` (${s}s)` : '';
  }

  function trunc(str, max = 100) {
    if (!str) return '';
    const c = str.replace(/\n/g, ' ').trim();
    return c.length > max ? c.substring(0, max) + '...' : c;
  }

  const SYM = { completed: '✓', error: '✗', cancelled: '⊘', running: '▶' };

  function renderNode(node, prefix, isLast) {
    const lines = [];
    const conn = isLast ? '└─' : '├─';
    const next = prefix + (isLast ? '   ' : '│  ');
    const s = SYM[node.status] || '○';
    const t = relTime(node.timestamp);
    const d = dur(node);

    if (node.type === 'task') {
      lines.push(`${prefix}${conn} [${t}] ${s} TASK: ${node.name}${d}`);
    } else if (node.type === 'skill') {
      lines.push(`${prefix}${conn} [${t}] ${s} SKILL: ${node.name}${node.iteration > 1 ? ` (iter ${node.iteration})` : ''}${d}`);
    } else if (node.type === 'agent') {
      lines.push(`${prefix}${conn} [${t}] ${s} AGENT: ${node.name}${node.model ? ` [${node.model}]` : ''}${d}`);
      if (node.detail) lines.push(`${next}   prompt: "${trunc(node.detail, 150)}"`);
    } else if (node.type === 'tool') {
      lines.push(`${prefix}${conn} [${t}] TOOL: ${node.name}${d}${node.detail ? ` → ${trunc(node.detail)}` : ''}`);
      if (node.output) lines.push(`${next}   output: ${trunc(node.output, 120)}`);
    } else if (node.type === 'thinking') {
      lines.push(`${prefix}${conn} [${t}] THINK: ${trunc(node.detail, 120)}`);
    } else if (node.type === 'response') {
      lines.push(`${prefix}${conn} [${t}] RESPONSE: ${trunc(node.detail, 120)}`);
    } else if (node.type === 'compaction') {
      lines.push(`${prefix}${conn} [${t}] ⟳ COMPACTION`);
    } else {
      lines.push(`${prefix}${conn} [${t}] ${node.type}: ${node.name}${d}`);
    }

    const kids = node.children || [];
    kids.forEach((child, i) => {
      lines.push(...renderNode(child, next, i === kids.length - 1));
    });
    return lines;
  }

  // Header
  const lines = [
    `=== Request Execution Log ===`,
    `Time: ${new Date(startTs).toLocaleString()}`,
    `Request: "${trunc(reqNode.fullText || reqNode.summary || reqNode.name, 250)}"`,
  ];

  if (reqNode.routing) {
    lines.push(`Routing: tasks=[${reqNode.routing.tasks.join(', ') || 'none'}] flags=[${reqNode.routing.flags.join(', ') || 'none'}]`);
  }

  lines.push(`Status: ${reqNode.status}${dur(reqNode)}`);
  lines.push('');
  lines.push('── Flow ──');

  const kids = reqNode.children || [];
  kids.forEach((child, i) => {
    lines.push(...renderNode(child, '', i === kids.length - 1));
  });

  lines.push('── End ──');
  return lines.join('\n');
}

/* ── Copy Log Button with feedback ── */
function CopyLogButton({ reqNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const log = generateRequestLog(reqNode);
    navigator.clipboard.writeText(log).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-2 py-3 transition-colors ${
        copied
          ? 'text-green-400'
          : 'text-zinc-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100'
      }`}
      title={copied ? 'Copied!' : 'Copy execution log'}
    >
      {copied
        ? <CheckCircle className="w-3.5 h-3.5" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  );
}

/* ── Request Card ── */
function RequestCard({ reqNode, defaultOpen, onDismiss, activeTeam, teamMessages }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [, setTick] = useState(0);
  const live = reqNode.status === 'running';

  // Re-render periodically to update compacting indicator (2s for responsiveness)
  useEffect(() => {
    if (!live) return;
    const interval = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(interval);
  }, [live]);

  const latestActivity = getLatestTimestamp(reqNode);
  const silenceMs = Date.now() - latestActivity;
  // Compacting: 8s silence OR compaction event received while still running (3s)
  // Also check for explicit compaction_start event
  const isPossiblyCompacting = live && (
    silenceMs > 8000 ||
    (reqNode.compacted && silenceMs > 2000) ||
    reqNode.compactionStarted
  );
  const time = formatTime(reqNode.timestamp);

  const countNodes = (node, type) => {
    let count = node.type === type ? 1 : 0;
    (node.children || []).forEach(c => { count += countNodes(c, type); });
    return count;
  };
  const toolCount = countNodes(reqNode, 'tool');
  const agentCount = countNodes(reqNode, 'agent');
  const skillCount = countNodes(reqNode, 'skill');

  // Find current activity (deepest running node) for live status display
  const findCurrentActivity = (node) => {
    if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const found = findCurrentActivity(node.children[i]);
        if (found) return found;
      }
    }
    if (node.status === 'running' && node.type !== 'req' && node.type !== 'task') {
      return node;
    }
    return null;
  };
  const currentActivity = live ? findCurrentActivity(reqNode) : null;

  return (
    <div data-status={reqNode.status} className={`rounded-lg border overflow-hidden transition-all group ${
      live ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-700/50 bg-zinc-800/20'
    }`}>
      {/* Header */}
      <div className="flex items-center">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex-1 flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors text-left"
        >
          {isOpen
            ? <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            : <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          }

          <StatusBadge status={isPossiblyCompacting ? 'compacting' : reqNode.status} />

          {reqNode.compacted && !isPossiblyCompacting && (
            <span className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
              <RefreshCw className="w-2.5 h-2.5" />
              Compacted
            </span>
          )}

          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 flex-shrink-0">REQ</span>

          <span
            className={`text-xs font-mono truncate ${live ? 'text-blue-200' : 'text-zinc-400'} ${currentActivity ? 'max-w-[200px]' : 'flex-1'}`}
            title={reqNode.fullText || reqNode.summary || reqNode.name}
          >
            {reqNode.summary || reqNode.name}
          </span>

          {/* Live activity indicator - shows what's happening right now */}
          {currentActivity && !isPossiblyCompacting && (
            <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 flex-shrink-0 animate-pulse truncate max-w-[280px]" title={currentActivity.detail || currentActivity.name}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="font-bold">{currentActivity.type === 'tool' ? 'Tool' : currentActivity.type === 'agent' ? 'Agent' : currentActivity.type === 'skill' ? 'Skill' : currentActivity.type}</span>
              <span className="font-mono opacity-80">{currentActivity.type === 'tool' ? shortenToolName(currentActivity.name) : currentActivity.name}</span>
              {currentActivity.detail && <span className="opacity-50 truncate">{getDetailPreview(currentActivity.detail, 30)}</span>}
            </span>
          )}

          {/* Routing detection badges */}
          {reqNode.routing && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Filter className="w-3 h-3 text-indigo-400" />
              {reqNode.routing.tasks.map((task, i) => (
                <span key={i} className="text-[8px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                  {task}
                </span>
              ))}
              {reqNode.routing.flags.map((flag, i) => {
                const cfg = SC_FLAGS[flag] || null;
                return (
                  <span key={`f-${i}`} className={`text-[8px] px-1 py-0.5 rounded font-mono ${cfg ? cfg.color + ' font-bold' : 'bg-rose-500/15 text-rose-300'}`}>
                    {cfg ? cfg.label : flag}
                  </span>
                );
              })}
              {reqNode.routing.teamRecommended && (
                <span className="text-[7px] px-1 py-0.5 rounded bg-indigo-500/25 text-indigo-200 font-bold flex items-center gap-0.5">
                  <Users className="w-2.5 h-2.5" />Team
                </span>
              )}
            </div>
          )}

          {/* Task plan summary badge */}
          {reqNode.taskPlan && reqNode.taskPlan.length > 0 && (() => {
            const done = reqNode.taskPlan.filter(t => t.status === 'completed').length;
            const inProg = reqNode.taskPlan.filter(t => t.status === 'in_progress').length;
            const pending = reqNode.taskPlan.filter(t => t.status === 'pending').length;
            return (
              <span className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono flex-shrink-0">
                {reqNode.taskPlan.length} tasks
                {done > 0 && <span className="text-green-400">{done}✓</span>}
                {inProg > 0 && <span className="text-yellow-400">{inProg}▶</span>}
                {pending > 0 && <span className="text-zinc-500">{pending}○</span>}
              </span>
            );
          })()}

          <div className="flex items-center gap-2 flex-shrink-0">
            {skillCount > 0 && <span className="text-[9px] text-purple-400">{skillCount} skill</span>}
            {agentCount > 0 && <span className="text-[9px] text-emerald-400">{agentCount} agent</span>}
            {toolCount > 0 && <span className="text-[9px] text-amber-400">{toolCount} tool</span>}
            <LiveTimer startTs={reqNode.timestamp} endTs={reqNode.endTimestamp} status={reqNode.status} />
            <span className="text-[9px] text-zinc-600">{time}</span>
          </div>
        </button>

        {/* Copy log button */}
        <CopyLogButton reqNode={reqNode} />

        {/* Dismiss button - only for completed */}
        {!live && onDismiss && (
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(reqNode.id); }}
            className="px-2 py-3 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Task Plan checklist - always visible when plan exists */}
      {reqNode.taskPlan && reqNode.taskPlan.length > 0 && (() => {
        const total = reqNode.taskPlan.length;
        const done = reqNode.taskPlan.filter(t => t.status === 'completed').length;
        const inProg = reqNode.taskPlan.filter(t => t.status === 'in_progress').length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <div className="px-4 py-2.5 border-t border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 to-transparent">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] text-cyan-400 font-bold tracking-wide">PLAN</span>
              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct === 100 ? 'bg-green-500' : inProg > 0 ? 'bg-cyan-500' : 'bg-zinc-600'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-[10px] font-mono font-bold ${
                pct === 100 ? 'text-green-400' : 'text-cyan-300'
              }`}>
                {done}/{total}
              </span>
            </div>
            {reqNode.taskPlan.map((task, i) => (
              <div key={i} className={`flex items-center gap-2 text-[10px] py-0.5 ${
                task.status === 'in_progress' ? 'bg-yellow-500/5 -mx-2 px-2 rounded' : ''
              }`}>
                <span className={`flex-shrink-0 w-4 text-center ${
                  task.status === 'completed' ? 'text-green-400' :
                  task.status === 'in_progress' ? 'text-yellow-400 animate-pulse' :
                  task.status === 'deleted' ? 'text-zinc-600' :
                  'text-zinc-500'
                }`}>
                  {task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : task.status === 'deleted' ? '✗' : '○'}
                </span>
                <span className={`flex-1 ${
                  task.status === 'completed' ? 'text-zinc-500 line-through' :
                  task.status === 'in_progress' ? 'text-cyan-200 font-medium' :
                  task.status === 'deleted' ? 'text-zinc-600 line-through' :
                  'text-zinc-400'
                }`}>
                  {task.subject}
                </span>
                {task.status === 'in_progress' && task.activeForm && (
                  <span className="text-[8px] text-yellow-300/60 italic flex-shrink-0">{task.activeForm}</span>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Body: Ladder view (team mode) or horizontal tree (normal mode) */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 overflow-x-auto overflow-y-auto max-h-[70vh]">
          {activeTeam ? (
            <LadderView reqNode={reqNode} team={activeTeam} teamMessages={teamMessages || []} />
          ) : (
            <div className="inline-flex flex-col gap-2 min-w-min">
              {[...(reqNode.children || [])].reverse().map((child, i) => (
                <TreeRow key={child.id || i} node={child} depth={1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Thread Pool Status Bar ── */
const POOL_COLORS = {
  blue:    { active: 'text-blue-400',    dot: 'bg-blue-500' },
  emerald: { active: 'text-emerald-400', dot: 'bg-emerald-500' },
  amber:   { active: 'text-amber-400',   dot: 'bg-amber-500' },
};

function ThreadPoolBar({ stats, liveStatus }) {
  if (!stats) return null;

  const runningReqCount = liveStatus?.runningSkills?.length || 0;
  const pools = [
    { label: 'Requests', total: stats.totalReqs, active: runningReqCount, color: 'blue' },
    { label: 'Agents', total: stats.totalAgents, active: stats.runningAgents || 0, color: 'emerald' },
    { label: 'Tools', total: stats.totalTools, active: liveStatus?.runningTools?.length || 0, color: 'amber' },
  ];

  const activeNames = [
    ...(liveStatus?.runningAgents || []).map(a => ({ name: a.name, type: 'agent', model: a.model })),
    ...(liveStatus?.runningTools || []).map(t => ({ name: t.name, type: 'tool' })),
  ];

  return (
    <div className="bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-center gap-6">
        {/* Pool meters */}
        {pools.map(p => {
          const colors = POOL_COLORS[p.color] || POOL_COLORS.blue;
          return (
            <div key={p.label} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 w-14">{p.label}</span>
              <div className="flex items-center gap-1">
                <span className={`text-xs font-bold ${p.active > 0 ? colors.active : 'text-zinc-600'}`}>
                  {p.active}
                </span>
                <span className="text-[10px] text-zinc-600">/ {p.total}</span>
              </div>
              {p.active > 0 && (
                <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} animate-pulse`} />
              )}
            </div>
          );
        })}

        {/* Active thread names */}
        {activeNames.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto overflow-hidden">
            {activeNames.slice(0, 5).map((item, i) => (
              <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded border ${
                item.type === 'agent'
                  ? 'border-emerald-700/50 text-emerald-400 bg-emerald-500/5'
                  : 'border-amber-700/50 text-amber-400 bg-amber-500/5'
              }`}>
                {item.type === 'tool' ? shortenToolName(item.name) : item.name}
                {item.model && <span className="ml-1 opacity-50">{item.model}</span>}
              </span>
            ))}
            {activeNames.length > 5 && (
              <span className="text-[9px] text-zinc-500">+{activeNames.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Team Bar: shows agent team members and task progress ── */
function TeamBar({ teams, sessionId }) {
  const teamList = Object.values(teams || {});
  const activeRouting = useEventStore(s => s.getActiveRouting);
  const routing = activeRouting();
  const [collapsedTeams, setCollapsedTeams] = useState(new Set());

  if (teamList.length === 0) return null;

  // Sort: active team (matching sessionId) first
  const sorted = [...teamList].sort((a, b) => {
    const aActive = a.leadSessionId === sessionId ? 1 : 0;
    const bActive = b.leadSessionId === sessionId ? 1 : 0;
    return bActive - aActive;
  });

  return (
    <div className="mb-4 space-y-2">
      {sorted.map(team => {
        const tasks = team.tasks || [];
        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'completed').length;
        const inProg = tasks.filter(t => t.status === 'in_progress').length;
        const pct = total > 0 ? Math.round(done / total * 100) : 0;
        const members = team.members || [];
        const isActive = team.leadSessionId === sessionId;
        const isCollapsed = !isActive && !collapsedTeams.has(team.name + ':expanded');

        // Routing info: active team uses live routing, others use stored flags
        const teamFlags = isActive
          ? (routing?.flags || [])
          : (team.activeFlags || []);
        const teamRouting = teamFlags.length > 0 ? { flags: teamFlags } : null;

        return (
          <div key={team.name} className={`bg-gradient-to-r border rounded-lg px-4 py-3 ${
            isActive
              ? 'from-indigo-500/10 via-transparent to-transparent border-indigo-500/40'
              : 'from-zinc-800/30 via-transparent to-transparent border-zinc-700/30 opacity-60'
          }`}>
            {/* Team header */}
            <div className={`flex items-center gap-3 ${isCollapsed ? '' : 'mb-2'} ${!isActive ? 'cursor-pointer' : ''}`}
              onClick={!isActive ? () => {
                setCollapsedTeams(prev => {
                  const next = new Set(prev);
                  const key = team.name + ':expanded';
                  next.has(key) ? next.delete(key) : next.add(key);
                  return next;
                });
              } : undefined}
            >
              <Users className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />}
              {!isActive && (isCollapsed
                ? <ChevronRight className="w-3 h-3 text-zinc-500" />
                : <ChevronDown className="w-3 h-3 text-zinc-500" />
              )}
              <span className="text-xs font-bold text-indigo-300 font-mono">{team.name}</span>
              {team.description && (
                <span className="text-[9px] text-zinc-500 truncate max-w-[200px]">{team.description}</span>
              )}

              {/* Active flags for this team */}
              {teamRouting && teamRouting.flags.length > 0 && (
                <div className="flex items-center gap-0.5">
                  <Flag className="w-2.5 h-2.5 text-rose-400" />
                  {teamRouting.flags.slice(0, 4).map((flag, i) => {
                    const cfg = SC_FLAGS[flag] || { label: flag.replace('--', ''), color: 'text-zinc-400 bg-zinc-700/30' };
                    return (
                      <span key={i} className={`text-[7px] px-1 py-0.5 rounded font-mono font-bold ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {total > 0 && (
                <span className={`text-[10px] font-mono ml-auto ${pct === 100 ? 'text-green-400' : 'text-indigo-300'}`}>
                  {done}/{total} tasks {pct === 100 ? '✓' : `(${pct}%)`}
                </span>
              )}
            </div>

            {/* Collapsible body */}
            {!isCollapsed && (<>
            {/* Progress bar */}
            {total > 0 && (
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pct === 100 ? 'bg-green-500' : inProg > 0 ? 'bg-indigo-500' : 'bg-zinc-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Members row */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {members.map(member => {
                const isLead = member.agentType === 'team-lead';
                const memberTask = tasks.find(t => t.owner === member.name && t.status === 'in_progress');
                const MemberIcon = isLead ? Crown : Bot;
                const scAgent = SC_AGENTS[member.agentType];
                const isSuperClaude = !!scAgent;

                return (
                  <div key={member.name} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] ${
                    isLead
                      ? 'border-orange-500/30 bg-orange-500/8 text-orange-300'
                      : memberTask
                        ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300'
                        : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-400'
                  }`}>
                    <MemberIcon className="w-3 h-3 flex-shrink-0" />
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isLead ? 'bg-orange-400' :
                      memberTask ? 'bg-emerald-400 animate-pulse' :
                      'bg-zinc-600'
                    }`} />
                    <span className="font-mono font-bold">{member.name}</span>
                    {member.model && (
                      <span className={`text-[8px] px-1 rounded ${MC[member.model] || 'text-zinc-500 bg-zinc-700/30'}`}>
                        {member.model}
                      </span>
                    )}
                    {/* SuperClaude agent type badge */}
                    {isSuperClaude && (
                      <span className={`text-[7px] px-1 py-0.5 rounded font-bold flex items-center gap-0.5 ${scAgent.color}`}>
                        <Sparkles className="w-2 h-2" />
                        {scAgent.label}
                      </span>
                    )}
                    {/* Non-SuperClaude agent type */}
                    {!isSuperClaude && member.agentType && member.agentType !== 'team-lead' && (
                      <span className="text-[8px] opacity-50">{member.agentType}</span>
                    )}
                    {/* Per-member flags inherited from team */}
                    {!isLead && teamFlags.length > 0 && (
                      <div className="flex items-center gap-0.5">
                        {teamFlags.slice(0, 3).map((flag, i) => {
                          const cfg = SC_FLAGS[flag] || { label: flag.replace('--', ''), color: 'text-zinc-400 bg-zinc-700/30' };
                          return (
                            <span key={`mf-${i}`} className={`text-[6px] px-0.5 py-0.5 rounded font-mono font-bold ${cfg.color}`}>
                              {cfg.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {memberTask && (
                      <span className="text-[8px] opacity-60 truncate max-w-[120px]">{memberTask.activeForm || memberTask.subject}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tasks list */}
            {total > 0 && (
              <div className="space-y-0.5 pl-1">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 text-[10px]">
                    <span className={`flex-shrink-0 w-3 text-center ${
                      task.status === 'completed' ? 'text-green-400' :
                      task.status === 'in_progress' ? 'text-yellow-400 animate-pulse' :
                      'text-zinc-600'
                    }`}>
                      {task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▶' : '○'}
                    </span>
                    <span className={`flex-1 truncate ${
                      task.status === 'completed' ? 'text-zinc-500 line-through' :
                      task.status === 'in_progress' ? 'text-zinc-200' :
                      'text-zinc-400'
                    }`}>
                      {task.subject}
                    </span>
                    {task.owner && (
                      <span className="text-[8px] text-zinc-600 font-mono">{task.owner}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            </>)}
          </div>
        );
      })}
    </div>
  );
}


/* ── Ladder View: vertical multi-column agent tree with communication cross-links (사다리타기) ── */
function LadderView({ reqNode, team, teamMessages }) {
  const members = team?.members || [];
  if (members.length === 0) return null;

  // 1. Collect all agent nodes from tree belonging to this team
  const treeAgents = [];
  function collectAgents(node) {
    if (node.type === 'agent' && node.team_name === team.name) {
      treeAgents.push(node);
    }
    for (const child of (node.children || [])) {
      collectAgents(child);
    }
  }
  collectAgents(reqNode);

  // 2. Collect leader items (non-agent children at task level)
  const leaderItems = [];
  for (const taskNode of (reqNode.children || [])) {
    if (taskNode.type === 'task') {
      for (const child of (taskNode.children || [])) {
        if (child.type !== 'agent') {
          leaderItems.push(child);
        }
      }
    }
  }

  // 3. Build columns: leader + worker members
  const leader = members.find(m => m.agentType === 'team-lead');
  const workerMembers = members.filter(m => m.agentType !== 'team-lead');

  const columns = [];
  if (leader) {
    columns.push({
      key: leader.name,
      member: leader,
      isLeader: true,
      items: leaderItems,
      agentNode: null,
    });
  }
  // Task plan for enriching worker columns
  const taskPlan = reqNode.taskPlan || [];

  for (const m of workerMembers) {
    const agentNode = treeAgents.find(a => a.agent_name === m.name);
    const toolItems = [...(agentNode?.children || [])];

    // Enrich: always add assigned tasks from task plan
    const assignedTasks = taskPlan.filter(t => t.owner === m.name);
    for (const task of assignedTasks) {
      toolItems.push({
        id: `task-assign-${task.id}-${m.name}`,
        type: 'tool',
        name: task.status === 'completed' ? 'Done' : task.status === 'in_progress' ? 'Working' : 'Assigned',
        tool_name: 'TaskPlan',
        status: task.status === 'completed' ? 'completed' : task.status === 'in_progress' ? 'running' : 'completed',
        timestamp: task.timestamp || agentNode?.timestamp || 0,
        detail: task.subject || task.description || '',
      });
    }

    // Enrich: add agent output/result
    if (agentNode?.output) {
      toolItems.push({
        id: `output-${agentNode.id}`,
        type: 'tool',
        name: 'Output',
        tool_name: 'AgentOutput',
        status: 'completed',
        timestamp: agentNode.endTimestamp || agentNode.timestamp || 0,
        detail: (agentNode.output || '').slice(0, 300),
      });
    }

    // Enrich: add agent prompt when still empty
    if (toolItems.length === 0 && agentNode?.detail) {
      toolItems.push({
        id: `detail-${agentNode.id}`,
        type: 'tool',
        name: 'Mission',
        tool_name: 'AgentMission',
        status: 'completed',
        timestamp: agentNode.timestamp || 0,
        detail: (agentNode.detail || '').slice(0, 300),
      });
    }

    columns.push({
      key: m.name,
      member: m,
      isLeader: false,
      items: toolItems,
      agentNode: agentNode || null,
    });
  }

  const colCount = columns.length;
  if (colCount === 0) return null;

  // 4. Build sender map: timestamp → column name (from SendMessage tools in tree)
  const senderByTs = {};
  for (let ci = 0; ci < columns.length; ci++) {
    for (const item of columns[ci].items) {
      if (item.name === 'SendMessage' || item.tool_name === 'SendMessage') {
        const ts = typeof item.timestamp === 'number' ? item.timestamp : new Date(item.timestamp).getTime();
        senderByTs[ts] = columns[ci].key;
      }
    }
  }

  // 4b. Enrich worker columns with team messages
  {
    const leaderName = leader?.name || '';
    let workerRREnrich = 0;
    for (const msg of teamMessages) {
      if (['shutdown_request', 'shutdown_response', 'plan_approval_request', 'plan_approval_response'].includes(msg.msg_type)) continue;
      const ts = typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp).getTime();
      let senderName = msg.sender || '';
      if (!senderName) {
        for (const [msgTs, name] of Object.entries(senderByTs)) {
          if (Math.abs(ts - Number(msgTs)) < 3000 && name !== msg.recipient) {
            senderName = name; break;
          }
        }
      }
      if (!senderName) {
        if (msg.recipient === leaderName && workerMembers.length > 0) {
          const inferredWorker = workerMembers.find(w =>
            msg.summary?.includes(w.name) || msg.content?.includes(w.name)
          );
          if (inferredWorker) senderName = inferredWorker.name;
          else { senderName = workerMembers[workerRREnrich % workerMembers.length].name; workerRREnrich++; }
        } else { senderName = leaderName; }
      }
      // Add to sender's worker column
      const senderCol = columns.find(c => c.key === senderName && !c.isLeader);
      if (senderCol) {
        senderCol.items.push({
          id: `msg-sent-${msg.id || ts}`,
          type: 'tool',
          name: 'Report',
          tool_name: 'Report',
          status: 'completed',
          timestamp: ts,
          detail: msg.summary || (msg.content || '').slice(0, 120),
        });
      }
      // Add to recipient's worker column (if different from sender)
      const recipCol = columns.find(c => c.key === msg.recipient && !c.isLeader);
      if (recipCol && recipCol !== senderCol) {
        recipCol.items.push({
          id: `msg-recv-${msg.id || ts}`,
          type: 'tool',
          name: 'Directive',
          tool_name: 'Directive',
          status: 'completed',
          timestamp: ts,
          detail: msg.summary || (msg.content || '').slice(0, 120),
        });
      }
    }
    // Re-sort worker columns by timestamp
    for (const col of columns) {
      if (!col.isLeader) {
        col.items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      }
    }
  }

  // 5. Build chronological timeline
  const timeline = [];

  // Work items from each column
  for (let ci = 0; ci < columns.length; ci++) {
    for (const item of columns[ci].items) {
      const ts = typeof item.timestamp === 'number' ? item.timestamp : new Date(item.timestamp).getTime();
      timeline.push({ kind: 'work', colIdx: ci, node: item, ts });
    }
    // Agent status markers for worker columns
    if (columns[ci].agentNode) {
      const a = columns[ci].agentNode;
      const ts = typeof a.timestamp === 'number' ? a.timestamp : new Date(a.timestamp).getTime();
      timeline.push({
        kind: 'agent_marker',
        colIdx: ci,
        agentNode: a,
        ts,
      });
    }
  }

  // Messages as cross-links
  let workerRR = 0; // round-robin index for unknown worker senders
  for (const msg of teamMessages) {
    const ts = typeof msg.timestamp === 'number' ? msg.timestamp : new Date(msg.timestamp).getTime();

    // Derive sender: msg.sender → tree match by timestamp (skip self-links) → infer from context
    let senderName = msg.sender || '';
    if (!senderName) {
      for (const [msgTs, name] of Object.entries(senderByTs)) {
        if (Math.abs(ts - Number(msgTs)) < 3000 && name !== msg.recipient) {
          senderName = name;
          break;
        }
      }
    }
    if (!senderName) {
      const leaderName = leader?.name || '';
      if (msg.recipient === leaderName && workerMembers.length > 0) {
        // Worker → Leader: infer which worker by name mention in summary/content
        const inferredWorker = workerMembers.find(w =>
          msg.summary?.includes(w.name) || msg.content?.includes(w.name)
        );
        if (inferredWorker) {
          senderName = inferredWorker.name;
        } else {
          // Round-robin across workers for unknown senders
          senderName = workerMembers[workerRR % workerMembers.length].name;
          workerRR++;
        }
      } else {
        senderName = leaderName;
      }
    }

    const senderIdx = columns.findIndex(c => c.key === senderName);
    const recipientIdx = columns.findIndex(c => c.key === msg.recipient);

    // Skip self-links (sender == recipient in same column)
    if (senderIdx >= 0 && recipientIdx >= 0 && senderIdx === recipientIdx) continue;

    if (msg.msg_type === 'broadcast') {
      timeline.push({ kind: 'broadcast', senderIdx: senderIdx >= 0 ? senderIdx : 0, summary: msg.summary || '', ts });
    } else if (recipientIdx >= 0) {
      timeline.push({
        kind: 'message',
        senderIdx: senderIdx >= 0 ? senderIdx : 0,
        recipientIdx,
        summary: msg.summary || '',
        ts,
      });
    }
  }

  // Sort chronologically (oldest top → newest bottom)
  timeline.sort((a, b) => a.ts - b.ts);

  // 6. Render
  return (
    <div>
      {/* Column Headers (sticky) */}
      <div
        className="grid gap-2 mb-2 sticky top-0 z-30 bg-zinc-900/98 backdrop-blur-sm pb-2 border-b border-zinc-700/40"
        style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
      >
        {columns.map(col => {
          const scAgent = SC_AGENTS[col.member?.agentType];
          const Icon = col.isLeader ? Crown : Bot;
          const hasRunning = col.items.some(i => i.status === 'running') || col.agentNode?.status === 'running';
          const isDone = !hasRunning && col.items.length > 0;
          return (
            <div key={col.key} className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border ${
              col.isLeader ? 'border-orange-500/40 bg-orange-500/8' :
              hasRunning ? 'border-emerald-500/40 bg-emerald-500/8' :
              isDone ? 'border-green-500/25 bg-green-500/5' :
              'border-zinc-700/40 bg-zinc-800/30'
            }`}>
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${col.isLeader ? 'text-orange-400' : hasRunning ? 'text-emerald-400' : isDone ? 'text-green-400' : 'text-zinc-500'}`} />
                <span className={`text-[10px] font-mono font-bold truncate ${
                  col.isLeader ? 'text-orange-300' : hasRunning ? 'text-emerald-300' : isDone ? 'text-green-300' : 'text-zinc-400'
                }`}>{col.key}</span>
                {hasRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
                {isDone && !hasRunning && <CheckCircle className="w-2.5 h-2.5 text-green-500/60" />}
              </div>
              <div className="flex items-center gap-1">
                {scAgent && (
                  <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${scAgent.color}`}>{scAgent.label}</span>
                )}
                {col.member?.model && (
                  <span className={`text-[8px] px-1 py-0.5 rounded ${MC[col.member.model] || 'text-zinc-500 bg-zinc-700/30'}`}>{col.member.model}</span>
                )}
              </div>
              <span className="text-[8px] text-zinc-600">{col.items.length} items</span>
            </div>
          );
        })}
      </div>

      {/* Timeline with vertical rails */}
      <div className="relative min-h-[40px]">
        {/* Background vertical rails */}
        <div
          className="absolute inset-0 grid pointer-events-none z-0"
          style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
        >
          {columns.map(col => (
            <div key={`rail-${col.key}`} className="flex justify-center">
              <div className={`h-full ${
                col.isLeader ? 'w-0.5 bg-orange-500/15' :
                col.items.length > 0 || col.agentNode ? 'w-0.5 bg-zinc-700/40' :
                'w-px bg-zinc-800/25'
              }`} style={{ borderRadius: 1 }} />
            </div>
          ))}
        </div>

        {/* Timeline entries */}
        <div className="relative z-10">
          {timeline.map((entry, idx) => {
            // Work item: ArgoBox in the agent's column
            if (entry.kind === 'work') {
              return (
                <div key={idx} className="grid gap-1 py-0.5" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                  {columns.map((_, ci) => (
                    <div key={ci} className="flex justify-center min-h-[8px]">
                      {ci === entry.colIdx ? <ArgoBox node={entry.node} /> : null}
                    </div>
                  ))}
                </div>
              );
            }

            // Agent status marker
            if (entry.kind === 'agent_marker') {
              const a = entry.agentNode;
              const isRunning = a.status === 'running';
              return (
                <div key={idx} className="grid gap-1 py-0.5" style={{ gridTemplateColumns: `repeat(${colCount}, 1fr)` }}>
                  {columns.map((_, ci) => (
                    <div key={ci} className="flex justify-center">
                      {ci === entry.colIdx ? (
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-mono ${
                          isRunning ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' :
                          a.status === 'completed' ? 'border-green-500/30 bg-green-500/5 text-green-400' :
                          a.status === 'error' ? 'border-red-500/30 bg-red-500/5 text-red-400' :
                          'border-zinc-700/40 bg-zinc-800/20 text-zinc-500'
                        }`}>
                          {isRunning ? (
                            <>
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-500 opacity-60" />
                                <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
                              </span>
                              Working...
                            </>
                          ) : a.status === 'completed' ? (
                            <><CheckCircle className="w-2.5 h-2.5" /> Done</>
                          ) : a.status === 'error' ? (
                            <><XCircle className="w-2.5 h-2.5" /> Error</>
                          ) : (
                            <><Activity className="w-2.5 h-2.5" /> {a.status}</>
                          )}
                          <LiveTimer startTs={a.timestamp} endTs={a.endTimestamp} status={a.status} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            }

            // Message cross-link (사다리 가로선)
            if (entry.kind === 'message') {
              const leftIdx = Math.min(entry.senderIdx, entry.recipientIdx);
              const rightIdx = Math.max(entry.senderIdx, entry.recipientIdx);
              const goesRight = entry.senderIdx <= entry.recipientIdx;
              const leftPct = ((leftIdx + 0.5) / colCount) * 100;
              const rightPct = ((rightIdx + 0.5) / colCount) * 100;

              return (
                <div key={idx} className="relative z-20 my-0.5" style={{ height: 32 }}>
                  {/* Cross-link line */}
                  <div
                    className="absolute flex items-center"
                    style={{
                      left: `calc(${leftPct}% - 5px)`,
                      width: `calc(${rightPct - leftPct}% + 10px)`,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {/* Left endpoint: sender if goesRight, recipient if goesLeft */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      goesRight ? 'bg-emerald-500' : 'border-2 border-emerald-500 bg-transparent'
                    }`} />
                    {/* Line with gradient */}
                    <div className="flex-1 relative" style={{ height: 2 }}>
                      <div className={`absolute inset-0 ${
                        goesRight
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-500/40'
                          : 'bg-gradient-to-l from-emerald-500 to-emerald-500/40'
                      }`} style={{ borderRadius: 1 }} />
                      {/* Arrow pointing to recipient */}
                      <div className={`absolute top-1/2 -translate-y-1/2 w-0 h-0
                        border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent
                        ${goesRight
                          ? 'right-0 border-l-[7px] border-l-emerald-500'
                          : 'left-0 border-r-[7px] border-r-emerald-500'
                        }`}
                      />
                    </div>
                    {/* Right endpoint: recipient if goesRight, sender if goesLeft */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      goesRight ? 'border-2 border-emerald-500 bg-transparent' : 'bg-emerald-500'
                    }`} />
                  </div>
                  {/* Summary label centered on line */}
                  <div
                    className="absolute flex justify-center pointer-events-none"
                    style={{
                      left: `${leftPct}%`,
                      width: `${rightPct - leftPct}%`,
                      top: 0,
                    }}
                  >
                    <span className="text-[8px] text-emerald-300 bg-zinc-900/95 px-1.5 py-0.5 rounded-sm truncate max-w-[180px] border border-emerald-500/20">
                      {entry.summary}
                    </span>
                  </div>
                </div>
              );
            }

            // Broadcast (full-width)
            if (entry.kind === 'broadcast') {
              return (
                <div key={idx} className="relative flex items-center px-2 z-20 my-0.5" style={{ height: 28 }}>
                  <div className="flex-1 h-0.5 bg-purple-500/30 rounded" />
                  <span className="text-[8px] text-purple-200 bg-purple-500/15 px-2 py-0.5 rounded mx-1.5 whitespace-nowrap border border-purple-500/20">
                    {entry.summary}
                  </span>
                  <div className="flex-1 h-0.5 bg-purple-500/30 rounded" />
                </div>
              );
            }

            return null;
          })}
        </div>

        {/* Empty state */}
        {timeline.length === 0 && (
          <div className="flex justify-center py-4">
            <span className="text-[9px] text-zinc-600 italic">Waiting for agent activity...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Stats bar ── */
function Stats({ stats }) {
  if (!stats) return null;
  const { totalSkills, totalAgents, totalTools, totalReqs, runningAgents, iterations } = stats;
  const loops = Object.entries(iterations || {}).filter(([, v]) => v > 1);

  return (
    <div className="flex items-center gap-3 text-[11px] mb-3 px-1">
      {totalReqs > 0 && <span className="text-blue-400 font-medium">{totalReqs} requests</span>}
      {totalSkills > 0 && <span className="text-purple-400 font-medium">{totalSkills} skills</span>}
      <span className="text-emerald-400 font-medium">
        {totalAgents} agents
        {runningAgents > 0 && <span className="ml-1 animate-pulse font-bold">({runningAgents} live)</span>}
      </span>
      <span className="text-amber-400 font-medium">{totalTools} tools</span>
      {loops.map(([name, count]) => (
        <span key={name} className="text-rose-400 font-bold">
          <Repeat className="w-3 h-3 inline mr-0.5" />{name} x{count}
        </span>
      ))}
    </div>
  );
}

/* ── Team snapshot from tree (persists after team deletion) ── */
function getTeamFromReqNode(reqNode) {
  const agents = [];
  function scan(node) {
    if (node.type === 'agent' && node.team_name) agents.push(node);
    for (const child of (node.children || [])) scan(child);
  }
  scan(reqNode);
  if (agents.length === 0) return null;

  const teamName = agents[0].team_name;
  const members = [{ name: 'team-lead', agentType: 'team-lead', model: '' }];
  const seen = new Set(['team-lead']);
  for (const a of agents) {
    const name = a.agent_name || a.name;
    if (!seen.has(name)) {
      seen.add(name);
      members.push({ name, agentType: a.agent_type || a.name, model: a.model || '' });
    }
  }
  return { name: teamName, members };
}

/* ── Export ── */
export function HorizontalTree({ data, liveStatus, teams, sessionId }) {
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const handleDismiss = (id) => {
    setDismissedIds(prev => new Set([...prev, id]));
  };

  const hasTeams = Object.keys(teams || {}).length > 0;
  const hasData = data && data.children?.length > 0;

  // DESC sort (most recent first), filter dismissed
  const reqNodes = hasData
    ? [...data.children].reverse().filter(n => !dismissedIds.has(n.id))
    : [];

  // Live team (current)
  const teamList = Object.values(teams || {});
  const liveTeam = teamList.find(t => (t.members || []).length > 1);
  const teamMessages = data?.teamMessages || [];

  // ── SINGLE RENDER: TeamBar + RequestCard (with ladder view when team active) ──
  return (
    <div>
      <TeamBar teams={teams} sessionId={sessionId} />
      {hasData && <ThreadPoolBar stats={data.stats} liveStatus={liveStatus} />}
      {hasData && <Stats stats={data.stats} />}
      {!hasData && !hasTeams && (
        <div className="text-xs text-zinc-500 text-center py-6">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Waiting for events...
        </div>
      )}
      {!hasData && hasTeams && (
        <div className="text-xs text-zinc-500 text-center py-4">
          <Activity className="w-6 h-6 mx-auto mb-1.5 opacity-20" />
          Team active, waiting for execution events...
        </div>
      )}
      <div className="flex flex-col gap-2">
        {reqNodes.map((reqNode, i) => {
          // Team mode: live team OR snapshot from tree (persists after team deletion)
          const teamForReq = liveTeam || getTeamFromReqNode(reqNode);
          return (
            <RequestCard
              key={reqNode.id || i}
              reqNode={reqNode}
              defaultOpen={i === 0}
              onDismiss={reqNode.status !== 'running' ? handleDismiss : null}
              activeTeam={teamForReq}
              teamMessages={teamMessages}
            />
          );
        })}
      </div>
      {dismissedIds.size > 0 && (
        <button
          onClick={() => setDismissedIds(new Set())}
          className="mt-3 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Show {dismissedIds.size} dismissed items
        </button>
      )}
    </div>
  );
}

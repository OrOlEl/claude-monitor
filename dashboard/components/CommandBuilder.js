'use client';

import { Zap, Flag, Cpu, Bot, ChevronDown, ChevronUp, X } from 'lucide-react';

// Default static options (overridden by server scan data when available)
const DEFAULT_SKILLS = [
  { id: 'implement', label: 'implement' },
  { id: 'analyze', label: 'analyze' },
  { id: 'improve', label: 'improve' },
  { id: 'troubleshoot', label: 'troubleshoot' },
  { id: 'explain', label: 'explain' },
  { id: 'review', label: 'review' },
  { id: 'test', label: 'test' },
  { id: 'build', label: 'build' },
];

const DEFAULT_FLAGS = [
  { id: 'ultrathink', label: 'ultrathink' },
  { id: 'aggressive', label: 'aggressive' },
  { id: 'verbose', label: 'verbose' },
  { id: 'safe', label: 'safe' },
  { id: 'dry-run', label: 'dry-run' },
];

const MODELS = [
  { id: 'haiku', label: 'Haiku' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
];

const DEFAULT_AGENTS = [
  { id: 'frontend-architect', label: 'frontend' },
  { id: 'backend-architect', label: 'backend' },
  { id: 'security-engineer', label: 'security' },
  { id: 'quality-engineer', label: 'quality' },
  { id: 'system-architect', label: 'architect' },
];

// Priority order for skills and flags (shown first)
const PRIORITY_SKILLS = ['implement', 'analyze', 'cleanup', 'test', 'design', 'troubleshoot', 'improve', 'build'];
const PRIORITY_FLAGS = ['ultrathink', 'all-mcp', 'verbose', 'safe-mode', 'aggressive', 'loop'];

function sortByPriority(items, priorityList) {
  return [...items].sort((a, b) => {
    const ai = priorityList.indexOf(a.id);
    const bi = priorityList.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return 0;
  });
}

function BadgeButton({ active, onClick, children, colorClass }) {
  const baseClass = 'text-xs rounded px-2 py-1 transition-colors cursor-pointer';
  const offClass = 'bg-argo-card/40 border border-argo-border/50 text-argo-muted hover:text-argo-text hover:border-argo-border';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} ${active ? colorClass : offClass}`}
    >
      {children}
    </button>
  );
}

function Section({ icon: Icon, label, children }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-argo-muted" />
        <span className="text-xs text-argo-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {children}
      </div>
    </div>
  );
}

export function CommandBuilder({
  availableSkills,
  availableFlags,
  availableAgents,
  selectedSkill,
  selectedFlags,
  selectedModels,
  selectedAgents,
  toggleSkill,
  toggleFlag,
  toggleModel,
  toggleAgent,
  isOpen,
  setIsOpen,
  hasSelections,
  clearAll,
  commandPrefix,
  commandSuffix,
}) {
  const skills = sortByPriority(availableSkills.length ? availableSkills : DEFAULT_SKILLS, PRIORITY_SKILLS);
  const flags = sortByPriority(availableFlags.length ? availableFlags : DEFAULT_FLAGS, PRIORITY_FLAGS);
  const agents = availableAgents.length ? availableAgents : DEFAULT_AGENTS;

  return (
    <div className="mb-2">
      {/* Collapsed header bar */}
      <div className="flex items-center gap-1 mb-1">
        <button
          type="button"
          onClick={() => setIsOpen(v => !v)}
          className="flex items-center gap-1 text-xs text-argo-muted hover:text-argo-text transition-colors px-1 py-0.5 rounded hover:bg-argo-card/30"
        >
          {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>빌더</span>
        </button>

        {/* Active badges summary (collapsed view) */}
        {!isOpen && hasSelections && (
          <div className="flex flex-wrap gap-1 flex-1">
            {selectedSkill && (
              <span className="text-xs rounded px-1.5 py-0.5 bg-argo-accent/20 border border-argo-accent/60 text-argo-accent">
                /{selectedSkill}
              </span>
            )}
            {selectedFlags.map(f => (
              <span key={f} className="text-xs rounded px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/60 text-amber-400">
                --{f}
              </span>
            ))}
            {selectedModels.map(m => (
              <span key={m} className="text-xs rounded px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/60 text-purple-300">
                {m}
              </span>
            ))}
            {selectedAgents.map(a => (
              <span key={a} className="text-xs rounded px-1.5 py-0.5 bg-green-500/20 border border-green-500/60 text-green-400">
                {a}
              </span>
            ))}
          </div>
        )}

        {hasSelections && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto text-xs text-argo-muted hover:text-argo-error transition-colors p-0.5 rounded"
            title="초기화"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Expanded panel */}
      {isOpen && (
        <div className="bg-argo-bg border border-argo-border/50 rounded-md p-2 mb-2 max-h-72 overflow-y-auto">
          <Section icon={Zap} label="SKILL">
            {skills.map(s => (
              <BadgeButton
                key={s.id}
                active={selectedSkill === s.id}
                onClick={() => toggleSkill(s.id)}
                colorClass="bg-argo-accent/20 border border-argo-accent/60 text-argo-accent"
              >
                {s.label || s.name || s.id}
              </BadgeButton>
            ))}
          </Section>

          <Section icon={Flag} label="FLAGS">
            {flags.map(f => (
              <BadgeButton
                key={f.id}
                active={selectedFlags.includes(f.id)}
                onClick={() => toggleFlag(f.id)}
                colorClass="bg-amber-500/20 border border-amber-500/60 text-amber-400"
              >
                {f.label || f.id}
              </BadgeButton>
            ))}
          </Section>

          <Section icon={Cpu} label="MODEL">
            {MODELS.map(m => (
              <BadgeButton
                key={m.id}
                active={selectedModels.includes(m.id)}
                onClick={() => toggleModel(m.id)}
                colorClass="bg-purple-500/20 border border-purple-500/60 text-purple-300"
              >
                {m.label}
              </BadgeButton>
            ))}
          </Section>

          <Section icon={Bot} label="AGENT">
            {agents.map(a => (
              <BadgeButton
                key={a.id}
                active={selectedAgents.includes(a.id)}
                onClick={() => toggleAgent(a.id)}
                colorClass="bg-green-500/20 border border-green-500/60 text-green-400"
              >
                {a.label || a.name || a.id}
              </BadgeButton>
            ))}
          </Section>

          {/* Preview box */}
          {hasSelections && (
            <div className="mt-2 bg-argo-bg border border-argo-border/30 rounded p-2 font-mono">
              {commandPrefix && (
                <div className="text-argo-accent text-xs">{commandPrefix}</div>
              )}
              <div className="text-argo-muted text-xs">(메시지 입력 내용)</div>
              {commandSuffix && (
                <div className="text-purple-300 text-xs whitespace-pre">{commandSuffix}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

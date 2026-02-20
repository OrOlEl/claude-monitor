'use client';

import { useState } from 'react';
import { Zap, Flag, Cpu, Bot, ChevronDown, ChevronUp, X, Bookmark, Pencil, Plus } from 'lucide-react';

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

function CreatePresetForm({ onSave, onCancel }) {
  const [name, setName] = useState('');
  return (
    <div className="mt-1 flex items-center gap-1 bg-argo-card/30 rounded p-1.5">
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="프리셋 이름"
        className="flex-1 bg-transparent text-xs text-argo-text placeholder-argo-muted outline-none border border-argo-border/50 rounded px-2 py-0.5"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        type="button"
        onClick={() => name.trim() && onSave(name.trim())}
        className="text-xs text-teal-400 hover:text-teal-300 px-1.5 py-0.5 rounded hover:bg-teal-500/10 transition-colors"
      >저장</button>
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-argo-muted hover:text-argo-text px-1.5 py-0.5 rounded hover:bg-argo-card/30 transition-colors"
      >취소</button>
    </div>
  );
}

function EditPresetForm({ preset, presetId, onUpdate, onDelete, onClose, selectedSkill, selectedFlags, selectedModels, selectedAgents }) {
  const [name, setName] = useState(preset.name || presetId);
  return (
    <div className="mt-1 bg-argo-card/30 rounded p-1.5 space-y-1">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 bg-transparent text-xs text-argo-text outline-none border border-argo-border/50 rounded px-2 py-0.5"
        />
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onUpdate(presetId, { name, skill: selectedSkill, flags: selectedFlags, models: selectedModels, agents: selectedAgents })}
          className="text-xs text-teal-400 hover:text-teal-300 px-1.5 py-0.5 rounded hover:bg-teal-500/10 transition-colors"
        >현재 선택으로 덮어쓰기</button>
        <button
          type="button"
          onClick={() => onDelete(presetId)}
          className="text-xs text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-500/10 transition-colors"
        >삭제</button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-argo-muted hover:text-argo-text px-1.5 py-0.5 rounded hover:bg-argo-card/30 transition-colors"
        >닫기</button>
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
  // Preset props
  presets,
  activePresetId,
  isPresetModified,
  editingPresetId,
  isCreatingPreset,
  applyPreset,
  savePreset,
  updatePreset,
  deletePreset,
  setEditingPresetId,
  setIsCreatingPreset,
}) {
  const skills = sortByPriority(availableSkills.length ? availableSkills : DEFAULT_SKILLS, PRIORITY_SKILLS);
  const flags = sortByPriority(availableFlags.length ? availableFlags : DEFAULT_FLAGS, PRIORITY_FLAGS);
  const agents = availableAgents.length ? availableAgents : DEFAULT_AGENTS;
  const presetEntries = Object.entries(presets || {});

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

        {/* Preset buttons + Active badges summary (collapsed view) */}
        {!isOpen && (presetEntries.length > 0 || hasSelections) && (
          <div className="flex flex-wrap gap-1 flex-1">
            {/* Preset buttons (no edit icon in collapsed view) */}
            {presetEntries.map(([id, preset]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`text-xs rounded px-1.5 py-0.5 transition-colors ${
                  activePresetId === id
                    ? 'bg-teal-500/20 border border-teal-500/60 text-teal-400'
                    : 'bg-teal-500/10 border border-teal-500/30 text-teal-500 hover:border-teal-500/60 hover:text-teal-400'
                }`}
              >
                {preset.name}{activePresetId === id && isPresetModified ? ' •' : ''}
              </button>
            ))}
            {/* Selection badges */}
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
          {/* PRESETS section */}
          <div className="mb-2">
            <div className="flex items-center gap-1 mb-1">
              <Bookmark className="w-3 h-3 text-argo-muted" />
              <span className="text-xs text-argo-muted uppercase tracking-wider">PRESETS</span>
            </div>
            {(presetEntries.length > 0 || isCreatingPreset) && (
              <div className="flex flex-wrap gap-1">
                {presetEntries.map(([id, preset]) => (
                  <div key={id} className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => applyPreset(id)}
                      className={`text-xs rounded px-2 py-1 transition-colors cursor-pointer ${
                        activePresetId === id
                          ? 'bg-teal-500/30 border border-teal-500/80 text-teal-300'
                          : 'bg-teal-500/10 border border-teal-500/30 text-teal-500 hover:border-teal-500/60 hover:text-teal-400'
                      }`}
                    >
                      {preset.name}{activePresetId === id && isPresetModified ? ' •' : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPresetId(editingPresetId === id ? null : id)}
                      className="text-xs text-argo-muted hover:text-argo-text p-0.5 rounded transition-colors"
                      title="편집"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCreatingPreset(true)}
                  className="text-xs text-argo-muted hover:text-argo-text p-1 rounded transition-colors hover:bg-argo-card/30"
                  title="프리셋 추가"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            )}
            {!presetEntries.length && !isCreatingPreset && (
              <button
                type="button"
                onClick={() => setIsCreatingPreset(true)}
                className="flex items-center gap-1 text-xs text-argo-muted hover:text-argo-text transition-colors px-1 py-0.5 rounded hover:bg-argo-card/30"
                title="프리셋 추가"
              >
                <Plus className="w-3 h-3" />
                <span>새 프리셋</span>
              </button>
            )}
            {isCreatingPreset && (
              <CreatePresetForm
                onSave={savePreset}
                onCancel={() => setIsCreatingPreset(false)}
              />
            )}
            {editingPresetId && presets[editingPresetId] && (
              <EditPresetForm
                preset={presets[editingPresetId]}
                presetId={editingPresetId}
                onUpdate={updatePreset}
                onDelete={deletePreset}
                onClose={() => setEditingPresetId(null)}
                selectedSkill={selectedSkill}
                selectedFlags={selectedFlags}
                selectedModels={selectedModels}
                selectedAgents={selectedAgents}
              />
            )}
          </div>

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

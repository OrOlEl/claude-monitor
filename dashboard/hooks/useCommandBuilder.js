'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';

function loadSetting(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function useCommandBuilder(socket) {
  // Available data from server scan
  const [availableSkills, setAvailableSkills] = useState([]);
  const [availableFlags, setAvailableFlags] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);

  // Selection state (localStorage persisted)
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [selectedFlags, setSelectedFlags] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Preset state
  const [presets, setPresets] = useState({});
  const [activePresetId, setActivePresetId] = useState(null);
  const [isPresetModified, setIsPresetModified] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState(null);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);

  // SSR-safe: load from localStorage after mount
  useEffect(() => {
    setSelectedSkill(loadSetting('cmd-skill', null));
    setSelectedFlags(loadSetting('cmd-flags', []));
    setSelectedModels(loadSetting('cmd-models', []));
    setSelectedAgents(loadSetting('cmd-agents', []));
    setIsOpen(loadSetting('cmd-open', false));
    setSettingsLoaded(true);
  }, []);

  // Persist to localStorage after settings are loaded
  useEffect(() => {
    if (settingsLoaded) saveSetting('cmd-skill', selectedSkill);
  }, [selectedSkill, settingsLoaded]);

  useEffect(() => {
    if (settingsLoaded) saveSetting('cmd-flags', selectedFlags);
  }, [selectedFlags, settingsLoaded]);

  useEffect(() => {
    if (settingsLoaded) saveSetting('cmd-models', selectedModels);
  }, [selectedModels, settingsLoaded]);

  useEffect(() => {
    if (settingsLoaded) saveSetting('cmd-agents', selectedAgents);
  }, [selectedAgents, settingsLoaded]);

  useEffect(() => {
    if (settingsLoaded) saveSetting('cmd-open', isOpen);
  }, [isOpen, settingsLoaded]);

  // Toggle functions
  const toggleSkill = useCallback((id) => {
    setSelectedSkill(prev => prev === id ? null : id);
  }, []);

  const toggleFlag = useCallback((id) => {
    setSelectedFlags(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  }, []);

  const toggleModel = useCallback((id) => {
    setSelectedModels(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }, []);

  const clearAll = useCallback(() => {
    setSelectedSkill(null);
    setSelectedFlags([]);
    setSelectedModels([]);
    setSelectedAgents([]);
  }, []);

  // Load scan data from server
  const loadScanData = useCallback((data) => {
    if (!data) return;
    if (Array.isArray(data.skills)) setAvailableSkills(data.skills);
    if (Array.isArray(data.flags)) setAvailableFlags(data.flags);
    if (Array.isArray(data.agents)) setAvailableAgents(data.agents);
  }, []);

  // Build command prefix from selections
  const commandPrefix = useMemo(() => {
    const parts = [];
    if (selectedSkill) parts.push(`/sc:${selectedSkill}`);
    if (selectedFlags.length) parts.push(selectedFlags.map(f => `--${f}`).join(' '));
    return parts.join(' ') || null;
  }, [selectedSkill, selectedFlags]);

  const toggleAgent = useCallback((id) => {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }, []);

  // Build command suffix from selections
  const commandSuffix = useMemo(() => {
    const parts = [];
    if (selectedModels.length) {
      const modelMap = { haiku: '하이쿠', sonnet: '소넷', opus: '오푸스' };
      const names = selectedModels.map(m => modelMap[m] || m).join(',');
      parts.push(`사용가능모델:${names}`);
    }
    if (selectedAgents.length) {
      parts.push(`위임에이전트:${selectedAgents.join(',')}`);
    }
    return parts.join('\n') || null;
  }, [selectedModels, selectedAgents]);

  const hasSelections = !!(selectedSkill || selectedFlags.length || selectedModels.length || selectedAgents.length);

  // Preset functions
  const loadPresets = useCallback((data) => {
    setPresets(data || {});
  }, []);

  const applyPreset = useCallback((id) => {
    if (activePresetId === id) {
      setActivePresetId(null);
      setIsPresetModified(false);
      return;
    }
    const p = presets[id];
    if (!p) return;
    setSelectedSkill(p.skill || null);
    setSelectedFlags(p.flags || []);
    setSelectedModels(p.models || []);
    setSelectedAgents(p.agents || []);
    setActivePresetId(id);
    setIsPresetModified(false);
  }, [activePresetId, presets]);

  const savePreset = useCallback((name) => {
    if (!socket) return;
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣-]/g, '').replace(/-+/g, '-') || `preset-${Date.now()}`;
    socket.emit('savePreset', { id, name, skill: selectedSkill, flags: selectedFlags, models: selectedModels, agents: selectedAgents });
    setActivePresetId(id);
    setIsPresetModified(false);
    setIsCreatingPreset(false);
  }, [socket, selectedSkill, selectedFlags, selectedModels, selectedAgents]);

  const updatePreset = useCallback((id, updates) => {
    if (!socket) return;
    socket.emit('updatePreset', { id, ...updates });
    setEditingPresetId(null);
    setIsPresetModified(false);
  }, [socket]);

  const deletePreset = useCallback((id) => {
    if (!socket) return;
    socket.emit('deletePreset', { id });
    if (activePresetId === id) {
      setActivePresetId(null);
      setIsPresetModified(false);
    }
    setEditingPresetId(null);
  }, [socket, activePresetId]);

  // Preset modification detection
  const checkPresetModified = useCallback((skill, flags, models, agents) => {
    if (!activePresetId || !presets[activePresetId]) { setIsPresetModified(false); return; }
    const p = presets[activePresetId];
    const modified = skill !== (p.skill || null) ||
      JSON.stringify([...flags].sort()) !== JSON.stringify([...(p.flags || [])].sort()) ||
      JSON.stringify([...models].sort()) !== JSON.stringify([...(p.models || [])].sort()) ||
      JSON.stringify([...agents].sort()) !== JSON.stringify([...(p.agents || [])].sort());
    setIsPresetModified(modified);
  }, [activePresetId, presets]);

  useEffect(() => {
    checkPresetModified(selectedSkill, selectedFlags, selectedModels, selectedAgents);
  }, [selectedSkill, selectedFlags, selectedModels, selectedAgents, checkPresetModified]);

  return {
    // Available data
    availableSkills,
    availableFlags,
    availableAgents,
    loadScanData,
    // Selection state
    selectedSkill,
    selectedFlags,
    selectedModels,
    selectedAgents,
    toggleSkill,
    toggleFlag,
    toggleModel,
    toggleAgent,
    // UI state
    isOpen,
    setIsOpen,
    hasSelections,
    // Composed results
    commandPrefix,
    commandSuffix,
    // Reset
    clearAll,
    // Preset state
    presets,
    activePresetId,
    isPresetModified,
    editingPresetId,
    isCreatingPreset,
    // Preset functions
    loadPresets,
    applyPreset,
    savePreset,
    updatePreset,
    deletePreset,
    setEditingPresetId,
    setIsCreatingPreset,
  };
}

import { create } from 'zustand';

export const useSessionStore = create((set, get) => ({
  sessions: {},
  currentView: 'projects',
  selectedProject: null,
  activeSessionId: null,

  getComputedStatus: (session) => {
    if (!session) return 'ended';
    if (session.explicitlyEnded) return 'ended';

    const now = Date.now();
    const lastActivity = new Date(session.lastActivity).getTime();
    const inactiveMs = now - lastActivity;
    const THIRTY_SEC = 30 * 1000;
    const FIVE_MIN = 5 * 60 * 1000;
    const THIRTY_MIN = 30 * 60 * 1000;

    // Event-based detection: check for active tool execution
    if (session.hasActiveTool) {
      return 'running';
    }

    // Time-based fallback with improved heuristics
    if (inactiveMs < THIRTY_SEC) {
      return 'running';
    }
    if (inactiveMs < FIVE_MIN) {
      return 'idle';
    }
    if (inactiveMs < THIRTY_MIN) {
      return 'idle';
    }
    return 'ended';
  },

  updateFromEvent: (event) => set((state) => {
    const sessionId = event.session_id;
    if (!sessionId) return state;

    const existing = state.sessions[sessionId] || {
      id: sessionId,
      project: event.project || 'unknown',
      startTime: event.timestamp,
      lastActivity: event.timestamp,
      eventCount: 0,
      explicitlyEnded: false,
      lastEventType: null,
      hasActiveTool: false,
      activeToolCount: 0,
    };

    // Track tool execution state
    let hasActiveTool = existing.hasActiveTool;
    let activeToolCount = existing.activeToolCount || 0;

    if (event.type === 'tool_start') {
      hasActiveTool = true;
      activeToolCount++;
    } else if (event.type === 'tool_end') {
      activeToolCount = Math.max(0, activeToolCount - 1);
      hasActiveTool = activeToolCount > 0;
    }

    // Smart project update: don't overwrite valid project with "unknown"
    let project = existing.project;
    const newProject = event.project;
    if (newProject && newProject !== 'unknown') {
      project = newProject;
    } else if (!project || project === 'unknown') {
      project = newProject || 'unknown';
    }

    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...existing,
          project,
          lastActivity: event.timestamp,
          lastEventType: event.type,
          eventCount: existing.eventCount + 1,
          explicitlyEnded: event.type === 'session_end' ? true : existing.explicitlyEnded,
          hasActiveTool,
          activeToolCount,
        }
      }
    };
  }),

  setView: (view) => set({ currentView: view }),
  setSelectedProject: (project) => set({ selectedProject: project, currentView: 'sessions' }),
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId, currentView: 'detail' }),
  goBack: () => set((state) => {
    if (state.currentView === 'detail') return { currentView: 'sessions', activeSessionId: null };
    if (state.currentView === 'sessions') return { currentView: 'projects', selectedProject: null };
    return state;
  }),

  getProjectsWithSessions: () => {
    const sessions = get().sessions;
    const getComputedStatus = get().getComputedStatus;
    const projectMap = {};
    Object.values(sessions).forEach(session => {
      const project = session.project || 'unknown';
      if (!projectMap[project]) {
        projectMap[project] = { name: project, sessions: [], runningSessions: 0, idleSessions: 0 };
      }
      projectMap[project].sessions.push(session);
      const status = getComputedStatus(session);
      if (status === 'running') projectMap[project].runningSessions++;
      if (status === 'idle') projectMap[project].idleSessions++;
    });
    return Object.values(projectMap);
  },
}));

import { create } from 'zustand';

export const useEventStore = create((set, get) => ({
  events: [],
  states: {},
  conversations: [],
  connected: false,
  sessionId: null,
  teams: {},

  setConnected: (connected) => set({ connected }),

  initEvents: (events) => {
    const sessionId = events.length > 0 ? events[events.length - 1].session_id : null;
    set({ events, sessionId });
  },

  initConversations: (conversations) => {
    set({ conversations });
  },

  initTeams: (teams) => set({ teams: teams || {} }),
  updateTeams: (teams) => set({ teams: teams || {} }),

  // Get routing data for the active session (used by TeamBar to show flags)
  getActiveRouting: () => {
    const events = get().events;
    const sessionId = get().sessionId;
    if (!sessionId) return null;
    const routingEvents = events.filter(e => e.session_id === sessionId && e.type === 'routing');
    if (routingEvents.length === 0) return null;
    const latest = routingEvents[routingEvents.length - 1];
    return {
      tasks: latest.tasks ? latest.tasks.split(',').filter(Boolean) : [],
      flags: latest.flags ? latest.flags.split(',').filter(Boolean) : [],
      teamRecommended: latest.team_recommended || false,
      teamMembers: latest.team_members ? latest.team_members.split(',').filter(Boolean) : [],
    };
  },

  addConversation: (entry) => set((state) => {
    const isDuplicate = state.conversations.some(conv => {
      if (entry.uuid && conv.uuid) return entry.uuid === conv.uuid;
      return entry.type === conv.type &&
        JSON.stringify(conv.message?.content) === JSON.stringify(entry.message?.content) &&
        conv.sessionId === entry.sessionId;
    });
    if (isDuplicate) return state;
    const newConversations = [...state.conversations, entry].slice(-500);
    return { conversations: newConversations };
  }),

  addEvent: (event) => set((state) => {
    const newEvents = [...state.events, event].slice(-500);
    // Don't switch active session for subagent events (session_ids like "agent-xxx")
    // This prevents tree flickering when teams are running
    const isSubagent = event.session_id && event.session_id.startsWith('agent-');
    return {
      events: newEvents,
      sessionId: isSubagent ? state.sessionId : (event.session_id || state.sessionId)
    };
  }),

  updateState: (stateData) => set((state) => ({
    states: { ...state.states, [stateData.name]: stateData }
  })),

  getStats: () => {
    const events = get().events;
    const sessionId = get().sessionId;
    if (!sessionId) return { totalReqs: 0, totalTasks: 0, totalSkills: 0, totalAgents: 0, totalTools: 0, runningAgents: 0 };

    const se = events.filter(e => e.session_id === sessionId);
    const agentStarts = se.filter(e => e.type === 'agent_start').length;
    const agentEnds = se.filter(e => e.type === 'agent_end').length;
    const reqStarts = se.filter(e => e.type === 'req_start').length;

    return {
      totalReqs: reqStarts,
      totalTasks: reqStarts,
      totalSkills: se.filter(e => e.type === 'skill_start').length,
      totalAgents: agentStarts,
      totalTools: se.filter(e => e.type === 'tool_start').length,
      runningAgents: Math.max(0, agentStarts - agentEnds),
    };
  },

  getLiveStatus: () => {
    const events = get().events;
    const sessionId = get().sessionId;
    if (!sessionId) return { runningSkills: [], runningAgents: [], runningTools: [] };

    const se = events.filter(e => e.session_id === sessionId);
    const openSkills = [];
    const openAgents = [];
    const openTools = [];

    for (const event of se) {
      if (event.type === 'skill_start') {
        openSkills.push({ name: event.skill_name, timestamp: event.timestamp });
      } else if (event.type === 'skill_end') {
        const idx = openSkills.findLastIndex(s => s.name === event.skill_name);
        if (idx >= 0) openSkills.splice(idx, 1);
      } else if (event.type === 'agent_start') {
        openAgents.push({
          name: event.agent_type?.split(':').pop() || event.agent_type,
          agent_type: event.agent_type,
          model: event.model,
          timestamp: event.timestamp
        });
      } else if (event.type === 'agent_end') {
        const idx = event.agent_type
          ? openAgents.findLastIndex(a => a.agent_type === event.agent_type)
          : openAgents.length - 1;
        if (idx >= 0) openAgents.splice(idx, 1);
      } else if (event.type === 'tool_start') {
        openTools.push({ name: event.tool_name, timestamp: event.timestamp });
      } else if (event.type === 'tool_end') {
        const idx = openTools.findLastIndex(t => t.name === event.tool_name);
        if (idx >= 0) openTools.splice(idx, 1);
      }
    }

    return { runningSkills: openSkills, runningAgents: openAgents, runningTools: openTools };
  },

  // Build hierarchical tree: req → task → skill → agent → tool
  getTreeData: () => {
    const events = get().events;
    const sessionId = get().sessionId;
    if (!sessionId) return null;

    const sessionEvents = events.filter(e => e.session_id === sessionId);
    if (sessionEvents.length === 0) return null;

    const tree = {
      id: sessionId,
      type: 'session',
      name: `Session: ${sessionId.slice(0, 8)}`,
      timestamp: sessionEvents[0]?.timestamp,
      children: [],
      stats: { totalReqs: 0, totalTasks: 0, totalSkills: 0, totalAgents: 0, totalTools: 0, runningAgents: 0, iterations: {} }
    };

    // Current context pointers
    let currentReq = null;
    let currentTask = null;
    let currentSkill = null;
    let currentAgent = null;

    // Pending routing: routing events arrive BEFORE req_start (classifier.sh fires before req-tracker.sh)
    let pendingRouting = null;

    // Track open items for name-based end matching
    const openSkills = [];
    const openAgents = [];
    const openTools = [];
    const skillIterations = {};

    // Helper: ensure req + task exist
    // If no current req, reopen the last closed one instead of creating "Implicit Request"
    function ensureTaskContainer(ts) {
      if (!currentReq) {
        // Try to reopen the last request (e.g., after req_end but Claude continues working)
        if (tree.children.length > 0) {
          currentReq = tree.children[tree.children.length - 1];
          currentReq.status = 'running';
          currentReq.endTimestamp = undefined;
          // Reopen or create a task container within it
          const lastTask = currentReq.children[currentReq.children.length - 1];
          if (lastTask && lastTask.type === 'task') {
            currentTask = lastTask;
            currentTask.status = 'running';
            currentTask.endTimestamp = undefined;
          } else {
            currentTask = null; // will be created below
          }
          currentSkill = null;
          currentAgent = null;
        } else {
          // No previous request at all - create a truly implicit one
          currentReq = {
            id: `implicit-req-${ts}`,
            type: 'req',
            name: 'Request',
            summary: 'Request',
            status: 'running',
            timestamp: ts,
            children: [],
          };
          tree.children.push(currentReq);
          tree.stats.totalReqs++;

          currentTask = {
            id: `implicit-task-${ts}`,
            type: 'task',
            name: 'Processing',
            status: 'running',
            timestamp: ts,
            children: [],
          };
          currentReq.children.push(currentTask);
          tree.stats.totalTasks++;
          currentSkill = null;
          currentAgent = null;
        }
      }
      if (!currentTask) {
        currentTask = {
          id: `${currentReq.id}-task-${ts}`,
          type: 'task',
          name: 'Processing',
          status: 'running',
          timestamp: ts,
          children: [],
        };
        currentReq.children.push(currentTask);
        tree.stats.totalTasks++;
      }
    }

    for (const event of sessionEvents) {
      const ts = event.timestamp;

      if (event.type === 'req_start') {
        // Close previous req if still open (user interrupted)
        if (currentReq && currentReq.status === 'running') {
          currentReq.status = 'cancelled';
          currentReq.endTimestamp = ts;
          if (currentTask && currentTask.status === 'running') {
            currentTask.status = 'cancelled';
            currentTask.endTimestamp = ts;
          }
          openSkills.forEach(s => { s.node.status = 'cancelled'; s.node.endTimestamp = ts; });
          openAgents.forEach(a => { a.node.status = 'cancelled'; a.node.endTimestamp = ts; tree.stats.runningAgents = Math.max(0, tree.stats.runningAgents - 1); });
          openTools.forEach(t => { t.node.status = 'cancelled'; t.node.endTimestamp = ts; });
          openSkills.length = 0;
          openAgents.length = 0;
          openTools.length = 0;
        }

        // New user request → root node
        currentReq = {
          id: event.id,
          type: 'req',
          name: event.summary || 'Request',
          summary: event.summary,
          fullText: event.full_text || event.summary || 'Request',
          status: 'running',
          timestamp: ts,
          children: [],
        };
        tree.children.push(currentReq);
        tree.stats.totalReqs++;

        // Auto-create implicit task
        currentTask = {
          id: `${event.id}-task`,
          type: 'task',
          name: 'Processing',
          status: 'running',
          timestamp: ts,
          children: [],
        };
        currentReq.children.push(currentTask);
        tree.stats.totalTasks++;
        currentSkill = null;
        currentAgent = null;

        // Attach pending routing (from classifier.sh which fires before req-tracker.sh)
        if (pendingRouting && (ts - pendingRouting.timestamp < 5000)) {
          currentReq.routing = pendingRouting;
          pendingRouting = null;
        }

      } else if (event.type === 'req_end') {
        // Close current req and task
        if (currentReq) {
          currentReq.status = 'completed';
          currentReq.endTimestamp = ts;
        }
        if (currentTask) {
          currentTask.status = 'completed';
          currentTask.endTimestamp = ts;
        }
        // Close any remaining open items
        openSkills.forEach(s => { s.node.status = 'completed'; s.node.endTimestamp = ts; });
        openAgents.forEach(a => { a.node.status = 'completed'; a.node.endTimestamp = ts; });
        openTools.forEach(t => { t.node.status = 'completed'; t.node.endTimestamp = ts; });
        openSkills.length = 0;
        openAgents.length = 0;
        openTools.length = 0;
        currentReq = null;
        currentTask = null;
        currentSkill = null;
        currentAgent = null;

      } else if (event.type === 'skill_start') {
        ensureTaskContainer(ts);
        const skillName = event.skill_name || 'unknown';
        skillIterations[skillName] = (skillIterations[skillName] || 0) + 1;

        const skillNode = {
          id: event.id,
          type: 'skill',
          name: skillName,
          skill_name: skillName,
          status: 'running',
          timestamp: ts,
          iteration: skillIterations[skillName],
          detail: event.detail || '',
          children: [],
        };
        currentTask.children.push(skillNode);
        tree.stats.totalSkills++;
        openSkills.push({ name: skillName, node: skillNode });
        currentSkill = skillNode;
        currentAgent = null;

      } else if (event.type === 'skill_end') {
        const skillName = event.skill_name || 'unknown';
        const matchIdx = openSkills.findLastIndex(s => s.name === skillName);
        if (matchIdx >= 0) {
          openSkills[matchIdx].node.status = 'completed';
          openSkills[matchIdx].node.endTimestamp = ts;
          if (event.output) openSkills[matchIdx].node.output = event.output;
          if (event.detail && !openSkills[matchIdx].node.detail) openSkills[matchIdx].node.detail = event.detail;
          openSkills.splice(matchIdx, 1);
        }
        if (currentSkill && currentSkill.name === skillName) {
          currentSkill = openSkills.length > 0 ? openSkills[openSkills.length - 1].node : null;
          currentAgent = null;
        }

      } else if (event.type === 'agent_start') {
        ensureTaskContainer(ts);
        const agentName = event.agent_type?.split(':').pop() || event.agent_type || 'unknown';

        const agentNode = {
          id: event.id,
          type: 'agent',
          name: agentName,
          agent_type: event.agent_type,
          model: event.model,
          status: 'running',
          timestamp: ts,
          detail: event.detail || '',
          team_name: event.team_name || '',
          agent_name: event.agent_name || '',
          flags: event.flags ? event.flags.split(',').filter(Boolean) : [],
          children: [],
        };
        tree.stats.totalAgents++;
        tree.stats.runningAgents++;

        // Parent: current skill > current task
        const parent = currentSkill || currentTask;
        parent.children.push(agentNode);
        openAgents.push({ agent_type: event.agent_type, node: agentNode });
        currentAgent = agentNode;

      } else if (event.type === 'agent_end') {
        const agentType = event.agent_type;
        let matchIdx = -1;
        if (agentType) {
          matchIdx = openAgents.findLastIndex(a => a.agent_type === agentType);
        }
        if (matchIdx < 0 && openAgents.length > 0) matchIdx = openAgents.length - 1;
        if (matchIdx >= 0) {
          openAgents[matchIdx].node.status = 'completed';
          openAgents[matchIdx].node.endTimestamp = ts;
          if (event.output) openAgents[matchIdx].node.output = event.output;
          if (event.detail && !openAgents[matchIdx].node.detail) openAgents[matchIdx].node.detail = event.detail;
          tree.stats.runningAgents = Math.max(0, tree.stats.runningAgents - 1);
          openAgents.splice(matchIdx, 1);
        }
        if (currentAgent && currentAgent.agent_type === agentType) {
          currentAgent = openAgents.length > 0 ? openAgents[openAgents.length - 1].node : null;
        }

      } else if (event.type === 'thinking' || event.type === 'response_text') {
        ensureTaskContainer(ts);
        const isThinking = event.type === 'thinking';
        const thinkNode = {
          id: event.id,
          type: isThinking ? 'thinking' : 'response',
          name: event.summary || (isThinking ? 'Thinking...' : 'Response'),
          status: 'completed',
          timestamp: ts,
          endTimestamp: ts,
          detail: event.text || '',
          model: event.model || '',
        };
        // Attach to current agent > current skill > current task
        const parent = currentAgent || currentSkill || currentTask;
        parent.children.push(thinkNode);

      } else if (event.type === 'routing') {
        // Store as pending - will be attached when req_start arrives
        // (classifier.sh fires BEFORE req-tracker.sh in hook chain)
        const routingData = {
          tasks: event.tasks ? event.tasks.split(',').filter(Boolean) : [],
          flags: event.flags ? event.flags.split(',').filter(Boolean) : [],
          inputPreview: event.input_preview || '',
          timestamp: ts,
          teamRecommended: event.team_recommended || false,
          teamMembers: event.team_members ? event.team_members.split(',').filter(Boolean) : [],
        };
        // If there's already a current running request (late routing event), attach directly
        if (currentReq && currentReq.status === 'running' && !currentReq.routing) {
          currentReq.routing = routingData;
        } else {
          pendingRouting = routingData;
        }

      } else if (event.type === 'compaction_start') {
        // Mark current request as compaction in progress (for immediate UI feedback)
        if (currentReq) currentReq.compactionStarted = true;

      } else if (event.type === 'compaction') {
        ensureTaskContainer(ts);
        const compactNode = {
          id: event.id,
          type: 'compaction',
          name: 'Context Compacted',
          status: 'completed',
          timestamp: ts,
          endTimestamp: ts,
          detail: event.summary || 'Context compacted - continued from summary',
        };
        currentTask.children.push(compactNode);
        if (currentReq) {
          currentReq.compacted = true;
          currentReq.compactionStarted = false; // compaction done
        }

      } else if (event.type === 'task_plan') {
        // Task planning events from TaskCreate/TaskUpdate tool calls
        const targetReq = currentReq || (tree.children.length > 0 ? tree.children[tree.children.length - 1] : null);
        if (targetReq) {
          if (!targetReq.taskPlan) targetReq.taskPlan = [];
          if (!targetReq._taskIdMap) targetReq._taskIdMap = {};
          if (event.action === 'create') {
            // Track creation order → will be assigned sequential ID by Claude Code
            const seqId = targetReq.taskPlan.length + 1;
            targetReq.taskPlan.push({
              id: String(seqId),
              subject: event.subject || 'Task',
              description: event.description || '',
              activeForm: event.activeForm || '',
              status: 'pending',
              timestamp: ts,
            });
            // Remember: the Nth created task maps to global ID that will be used in updates
            targetReq._taskIdMap[`_seq_${seqId}`] = seqId;
          } else if (event.action === 'update') {
            const globalId = String(event.taskId);
            // Try direct match first (global ID → local ID mapping)
            let task = targetReq.taskPlan.find(t => t.id === globalId);
            if (!task) {
              // Build mapping: first update with unknown globalId → match to first unmatched task
              if (!targetReq._taskIdMap[globalId]) {
                // Find next unmapped sequential task
                for (let i = 0; i < targetReq.taskPlan.length; i++) {
                  const t = targetReq.taskPlan[i];
                  const mapped = Object.values(targetReq._taskIdMap).includes(t.id);
                  if (!mapped) {
                    targetReq._taskIdMap[globalId] = t.id;
                    break;
                  }
                }
              }
              const mappedId = targetReq._taskIdMap[globalId];
              if (mappedId) task = targetReq.taskPlan.find(t => t.id === String(mappedId));
            }
            if (task) {
              if (event.status) task.status = event.status;
              if (event.subject) task.subject = event.subject;
              if (event.owner) task.owner = event.owner;
            }
          }
        }

      } else if (event.type === 'tool_start') {
        ensureTaskContainer(ts);
        const toolNode = {
          id: event.id,
          type: 'tool',
          name: event.tool_name || 'unknown',
          tool_name: event.tool_name,
          status: 'running',
          timestamp: ts,
          detail: event.detail || '',
        };
        tree.stats.totalTools++;

        // Parent: current agent > current skill > current task
        const parent = currentAgent || currentSkill || currentTask;
        parent.children.push(toolNode);
        openTools.push({ tool_name: event.tool_name, node: toolNode });

      } else if (event.type === 'tool_end') {
        const toolName = event.tool_name || 'unknown';
        const matchIdx = openTools.findLastIndex(t => t.tool_name === toolName);
        if (matchIdx >= 0) {
          openTools[matchIdx].node.status = 'completed';
          openTools[matchIdx].node.endTimestamp = ts;
          if (event.output) openTools[matchIdx].node.output = event.output;
          if (event.detail && !openTools[matchIdx].node.detail) openTools[matchIdx].node.detail = event.detail;
          openTools.splice(matchIdx, 1);
        }
      }
    }

    // Stale detection: if no events recently and items still running, mark as stale
    // Compacted requests get shorter timeout since the cycle should end soon
    const lastTs = sessionEvents.length > 0 ? sessionEvents[sessionEvents.length - 1].timestamp : 0;
    const STALE_MS = 30000; // 30s default
    const COMPACTED_STALE_MS = 15000; // 15s for compacted requests
    if (lastTs && currentReq && currentReq.status === 'running') {
      const staleThreshold = currentReq.compacted ? COMPACTED_STALE_MS : STALE_MS;
      if (Date.now() - lastTs > staleThreshold) {
        currentReq.status = 'completed';
        currentReq.endTimestamp = lastTs;
        if (currentTask && currentTask.status === 'running') {
          currentTask.status = 'completed';
          currentTask.endTimestamp = lastTs;
        }
        openSkills.forEach(s => { s.node.status = 'completed'; s.node.endTimestamp = lastTs; });
        openAgents.forEach(a => { a.node.status = 'completed'; a.node.endTimestamp = lastTs; tree.stats.runningAgents = Math.max(0, tree.stats.runningAgents - 1); });
        openTools.forEach(t => { t.node.status = 'completed'; t.node.endTimestamp = lastTs; });
      }
    }

    tree.stats.iterations = skillIterations;

    // Collect team messages from ALL sessions (subagents have different session_ids)
    tree.teamMessages = events
      .filter(e => e.type === 'team_message')
      .map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        session_id: e.session_id || '',
        msg_type: e.msg_type || '',
        recipient: e.recipient || '',
        summary: e.summary || '',
        content: e.content || '',
        sender: e.sender || '',
      }));

    return tree;
  },
}));

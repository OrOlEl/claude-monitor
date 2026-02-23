const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const os = require('os');
const uuidv4 = () => crypto.randomUUID();

const TMUX_SESSION = process.env.TMUX_SESSION || 'claude';
const TMUX_PROMPT_PATTERN = process.env.TMUX_PROMPT_PATTERN || '>|❯';

const app = express();
const server = http.createServer(app);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3848'];
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

// CORS for REST API (same origins as Socket.IO)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3847;
const EVENTS_FILE = process.env.EVENTS_FILE || path.join(process.env.HOME, '.claude-monitor', 'events.jsonl');
const COMMANDS_FILE = process.env.COMMANDS_FILE || path.join(process.env.HOME, '.claude-monitor', 'commands.jsonl');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.env.HOME, '.claude', 'projects');
const TEAMS_DIR = path.join(process.env.HOME, '.claude', 'teams');
const TEAM_TASKS_DIR = path.join(process.env.HOME, '.claude', 'tasks');

const MONITOR_DIR = path.join(process.env.HOME, '.claude-monitor');
const CLAUDE_DIR = path.join(process.env.HOME, '.claude');
const CLAUDE_SC_DIR = path.join(CLAUDE_DIR, 'commands', 'sc');
const CLAUDE_FLAGS_FILE = path.join(CLAUDE_DIR, 'FLAGS.md');
const CLAUDE_AGENTS_DIR = path.join(CLAUDE_DIR, 'agents');

class ConfigManager {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = this._load();
  }
  _load() {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch (e) {
      return { version: 1, presets: {} };
    }
  }
  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {}
  }
  getPresets() { return this.data.presets; }
  setPreset(id, preset) { this.data.presets[id] = preset; this._save(); }
  deletePreset(id) { delete this.data.presets[id]; this._save(); }
}

const configManager = new ConfigManager(path.join(MONITOR_DIR, 'config.json'));

let claudeScanCache = null;
let claudeScanTimestamp = 0;
const CLAUDE_SCAN_TTL = 10 * 60 * 1000; // 10 minutes

const events = [];
const MAX_EVENTS = 1000;

const commandHistory = [];
const MAX_COMMAND_HISTORY = 100;

const transcriptTracking = new Map();
const conversationHistory = [];
const MAX_CONVERSATION_HISTORY = 500;

function extractSessionIdFromPath(filePath) {
  const filename = path.basename(filePath, '.jsonl');
  if (/^[0-9a-f-]{36}$/i.test(filename)) {
    return filename;
  }
  return null;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', events: events.length });
});

app.post('/api/command', (req, res) => {
  const { sessionId, command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command is required and must be a string' });
  }
  if (command.length > 2000) {
    return res.status(400).json({ error: 'command exceeds maximum length of 2000 characters' });
  }
  // Save to history (deduplicate consecutive)
  if (commandHistory[0] !== command) {
    commandHistory.unshift(command);
    if (commandHistory.length > MAX_COMMAND_HISTORY) commandHistory.pop();
  }

  let method = 'queue';
  const commandEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    sessionId: sessionId || 'unknown',
    command: command,
    status: 'pending',
    method: 'queue'
  };

  // Attempt tmux injection if available (regardless of idle state)
  if (isTmuxAvailable()) {
    try {
      const idle = isClaudeIdle();
      sendViaTmux(command);
      method = idle ? 'tmux' : 'tmux-queued';
      commandEntry.method = method;
      commandEntry.status = 'sent';
      console.log(`[command] Sent via tmux (${method}): ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
    } catch (tmuxError) {
      console.warn('[command] tmux send failed, falling back to queue:', tmuxError.message);
    }
  }

  try {
    const dir = path.dirname(COMMANDS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(COMMANDS_FILE, JSON.stringify(commandEntry) + '\n');
    io.emit('commandQueued', commandEntry);
    console.log(`[command] Queued (method=${method}): ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
    res.json({ success: true, command: commandEntry });
  } catch (error) {
    console.error('Failed to queue command:', error);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

app.get('/api/commands', (req, res) => {
  try {
    if (!fs.existsSync(COMMANDS_FILE)) {
      return res.json({ commands: [] });
    }
    const content = fs.readFileSync(COMMANDS_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const commands = lines
      .map(line => { try { return JSON.parse(line); } catch (e) { return null; } })
      .filter(cmd => cmd && cmd.status === 'pending');
    res.json({ commands });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read commands' });
  }
});

// Hook-based tmux idle notifications (event-driven)
app.post('/api/tmux-idle', (req, res) => {
  const prev = hookIdleState;
  hookIdleState = true;
  hookIdleTimestamp = Date.now();
  console.log(`[tmux-hook] Claude is IDLE (via hook)`);
  if (prev !== true) {
    io.emit('tmuxStatus', getTmuxStatus());
  }
  res.json({ ok: true, state: 'idle' });
});

app.get('/api/tmux/status', (req, res) => {
  lastTmuxCheck = 0; // Force fresh check
  const status = getTmuxStatus();
  res.json({
    ...status,
    hookIdleState,
    hookAge: hookIdleTimestamp ? Date.now() - hookIdleTimestamp : null,
    serverUptime: Math.floor(process.uptime()),
  });
});

app.post('/api/tmux-busy', (req, res) => {
  const prev = hookIdleState;
  hookIdleState = false;
  hookIdleTimestamp = Date.now();
  console.log(`[tmux-hook] Claude is BUSY (via hook)`);
  if (prev !== false) {
    io.emit('tmuxStatus', getTmuxStatus());
  }
  res.json({ ok: true, state: 'busy' });
});

app.get('/api/claude/scan', (req, res) => {
  const force = req.query.force === 'true';
  const now = Date.now();
  if (!force && claudeScanCache && (now - claudeScanTimestamp) < CLAUDE_SCAN_TTL) {
    return res.json(claudeScanCache);
  }
  try {
    claudeScanCache = scanClaudeFolder();
    claudeScanTimestamp = Date.now();
    res.json(claudeScanCache);
  } catch (error) {
    res.status(500).json({ error: 'Failed to scan .claude folder' });
  }
});

app.get('/api/presets', (req, res) => {
  res.json(configManager.getPresets());
});

app.post('/api/presets', (req, res) => {
  const { id, name, skill, flags, models, agents, order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const presetId = id || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163-]/g, '').replace(/-+/g, '-') || `preset-${Date.now()}`;
  const preset = { id: presetId, name, skill, flags, models, agents, order, updatedAt: new Date().toISOString() };
  configManager.setPreset(presetId, preset);
  io.emit('presetsUpdated', configManager.getPresets());
  res.json({ success: true, preset });
});

app.put('/api/presets/:id', (req, res) => {
  const { id } = req.params;
  const presets = configManager.getPresets();
  if (!presets[id]) return res.status(404).json({ error: 'Preset not found' });
  const updated = { ...presets[id], ...req.body, id, updatedAt: new Date().toISOString() };
  configManager.setPreset(id, updated);
  io.emit('presetsUpdated', configManager.getPresets());
  res.json({ success: true, preset: updated });
});

app.delete('/api/presets/:id', (req, res) => {
  const { id } = req.params;
  const presets = configManager.getPresets();
  if (!presets[id]) return res.status(404).json({ error: 'Preset not found' });
  configManager.deletePreset(id);
  io.emit('presetsUpdated', configManager.getPresets());
  res.json({ success: true });
});

function loadInitialEvents() {
  if (fs.existsSync(EVENTS_FILE)) {
    const content = fs.readFileSync(EVENTS_FILE, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const recentLines = lines.slice(-MAX_EVENTS);
    for (const line of recentLines) {
      try { events.push(JSON.parse(line)); } catch (e) {}
    }
    console.log(`Loaded ${events.length} initial events`);
  }
}

let lastFileSize = 0;

function watchEventsFile() {
  const dir = path.dirname(EVENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '');

  const stats = fs.statSync(EVENTS_FILE);
  lastFileSize = stats.size;

  const watcher = chokidar.watch(EVENTS_FILE, {
    persistent: true,
    usePolling: true,
    interval: 300
  });

  watcher.on('change', () => {
    try {
      const stats = fs.statSync(EVENTS_FILE);
      const newSize = stats.size;
      if (newSize > lastFileSize) {
        const fd = fs.openSync(EVENTS_FILE, 'r');
        const buffer = Buffer.alloc(newSize - lastFileSize);
        fs.readSync(fd, buffer, 0, buffer.length, lastFileSize);
        fs.closeSync(fd);
        const newContent = buffer.toString('utf-8');
        const lines = newContent.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            events.push(event);
            if (events.length > MAX_EVENTS) events.shift();
            handleStopEvent(event);
            io.emit('event', event);
          } catch (e) {}
        }
        lastFileSize = newSize;
      }
    } catch (e) {
      console.error('Watch error:', e.message);
    }
  });
  console.log(`Watching: ${EVENTS_FILE}`);
}

function readNewTranscriptLines(filePath) {
  try {
    const tracking = transcriptTracking.get(filePath);
    if (!tracking) return [];
    if (!fs.existsSync(filePath)) return [];
    const stats = fs.statSync(filePath);
    const currentSize = stats.size;
    if (currentSize < tracking.lastPosition) tracking.lastPosition = 0;
    if (currentSize <= tracking.lastPosition) return [];
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(currentSize - tracking.lastPosition);
    fs.readSync(fd, buffer, 0, buffer.length, tracking.lastPosition);
    fs.closeSync(fd);
    tracking.lastPosition = currentSize;
    tracking.lastRead = Date.now();
    const newContent = buffer.toString('utf-8');
    const lines = newContent.trim().split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines) {
      try { entries.push(JSON.parse(line)); } catch (e) {}
    }
    return entries;
  } catch (e) {
    return [];
  }
}

// Track emitted thinking hashes to avoid duplicates
const emittedThinkingHashes = new Set();
const MAX_THINKING_HASHES = 500;

function extractThinkingEvents(entries, sessionId) {
  const thinkingEvents = [];
  for (const entry of entries) {
    if (entry.type !== 'assistant' || !entry.message?.content) continue;
    const content = entry.message.content;
    for (const block of content) {
      if (block.type === 'thinking' && block.thinking) {
        // Dedup by first 100 chars hash
        const hashKey = block.thinking.substring(0, 100);
        if (emittedThinkingHashes.has(hashKey)) continue;
        emittedThinkingHashes.add(hashKey);
        if (emittedThinkingHashes.size > MAX_THINKING_HASHES) {
          const first = emittedThinkingHashes.values().next().value;
          emittedThinkingHashes.delete(first);
        }

        thinkingEvents.push({
          id: uuidv4(),
          type: 'thinking',
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          session_id: sessionId,
          text: block.thinking.substring(0, 3000),
          summary: block.thinking.substring(0, 150).replace(/\n/g, ' ').trim(),
          model: entry.message?.model || '',
        });
      }
      if (block.type === 'text' && block.text && block.text.trim().length > 0) {
        thinkingEvents.push({
          id: uuidv4(),
          type: 'response_text',
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          session_id: sessionId,
          text: block.text.substring(0, 2000),
          summary: block.text.substring(0, 150).replace(/\n/g, ' ').trim(),
        });
      }
    }
  }
  return thinkingEvents;
}

function extractCompactionEvents(entries, sessionId) {
  const compactionEvents = [];
  for (const entry of entries) {
    // Detect /compact command trigger (compaction start)
    if (entry.type === 'human' && entry.message?.content) {
      const content = Array.isArray(entry.message.content)
        ? entry.message.content.map(b => b.text || '').join(' ')
        : (typeof entry.message.content === 'string' ? entry.message.content : '');

      // Detect manual /compact command
      if (content.includes('<command-name>/compact</command-name>') ||
          content.includes('<command-message>compact</command-message>')) {
        compactionEvents.push({
          id: uuidv4(),
          type: 'compaction_start',
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          session_id: sessionId,
          summary: 'Context compaction started',
        });
      }

      // Detect completed compaction (summary injected)
      if (content.includes('continued from a previous conversation') &&
          content.includes('ran out of context')) {
        compactionEvents.push({
          id: uuidv4(),
          type: 'compaction',
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          session_id: sessionId,
          summary: 'Context compacted - conversation continued from summary',
        });
      }
    }
  }
  return compactionEvents;
}

function watchTranscriptFiles() {
  if (!fs.existsSync(PROJECTS_DIR)) return;

  const watcher = chokidar.watch(path.join(PROJECTS_DIR, '**/*.jsonl'), {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 50 }
  });

  watcher.on('change', (filePath) => {
    if (!transcriptTracking.has(filePath)) {
      transcriptTracking.set(filePath, {
        path: filePath, lastPosition: 0, lastRead: Date.now(),
        sessionId: extractSessionIdFromPath(filePath)
      });
      console.log(`Started tracking transcript: ${path.basename(filePath)}`);
    }
    const entries = readNewTranscriptLines(filePath);
    if (entries.length === 0) return;
    const tracking = transcriptTracking.get(filePath);
    const sessionId = tracking?.sessionId || extractSessionIdFromPath(filePath);

    // Extract thinking/response events from assistant messages
    const thinkingEvents = extractThinkingEvents(entries, sessionId);
    for (const te of thinkingEvents) {
      events.push(te);
      if (events.length > MAX_EVENTS) events.shift();
      io.emit('event', te);
    }
    if (thinkingEvents.length > 0) {
      console.log(`[thinking] ${thinkingEvents.length} blocks from ${path.basename(filePath)}`);
    }

    // Detect compaction events
    const compactionEvents = extractCompactionEvents(entries, sessionId);
    for (const ce of compactionEvents) {
      events.push(ce);
      if (events.length > MAX_EVENTS) events.shift();
      io.emit('event', ce);
    }
    if (compactionEvents.length > 0) {
      console.log(`[compaction] detected from ${path.basename(filePath)}`);
    }

    for (const entry of entries) {
      const conversationEvent = {
        timestamp: Date.now(),
        transcriptPath: filePath,
        sessionId,
        ...entry
      };
      conversationHistory.push(conversationEvent);
      if (conversationHistory.length > MAX_CONVERSATION_HISTORY) conversationHistory.shift();
      io.emit('conversation', conversationEvent);
    }
    console.log(`[conversation] ${entries.length} entries from ${path.basename(filePath)}`);
  });

  watcher.on('add', (filePath) => {
    transcriptTracking.set(filePath, {
      path: filePath, lastPosition: 0, lastRead: Date.now(),
      sessionId: extractSessionIdFromPath(filePath)
    });
    const entries = readNewTranscriptLines(filePath);
    const tracking = transcriptTracking.get(filePath);
    const sessionId = tracking?.sessionId || extractSessionIdFromPath(filePath);

    // Extract thinking from existing transcript on startup
    const thinkingEvents = extractThinkingEvents(entries, sessionId);
    for (const te of thinkingEvents) {
      events.push(te);
      if (events.length > MAX_EVENTS) events.shift();
    }

    // Detect compaction in initial load
    const initCompactionEvents = extractCompactionEvents(entries, sessionId);
    for (const ce of initCompactionEvents) {
      events.push(ce);
      if (events.length > MAX_EVENTS) events.shift();
    }

    for (const entry of entries) {
      const conversationEvent = {
        timestamp: Date.now(),
        transcriptPath: filePath,
        sessionId,
        ...entry
      };
      conversationHistory.push(conversationEvent);
      if (conversationHistory.length > MAX_CONVERSATION_HISTORY) conversationHistory.shift();
    }
    console.log(`New transcript detected: ${path.basename(filePath)} (${entries.length} entries, ${thinkingEvents.length} thinking blocks)`);
  });

  console.log(`Watching transcripts: ${PROJECTS_DIR}/**/*.jsonl`);
}

function associateTranscriptWithSession(sessionId, transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return;
  if (!transcriptTracking.has(transcriptPath)) {
    transcriptTracking.set(transcriptPath, {
      path: transcriptPath, lastPosition: 0, lastRead: Date.now(), sessionId
    });
    const entries = readNewTranscriptLines(transcriptPath);

    // Extract thinking events
    const thinkingEvents = extractThinkingEvents(entries, sessionId);
    for (const te of thinkingEvents) {
      events.push(te);
      if (events.length > MAX_EVENTS) events.shift();
      io.emit('event', te);
    }

    for (const entry of entries) {
      const conversationEvent = { timestamp: Date.now(), transcriptPath, sessionId, ...entry };
      conversationHistory.push(conversationEvent);
      if (conversationHistory.length > MAX_CONVERSATION_HISTORY) conversationHistory.shift();
      io.emit('conversation', conversationEvent);
    }
  } else {
    const tracking = transcriptTracking.get(transcriptPath);
    if (!tracking.sessionId) tracking.sessionId = sessionId;
  }
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  const conversationsWithSessionId = conversationHistory.slice(-200).map(conv => {
    if (!conv.sessionId && conv.transcriptPath) {
      return { ...conv, sessionId: extractSessionIdFromPath(conv.transcriptPath) };
    }
    return conv;
  });
  socket.emit('init', {
    events: events.slice(-100),
    conversations: conversationsWithSessionId,
    teams: getAllTeams(),
    tmux: getTmuxStatus(),
    commandHistory: commandHistory,
    claudeScan: claudeScanCache,
    presets: configManager.getPresets(),
  });
  socket.on('getCommandHistory', () => {
    socket.emit('commandHistory', commandHistory);
  });
  socket.on('sendCommand', (data) => {
    const { sessionId, command } = data;
    if (!command || typeof command !== 'string') {
      socket.emit('commandError', { error: 'command is required' });
      return;
    }
    if (command.length > 2000) {
      socket.emit('commandError', { error: 'command exceeds maximum length' });
      return;
    }
    // Save to history (deduplicate consecutive)
    if (commandHistory[0] !== command) {
      commandHistory.unshift(command);
      if (commandHistory.length > MAX_COMMAND_HISTORY) commandHistory.pop();
    }

    let method = 'queue';
    const commandEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      sessionId: sessionId || 'unknown',
      command,
      status: 'pending',
      method: 'queue'
    };

    // Attempt tmux injection if available (regardless of idle state)
    if (isTmuxAvailable()) {
      try {
        const idle = isClaudeIdle();
        sendViaTmux(command);
        method = idle ? 'tmux' : 'tmux-queued';
        commandEntry.method = method;
        commandEntry.status = 'sent';
        console.log(`[command] Sent via tmux (${method}, WS): ${command.substring(0, 50)}`);
      } catch (tmuxError) {
        console.warn('[command] tmux send failed (WS), falling back to queue:', tmuxError.message);
      }
    }

    try {
      const dir = path.dirname(COMMANDS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(COMMANDS_FILE, JSON.stringify(commandEntry) + '\n');
      io.emit('commandQueued', commandEntry);
      socket.emit('commandStatus', { id: commandEntry.id, method, status: commandEntry.status });
      console.log(`[command] Queued via WS (method=${method}): ${command.substring(0, 50)}`);
    } catch (error) {
      socket.emit('commandError', { error: 'Failed to queue command' });
    }
  });
  // Preset CRUD via Socket.IO (avoids CORS issues with REST API)
  socket.on('savePreset', (data) => {
    const { id, name, skill, flags, models, agents } = data || {};
    if (!name) return socket.emit('presetError', { error: 'name is required' });
    const presetId = id || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163-]/g, '').replace(/-+/g, '-') || `preset-${Date.now()}`;
    const preset = { id: presetId, name, skill, flags, models, agents, updatedAt: new Date().toISOString() };
    configManager.setPreset(presetId, preset);
    io.emit('presetsUpdated', configManager.getPresets());
  });
  socket.on('updatePreset', (data) => {
    const { id, ...updates } = data || {};
    if (id == null || !configManager.getPresets()[id]) return socket.emit('presetError', { error: 'Preset not found' });
    const updated = { ...configManager.getPresets()[id], ...updates, id, updatedAt: new Date().toISOString() };
    configManager.setPreset(id, updated);
    io.emit('presetsUpdated', configManager.getPresets());
  });
  socket.on('deletePreset', (data) => {
    const { id } = data || {};
    if (id == null || !configManager.getPresets()[id]) return socket.emit('presetError', { error: 'Preset not found' });
    configManager.deletePreset(id);
    io.emit('presetsUpdated', configManager.getPresets());
  });
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

function handleStopEvent(event) {
  if (event.type === 'session_end' && event.transcript_path) {
    associateTranscriptWithSession(event.session_id || 'unknown', event.transcript_path);
  }

  // Event-based idle tracking (backup for HTTP hook notifications)
  if (event.tmux_session && event.tmux_session === TMUX_SESSION) {
    const prev = hookIdleState;
    if (event.type === 'req_end') {
      hookIdleState = true;
      hookIdleTimestamp = Date.now();
      if (prev !== true) {
        io.emit('tmuxStatus', getTmuxStatus());
        console.log(`[tmux-event] Claude IDLE (from events.jsonl)`);
      }
    } else if (event.type === 'req_start') {
      hookIdleState = false;
      hookIdleTimestamp = Date.now();
      if (prev !== false) {
        io.emit('tmuxStatus', getTmuxStatus());
        console.log(`[tmux-event] Claude BUSY (from events.jsonl)`);
      }
    }
  }
}

// ── .claude Folder Scanner ──

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fm = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return fm;
}

function scanSkills() {
  const skills = [];
  if (!fs.existsSync(CLAUDE_SC_DIR)) return skills;
  try {
    const files = fs.readdirSync(CLAUDE_SC_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(CLAUDE_SC_DIR, file), 'utf-8');
        const fm = parseFrontmatter(content);
        if (!fm) continue;
        const id = fm.name || path.basename(file, '.md');
        skills.push({
          id,
          name: fm.name || id,
          command: `/sc:${id}`,
          description: fm.description || '',
          category: fm.category || 'general',
          source: 'sc',
        });
      } catch (e) {}
    }
  } catch (e) {}
  return skills;
}

function scanFlags() {
  const flags = [];
  if (!fs.existsSync(CLAUDE_FLAGS_FILE)) return flags;
  try {
    const lines = fs.readFileSync(CLAUDE_FLAGS_FILE, 'utf-8').split('\n');
    let currentCategory = 'general';
    for (const line of lines) {
      const sectionMatch = line.match(/^##\s+(.+)/);
      if (sectionMatch) {
        currentCategory = sectionMatch[1].trim();
        continue;
      }
      const flagMatch = line.match(/^\*\*(--.+?)\*\*/);
      if (!flagMatch) continue;
      try {
        const parts = flagMatch[1].split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
        const primaryFlag = parts[0];
        flags.push({
          id: primaryFlag.replace(/^--/, '').replace(/\s.*$/, ''),
          flag: primaryFlag,
          aliases: parts.slice(1),
          category: currentCategory,
        });
      } catch (e) {}
    }
  } catch (e) {}
  return flags;
}

function scanAgents() {
  const agents = [];
  if (!fs.existsSync(CLAUDE_AGENTS_DIR)) return agents;
  try {
    const files = fs.readdirSync(CLAUDE_AGENTS_DIR).filter(f => f.endsWith('.md') && f !== 'README.md');
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(CLAUDE_AGENTS_DIR, file), 'utf-8');
        const id = path.basename(file, '.md');
        const fm = parseFrontmatter(content);
        agents.push({
          id,
          name: fm?.name || id,
          description: fm?.description || '',
          category: fm?.category || 'general',
        });
      } catch (e) {}
    }
  } catch (e) {}
  return agents;
}

function scanClaudeFolder() {
  const skills = scanSkills();
  const flags = scanFlags();
  const agents = scanAgents();
  return {
    scannedAt: new Date().toISOString(),
    skills,
    flags,
    agents,
    meta: {
      skillCount: skills.length,
      flagCount: flags.length,
      agentCount: agents.length,
    },
  };
}

function watchClaudeFolder() {
  const watchPaths = [
    path.join(CLAUDE_SC_DIR, '*.md'),
    CLAUDE_FLAGS_FILE,
    path.join(CLAUDE_AGENTS_DIR, '*.md'),
  ];

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
  });

  let debounceTimer = null;
  const rescan = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        claudeScanCache = scanClaudeFolder();
        claudeScanTimestamp = Date.now();
        io.emit('claudeScanUpdated', { updatedAt: new Date().toISOString() });
        console.log(`[claude-scan] Rescanned: ${claudeScanCache.meta.skillCount} skills, ${claudeScanCache.meta.flagCount} flags, ${claudeScanCache.meta.agentCount} agents`);
      } catch (e) {
        console.error('[claude-scan] Rescan error:', e.message);
      }
    }, 2000);
  };

  watcher.on('add', rescan);
  watcher.on('change', rescan);
  watcher.on('unlink', rescan);
  console.log(`[claude-scan] Watching .claude skills, flags, agents`);
}

// ── Agent Team Monitoring ──

function readTeamData(teamDir) {
  const configPath = path.join(teamDir, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const teamName = config.name || path.basename(teamDir);

    // Read associated tasks (filter out internal agent-tracking tasks)
    const tasksDir = path.join(TEAM_TASKS_DIR, teamName);
    const tasks = [];
    if (fs.existsSync(tasksDir)) {
      const files = fs.readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const task = JSON.parse(fs.readFileSync(path.join(tasksDir, file), 'utf-8'));
          if (!task.metadata?._internal) tasks.push(task);
        } catch (e) {}
      }
      tasks.sort((a, b) => Number(a.id) - Number(b.id));
    }

    // Find active flags from recent routing events for this session
    const teamFlags = findTeamFlags(config);

    return { ...config, tasks, activeFlags: teamFlags };
  } catch (e) {
    console.error(`[teams] Failed to read team ${teamDir}:`, e.message);
    return null;
  }
}

function findTeamFlags(teamConfig) {
  // Search recent events for routing data with team_recommended=true
  // that matches this team's creation timeframe
  const recentRouting = events
    .filter(e => e.type === 'routing' && e.team_recommended)
    .slice(-5);

  if (recentRouting.length === 0) return [];

  // Use the most recent routing event with flags
  for (let i = recentRouting.length - 1; i >= 0; i--) {
    const routing = recentRouting[i];
    const flags = routing.flags ? routing.flags.split(',').filter(Boolean) : [];
    if (flags.length > 0) return flags;
  }
  return [];
}

function getAllTeams() {
  const teams = {};
  if (!fs.existsSync(TEAMS_DIR)) return teams;
  try {
    const dirs = fs.readdirSync(TEAMS_DIR);
    for (const dir of dirs) {
      const fullPath = path.join(TEAMS_DIR, dir);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          const data = readTeamData(fullPath);
          if (data) teams[data.name] = data;
        }
      } catch (e) {}
    }
  } catch (e) {}
  return teams;
}

function watchTeamDirectories() {
  const watchPaths = [];
  if (fs.existsSync(TEAMS_DIR)) watchPaths.push(path.join(TEAMS_DIR, '**/*.json'));
  if (fs.existsSync(TEAM_TASKS_DIR)) watchPaths.push(path.join(TEAM_TASKS_DIR, '**/*.json'));
  if (watchPaths.length === 0) {
    console.log('[teams] No teams/tasks directories found, skipping watch');
    return;
  }

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 }
  });

  let debounceTimer = null;
  const emitTeamUpdate = (filePath) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const teams = getAllTeams();
      io.emit('team_update', teams);
      console.log(`[teams] Update emitted (${Object.keys(teams).length} teams)`);
    }, 200);
  };

  watcher.on('add', emitTeamUpdate);
  watcher.on('change', emitTeamUpdate);
  watcher.on('unlink', emitTeamUpdate);

  console.log(`[teams] Watching: ${TEAMS_DIR}, ${TEAM_TASKS_DIR}`);
}

// ── tmux Integration ──

const SAFE_TMUX_TARGET = /^[a-zA-Z0-9_:.\-]+$/;
const SAFE_PID = /^\d+$/;

let cachedTmuxTarget = null;
let cachedTmuxStatus = false;
let lastTmuxCheck = 0;
const TMUX_CHECK_INTERVAL = 3000; // 3 seconds cache

// Hook-based idle state (event-driven, no polling)
// null = unknown (fallback to tmux capture-pane), true = idle, false = busy
let hookIdleState = null;
let hookIdleTimestamp = 0;

function findClaudeTarget() {
  // Auto-detect tmux pane running Claude Code
  // Scan all panes: check pane_current_command AND child processes for 'claude'
  try {
    const output = execSync(
      "tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_current_command} #{pane_pid}'",
      { encoding: 'utf-8', timeout: 2000 }
    ).trim();
    for (const line of output.split('\n')) {
      const parts = line.split(' ');
      const target = parts[0];
      const panePid = parts[parts.length - 1]; // PID is always last
      const cmd = parts.slice(1, -1).join(' ').toLowerCase(); // command may contain spaces

      // Validate target format (session:window.pane)
      if (!SAFE_TMUX_TARGET.test(target)) continue;

      // Direct match on pane command
      if (cmd.includes('claude')) return target;

      // Check child processes of this pane for 'claude'
      // NOTE: pgrep -P is unreliable on macOS, use ps + awk instead
      if (panePid && SAFE_PID.test(panePid)) {
        try {
          const children = execSync(
            `ps -axo ppid=,comm= | awk '$1 == ${panePid} { print $2 }'`,
            { encoding: 'utf-8', timeout: 1000 }
          ).trim();
          if (children.toLowerCase().includes('claude')) return target;
        } catch {}
      }
    }
  } catch {}

  // Fallback: check if configured session exists
  if (SAFE_TMUX_TARGET.test(TMUX_SESSION)) {
    try {
      execSync(`tmux has-session -t ${TMUX_SESSION}`, { stdio: 'ignore', timeout: 2000 });
      return TMUX_SESSION;
    } catch {}
  }

  return null;
}

function isTmuxAvailable() {
  const now = Date.now();
  if (now - lastTmuxCheck < TMUX_CHECK_INTERVAL) return cachedTmuxStatus;
  lastTmuxCheck = now;

  try {
    execSync('tmux -V', { stdio: 'ignore', timeout: 2000 });
  } catch {
    cachedTmuxStatus = false;
    cachedTmuxTarget = null;
    return false;
  }

  const target = findClaudeTarget();
  cachedTmuxTarget = target;
  cachedTmuxStatus = target !== null;
  return cachedTmuxStatus;
}

function getTmuxTarget() {
  if (!cachedTmuxTarget) isTmuxAvailable();
  return cachedTmuxTarget || TMUX_SESSION;
}

function isClaudeIdle() {
  // Hook-based state only (event-driven from Stop/UserPromptSubmit hooks)
  // Returns false when unknown (null) - capture-pane is unreliable because
  // Claude Code TUI always renders ❯ even when busy, causing false positives
  return hookIdleState === true;
}

function shellEscape(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function sendViaTmux(command) {
  const target = getTmuxTarget();
  if (!SAFE_TMUX_TARGET.test(target)) throw new Error('Invalid tmux target');
  execSync(`tmux send-keys -t ${target} -l ${shellEscape(command)}`, { timeout: 5000 });
  execSync(`tmux send-keys -t ${target} Enter`, { timeout: 5000 });
}

function getTmuxStatus() {
  const available = isTmuxAvailable();
  return {
    available,
    target: cachedTmuxTarget,
    session: TMUX_SESSION,
    idle: available ? isClaudeIdle() : false,
    source: hookIdleState !== null ? 'hook' : 'initializing',
  };
}

const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Claude Monitor Server running on port ${PORT}`);
  loadInitialEvents();

  // Initialize hookIdleState optimistically if tmux Claude is detected
  // Assume idle until first hook fires (hooks are reliable once active)
  if (isTmuxAvailable()) {
    hookIdleState = true;
    hookIdleTimestamp = Date.now();
    console.log(`[tmux-init] Claude detected in tmux, assuming IDLE until first hook fires`);
  }

  watchEventsFile();
  watchTranscriptFiles();
  watchTeamDirectories();
  watchClaudeFolder();

  // Initial .claude scan (delayed to let file system settle)
  setTimeout(() => {
    try {
      claudeScanCache = scanClaudeFolder();
      claudeScanTimestamp = Date.now();
      console.log(`[claude-scan] Initial scan: ${claudeScanCache.meta.skillCount} skills, ${claudeScanCache.meta.flagCount} flags, ${claudeScanCache.meta.agentCount} agents`);
    } catch (e) {
      console.error('[claude-scan] Initial scan error:', e.message);
    }
  }, 3000);

  // Broadcast tmux status every 5 seconds
  let lastBroadcastStatus = null;
  setInterval(() => {
    const status = getTmuxStatus();
    const statusKey = `${status.available}:${status.target}:${status.idle}`;
    if (statusKey !== lastBroadcastStatus) {
      lastBroadcastStatus = statusKey;
      io.emit('tmuxStatus', status);
      console.log(`[tmux] Status: available=${status.available}, target=${status.target}, idle=${status.idle}`);
    }
  }, 5000);
});

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

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

const PORT = process.env.PORT || 3847;
const EVENTS_FILE = process.env.EVENTS_FILE || path.join(process.env.HOME, '.claude-monitor', 'events.jsonl');
const COMMANDS_FILE = process.env.COMMANDS_FILE || path.join(process.env.HOME, '.claude-monitor', 'commands.jsonl');
const PROJECTS_DIR = process.env.PROJECTS_DIR || path.join(process.env.HOME, '.claude', 'projects');
const TEAMS_DIR = path.join(process.env.HOME, '.claude', 'teams');
const TEAM_TASKS_DIR = path.join(process.env.HOME, '.claude', 'tasks');

const events = [];
const MAX_EVENTS = 1000;

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
  const commandEntry = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    sessionId: sessionId || 'unknown',
    command: command,
    status: 'pending'
  };
  try {
    const dir = path.dirname(COMMANDS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(COMMANDS_FILE, JSON.stringify(commandEntry) + '\n');
    io.emit('commandQueued', commandEntry);
    console.log(`[command] Queued: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`);
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
    teams: getAllTeams()
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
    const commandEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      sessionId: sessionId || 'unknown',
      command, status: 'pending'
    };
    try {
      const dir = path.dirname(COMMANDS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(COMMANDS_FILE, JSON.stringify(commandEntry) + '\n');
      io.emit('commandQueued', commandEntry);
      console.log(`[command] Queued via WS: ${command.substring(0, 50)}`);
    } catch (error) {
      socket.emit('commandError', { error: 'Failed to queue command' });
    }
  });
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

function handleStopEvent(event) {
  if (event.type === 'session_end' && event.transcript_path) {
    associateTranscriptWithSession(event.session_id || 'unknown', event.transcript_path);
  }
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

const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Claude Monitor Server running on port ${PORT}`);
  loadInitialEvents();
  watchEventsFile();
  watchTranscriptFiles();
  watchTeamDirectories();
});

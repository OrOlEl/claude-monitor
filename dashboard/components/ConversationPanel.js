'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { User, Bot, Terminal, ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { shortenToolName, getDetailPreview } from '../utils/toolNames';
import { MarkdownText } from './MarkdownText';
import { useEventStore } from '../stores/eventStore';

// Generate consistent color from session ID hash
const AGENT_COLORS = [
  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/60', text: 'text-emerald-400', avatarBg: 'bg-emerald-500/20' },
  { bg: 'bg-orange-500/20', border: 'border-orange-500/60', text: 'text-orange-400', avatarBg: 'bg-orange-500/20' },
  { bg: 'bg-pink-500/20', border: 'border-pink-500/60', text: 'text-pink-400', avatarBg: 'bg-pink-500/20' },
  { bg: 'bg-cyan-500/20', border: 'border-cyan-500/60', text: 'text-cyan-400', avatarBg: 'bg-cyan-500/20' },
  { bg: 'bg-yellow-500/20', border: 'border-yellow-500/60', text: 'text-yellow-400', avatarBg: 'bg-yellow-500/20' },
  { bg: 'bg-violet-500/20', border: 'border-violet-500/60', text: 'text-violet-400', avatarBg: 'bg-violet-500/20' },
  { bg: 'bg-rose-500/20', border: 'border-rose-500/60', text: 'text-rose-400', avatarBg: 'bg-rose-500/20' },
  { bg: 'bg-lime-500/20', border: 'border-lime-500/60', text: 'text-lime-400', avatarBg: 'bg-lime-500/20' },
];

function hashSessionId(sid) {
  let hash = 0;
  for (let i = 0; i < sid.length; i++) {
    hash = ((hash << 5) - hash + sid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function ToolCallItem({ toolUse, toolResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getContentText = (content) => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    }
    if (typeof content === 'object' && content.text) return content.text;
    return JSON.stringify(content, null, 2);
  };

  const resultText = toolResult ? getContentText(toolResult.content) : '';
  const isError = toolResult?.is_error === true;
  const statusText = isError ? 'error' : (toolResult ? 'done' : 'pending');

  return (
    <div className="border border-argo-border rounded-md overflow-hidden bg-argo-bg/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-2 hover:bg-argo-card/50 transition-colors text-left"
      >
        {isExpanded ? <ChevronDown className="w-4 h-4 text-argo-muted flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-argo-muted flex-shrink-0" />}
        <Terminal className="w-4 h-4 text-argo-warning flex-shrink-0" />
        <span className="text-sm text-argo-text font-mono" title={toolUse?.name}>{shortenToolName(toolUse?.name) || 'tool'}</span>
        {toolUse?.name === 'Bash' && toolUse?.input?.command && (
          <span className="text-xs text-argo-muted truncate max-w-[200px]">{toolUse.input.command.substring(0, 60)}</span>
        )}
        {toolUse?.name !== 'Bash' && toolUse?.input && (() => {
          const preview = getDetailPreview(
            toolUse.input.file_path || toolUse.input.path || toolUse.input.pattern ||
            toolUse.input.query || toolUse.input.url || toolUse.input.command || toolUse.input.prompt || '',
            50
          );
          return preview ? <span className="text-xs text-argo-muted truncate max-w-[200px]">{preview}</span> : null;
        })()}
        <span className={`text-xs ml-auto ${isError ? 'text-red-400' : 'text-argo-muted'}`}>{statusText}</span>
      </button>
      {isExpanded && (
        <div className="border-t border-argo-border p-3 space-y-2">
          {toolUse?.input && (
            <div>
              <div className="text-xs text-argo-muted mb-1">Input:</div>
              <pre className="text-xs bg-argo-bg p-2 rounded overflow-x-auto text-argo-text font-mono max-h-48 overflow-y-auto">
                {typeof toolUse.input === 'string' ? toolUse.input : JSON.stringify(toolUse.input, null, 2)}
              </pre>
            </div>
          )}
          {resultText && !isError && (
            <div>
              <div className="text-xs text-argo-muted mb-1">Output:</div>
              <pre className="text-xs bg-argo-bg p-2 rounded overflow-x-auto text-argo-text font-mono max-h-64 overflow-y-auto">{resultText}</pre>
            </div>
          )}
          {isError && resultText && (
            <div>
              <div className="text-xs text-red-400 mb-1">Error:</div>
              <pre className="text-xs bg-red-500/10 p-2 rounded overflow-x-auto text-red-400 font-mono max-h-64 overflow-y-auto">{resultText}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, index, messages, mainSessionId, sessionAgentMap }) {
  const msg = message.message || message;
  const entryType = message.type;

  if (!['user', 'assistant'].includes(entryType)) return null;

  const isUser = entryType === 'user' || msg.role === 'user';
  const isAssistant = entryType === 'assistant' || msg.role === 'assistant';
  const rawContent = msg.content;
  const msgSessionId = message.sessionId || '';
  const isSubagent = mainSessionId && msgSessionId && msgSessionId !== mainSessionId;

  // Skip user messages that only contain tool_results
  if (isUser && Array.isArray(rawContent)) {
    const hasOnlyToolResults = rawContent.every(block => block.type === 'tool_result');
    if (hasOnlyToolResults) return null;
  }

  let textContent = '';
  let thinkingContent = '';
  if (typeof rawContent === 'string') {
    textContent = rawContent;
  } else if (Array.isArray(rawContent)) {
    textContent = rawContent.filter(b => b.type === 'text').map(b => b.text).join('\n');
    thinkingContent = rawContent.filter(b => b.type === 'thinking').map(b => b.thinking).join('\n');
  } else if (rawContent?.text) {
    textContent = rawContent.text;
  }

  // Find tool uses and results
  const toolUses = [];
  if (isAssistant && Array.isArray(rawContent)) {
    rawContent.forEach((block) => {
      if (block.type === 'tool_use') {
        let matchedResult = null;
        for (let i = index + 1; i < messages.length; i++) {
          const nextMsg = messages[i];
          const nextInner = nextMsg.message || nextMsg;
          const nextContent = nextInner.content;
          if (Array.isArray(nextContent)) {
            const resultBlock = nextContent.find(b => b.type === 'tool_result' && b.tool_use_id === block.id);
            if (resultBlock) { matchedResult = resultBlock; break; }
          }
        }
        toolUses.push({ toolUse: block, toolResult: matchedResult });
      }
    });
  }

  if (!textContent && !thinkingContent && toolUses.length === 0) return null;

  // Determine agent display info for subagent messages
  const agentColor = isSubagent ? AGENT_COLORS[hashSessionId(msgSessionId) % AGENT_COLORS.length] : null;
  const agentName = isSubagent ? (sessionAgentMap[msgSessionId] || `agent-${msgSessionId.slice(0, 6)}`) : null;

  // Avatar styling
  const avatarBg = isUser
    ? 'bg-blue-500/20'
    : isSubagent ? agentColor.avatarBg : 'bg-argo-accent/20';
  const avatarIcon = isUser
    ? <User className="w-4 h-4 text-blue-400" />
    : isSubagent
      ? <Cpu className={`w-4 h-4 ${agentColor.text}`} />
      : <Bot className="w-4 h-4 text-argo-accent" />;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${avatarBg}`} title={isSubagent ? `${agentName} (${msgSessionId.slice(0, 8)})` : undefined}>
          {avatarIcon}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {isSubagent && isAssistant && (
            <span className={`text-xs font-medium ${agentColor.text} flex items-center gap-1`}>
              <span className={`inline-block w-2 h-2 rounded-full ${agentColor.avatarBg} border ${agentColor.border}`} />
              {agentName}
            </span>
          )}
          {thinkingContent && (
            <details className="rounded-lg bg-purple-500/10 border border-purple-500/30">
              <summary className="px-3 py-2 text-xs text-purple-400 cursor-pointer hover:bg-purple-500/20">Thinking...</summary>
              <pre className="whitespace-pre-wrap break-words font-sans text-xs p-3 pt-0 text-purple-300/80 max-h-48 overflow-y-auto">{thinkingContent}</pre>
            </details>
          )}
          {textContent && (
            <div className={`rounded-lg p-3 ${
              isUser
                ? 'bg-blue-500/20 text-argo-text'
                : isSubagent
                  ? `${agentColor.bg} border ${agentColor.border} text-argo-text`
                  : 'bg-argo-card text-argo-text'
            }`}>
              <MarkdownText>{textContent}</MarkdownText>
            </div>
          )}
          {toolUses.length > 0 && (
            <div className="space-y-2">
              {toolUses.map((tool, idx) => (
                <ToolCallItem key={tool.toolUse?.id || idx} toolUse={tool.toolUse} toolResult={tool.toolResult} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConversationPanel({ messages = [], sessionId, autoFollow = true, scrollTrigger = 0 }) {
  const scrollRef = useRef(null);
  const mainSessionId = useEventStore(s => s.sessionId);
  const getSessionAgentMap = useEventStore(s => s.getSessionAgentMap);
  const sessionAgentMap = useMemo(() => getSessionAgentMap(), [getSessionAgentMap, messages]);

  useEffect(() => {
    if (autoFollow && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [messages, autoFollow]);

  useEffect(() => {
    if (scrollTrigger > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    }
  }, [scrollTrigger]);

  if (!messages || messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-argo-muted">
        <div className="text-center">
          <Bot className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No conversation yet...</p>
          <p className="text-xs mt-1">Messages will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id || index}
          message={message}
          index={index}
          messages={messages}
          mainSessionId={mainSessionId}
          sessionAgentMap={sessionAgentMap}
        />
      ))}
    </div>
  );
}

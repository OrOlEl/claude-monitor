'use client';

import { useEffect, useRef, useState } from 'react';
import { User, Bot, Terminal, ChevronDown, ChevronRight } from 'lucide-react';
import { shortenToolName, getDetailPreview } from '../utils/toolNames';

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

function MessageBubble({ message, index, messages }) {
  const msg = message.message || message;
  const entryType = message.type;

  if (!['user', 'assistant'].includes(entryType)) return null;

  const isUser = entryType === 'user' || msg.role === 'user';
  const isAssistant = entryType === 'assistant' || msg.role === 'assistant';
  const rawContent = msg.content;

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

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-500/20' : 'bg-argo-accent/20'}`}>
          {isUser ? <User className="w-4 h-4 text-blue-400" /> : <Bot className="w-4 h-4 text-argo-accent" />}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {thinkingContent && (
            <details className="rounded-lg bg-purple-500/10 border border-purple-500/30">
              <summary className="px-3 py-2 text-xs text-purple-400 cursor-pointer hover:bg-purple-500/20">Thinking...</summary>
              <pre className="whitespace-pre-wrap break-words font-sans text-xs p-3 pt-0 text-purple-300/80 max-h-48 overflow-y-auto">{thinkingContent}</pre>
            </details>
          )}
          {textContent && (
            <div className={`rounded-lg p-3 ${isUser ? 'bg-blue-500/20 text-argo-text' : 'bg-argo-card text-argo-text'}`}>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{textContent}</pre>
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

export function ConversationPanel({ messages = [], sessionId }) {
  const scrollRef = useRef(null);
  const prevMessagesLengthRef = useRef(messages.length);

  useEffect(() => {
    if (scrollRef.current && messages.length > prevMessagesLengthRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages]);

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
        <MessageBubble key={message.id || index} message={message} index={index} messages={messages} />
      ))}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { Send, AlertCircle, Zap, Clock, Terminal, WifiOff } from 'lucide-react';

export function ChatInput({ socket, sessionId, disabled = false }) {
  const [command, setCommand] = useState('');
  const [toastType, setToastType] = useState(null);
  const [tmuxStatus, setTmuxStatus] = useState({ available: false, target: null, idle: false });
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [savedDraft, setSavedDraft] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const onInit = (data) => {
      if (data.tmux) setTmuxStatus(data.tmux);
      if (data.commandHistory?.length) setHistory(data.commandHistory);
    };
    const onTmuxStatus = (status) => {
      setTmuxStatus(status);
    };
    const onCommandHistory = (h) => {
      if (h?.length) setHistory(h);
    };
    const onCommandStatus = (data) => {
      if (data.method === 'tmux') {
        setToastType('tmux');
      } else if (data.method === 'tmux-queued') {
        setToastType('tmux-queued');
      } else {
        setToastType('queue');
      }
      setTimeout(() => setToastType(null), 2500);
    };
    const onCommandError = () => {
      setToastType('error');
      setTimeout(() => setToastType(null), 2500);
    };

    socket.on('init', onInit);
    socket.on('tmuxStatus', onTmuxStatus);
    socket.on('commandHistory', onCommandHistory);
    socket.on('commandStatus', onCommandStatus);
    socket.on('commandError', onCommandError);

    // Request history on mount (in case init was missed)
    socket.emit('getCommandHistory');

    return () => {
      socket.off('init', onInit);
      socket.off('tmuxStatus', onTmuxStatus);
      socket.off('commandHistory', onCommandHistory);
      socket.off('commandStatus', onCommandStatus);
      socket.off('commandError', onCommandError);
    };
  }, [socket]);

  const isDisabled = disabled || !socket || !tmuxStatus.available;

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!command.trim() || isDisabled) return;
    const trimmed = command.trim();
    socket.emit('sendCommand', { sessionId: sessionId || 'current', command: trimmed });
    setHistory((prev) => {
      const filtered = prev.filter((h) => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 50);
    });
    setHistoryIndex(-1);
    setSavedDraft('');
    setCommand('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  };

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;

    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    // ArrowUp: previous history
    if (e.key === 'ArrowUp') {
      const textarea = textareaRef.current;
      // Only navigate history if cursor is at the start or input is single line
      if (textarea && (textarea.selectionStart !== 0 && command.includes('\n'))) return;

      if (history.length === 0) return;
      e.preventDefault();
      if (historyIndex === -1) {
        setSavedDraft(command);
      }
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setCommand(history[nextIndex]);
      return;
    }

    // ArrowDown: next history / back to draft
    if (e.key === 'ArrowDown') {
      const textarea = textareaRef.current;
      if (textarea && command.includes('\n') && textarea.selectionStart !== command.length) return;

      if (historyIndex === -1) return;
      e.preventDefault();
      const nextIndex = historyIndex - 1;
      if (nextIndex < 0) {
        setHistoryIndex(-1);
        setCommand(savedDraft);
      } else {
        setHistoryIndex(nextIndex);
        setCommand(history[nextIndex]);
      }
      return;
    }
  };

  // Auto-resize textarea
  const handleInput = (e) => {
    setCommand(e.target.value);
    // Reset history browsing when user types
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
    }
    const textarea = e.target;
    textarea.style.height = 'auto';
    const lineHeight = 20;
    const maxHeight = lineHeight * 10; // 10 lines
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  const renderToast = () => {
    if (!toastType) return null;
    const configs = {
      tmux: { border: 'border-green-500', text: 'text-green-400', icon: Zap, label: 'Command sent' },
      'tmux-queued': { border: 'border-amber-500', text: 'text-amber-400', icon: Clock, label: 'Sent to tmux (processing...)' },
      queue: { border: 'border-argo-accent', text: 'text-argo-accent', icon: Clock, label: 'Queued for next prompt' },
      error: { border: 'border-red-500', text: 'text-red-400', icon: AlertCircle, label: 'Failed to send' },
    };
    const cfg = configs[toastType];
    if (!cfg) return null;
    const Icon = cfg.icon;
    return (
      <div className={`absolute -top-12 left-1/2 transform -translate-x-1/2 bg-argo-card border ${cfg.border} rounded-md px-4 py-2 shadow-lg z-10`}>
        <span className={`flex items-center gap-2 text-sm ${cfg.text}`}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
      </div>
    );
  };

  return (
    <div className="relative">
      {renderToast()}
      <div className="flex items-center gap-2 mb-2 px-3">
        {tmuxStatus.available ? (
          <>
            <Terminal className="w-3 h-3 text-green-400 flex-shrink-0" />
            <span className="text-xs text-green-400">
              tmux connected{tmuxStatus.target ? ` (${tmuxStatus.target})` : ''}
              {tmuxStatus.idle ? ' — idle' : ' — processing'}
            </span>
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3 text-argo-muted flex-shrink-0" />
            <span className="text-xs text-argo-muted">
              tmux not connected — start Claude in tmux to enable chat
            </span>
          </>
        )}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={command}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          rows={1}
          placeholder={tmuxStatus.available ? 'Send command to Claude... (Shift+Enter for newline, ↑↓ for history)' : 'tmux not connected'}
          className={`flex-1 bg-argo-card border border-argo-border rounded-md px-4 py-2 text-sm text-argo-text placeholder-argo-muted focus:outline-none focus:ring-2 focus:ring-argo-accent resize-none overflow-y-hidden ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-argo-accent/50'}`}
        />
        <button
          type="submit"
          disabled={isDisabled || !command.trim()}
          className={`bg-argo-accent hover:bg-argo-accent/80 text-white rounded-md px-4 py-2 flex items-center self-end ${isDisabled || !command.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'}`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

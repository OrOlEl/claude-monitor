'use client';

import { useState } from 'react';
import { Send, AlertCircle } from 'lucide-react';

export function ChatInput({ socket, sessionId, disabled = false }) {
  const [command, setCommand] = useState('');
  const [showToast, setShowToast] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!command.trim() || !socket || disabled) return;
    socket.emit('sendCommand', { sessionId: sessionId || 'current', command: command.trim() });
    setCommand('');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  return (
    <div className="relative">
      {showToast && (
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-argo-card border border-argo-accent rounded-md px-4 py-2 shadow-lg z-10">
          <span className="text-sm text-argo-accent">Command queued</span>
        </div>
      )}
      <div className="flex items-center gap-2 mb-2 px-3">
        <AlertCircle className="w-3 h-3 text-argo-warning flex-shrink-0" />
        <span className="text-xs text-argo-muted">Commands delivered when Claude finishes current response</span>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          disabled={disabled || !socket}
          placeholder="Send command to Claude..."
          className={`flex-1 bg-argo-card border border-argo-border rounded-md px-4 py-2 text-sm text-argo-text placeholder-argo-muted focus:outline-none focus:ring-2 focus:ring-argo-accent ${disabled || !socket ? 'opacity-50 cursor-not-allowed' : 'hover:border-argo-accent/50'}`}
        />
        <button
          type="submit"
          disabled={disabled || !socket || !command.trim()}
          className={`bg-argo-accent hover:bg-argo-accent/80 text-white rounded-md px-4 py-2 flex items-center ${disabled || !socket || !command.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'}`}
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

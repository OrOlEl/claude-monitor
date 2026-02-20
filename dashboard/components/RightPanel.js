'use client';

import { useState } from 'react';
import { MessageSquare, Activity } from 'lucide-react';
import { ConversationPanel } from './ConversationPanel';
import { ActivityLog } from './ActivityLog';
import { ChatInput } from './ChatInput';

export function RightPanel({ conversations, events, socket, sessionId }) {
  const [activeTab, setActiveTab] = useState('conversation');

  const tabs = [
    { id: 'conversation', label: 'Conversation', icon: MessageSquare },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

  return (
    <div className="flex flex-col h-full bg-argo-sidebar border-l border-argo-border">
      <div className="flex border-b border-argo-border">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
              ${activeTab === tab.id
                ? 'text-argo-accent border-b-2 border-argo-accent bg-argo-card/50'
                : 'text-argo-muted hover:text-argo-text hover:bg-argo-card/30'
              }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'conversation' && (
          <>
            <div className="flex-1 overflow-hidden">
              <ConversationPanel messages={conversations} sessionId={sessionId} />
            </div>
            <div className="border-t border-argo-border p-3">
              <ChatInput socket={socket} sessionId={sessionId} />
            </div>
          </>
        )}
        {activeTab === 'activity' && (
          <ActivityLog events={events} />
        )}
      </div>
    </div>
  );
}

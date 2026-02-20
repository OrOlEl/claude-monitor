'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useEventStore } from '../stores/eventStore';
import { useSessionStore } from '../stores/sessionStore';
import { RightPanel } from '../components/RightPanel';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { HorizontalTree } from '../components/HorizontalTree';
import { Monitor, PanelRightClose, PanelRight, TreePine, LayoutGrid } from 'lucide-react';
import { ProjectsGrid } from '../components/ProjectsGrid';
import { SessionList } from '../components/SessionList';
import { SessionDetail } from '../components/SessionDetail';

export default function Home() {
  const socket = useSocket();
  const { events, conversations, connected, getTreeData, getLiveStatus, teams, sessionId: storeSessionId } = useEventStore();
  const { currentView, selectedProject, activeSessionId, getProjectsWithSessions } = useSessionStore();

  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [filteredConversations, setFilteredConversations] = useState([]);
  const [mainTab, setMainTab] = useState('tree');
  const [, setTick] = useState(0);

  const containerRef = useRef(null);

  // Periodic re-render for stale detection (marks interrupted items as cancelled)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      setFilteredEvents(events.filter(e => e.session_id === activeSessionId));
      const sessionConvos = conversations.filter(c => c.sessionId === activeSessionId);
      setFilteredConversations(sessionConvos.length > 0 ? sessionConvos : conversations);
    } else {
      setFilteredEvents(events);
      setFilteredConversations(conversations);
    }
  }, [events, conversations, activeSessionId]);

  const treeData = getTreeData();
  const liveStatus = getLiveStatus();

  const projectSessions = selectedProject
    ? getProjectsWithSessions().find(p => p.name === selectedProject)?.sessions || []
    : [];

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    const maxWidth = containerRect.width * 0.5;
    if (newWidth >= 280 && newWidth <= maxWidth) {
      setRightPanelWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="h-screen bg-argo-bg flex flex-col overflow-hidden">
      <header className="border-b border-argo-border bg-argo-sidebar sticky top-0 z-10">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Monitor className="w-6 h-6 text-argo-accent" />
            <h1 className="text-lg font-semibold text-argo-text">Claude Monitor</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-argo-bg rounded-lg border border-argo-border">
              <button
                onClick={() => setMainTab('tree')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${
                  mainTab === 'tree'
                    ? 'bg-argo-accent/20 text-argo-accent'
                    : 'text-argo-muted hover:text-argo-text'
                }`}
              >
                <TreePine className="w-3.5 h-3.5" />
                Execution
              </button>
              <button
                onClick={() => setMainTab('projects')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
                  mainTab === 'projects'
                    ? 'bg-argo-accent/20 text-argo-accent'
                    : 'text-argo-muted hover:text-argo-text'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Sessions
              </button>
            </div>
            <ConnectionStatus connected={connected} />
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className="p-2 rounded hover:bg-argo-card text-argo-muted hover:text-argo-text"
              title={showRightPanel ? 'Hide panel' : 'Show panel'}
            >
              {showRightPanel ? <PanelRightClose className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-y-auto min-h-0">
          {mainTab === 'tree' && (
            <div className="p-6">
              <HorizontalTree data={treeData} liveStatus={liveStatus} teams={teams} sessionId={storeSessionId} />
            </div>
          )}
          {mainTab === 'projects' && (
            <>
              {currentView === 'projects' && <ProjectsGrid />}
              {currentView === 'sessions' && (
                <div className="p-6">
                  <SessionList sessions={projectSessions} projectName={selectedProject} />
                </div>
              )}
              {currentView === 'detail' && <SessionDetail />}
            </>
          )}
        </main>

        {showRightPanel && (
          <>
            <div
              onMouseDown={handleMouseDown}
              className={`w-1 cursor-col-resize flex-shrink-0 hover:bg-argo-accent/50 active:bg-argo-accent transition-colors ${isResizing ? 'bg-argo-accent' : 'bg-argo-border'}`}
              title="Drag to resize"
            />
            <aside style={{ width: rightPanelWidth }} className="flex-shrink-0 overflow-hidden">
              <RightPanel
                conversations={filteredConversations}
                events={filteredEvents}
                socket={socket}
                sessionId={activeSessionId}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

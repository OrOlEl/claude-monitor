'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useEventStore } from '../stores/eventStore';
import { useSessionStore } from '../stores/sessionStore';
import { RightPanel } from '../components/RightPanel';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { HorizontalTree } from '../components/HorizontalTree';
import { Monitor, PanelRightClose, PanelRight, TreePine, LayoutGrid, ArrowDownToLine, ArrowLeftRight, Columns, Rows } from 'lucide-react';
import { ProjectsGrid } from '../components/ProjectsGrid';
import { SessionList } from '../components/SessionList';
import { SessionDetail } from '../components/SessionDetail';

function loadSetting(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const v = localStorage.getItem(`monitor:${key}`);
    if (v === null) return fallback;
    return JSON.parse(v);
  } catch { return fallback; }
}

function saveSetting(key, value) {
  try { localStorage.setItem(`monitor:${key}`, JSON.stringify(value)); } catch {}
}

export default function Home() {
  const socket = useSocket();
  const { events, conversations, connected, getTreeData, getLiveStatus, teams, sessionId: storeSessionId } = useEventStore();
  const { currentView, selectedProject, activeSessionId, getProjectsWithSessions } = useSessionStore();

  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [panelHeight, setPanelHeight] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [filteredConversations, setFilteredConversations] = useState([]);
  const [mainTab, setMainTab] = useState('tree');
  const [, setTick] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const autoFollowRef = useRef(true);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [layoutSwapped, setLayoutSwapped] = useState(false);
  const [layoutVertical, setLayoutVertical] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load persisted settings after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    setShowRightPanel(loadSetting('showPanel', true));
    setRightPanelWidth(loadSetting('panelWidth', 400));
    setPanelHeight(loadSetting('panelHeight', 350));
    setMainTab(loadSetting('mainTab', 'tree'));
    setLayoutSwapped(loadSetting('swapped', false));
    setLayoutVertical(loadSetting('vertical', false));
    setSettingsLoaded(true);
  }, []);

  const containerRef = useRef(null);
  const mainRef = useRef(null);

  // Persist layout settings to localStorage (only after initial load)
  useEffect(() => { if (settingsLoaded) saveSetting('showPanel', showRightPanel); }, [showRightPanel, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) saveSetting('swapped', layoutSwapped); }, [layoutSwapped, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) saveSetting('vertical', layoutVertical); }, [layoutVertical, settingsLoaded]);
  useEffect(() => { if (settingsLoaded) saveSetting('mainTab', mainTab); }, [mainTab, settingsLoaded]);
  useEffect(() => {
    if (settingsLoaded && !isResizing) {
      saveSetting('panelWidth', rightPanelWidth);
      saveSetting('panelHeight', panelHeight);
    }
  }, [isResizing, rightPanelWidth, panelHeight, settingsLoaded]);

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

  // Find the deepest running node inside the tree (3-tier fallback)
  const findLatestRunningNode = useCallback(() => {
    if (!mainRef.current) return null;
    // 1. Running nodes (tool/agent/skill level, including team agent markers)
    const runningNodes = mainRef.current.querySelectorAll('[data-node-status="running"]');
    if (runningNodes.length > 0) {
      return runningNodes[runningNodes.length - 1];
    }
    // 2. Running RequestCard container
    const runningCard = mainRef.current.querySelector('[data-status="running"]');
    if (runningCard) return runningCard;
    // 3. Last node of any status (most recent completed activity)
    const allNodes = mainRef.current.querySelectorAll('[data-node-status]');
    if (allNodes.length > 0) {
      return allNodes[allNodes.length - 1];
    }
    return null;
  }, []);

  // Keep ref in sync with state so rAF callbacks check the latest value
  useEffect(() => { autoFollowRef.current = autoFollow; }, [autoFollow]);

  // Auto-follow: scroll to latest running node when new events arrive
  const prevEventCount = useRef(0);
  useEffect(() => {
    if (mainTab !== 'tree' || !mainRef.current) return;
    if (events.length > prevEventCount.current && autoFollow) {
      requestAnimationFrame(() => {
        // Re-check ref inside rAF: user may have toggled off between schedule and execution
        if (!autoFollowRef.current || !mainRef.current) return;
        const target = findLatestRunningNode();
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          mainRef.current.scrollTop = mainRef.current.scrollHeight;
        }
      });
    }
    prevEventCount.current = events.length;
  }, [events.length, autoFollow, mainTab, findLatestRunningNode]);

  const scrollToLatest = useCallback(() => {
    setScrollTrigger(t => t + 1);
    requestAnimationFrame(() => {
      if (!mainRef.current) return;
      const target = findLatestRunningNode();
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        mainRef.current.scrollTop = mainRef.current.scrollHeight;
      }
    });
  }, [findLatestRunningNode]);

  // Scroll when auto-follow is toggled ON
  const prevAutoFollowState = useRef(autoFollow);
  useEffect(() => {
    if (autoFollow && !prevAutoFollowState.current) {
      scrollToLatest();
    }
    prevAutoFollowState.current = autoFollow;
  }, [autoFollow, scrollToLatest]);

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
    if (layoutVertical) {
      const newHeight = layoutSwapped
        ? e.clientY - containerRect.top
        : containerRect.bottom - e.clientY;
      const maxHeight = containerRect.height * 0.7;
      if (newHeight >= 150 && newHeight <= maxHeight) {
        setPanelHeight(newHeight);
      }
    } else {
      const newWidth = layoutSwapped
        ? e.clientX - containerRect.left
        : containerRect.right - e.clientX;
      const maxWidth = containerRect.width * 0.5;
      if (newWidth >= 280 && newWidth <= maxWidth) {
        setRightPanelWidth(newWidth);
      }
    }
  }, [isResizing, layoutVertical, layoutSwapped]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = layoutVertical ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp, layoutVertical]);

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
            {mainTab === 'tree' && (
              <div className="flex items-center bg-argo-bg rounded-lg border border-argo-border">
                <button
                  onClick={scrollToLatest}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-argo-muted hover:text-argo-text transition-colors rounded-l-lg"
                  title="Scroll to latest activity"
                >
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  Latest
                </button>
                <button
                  onClick={() => setAutoFollow(!autoFollow)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
                    autoFollow
                      ? 'bg-argo-accent/20 text-argo-accent'
                      : 'text-argo-muted hover:text-argo-text'
                  }`}
                  title={autoFollow ? 'Auto-follow ON' : 'Auto-follow OFF'}
                >
                  Auto
                </button>
              </div>
            )}
            <ConnectionStatus connected={connected} />
            {showRightPanel && (
              <div className="flex items-center bg-argo-bg rounded-lg border border-argo-border">
                <button
                  onClick={() => setLayoutSwapped(!layoutSwapped)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${
                    layoutSwapped
                      ? 'bg-argo-accent/20 text-argo-accent'
                      : 'text-argo-muted hover:text-argo-text'
                  }`}
                  title={layoutSwapped ? 'Panel: Left' : 'Swap panel position'}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLayoutVertical(!layoutVertical)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
                    layoutVertical
                      ? 'bg-argo-accent/20 text-argo-accent'
                      : 'text-argo-muted hover:text-argo-text'
                  }`}
                  title={layoutVertical ? 'Horizontal layout' : 'Vertical layout'}
                >
                  {layoutVertical ? <Columns className="w-3.5 h-3.5" /> : <Rows className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
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

      <div ref={containerRef} className={`flex-1 flex ${layoutVertical ? 'flex-col' : 'flex-row'} overflow-hidden min-h-0`}>
        {/* Main content - order swaps based on layoutSwapped */}
        <main ref={mainRef} className={`flex-1 overflow-y-auto min-h-0 ${layoutSwapped && showRightPanel ? 'order-3' : 'order-1'}`}>
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
              className={`flex-shrink-0 order-2 hover:bg-argo-accent/50 active:bg-argo-accent transition-colors ${
                isResizing ? 'bg-argo-accent' : 'bg-argo-border'
              } ${layoutVertical ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'}`}
              title="Drag to resize"
            />
            <aside
              style={layoutVertical ? { height: panelHeight } : { width: rightPanelWidth }}
              className={`flex-shrink-0 overflow-hidden ${layoutSwapped ? 'order-1' : 'order-3'}`}
            >
              <RightPanel
                conversations={filteredConversations}
                events={filteredEvents}
                socket={socket}
                sessionId={activeSessionId}
                autoFollow={autoFollow}
                scrollTrigger={scrollTrigger}
              />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

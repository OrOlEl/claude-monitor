'use client';

import { useSessionStore } from '../stores/sessionStore';
import { Folder, Activity } from 'lucide-react';

export function ProjectsGrid() {
  const { getProjectsWithSessions, setSelectedProject } = useSessionStore();
  const projects = getProjectsWithSessions();

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-argo-muted">
        <div className="text-center p-8">
          <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <h2 className="text-lg font-medium text-argo-text mb-2">No Projects Yet</h2>
          <p className="text-sm">Sessions will appear here as Claude works</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-argo-text mb-4">Projects</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => {
          const active = (p.runningSessions || 0) + (p.idleSessions || 0);
          return (
            <button
              key={p.name}
              onClick={() => setSelectedProject(p.name)}
              className="bg-argo-card border border-argo-border rounded-lg p-4 hover:border-argo-accent/50 transition-all text-left"
            >
              <div className="flex items-center gap-3 mb-3">
                <Folder className="w-5 h-5 text-argo-accent" />
                <span className="text-sm font-medium text-argo-text truncate">{p.name}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-argo-muted">
                <span>{p.sessions.length} sessions</span>
                {active > 0 && (
                  <span className="flex items-center gap-1 text-argo-success">
                    <Activity className="w-3 h-3" /> {active} active
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

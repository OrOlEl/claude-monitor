'use client';

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useEventStore } from '../stores/eventStore';
import { useSessionStore } from '../stores/sessionStore';

export function useSocket() {
  const socketRef = useRef(null);
  const { setConnected, initEvents, addEvent, updateState, initConversations, addConversation, initTeams, updateTeams } = useEventStore();
  const { updateFromEvent } = useSessionStore();

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3847';
    socketRef.current = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    const socket = socketRef.current;

    socket.on('connect', () => { console.log('Connected'); setConnected(true); });
    socket.on('disconnect', () => { setConnected(false); });
    socket.on('init', (data) => {
      initEvents(data.events);
      data.events.forEach(e => updateFromEvent(e));
      if (data.conversations) initConversations(data.conversations);
      if (data.teams) initTeams(data.teams);
    });
    socket.on('event', (event) => { addEvent(event); updateFromEvent(event); });
    socket.on('state', (stateData) => { updateState(stateData); });
    socket.on('conversation', (entry) => { addConversation(entry); });
    socket.on('team_update', (teams) => { updateTeams(teams); });

    return () => { socket.disconnect(); };
  }, [setConnected, initEvents, addEvent, updateState, updateFromEvent, initConversations, addConversation, initTeams, updateTeams]);

  return socketRef.current;
}

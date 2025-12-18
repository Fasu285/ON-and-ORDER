import { db } from './firebase';
import * as firebaseDatabase from 'firebase/database';
import { LobbyUser, GameConfig } from '../types';

const { ref, set, onValue, remove, update, onDisconnect, get } = firebaseDatabase;

/**
 * Public Lobby: Advertisement for Discovery
 */
export const updateLobby = (user: LobbyUser, matchCode: string) => {
  if (!db) return;
  const lobbyRef = ref(db, `lobby/${user.username}`);
  set(lobbyRef, {
    username: user.username,
    config: { n: user.n, timeLimit: user.timeLimit },
    matchCode,
    lastSeen: Date.now(),
    status: 'waiting'
  });
  onDisconnect(lobbyRef).remove();
};

export const clearLobby = (username: string) => {
  if (!db) return;
  remove(ref(db, `lobby/${username}`));
};

/**
 * Match State: Synchronization for Gameplay
 */
export const joinMatch = async (matchCode: string, guestName: string) => {
  if (!db) return null;
  const matchRef = ref(db, `matches/${matchCode}`);
  const snapshot = await get(matchRef);
  
  if (snapshot.exists()) {
    // Write guest into metadata to trigger host's transition
    await update(ref(db, `matches/${matchCode}/metadata`), { 
      guest: guestName,
      status: 'active' 
    });
    return snapshot.val().metadata.config;
  }
  return null;
};

export const syncGameStateNode = (matchCode: string, stateUpdate: any) => {
  if (!db) return;
  update(ref(db, `matches/${matchCode}/state`), {
    ...stateUpdate,
    lastUpdate: Date.now()
  });
};

export const initMatchNode = (matchCode: string, hostName: string, config: any) => {
  if (!db) return;
  set(ref(db, `matches/${matchCode}`), {
    metadata: {
      host: hostName,
      guest: null,
      config: config,
      status: 'waiting'
    },
    state: {
      phase: 'WAITING_FOR_OPPONENT',
      p1Secret: '',
      p2Secret: '',
      p1History: [],
      p2History: []
    }
  });
};
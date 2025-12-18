
import { db } from './firebase';
import * as firebaseDatabase from 'firebase/database';
import { LobbyUser, GameConfig, GameState } from '../types';

const { ref, set, onValue, remove, update, onDisconnect, get } = firebaseDatabase;

/**
 * Updates the global lobby with the host's match info.
 */
export const updateLobby = (user: LobbyUser, matchCode: string) => {
  if (!db) return;
  const lobbyRef = ref(db, `lobby/${user.username}`);
  set(lobbyRef, {
    username: user.username,
    config: { n: user.n, timeLimit: user.timeLimit },
    matchCode,
    lastSeen: Date.now()
  });
  // Auto-remove if host disconnects
  onDisconnect(lobbyRef).remove();
};

/**
 * Removes a player from the lobby.
 */
export const clearLobby = (username: string) => {
  if (!db) return;
  remove(ref(db, `lobby/${username}`));
};

/**
 * Joins an existing match by updating metadata.
 */
export const joinMatch = async (matchCode: string, guestName: string) => {
  if (!db) return null;
  const matchRef = ref(db, `matches/${matchCode}`);
  const snapshot = await get(matchRef);
  
  if (snapshot.exists()) {
    const data = snapshot.val();
    // Only join if match isn't full or if re-joining
    if (!data.metadata.guest || data.metadata.guest === guestName) {
      await update(ref(db, `matches/${matchCode}/metadata`), { 
        guest: guestName,
        joinedAt: Date.now()
      });
      // Once joined, remove from public lobby
      if (data.metadata.host) {
        clearLobby(data.metadata.host);
      }
      return data.metadata.config;
    }
  }
  return null;
};

/**
 * Synchronizes the game state node.
 */
export const syncGameStateNode = (matchCode: string, state: any) => {
  if (!db) return;
  update(ref(db, `matches/${matchCode}/state`), {
    ...state,
    lastUpdate: Date.now()
  });
};

/**
 * Initializes a new match container.
 */
export const initMatchNode = async (matchCode: string, hostName: string, config: GameConfig) => {
  if (!db) return;
  const matchRef = ref(db, `matches/${matchCode}`);
  await set(matchRef, {
    metadata: {
      host: hostName,
      guest: null,
      config: { n: config.n, timeLimit: config.timeLimit },
      createdAt: Date.now()
    },
    state: {
      phase: 'WAITING_FOR_OPPONENT',
      p1Secret: '',
      p2Secret: '',
      p1History: [],
      p2History: []
    }
  });
  onDisconnect(matchRef).remove();
};

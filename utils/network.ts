import { db } from './firebase';
import { ref, set, onValue, onDisconnect, remove, get, update, runTransaction } from 'firebase/database';
import { LobbyUser, LobbyEntry, GameConfig } from '../types';

type NetworkEventCallback = (data: any) => void;

export class NetworkAdapter {
  private matchId: string;
  private userId: string;
  private onMessage: NetworkEventCallback;
  private matchRef: any;
  private unsubscribe: (() => void) | null = null;

  constructor(matchId: string, userId: string, onMessage: NetworkEventCallback) {
    this.matchId = matchId;
    this.userId = userId;
    this.onMessage = onMessage;
    
    if (db) {
      this.matchRef = ref(db, `matches/${matchId}`);
      this.unsubscribe = onValue(this.matchRef, (snapshot) => {
        const val = snapshot.val();
        if (val && val.lastMessage) {
          // Only process messages from the other player and that are recent
          if (val.lastMessage.from !== this.userId && val.lastMessage.timestamp > (Date.now() - 60000)) {
             this.onMessage(val.lastMessage);
          }
        }
      });
    }
  }

  public send(type: string, payload: any) {
    if (!db) return;
    const message = { type, payload, timestamp: Date.now(), from: this.userId };
    set(this.matchRef, { lastMessage: message, updatedAt: Date.now() });
  }

  public cleanup() {
    if (this.unsubscribe) this.unsubscribe();
  }
}

// Helper for 6-char alphanumeric code
const generateJoinCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
};

// --- Online Lobby System ---

export const hostMatchInLobby = async (hostUser: { username: string, userId: string }, config: { n: number, timeLimit: number }) => {
    if (!db) throw new Error("Firebase not configured. Check your environment variables.");
    
    const matchId = `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const joinCode = generateJoinCode();
    
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 min TTL
    
    const lobbyEntry: LobbyEntry = {
        matchId,
        hostUserId: hostUser.userId,
        hostUsername: hostUser.username,
        n: config.n as 2 | 3 | 4,
        timeLimit: config.timeLimit as 30 | 60 | 90,
        createdAt: new Date().toISOString(),
        expiresAt,
        joinCode,
        status: 'waiting_for_opponent'
    };

    const updates: any = {};
    updates[`lobby/${matchId}`] = lobbyEntry;
    updates[`joinCodes/${joinCode}`] = { matchId, expiresAt };
    updates[`matches/${matchId}/config`] = { ...config, matchId, role: 'HOST' };
    
    await update(ref(db), updates);

    // Auto cleanup on disconnect
    onDisconnect(ref(db, `lobby/${matchId}`)).remove();
    onDisconnect(ref(db, `joinCodes/${joinCode}`)).remove();

    return { matchId, joinCode };
};

export const joinMatchByCode = async (code: string) => {
    if (!db) throw new Error("Firebase not configured.");
    
    const codeRef = ref(db, `joinCodes/${code}`);
    const snapshot = await get(codeRef);
    if (!snapshot.exists()) throw new Error("Invalid or expired match code.");

    const { matchId } = snapshot.val();
    
    // Transaction to ensure only one guest joins
    const lobbyRef = ref(db, `lobby/${matchId}`);
    const result = await runTransaction(lobbyRef, (current) => {
        if (!current) return null;
        if (current.status !== 'waiting_for_opponent') return; // abort
        return { ...current, status: 'playing' };
    });

    if (!result.committed || !result.snapshot.exists()) {
        throw new Error("Match is full or no longer available.");
    }

    // Fetch config to return to guest
    const configSnapshot = await get(ref(db, `matches/${matchId}/config`));
    const config = configSnapshot.val();

    // Cleanup lobby tracking now that match started
    await remove(codeRef);
    await remove(lobbyRef);

    return { matchId, config };
};

export const listenToAvailableMatches = (callback: (entries: LobbyEntry[]) => void) => {
    if (!db) return () => {};
    const lobbyRef = ref(db, 'lobby');
    return onValue(lobbyRef, (snapshot) => {
        const val = snapshot.val();
        const entries: LobbyEntry[] = [];
        if (val) {
            Object.values(val).forEach((entry: any) => {
                if (entry.status === 'waiting_for_opponent') entries.push(entry);
            });
        }
        entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(entries);
    });
};

export const listenToLobbyStatus = (matchId: string, callback: (status: string) => void) => {
    if (!db) return () => {};
    const statusRef = ref(db, `lobby/${matchId}/status`);
    return onValue(statusRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });
};

export const updateHeartbeat = (username: string) => {
    if (!db) return;
    update(ref(db, `users/${username}`), { lastSeen: Date.now() });
};

export const leaveLobby = (username: string) => {
    if (!db) return;
    remove(ref(db, `users/${username}`));
};
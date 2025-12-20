
import { db } from './firebase';
import { ref, set, onValue, onDisconnect, remove, get, update, runTransaction } from 'firebase/database';
import { LobbyUser, LobbyEntry, GameConfig } from '../types';

type NetworkEventCallback = (data: any) => void;

export class NetworkAdapter {
  private matchCode: string;
  private userId: string;
  private onMessage: NetworkEventCallback;
  private matchRef: any;
  private unsubscribe: (() => void) | null = null;

  constructor(matchCode: string, userId: string, onMessage: NetworkEventCallback) {
    this.matchCode = matchCode;
    this.userId = userId;
    this.onMessage = onMessage;
    
    if (db) {
      this.matchRef = ref(db, `matches/${matchCode}`);
      this.unsubscribe = onValue(this.matchRef, (snapshot) => {
        const val = snapshot.val();
        if (val && val.lastMessage) {
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

// --- Online Lobby System ---

export const hostMatchInLobby = async (hostUser: { username: string, userId: string }, config: { n: number, timeLimit: number }) => {
    if (!db) throw new Error("Database not connected");
    
    const matchId = `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const joinCode = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit code
    
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); // 15 min TTL
    
    const lobbyEntry: LobbyEntry = {
        matchId,
        hostUserId: hostUser.userId,
        hostUsername: hostUser.username,
        // Fix: Explicitly cast to union types to fix potential type mismatch errors
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
    updates[`matches/${matchId}/config`] = { ...config, matchCode: joinCode, role: 'HOST' };
    
    await update(ref(db), updates);

    // Auto cleanup on disconnect
    onDisconnect(ref(db, `lobby/${matchId}`)).remove();
    onDisconnect(ref(db, `joinCodes/${joinCode}`)).remove();

    return { matchId, joinCode };
};

export const joinMatchByCode = async (code: string, username: string) => {
    if (!db) throw new Error("Database not connected");
    
    const codeRef = ref(db, `joinCodes/${code}`);
    const snapshot = await get(codeRef);
    if (!snapshot.exists()) throw new Error("Invalid or expired code");

    const { matchId } = snapshot.val();
    
    // Use transaction to ensure only one guest joins
    const result = await runTransaction(ref(db, `lobby/${matchId}`), (current) => {
        if (!current) return null;
        if (current.status !== 'waiting_for_opponent') return; // abort
        return { ...current, status: 'playing' };
    });

    if (!result.committed) throw new Error("Match is full or unavailable");

    // Cleanup lobby entry and join code once joined
    await remove(codeRef);
    await remove(ref(db, `lobby/${matchId}`));

    return { matchId };
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
        // Sort by newest first
        entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(entries);
    });
};

// Legacy support
export const joinLobby = (user: LobbyUser) => {
    if (!db) return;
    const userRef = ref(db, `users/${user.username}`);
    set(userRef, { ...user, lastSeen: Date.now() });
    onDisconnect(userRef).remove();
};

export const updateHeartbeat = (username: string) => {
    if (!db) return;
    update(ref(db, `users/${username}`), { lastSeen: Date.now() });
};

export const leaveLobby = (username: string) => {
    if (!db) return;
    remove(ref(db, `users/${username}`));
};

export const listenForInvites = (username: string, callback: (invite: any) => void) => {
    if (!db) return () => {};
    const invitesRef = ref(db, `invites/${username}`);
    return onValue(invitesRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
            const firstKey = Object.keys(val)[0];
            const invite = val[firstKey];
            callback(invite);
            remove(ref(db, `invites/${username}/${firstKey}`));
        }
    });
};

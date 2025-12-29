import { db } from './firebase';
import { ref, set, onValue, onDisconnect, remove, get, update, runTransaction } from 'firebase/database';
import { LobbyUser, LobbyEntry, GameConfig } from '../types';

type NetworkEventCallback = (data: any) => void;

export class NetworkAdapter {
  private matchId: string;
  private userId: string;
  private role: 'HOST' | 'GUEST';
  private onMessage: NetworkEventCallback;
  private matchRef: any;
  private unsubscribeHost: (() => void) | null = null;
  private unsubscribeGuest: (() => void) | null = null;
  // Initialize with a grace period (15 seconds) to catch messages sent during component remounts/rematches
  private lastProcessedTimestamp: number = Date.now() - 15000; 

  constructor(matchId: string, userId: string, role: 'HOST' | 'GUEST', onMessage: NetworkEventCallback) {
    this.matchId = matchId;
    this.userId = userId;
    this.role = role;
    this.onMessage = onMessage;
    
    if (db) {
      this.matchRef = ref(db, `matches/${matchId}`);
      
      // Listen to the OPPONENT'S slot
      const opponentRole = this.role === 'HOST' ? 'guestMessage' : 'hostMessage';
      const opponentRef = ref(db, `matches/${matchId}/${opponentRole}`);
      
      this.unsubscribeHost = onValue(opponentRef, (snapshot) => {
        const val = snapshot.val();
        if (val && val.timestamp > this.lastProcessedTimestamp) {
          this.lastProcessedTimestamp = val.timestamp;
          this.onMessage(val);
        }
      });
    }
  }

  public send(type: string, payload: any) {
    if (!db) return;
    const myRoleSlot = this.role === 'HOST' ? 'hostMessage' : 'guestMessage';
    const message = { type, payload, timestamp: Date.now(), from: this.userId };
    
    // Update only our specific role's slot to prevent overwriting opponent's messages
    const updates: any = {};
    updates[`${myRoleSlot}`] = message;
    updates['updatedAt'] = Date.now();
    
    update(this.matchRef, updates).catch(err => {
      console.error("Network send error:", err);
    });
  }

  public cleanup() {
    if (this.unsubscribeHost) this.unsubscribeHost();
    if (this.unsubscribeGuest) this.unsubscribeGuest();
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
    if (!db) throw new Error("Firebase not initialized. Check your config in utils/firebase.ts");
    
    const matchId = `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const joinCode = generateJoinCode();
    
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(); // 30 min TTL
    
    const lobbyEntry: LobbyEntry & { guestUsername?: string } = {
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
    
    try {
        await update(ref(db), updates);

        // Auto cleanup on disconnect
        onDisconnect(ref(db, `lobby/${matchId}`)).remove();
        onDisconnect(ref(db, `joinCodes/${joinCode}`)).remove();

        return { matchId, joinCode };
    } catch (err: any) {
        if (err.message && err.message.includes('PERMISSION_DENIED')) {
            throw new Error("PERMISSION_DENIED: Please check your Firebase Realtime Database Security Rules. They must allow read/write access.");
        }
        throw err;
    }
};

export const joinMatchByCode = async (code: string, guestUsername: string) => {
    if (!db) throw new Error("Firebase not initialized.");
    
    const codeRef = ref(db, `joinCodes/${code}`);
    let snapshot;
    try {
        snapshot = await get(codeRef);
    } catch (err: any) {
        if (err.message && err.message.includes('PERMISSION_DENIED')) {
            throw new Error("PERMISSION_DENIED: Unable to read from Firebase. Check Security Rules.");
        }
        throw err;
    }

    if (!snapshot.exists()) throw new Error("Invalid or expired match code.");

    const { matchId } = snapshot.val();
    
    // Transaction to ensure only one guest joins and record their name
    const lobbyRef = ref(db, `lobby/${matchId}`);
    const result = await runTransaction(lobbyRef, (current) => {
        if (!current) return; // Abort if entry missing
        if (current.status !== 'waiting_for_opponent') return; // Abort if already filled
        return { ...current, status: 'playing', guestUsername };
    });

    if (!result.committed || !result.snapshot.exists()) {
        throw new Error("Match is full or no longer available.");
    }

    const lobbyData = result.snapshot.val();
    const config = {
        n: lobbyData.n,
        timeLimit: lobbyData.timeLimit
    };

    await remove(codeRef);
    
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
    }, (err) => {
        console.error("Lobby listener error:", err);
    });
};

export const listenToLobbyStatus = (matchId: string, callback: (entry: any) => void) => {
    if (!db) return () => {};
    const lobbyRef = ref(db, `lobby/${matchId}`);
    return onValue(lobbyRef, (snapshot) => {
        if (snapshot.exists()) {
            callback(snapshot.val());
        }
    });
};

export const updateHeartbeat = (username: string) => {
    if (!db) return;
    update(ref(db, `users/${username}`), { lastSeen: Date.now() }).catch(() => {});
};

export const leaveLobby = (username: string) => {
    if (!db) return;
    remove(ref(db, `users/${username}`)).catch(() => {});
};
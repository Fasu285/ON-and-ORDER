import { db } from './firebase';
import { ref, set, onValue, push, onDisconnect, remove, get } from 'firebase/database';
import { LobbyUser } from '../types';

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
      // Listen for updates
      this.unsubscribe = onValue(this.matchRef, (snapshot) => {
        const val = snapshot.val();
        if (val && val.lastMessage) {
          // Process message if it exists. 
          // 1. Timestamp check: reasonably recent (within last 60s)
          // 2. Sender check: ignore messages from self (echo)
          if (val.lastMessage.from !== this.userId && val.lastMessage.timestamp > (Date.now() - 60000)) {
             this.onMessage(val.lastMessage);
          }
        }
      });
    }
  }

  public send(type: string, payload: any) {
    if (!db) return;
    
    const message = { 
        type, 
        payload, 
        timestamp: Date.now(), 
        from: this.userId 
    };

    set(this.matchRef, {
        lastMessage: message,
        updatedAt: Date.now()
    });
  }

  public cleanup() {
    if (this.unsubscribe) {
        this.unsubscribe(); // Stop listening
    }
  }
}

// --- Lobby Functions ---

export const joinLobby = (user: LobbyUser) => {
    if (!db) return;
    const database = db; // Local capture for TS narrowing
    const userRef = ref(database, `lobby/${user.username}`);
    set(userRef, {
        ...user,
        lastSeen: Date.now()
    });
    // Auto remove if they close browser
    onDisconnect(userRef).remove();
};

export const leaveLobby = (username: string) => {
    if (!db) return;
    const database = db;
    const userRef = ref(database, `lobby/${username}`);
    remove(userRef);
};

export const listenToLobby = (callback: (users: LobbyUser[]) => void) => {
    if (!db) return () => {};
    const database = db;
    const lobbyRef = ref(database, 'lobby');
    return onValue(lobbyRef, (snapshot) => {
        const val = snapshot.val();
        const users: LobbyUser[] = [];
        if (val) {
            Object.keys(val).forEach(key => {
                users.push(val[key]);
            });
        }
        callback(users);
    });
};

export const sendInvite = (toUser: string, fromUser: string, matchCode: string, config: any) => {
    if (!db) return;
    const database = db;
    const inviteRef = ref(database, `invites/${toUser}/${fromUser}`);
    set(inviteRef, {
        from: fromUser,
        matchCode,
        config,
        timestamp: Date.now()
    });
};

export const listenForInvites = (username: string, callback: (invite: any) => void) => {
    if (!db) return () => {};
    const database = db;
    const invitesRef = ref(database, `invites/${username}`);
    return onValue(invitesRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
            // Get first invite
            const firstKey = Object.keys(val)[0];
            const invite = val[firstKey];
            callback(invite);
            // Auto clear invite after receiving
            remove(ref(database, `invites/${username}/${firstKey}`));
        }
    });
};
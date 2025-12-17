import { db } from './firebase';
import { ref, set, onValue, push, onDisconnect, remove, get } from 'firebase/database';
import { LobbyUser } from '../types';

type NetworkEventCallback = (data: any) => void;

export class NetworkAdapter {
  private matchCode: string;
  private onMessage: NetworkEventCallback;
  private matchRef: any;
  private unsubscribe: (() => void) | null = null;

  constructor(matchCode: string, onMessage: NetworkEventCallback) {
    this.matchCode = matchCode;
    this.onMessage = onMessage;
    
    if (db) {
      this.matchRef = ref(db, `matches/${matchCode}`);
      // Listen for updates
      this.unsubscribe = onValue(this.matchRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
          // Firebase returns the whole object. In a real app we might listen to a list of messages
          // For this simple implementation, we assume the 'lastMessage' field drives the state
          if (val.lastMessage && val.lastMessage.timestamp > (Date.now() - 5000)) {
             // Only process recent messages to avoid flood on reconnect
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
        senderId: Math.random() 
    };

    // Update the match state with the latest message
    // In a production app, we would push to a 'messages' list, but replacing a 'lastMessage' node
    // is sufficient for this lock-step game state sync.
    set(this.matchRef, {
        lastMessage: message,
        updatedAt: Date.now()
    });
  }

  public cleanup() {
    if (this.unsubscribe) {
        this.unsubscribe(); // Stop listening
    }
    // Optional: If host, maybe remove match? 
    // We leave it for now to allow reconnections
  }
}

// --- Lobby Functions ---

export const joinLobby = (user: LobbyUser) => {
    if (!db) return;
    const userRef = ref(db, `lobby/${user.username}`);
    set(userRef, {
        ...user,
        lastSeen: Date.now()
    });
    // Auto remove if they close browser
    onDisconnect(userRef).remove();
};

export const leaveLobby = (username: string) => {
    if (!db) return;
    const userRef = ref(db, `lobby/${username}`);
    remove(userRef);
};

export const listenToLobby = (callback: (users: LobbyUser[]) => void) => {
    if (!db) return () => {};
    const lobbyRef = ref(db, 'lobby');
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
    const inviteRef = ref(db, `invites/${toUser}/${fromUser}`);
    set(inviteRef, {
        from: fromUser,
        matchCode,
        config,
        timestamp: Date.now()
    });
};

export const listenForInvites = (username: string, callback: (invite: any) => void) => {
    if (!db) return () => {};
    const invitesRef = ref(db, `invites/${username}`);
    return onValue(invitesRef, (snapshot) => {
        const val = snapshot.val();
        if (val) {
            // Get first invite
            const firstKey = Object.keys(val)[0];
            const invite = val[firstKey];
            callback(invite);
            // Auto clear invite after receiving
            remove(ref(db, `invites/${username}/${firstKey}`));
        }
    });
};
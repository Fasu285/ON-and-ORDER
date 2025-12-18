import { MatchRecord, GameState } from '../types';

const HISTORY_KEY = 'on_order_match_history';
const ACTIVE_SESSION_KEY = 'on_order_active_session';

export const saveMatchRecord = (record: MatchRecord) => {
  try {
    const existing = localStorage.getItem(HISTORY_KEY);
    const history: MatchRecord[] = existing ? JSON.parse(existing) : [];
    history.unshift(record); // Add to top
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save match history', e);
  }
};

export const getMatchHistory = (): MatchRecord[] => {
  try {
    const existing = localStorage.getItem(HISTORY_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch (e) {
    return [];
  }
};

// --- Active Session Persistence ---

export const saveActiveSession = (state: GameState) => {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save active session', e);
  }
};

export const getActiveSession = (): GameState | null => {
  try {
    const data = localStorage.getItem(ACTIVE_SESSION_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

export const clearActiveSession = () => {
  localStorage.removeItem(ACTIVE_SESSION_KEY);
};

// --- Network Simulation (LocalStorage Bus) ---
// In a real app, this would be WebSocket or WebRTC

type NetworkEventCallback = (data: any) => void;

export class NetworkAdapter {
  private matchCode: string;
  private onMessage: NetworkEventCallback;

  constructor(matchCode: string, onMessage: NetworkEventCallback) {
    this.matchCode = matchCode;
    this.onMessage = onMessage;
    window.addEventListener('storage', this.handleStorageEvent);
  }

  private handleStorageEvent = (e: StorageEvent) => {
    if (e.key && e.key.startsWith(`MATCH_${this.matchCode}_`)) {
      if (e.newValue) {
        const data = JSON.parse(e.newValue);
        // Avoid processing own messages if needed, but simplified here
        this.onMessage(data);
      }
    }
  };

  public send(type: string, payload: any) {
    const key = `MATCH_${this.matchCode}_MSG`;
    const message = { type, payload, timestamp: Date.now(), senderId: Math.random() };
    localStorage.setItem(key, JSON.stringify(message));
  }

  public cleanup() {
    window.removeEventListener('storage', this.handleStorageEvent);
  }
}

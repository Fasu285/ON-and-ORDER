export enum GameMode {
  SINGLE_PLAYER = '1P',
  TWO_PLAYER = '2P',
  ONLINE = 'ONLINE'
}

export enum GameStatus {
  SETUP = 'SETUP', // Legacy, mapping to detailed phases
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}

export enum GamePhase {
  SETUP_P1 = 'SETUP_P1',
  SETUP_P2 = 'SETUP_P2',
  TRANSITION = 'TRANSITION', // "Pass the device"
  WAITING_FOR_OPPONENT = 'WAITING_FOR_OPPONENT', // New for Online
  TURN_P1 = 'TURN_P1',
  TURN_P2 = 'TURN_P2',
  GAME_OVER = 'GAME_OVER'
}

export interface GuessResult {
  guess: string;
  on: number;
  order: number;
  timestamp: string;
}

export interface GameConfig {
  n: 2 | 3 | 4;
  timeLimit: 30 | 60 | 90;
  mode: GameMode;
  matchCode?: string; // For Online
  role?: 'HOST' | 'GUEST'; // For Online
  secondPlayerName?: string; // For Local 2P
}

export interface User {
  username: string;
  contact: string; // Email or Phone
}

export interface LobbyUser {
  username: string;
  n: number;
  timeLimit: number;
  status: 'IDLE' | 'PLAYING';
  lastSeen: number;
}

export interface Invite {
  from: string;
  matchCode: string;
  config: GameConfig;
}

export interface MatchRecord {
  id: string;
  timestamp: string;
  mode: GameMode;
  n: number;
  winner: string; // The display name of the winner
  rounds: number;
  player1Secret: string;
  player2Secret: string;
  player1History: GuessResult[];
  player2History: GuessResult[];
  opponentName?: string;
}

export interface GameState {
  matchId: string;
  config: GameConfig;
  phase: GamePhase;
  
  // Secrets
  player1Secret: string;
  player2Secret: string; // AI secret in 1P
  
  // Histories
  player1History: GuessResult[]; // P1 guesses against P2 Secret
  player2History: GuessResult[]; // P2 guesses against P1 Secret
  
  message?: string;
  winner?: string | null; 
  opponentName?: string; // Persisted name of the opponent
  timeLeft?: number; // Saved time for resume
}

// For Test Vectors
export interface TestVector {
  n: number;
  secret: string;
  guess: string;
  expectedOn: number;
  expectedOrder: number;
}

export enum GameMode {
  SINGLE_PLAYER = '1P',
  TWO_PLAYER = '2P',
  ONLINE = 'ONLINE'
}

export enum GameStatus {
  SETUP = 'SETUP', 
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED'
}

export enum GamePhase {
  SETUP_P1 = 'SETUP_P1',
  SETUP_P2 = 'SETUP_P2',
  TRANSITION = 'TRANSITION', 
  WAITING_FOR_OPPONENT = 'WAITING_FOR_OPPONENT', 
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
  contact: string; 
}

export interface LobbyUser {
  username: string;
  n: 2 | 3 | 4;
  timeLimit: 30 | 60 | 90;
  status: 'IDLE' | 'PLAYING';
  lastSeen: number;
}

export interface LobbyEntry {
  matchId: string;
  hostUserId: string;
  hostUsername: string;
  n: 2 | 3 | 4;
  timeLimit: 30 | 60 | 90;
  createdAt: string;
  expiresAt: string;
  joinCode: string;
  status: 'waiting_for_opponent' | 'playing';
}

export interface JoinCodeRecord {
  matchId: string;
  createdAt: string;
  expiresAt: string;
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
  winner: string; 
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
  player1Secret: string;
  player2Secret: string; 
  player1History: GuessResult[]; 
  player2History: GuessResult[]; 
  message?: string;
  winner?: string | null; 
  opponentName?: string; 
  timeLeft?: number; 
}

export interface TestVector {
  n: number;
  secret: string;
  guess: string;
  expectedOn: number;
  expectedOrder: number;
}

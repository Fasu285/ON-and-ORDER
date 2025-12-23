import { TestVector, GuessResult } from '../types';

/**
 * Validates a sequence of digits.
 * Rules:
 * - Length must be N
 * - Only digits 0-9
 * - No repeated digits
 */
export const validateSequence = (sequence: string, n: number): { valid: boolean; error?: string } => {
  if (sequence.length !== n) {
    return { valid: false, error: `Length must be ${n}` };
  }
  if (!/^\d+$/.test(sequence)) {
    return { valid: false, error: 'Only digits 0-9 allowed' };
  }
  const unique = new Set(sequence.split(''));
  if (unique.size !== sequence.length) {
    return { valid: false, error: 'No repeated digits allowed' };
  }
  return { valid: true };
};

/**
 * Computes ON and Order values.
 * 
 * Order: count of positions where guess digit equals secret digit.
 * ON: count of unique digits in the guess that are present in Secret (each digit counted at most once).
 */
export const computeOnAndOrder = (secret: string, guess: string): { on: number; order: number } => {
  const secretArr = secret.split('');
  const guessArr = guess.split('');
  
  // Calculate Order
  let order = 0;
  for (let i = 0; i < secretArr.length; i++) {
    if (secretArr[i] === guessArr[i]) {
      order++;
    }
  }

  // Calculate ON
  const secretSet = new Set(secretArr);
  const guessSet = new Set(guessArr); // Unique digits in guess (input validation ensures this, but good for safety)
  
  let on = 0;
  guessSet.forEach(digit => {
    if (secretSet.has(digit)) {
      on++;
    }
  });

  return { on, order };
};

/**
 * Generates a random secret sequence of N unique digits.
 * Uses window.crypto for higher quality randomness to ensure variety.
 */
export const generateRandomSecret = (n: number): string => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  let available = [...digits];
  let secret = '';
  
  // Use crypto for better randomness
  const array = new Uint32Array(n);
  window.crypto.getRandomValues(array);

  for (let i = 0; i < n; i++) {
    const randomIndex = array[i] % available.length;
    secret += available[randomIndex];
    available.splice(randomIndex, 1);
  }
  return secret;
};

/**
 * CPU logic for Single Player: Returns a guess consistent with history.
 * This implements an elimination algorithm to find a sequence that matches 
 * all previous feedback received by the CPU.
 */
export const getCpuPerfectGuess = (n: number, history: GuessResult[]): string => {
  if (history.length === 0) {
    return generateRandomSecret(n);
  }

  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const candidates: string[] = [];

  const backtrack = (current: string) => {
    if (current.length === n) {
      // Check consistency with ALL history
      const isConsistent = history.every(move => {
        const check = computeOnAndOrder(current, move.guess);
        return check.on === move.on && check.order === move.order;
      });
      if (isConsistent) candidates.push(current);
      return;
    }
    for (const d of digits) {
      if (!current.includes(d)) {
        backtrack(current + d);
      }
    }
  };

  backtrack('');

  if (candidates.length === 0) return generateRandomSecret(n);
  
  // To be a "perfect" opponent, we could just return the first one, 
  // but picking a random valid candidate makes it feel slightly more natural 
  // while remaining mathematically sound based on information available.
  return candidates[Math.floor(Math.random() * candidates.length)];
};

export const runTestVectors = (vectors: TestVector[]): { passed: boolean; details: string[] } => {
  const details: string[] = [];
  let allPassed = true;

  vectors.forEach((v, idx) => {
    const result = computeOnAndOrder(v.secret, v.guess);
    const passed = result.on === v.expectedOn && result.order === v.expectedOrder;
    if (!passed) {
      allPassed = false;
      details.push(`Vector ${idx + 1} FAILED: Secret=${v.secret}, Guess=${v.guess}. Expected ON=${v.expectedOn}/Order=${v.expectedOrder}. Got ON=${result.on}/Order=${result.order}`);
    } else {
      details.push(`Vector ${idx + 1} PASSED: Secret=${v.secret}, Guess=${v.guess} -> ${result.on}/${result.order}`);
    }
  });

  return { passed: allPassed, details };
};
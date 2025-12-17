import { TestVector } from '../types';

export const TEST_VECTORS: TestVector[] = [
  { n: 4, secret: '4725', guess: '2475', expectedOn: 4, expectedOrder: 1 },
  { n: 4, secret: '1234', guess: '4321', expectedOn: 4, expectedOrder: 0 },
  { n: 4, secret: '9876', guess: '9876', expectedOn: 4, expectedOrder: 4 },
  { n: 3, secret: '582', guess: '528', expectedOn: 3, expectedOrder: 1 },
  { n: 2, secret: '45', guess: '54', expectedOn: 2, expectedOrder: 0 }
];

export const COLORS = {
  primary: 'bg-blue-600',
  secondary: 'bg-orange-500',
  success: 'bg-green-600',
  error: 'bg-red-600',
  neutral: 'bg-gray-200',
  text: 'text-gray-900',
  textLight: 'text-white'
};

export const ANIMATION_DELAY = 300; // ms
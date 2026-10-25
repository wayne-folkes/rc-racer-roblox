import './setup';
import { expect, test } from 'vitest';
import { BRONZE, GOLD, newProfile, withCupResult } from '../src/shared/profile';
import { isUnlocked, unlockedVehicles, unlockHint } from '../src/shared/unlocks';

test('a new profile can only pick the buggy', () => {
  expect(unlockedVehicles(newProfile())).toEqual(['buggy']);
  expect(isUnlocked(newProfile(), 'truck')).toBe(false);
});

test('a bronze in the Classic Cup unlocks the Monster Truck', () => {
  const p = withCupResult(newProfile(), 'classic', BRONZE, false);
  expect(isUnlocked(p, 'truck')).toBe(true);
  expect(unlockedVehicles(p)).toEqual(['buggy', 'truck']);
});

test('a gold in another cup does not unlock the Monster Truck', () => {
  const p = withCupResult(newProfile(), 'space', GOLD, false);
  expect(isUnlocked(p, 'truck')).toBe(false);
  expect(unlockedVehicles(p)).toEqual(['buggy']);
});

test('the hint says how to unlock a locked vehicle', () => {
  expect(unlockHint('truck')).toBe('Finish in the top 3 of the Classic Cup');
  expect(unlockHint('buggy')).toBe('');
});

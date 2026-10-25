import './setup';
import { expect, test } from 'vitest';
import {
  BRONZE,
  GOLD,
  newProfile,
  NO_TROPHY,
  readProfile,
  SILVER,
  withCupResult,
  withRace,
  withVehicle,
  type Profile,
} from '../src/shared/profile';

// Copies a profile, so a test can check the original was left alone.
const copyOf = (p: Profile): Profile => JSON.parse(JSON.stringify(p));

test('a missing or non-table stored value reads as a new profile', () => {
  expect(readProfile(undefined)).toEqual(newProfile());
  expect(readProfile('a string')).toEqual(newProfile());
  expect(readProfile(7)).toEqual(newProfile());
});

test('malformed fields fall back one by one, and the rest of the profile is kept', () => {
  const stored = {
    vehicle: 'go-kart',
    races: -1,
    raceWins: 1.5,
    cupsFinished: 'lots',
    rivalWins: 3,
    // A stored table's cups are read as pairs, so the test stores them as a Map, as Luau's table would be.
    cups: new Map<unknown, unknown>([
      ['classic', { best: 7, finished: -2, bronze: 1, silver: 'a', gold: 0.5 }],
      ['space', 'not a record'],
    ]),
  };
  expect(readProfile(stored)).toEqual({
    v: 1,
    vehicle: 'buggy',
    races: 0,
    raceWins: 0,
    cupsFinished: 0,
    rivalWins: 3,
    cups: { classic: { best: GOLD, finished: 0, bronze: 1, silver: 0, gold: 0 } },
  });
});

test('a well-formed stored profile reads back unchanged', () => {
  const stored = {
    v: 1,
    vehicle: 'truck',
    races: 4,
    raceWins: 1,
    cupsFinished: 1,
    rivalWins: 0,
    cups: new Map<unknown, unknown>([['classic', { best: BRONZE, finished: 1, bronze: 1, silver: 0, gold: 0 }]]),
  };
  expect(readProfile(stored)).toEqual({
    ...stored,
    cups: { classic: { best: BRONZE, finished: 1, bronze: 1, silver: 0, gold: 0 } },
  });
});

test('picking a vehicle sets it and leaves the profile as it was', () => {
  const before = newProfile();
  const picked = withVehicle(before, 'truck');
  expect(picked.vehicle).toBe('truck');
  expect(before).toEqual(newProfile());
});

test('a race adds one race, and one win if it was won', () => {
  const before = newProfile();
  const won = withRace(before, true);
  expect(won).toMatchObject({ races: 1, raceWins: 1 });
  const lost = withRace(won, false);
  expect(lost).toMatchObject({ races: 2, raceWins: 1 });
  expect(before).toEqual(newProfile());
});

test('a cup counts its trophy by tier, keeps the best, and counts a Rival win', () => {
  const before = newProfile();
  const gold = withCupResult(before, 'classic', GOLD, false);
  expect(gold).toMatchObject({ cupsFinished: 1, rivalWins: 0 });
  expect(gold.cups.classic).toEqual({ best: GOLD, finished: 1, bronze: 0, silver: 0, gold: 1 });

  // A lower trophy later keeps the gold as the best, but still counts its own tier.
  const again = withCupResult(gold, 'classic', BRONZE, true);
  expect(again).toMatchObject({ cupsFinished: 2, rivalWins: 1 });
  expect(again.cups.classic).toEqual({ best: GOLD, finished: 2, bronze: 1, silver: 0, gold: 1 });

  // No trophy still counts the cup as finished, and is kept as a 0 best.
  const plain = withCupResult(before, 'space', NO_TROPHY, false);
  expect(plain.cups.space).toEqual({ best: NO_TROPHY, finished: 1, bronze: 0, silver: 0, gold: 0 });

  const silver = withCupResult(before, 'space', SILVER, false);
  expect(silver.cups.space).toEqual({ best: SILVER, finished: 1, bronze: 0, silver: 1, gold: 0 });
  expect(before).toEqual(newProfile());
});

test('the profile functions never change the profile they are given', () => {
  const start = withCupResult(withRace(newProfile(), true), 'classic', BRONZE, false);
  const snapshot = copyOf(start);
  withVehicle(start, 'truck');
  withRace(start, true);
  withCupResult(start, 'classic', GOLD, true);
  expect(start).toEqual(snapshot);
});

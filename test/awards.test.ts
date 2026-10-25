import './setup';
import { expect, test } from 'vitest';
import { awardNews, Cup, cupAwards, type CupAward, type Scorer } from '../src/shared/cup';
import { BRONZE, GOLD, NO_TROPHY, SILVER } from '../src/shared/profile';

const ai = (name: string): Scorer => ({ key: `ai:${name}`, name, color: '#fff', userId: 0 });
const player = (name: string, userId: number): Scorer => ({ key: `player:${userId}`, name, color: '#fff', userId });

/** Scores the same finishing order `times` times. */
function race(cup: Cup, order: Scorer[], times = 1) {
  for (let i = 0; i < times; i++) cup.addRace(order);
}

/** Each award as [userId, place, trophy, rival], for comparing in one line. */
const summary = (awards: CupAward[]) => awards.map((a) => [a.userId, a.place, a.trophy, a.rival]);

const Red = ai('Red');
const Blue = ai('Blue');
const Green = ai('Green');
const Pink = ai('Pink');
const Yellow = ai('Yellow');
const Ann = player('Ann', 101);
const Ben = player('Ben', 102);
const Cy = player('Cy', 103);

test('trophies go by overall place, with AI cars ahead of and behind the players', () => {
  // Ann is 2nd: silver, with an AI car ahead. Blue (AI) is 3rd, so Ben, 4th, gets nothing. All three
  // players raced every race, so they're all rivals, and the best placed of them (Ann) gets the Rival win.
  const silver = new Cup('classic');
  race(silver, [Red, Ann, Blue, Ben, Green, Cy], 4);
  expect(summary(cupAwards(silver.standings(), 4))).toEqual([
    [101, 2, SILVER, true],
    [102, 4, NO_TROPHY, false],
    [103, 6, NO_TROPHY, false],
  ]);

  // Ann is 3rd: bronze, with AI cars on either side of her. She's the best placed of the three rivals.
  const bronze = new Cup('classic');
  race(bronze, [Red, Blue, Ann, Green, Ben, Cy], 4);
  expect(summary(cupAwards(bronze.standings(), 4))).toEqual([
    [101, 3, BRONZE, true],
    [102, 5, NO_TROPHY, false],
    [103, 6, NO_TROPHY, false],
  ]);

  // Ann wins: gold, and the Rival win too, as the best placed of the three players.
  const gold = new Cup('classic');
  race(gold, [Ann, Red, Blue, Ben, Green, Cy], 4);
  expect(summary(cupAwards(gold.standings(), 4))[0]).toEqual([101, 1, GOLD, true]);
});

test('a solo cup gives the trophy but no Rival win', () => {
  const cup = new Cup('classic');
  race(cup, [Ann, Red, Blue, Green, Pink, Yellow], 4);
  expect(summary(cupAwards(cup.standings(), 4))).toEqual([[101, 1, GOLD, false]]);
});

test('two players who raced every race: the higher-placed one gets the Rival win', () => {
  const cup = new Cup('classic');
  race(cup, [Ann, Ben, Red, Blue, Green, Pink], 4);
  expect(summary(cupAwards(cup.standings(), 4))).toEqual([
    [101, 1, GOLD, true],
    [102, 2, SILVER, false],
  ]);
});

test('a player who joined for the last race only is not a rival, so one other rival gets nothing', () => {
  const cup = new Cup('classic');
  race(cup, [Ann, Red, Blue, Green, Pink, Yellow], 3);
  // Ben's first race is the last one, and he wins it, but he has only one race of four.
  race(cup, [Ben, Ann, Red, Blue, Green, Pink]);
  const awards = cupAwards(cup.standings(), 4);
  expect(cup.standings().find((r) => r.userId === 102)?.races).toBe(1);
  expect(summary(awards).map((a) => a[3])).toEqual([false, false]);
  expect(awards.find((a) => a.userId === 101)?.trophy).toBe(GOLD);
});

test('a player who left after two of four races still counts as a rival, and their points stay under their key', () => {
  const cup = new Cup('classic');
  race(cup, [Ann, Cy, Red, Blue, Green, Pink], 2);
  race(cup, [Ann, Red, Blue, Green, Pink, Yellow], 2);
  const awards = cupAwards(cup.standings(), 4);
  // Cy has two races of four, which is half: a rival, so Ann (the better placed) gets the Rival win.
  // Cy is 5th overall, behind three AI cars, so no trophy.
  expect(summary(awards)).toEqual([
    [101, 1, GOLD, true],
    [103, 5, NO_TROPHY, false],
  ]);
  const cy = cup.standings().find((r) => r.key === 'player:103');
  expect(cy).toMatchObject({ races: 2, points: 24 });
});

test('races counts the races each scorer took part in', () => {
  const cup = new Cup('classic');
  race(cup, [Ann, Red, Blue, Green, Pink, Yellow], 3);
  race(cup, [Red, Ann, Blue, Green, Pink, Yellow]);
  const rows = Object.fromEntries(cup.standings().map((r) => [r.name, r.races]));
  expect(rows).toEqual({ Ann: 4, Red: 4, Blue: 4, Green: 4, Pink: 4, Yellow: 4 });
});

test('only players get awards, and the cup with no players gives none', () => {
  const cup = new Cup('classic');
  race(cup, [Red, Blue, Green, Pink, Yellow, Ann], 4);
  expect(cupAwards(cup.standings(), 4)).toEqual([{ userId: 101, place: 6, trophy: NO_TROPHY, rival: false }]);
  const empty = new Cup('classic');
  race(empty, [Red, Blue, Green, Pink, Yellow, Ben], 4);
  expect(cupAwards(empty.standings(), 4).map((a) => a.userId)).toEqual([102]);
});

const award = (trophy: number, rival: boolean): CupAward => ({ userId: 101, place: 1, trophy, rival });

test('results news: the trophy, the Rival win, then each unlock, in that order', () => {
  expect(awardNews(award(GOLD, true), 'Classic Cup', ['Monster Truck'], true)).toEqual([
    'Gold in the Classic Cup',
    'Rival win! Top player in the cup',
    'Unlocked: Monster Truck',
  ]);
  expect(awardNews(award(SILVER, false), 'Space Cup', [], true)).toEqual(['Silver in the Space Cup']);
});

test('results news: nothing earned, nothing shown', () => {
  expect(awardNews(award(NO_TROPHY, false), 'Classic Cup', [], true)).toEqual([]);
  expect(awardNews(undefined, 'Classic Cup', [], true)).toEqual([]);
});

test('results news: an unlock with no award is still told', () => {
  expect(awardNews(undefined, 'Classic Cup', ['Monster Truck'], true)).toEqual(['Unlocked: Monster Truck']);
});

test("results news: if the save failed, the trophy is still shown, with a note that it wasn't saved", () => {
  expect(awardNews(award(BRONZE, true), 'Toybox Cup', [], false)).toEqual([
    'Bronze in the Toybox Cup',
    'Rival win! Top player in the cup',
    "Progress couldn't be saved",
  ]);
});

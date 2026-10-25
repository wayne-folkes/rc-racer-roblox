import './setup';
import { expect, test } from 'vitest';
import { countVotes, Cup, CUP_POINTS, voteOptions, winningOption, type Scorer } from '../src/shared/cup';
import { seededRandom } from '../src/shared/items';
import { NOT_FINISHED } from '../src/shared/race';
import { RaceSim } from '../src/shared/raceSim';
import { ALL_TRACKS, trackById, trackPath } from '../src/shared/tracks';

const scorer = (name: string, userId = 0): Scorer => ({
  key: userId ? `player:${userId}` : `ai:${name}`,
  name,
  color: '#fff',
  userId,
});

test('a vote offers all four cups and two different quick races on real tracks', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const options = voteOptions(seededRandom(seed));
    expect(options.map((o) => o.kind)).toEqual(['cup', 'cup', 'cup', 'cup', 'quick', 'quick']);
    expect(options.slice(0, 4).map((o) => o.id)).toEqual(['classic', 'space', 'toybox', 'city']);
    expect(options[4].id).not.toBe(options[5].id);
    for (const o of options.slice(4)) expect(trackById(o.id)).toBeDefined();
  }
});

test('votes are counted, and the most votes win; ties and no votes are settled at random', () => {
  expect(countVotes(4, [0, 2, 2, 3, 9, -1])).toEqual([1, 0, 2, 1]);
  expect(winningOption([1, 0, 2, 1], seededRandom(1))).toBe(2);
  const tied = new Set<number>();
  const none = new Set<number>();
  const rand = seededRandom(3);
  for (let k = 0; k < 200; k++) {
    tied.add(winningOption([2, 0, 2, 1], rand));
    none.add(winningOption([0, 0, 0, 0], rand));
  }
  expect([...tied].sort()).toEqual([0, 2]);
  expect([...none].sort()).toEqual([0, 1, 2, 3]);
});

test('a cup scores 15-12-10-8-6-4 over four races, ties going to the best single finish', () => {
  const cup = new Cup('classic');
  expect(cup.name()).toBe('Classic Cup');
  expect(cup.tracks.map((t) => t.id)).toEqual(['demo', 'desert', 'lakeside', 'snow']);
  const [a, b, c, d, e, f] = ['Ann', 'Ben', 'Blue', 'Green', 'Purple', 'Yellow'].map((n, i) =>
    scorer(n, i < 2 ? 100 + i : 0),
  );
  expect(cup.nextTrack()?.id).toBe('demo');
  cup.addRace([a, b, c, d, e, f]);
  cup.addRace([b, a, c, d, e, f]);
  expect(cup.standings().slice(0, 2).map((r) => [r.name, r.points])).toEqual([
    ['Ann', 27],
    ['Ben', 27],
  ]);
  // Level on points: Ann and Ben have both won a race, so it falls to the name. Then Ben wins again.
  cup.addRace([b, c, a, d, e, f]);
  expect(cup.standings()[0]).toMatchObject({ name: 'Ben', points: 42, lastPoints: 15 });
  expect(cup.done()).toBe(false);
  // A player who joins for the last race scores from there; one who left keeps their points.
  const g = scorer('Gus', 102);
  cup.addRace([c, g, a, d, e, f]);
  expect(cup.done()).toBe(true);
  expect(cup.nextTrack()).toBeUndefined();
  const table = Object.fromEntries(cup.standings().map((r) => [r.name, r.points]));
  // Ann and Blue end level on 47 with a win each, so it falls to the name.
  expect(table).toEqual({ Ann: 47, Blue: 47, Ben: 42, Green: 32, Purple: 24, Yellow: 16, Gus: 12 });
  expect(cup.standings().map((r) => r.name)).toEqual(['Ann', 'Blue', 'Ben', 'Green', 'Purple', 'Yellow', 'Gus']);
  expect(CUP_POINTS).toEqual([15, 12, 10, 8, 6, 4]);
});

test('every track, both ways round: a full race with items finishes with nobody stuck', () => {
  const report: string[] = [];
  for (const def of ALL_TRACKS) {
    const sim = new RaceSim(trackPath(def), [], 11, def.layout);
    let t = 0;
    while (t < 240 && sim.race.finishTimes.some((f) => f === NOT_FINISHED)) {
      sim.step(1 / 120);
      t += 1 / 120;
    }
    const times = sim.race.finishTimes;
    report.push(`${def.id} ${Math.max(...times).toFixed(1)}s`);
    expect(times.every((f) => f !== NOT_FINISHED), `${def.id}: ${times}`).toBe(true);
  }
  console.log('slowest finisher per track:', report.join(', '));
}, 120_000);

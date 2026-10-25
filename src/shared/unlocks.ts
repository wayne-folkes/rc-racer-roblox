import { CIRCUITS, type CircuitId } from './tracks';
import { BRONZE, GOLD, SILVER, type Profile } from './profile';
import { VEHICLE_IDS, type VehicleId } from './vehicles';

// What each vehicle needs before it can be picked. Unlocks are worked out from what the player has
// done, not stored, so a new unlock goes straight to everyone who already qualifies (docs/progression.md).

/** What a vehicle needs before it can be picked. */
export type Requirement = { kind: 'start' } | { kind: 'cup'; circuit: CircuitId; trophy: number };

export const VEHICLE_UNLOCKS: Record<VehicleId, Requirement> = {
  buggy: { kind: 'start' },
  truck: { kind: 'cup', circuit: 'classic', trophy: BRONZE },
};

export function isUnlocked(p: Profile, vehicle: VehicleId): boolean {
  const need = VEHICLE_UNLOCKS[vehicle];
  if (need.kind === 'start') return true;
  const cup = p.cups[need.circuit];
  return cup !== undefined && cup.best >= need.trophy;
}

/** The vehicles a player can pick, in VEHICLE_IDS order. */
export function unlockedVehicles(p: Profile): VehicleId[] {
  return VEHICLE_IDS.filter((id) => isUnlocked(p, id));
}

/** How to unlock a vehicle, for its locked card: e.g. 'Finish in the top 3 of the Classic Cup'. */
export function unlockHint(vehicle: VehicleId): string {
  const need = VEHICLE_UNLOCKS[vehicle];
  if (need.kind === 'start') return '';
  const cup = CIRCUITS[need.circuit].name;
  if (need.trophy === GOLD) return `Win the ${cup}`;
  if (need.trophy === SILVER) return `Finish in the top 2 of the ${cup}`;
  return `Finish in the top 3 of the ${cup}`;
}

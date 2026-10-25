import { DEFAULT_TUNING, type CarTuning } from './carPhysics';

// The vehicles a player picks between races. The buggy is the game's baseline handling; the truck is
// the buggy's numbers with a few changed, so a tweak to DEFAULT_TUNING carries over to both.

export type VehicleId = 'buggy' | 'truck';
export const VEHICLE_IDS: VehicleId[] = ['buggy', 'truck'];
export const DEFAULT_VEHICLE: VehicleId = 'buggy';

export interface Vehicle {
  name: string;
  /** One line for the pick screen: what it's good and bad at. */
  blurb: string;
  tuning: CarTuning;
}

export const VEHICLES: Record<VehicleId, Vehicle> = {
  buggy: {
    name: 'Buggy',
    blurb: 'Quick and sharp. Oil and puddles bite.',
    tuning: DEFAULT_TUNING,
  },
  truck: {
    name: 'Monster Truck',
    blurb: 'Slower and softer to steer, but big tires shrug off oil and puddles.',
    tuning: {
      ...DEFAULT_TUNING,
      maxSpeed: DEFAULT_TUNING.maxSpeed * 0.94,
      accel: DEFAULT_TUNING.accel * 0.9,
      maxTurnRate: DEFAULT_TUNING.maxTurnRate * 0.92,
      slickGrip: 0.35,
      puddleDrag: DEFAULT_TUNING.puddleDrag * 0.5,
    },
  },
};

export function isVehicleId(value: unknown): value is VehicleId {
  return VEHICLE_IDS.includes(value as VehicleId);
}

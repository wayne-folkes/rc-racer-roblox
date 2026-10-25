import './setup';
import { expect, test } from 'vitest';
import * as web from '../../rc-racer/client/src/game/vehicles';
import * as port from '../src/shared/vehicles';

test("the ported vehicles are the web game's, with the same names, blurbs and tunings", () => {
  expect(port.VEHICLE_IDS).toEqual(web.VEHICLE_IDS);
  expect(port.DEFAULT_VEHICLE).toBe(web.DEFAULT_VEHICLE);
  for (const id of web.VEHICLE_IDS) {
    expect(port.VEHICLES[id].name).toBe(web.VEHICLES[id].name);
    expect(port.VEHICLES[id].blurb).toBe(web.VEHICLES[id].blurb);
    expect(port.VEHICLES[id].tuning).toEqual(web.VEHICLES[id].tuning);
  }
});

test('only the known vehicles are accepted from a player', () => {
  expect(port.isVehicleId('buggy')).toBe(true);
  expect(port.isVehicleId('truck')).toBe(true);
  expect(port.isVehicleId('go-kart')).toBe(false);
  expect(port.isVehicleId(undefined)).toBe(false);
  expect(port.isVehicleId(1)).toBe(false);
});

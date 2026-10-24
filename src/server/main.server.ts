import { MEADOW_LOOP, trackPath } from 'shared/tracks';
import { buildTrack } from './buildTrack';

// The server only builds the track. Driving is all on the player's own device for the spike;
// see NOTES.md for what multiplayer would move here.

buildTrack(trackPath(MEADOW_LOOP), MEADOW_LOOP);

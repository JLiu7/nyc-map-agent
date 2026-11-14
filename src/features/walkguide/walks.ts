/**
 * Step-free walks we filmed ourselves, one checkpoint per sign or landmark, in
 * the direction we walked them (2026-11-13): into Cortlandt St by the street
 * elevator on Broadway, the R or W uptown, and out of 14 St-Union Sq across
 * from the Climate Clock. A station here has no model in the app, so this list
 * is what a rider is matched against: the sign they see, the level it is on,
 * and how far the next one is.
 *
 * What is measured and what is a guess: the order, the signs' words and the
 * step counts come from the recording (camera plus the phone's step counter);
 * the levels come from the barometer. At 14 St-Union Sq the places come from a
 * second recording that evening, walked the other way with location on: the
 * phone logged a position every 15 s or so across the mezzanine, good to about
 * 20 m, and the gyroscope gave the corners. The platform there is laid along
 * the N/Q/R/W track as the map draws it, north of the elevator; which end of
 * it we walked from is a guess. At Cortlandt St the places are
 * still estimates: the passage is laid along Dey St from Broadway to Church
 * St, where the live map draws those streets.
 */

type WalkLevel = "street" | "concourse" | "mezzanine" | "platform";

export interface Checkpoint {
  id: string;
  station: "Cortlandt St" | "14 St-Union Sq";
  level: WalkLevel;
  /** Estimated place, [lon, lat]. */
  at: [number, number];
  /** What the sign or landmark is, as a rider would name it. Never translated: it is what is written there. */
  sign: string;
  /** What to do from here to reach the next checkpoint. */
  say: string;
  /** Steps we counted from here to the next checkpoint; 0 when the next one is reached by elevator or train. */
  steps: number;
  /** Corners on the way to the next checkpoint, [lon, lat], so the line and the dot turn where the walk turns. */
  via?: [number, number][];
  /** How the next checkpoint is reached when not on foot. */
  by?: "elevator" | "train";
  photo: string;
}

/** A sign that means the rider has left the route, and the checkpoint to head back to. */
export interface WrongWay {
  id: string;
  sign: string;
  say: string;
  /** The checkpoint this is nearest to on the route. */
  near: string;
  photo: string;
}

export const WALK: Checkpoint[] = [
  { id: "fulton-entrance", station: "Cortlandt St", level: "street", at: [-74.00926, 40.71027], sign: "Fulton Street Station entrance, Broadway at Dey St", say: "Go in at the glass entrance on Broadway. The elevator is just inside.", steps: 12, photo: "fulton-entrance" },
  { id: "el728x", station: "Cortlandt St", level: "street", at: [-74.00934, 40.71031], sign: "Elevator to A C J Z R W 2 3 4 5 · PATH/WTC", say: "Take this elevator down. Press Concourse.", steps: 0, by: "elevator", photo: "el728x" },
  { id: "dey-passage", station: "Cortlandt St", level: "concourse", at: [-74.0094, 40.71033], sign: "↑ R W E 1 · WTC/PATH (long passage, starburst ceiling)", say: "Follow the long passage under the R W E 1 signs. About 175 steps.", steps: 175, photo: "dey-passage" },
  { id: "to-rwe", station: "Cortlandt St", level: "concourse", at: [-74.0106, 40.71094], sign: "Elevator to R W E ↗", say: "At the Elevator to R W E sign, bear right to the turnstiles. About 40 steps.", steps: 40, photo: "to-rwe" },
  { id: "cortlandt-turnstiles", station: "Cortlandt St", level: "concourse", at: [-74.01078, 40.71103], sign: "Turnstiles by the mosaic wall", say: "Go through the wide gate. The elevators are past the mosaic wall, about 20 steps.", steps: 20, photo: "cortlandt-turnstiles" },
  { id: "uptown-queens", station: "Cortlandt St", level: "concourse", at: [-74.01082, 40.711], sign: "Elevator to Uptown & Queens R W", say: "Take the glass elevator signed Uptown & Queens. It goes up to the platform.", steps: 0, by: "elevator", photo: "uptown-queens" },
  { id: "cortlandt-platform", station: "Cortlandt St", level: "platform", at: [-74.01086, 40.71092], sign: "Cortlandt Street (uptown platform)", say: "Board an R or W. Ride 5 stops to 14 St-Union Sq.", steps: 0, by: "train", photo: "cortlandt-platform" },
  { id: "us-platform", station: "14 St-Union Sq", level: "platform", at: [-73.99048, 40.73645], sign: "14 Street, with the wheelchair symbol", say: "Walk along the platform to the elevator. About 220 steps.", steps: 220, photo: "us-platform" },
  { id: "us-to-mezzanine", station: "14 St-Union Sq", level: "platform", at: [-73.9908, 40.7353], sign: "To Mezzanine · L & Downtown N Q R W", say: "Take this elevator up one level, to the mezzanine.", steps: 0, by: "elevator", photo: "us-to-mezzanine" },
  { id: "us-to-l", station: "14 St-Union Sq", level: "mezzanine", at: [-73.99064, 40.73529], sign: "Elevator to L (overhead)", say: "Go under the Elevator to L sign and into the long corridor. About 20 steps.", steps: 22, photo: "us-to-l" },
  { id: "us-corridor", station: "14 St-Union Sq", level: "mezzanine", at: [-73.99046, 40.73527], sign: "Long white corridor with ad screens", say: "Walk the length of the corridor. About 90 steps.", steps: 89, via: [[-73.99025, 40.73515]], photo: "us-corridor" },
  { id: "us-yellow", station: "14 St-Union Sq", level: "mezzanine", at: [-73.99012, 40.73464], sign: "Exit · 14 St & 4 Av (yellow columns)", say: "Go past the yellow columns. About 15 steps.", steps: 14, photo: "us-yellow" },
  { id: "us-sw-turnstiles", station: "14 St-Union Sq", level: "mezzanine", at: [-73.99004, 40.73448], sign: "Exit · 14 St & 4 Av SW corner (turnstiles)", say: "Do not go out at these turnstiles. Keep going, about 25 steps.", steps: 25, photo: "us-sw-turnstiles" },
  { id: "us-downtown-sign", station: "14 St-Union Sq", level: "mezzanine", at: [-73.98996, 40.73444], sign: "Exit · 14 Street · Downtown (blue columns)", say: "Go on through the hall with blue columns to the wide exit gate. About 35 steps.", steps: 35, photo: "us-downtown-sign" },
  { id: "us-exit-arrow", station: "14 St-Union Sq", level: "mezzanine", at: [-73.98989, 40.73452], sign: "Exit · 14 Street & 4 Avenue →", say: "Go out through the wide gate and follow the arrow. About 25 steps.", steps: 27, photo: "us-exit-arrow" },
  { id: "us-mural-elevator", station: "14 St-Union Sq", level: "mezzanine", at: [-73.98984, 40.73466], sign: "Red Exit sign, NE corner, beside the orange mural", say: "Take the elevator under the red Exit sign up to the street.", steps: 0, by: "elevator", photo: "us-mural-elevator" },
  { id: "us-climate-clock", station: "14 St-Union Sq", level: "street", at: [-73.98984, 40.73471], sign: "Climate Clock above Best Buy, across 14th St", say: "You are out, at 14th Street and 4th Avenue. The Climate Clock is across the street.", steps: 0, photo: "us-climate-clock" },
];

export const WRONG_WAYS: WrongWay[] = [
  { id: "downtown-brooklyn-rw", sign: "Elevator to Downtown & Brooklyn R W", say: "Wrong elevator: this one is for downtown. Yours is signed Uptown & Queens, a few steps away.", near: "uptown-queens", photo: "downtown-brooklyn-rw" },
  { id: "us-downtown-elevator", sign: "Elevator to Downtown & Brooklyn N Q R W (glass)", say: "This elevator goes down to the downtown platform. For the street, look for the Elevator to L sign.", near: "us-to-l", photo: "us-downtown-elevator" },
  { id: "us-west-exit", sign: "Exit · 16 Street & Union Square West", say: "This is the west side. Turn back to the elevators and look for the Elevator to L sign.", near: "us-to-l", photo: "us-west-exit" },
];

export const photoUrl = (name: string): string => `/walks/${name}.jpg`;

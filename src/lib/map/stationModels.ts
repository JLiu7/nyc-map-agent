/**
 * The stations with a dollhouse model (#129 for Fulton St; Brooklyn Bridge–City Hall and
 * Atlantic Av–Barclays Ctr added after it). Each model comes from Project Subway NYC's station model
 * (credited in the map's credits) and holds walks from one platform, where one direction of trains
 * stops, to every street exit it reaches. A trip plays the dollhouse walk when it gets off such a
 * train at that platform; every other station leg stays first person.
 */
export type StationModelId = "fulton" | "cityhall" | "barclays";

type StationModelInfo = {
  id: StationModelId;
  /** Where the model sits in `public/`. */
  url: string;
  /** The middle of the platform the walks start from. */
  platform: [number, number];
  /** The routes that stop at that platform. */
  routes: RegExp;
  /** The street named on the exit signs when the map cannot read the corner. */
  street: string;
};

export const STATION_MODELS: readonly StationModelInfo[] = [
  // The downtown 4/5 platform at Fulton St, by the Dey St stair.
  { id: "fulton", url: "/transit/fulton-model.json", platform: [-74.00957, 40.71042], routes: /^[45]X?$/, street: "Fulton Street" },
  // The downtown island at Brooklyn Bridge–City Hall, where the 4, 5 and 6 stop.
  { id: "cityhall", url: "/transit/cityhall-model.json", platform: [-74.0043, 40.71287], routes: /^[456]X?$/, street: "Centre Street" },
  // The Brooklyn-bound local platform at Atlantic Av–Barclays Ctr, where the 2 and 3 stop. The 4 and 5
  // stop at the express island, which has no walks yet, so their riders keep the plain view.
  { id: "barclays", url: "/transit/barclays-model.json", platform: [-73.97795, 40.68463], routes: /^[23]X?$/, street: "Atlantic Avenue" },
];

export function stationModel(id: StationModelId): StationModelInfo {
  return STATION_MODELS.find((m) => m.id === id) ?? STATION_MODELS[0];
}

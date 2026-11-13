/**
 * The street corner at each of Fulton St's model exits, keyed by the exit's spot ("lon,lat"), the way
 * `cornerLine` writes them. The where-am-I helper opens wherever the map happens to be, often far from
 * Fulton St, so the tiles that name these streets may not be loaded; without them an Exit sign has no
 * corner and words typed off one match nothing. Taken from OpenStreetMap on 2026-11-13: the two named
 * streets nearest each exit.
 */
const CORNERS: Record<string, string> = {
  "-74.00797,40.71009": "Fulton St & Nassau St",
  "-74.00792,40.71039": "Fulton St & Nassau St",
  "-74.00941,40.71113": "Broadway & Fulton St",
  "-74.00938,40.71096": "Broadway & Fulton St",
  "-74.00919,40.71103": "Broadway & Fulton St",
  "-74.00918,40.71017": "Broadway & John St",
  "-74.00999,40.7097": "Broadway & Maiden Ln",
  "-74.01029,40.70978": "Broadway & Cortlandt St",
  "-74.00927,40.71046": "Broadway & Dey St",
  "-74.00903,40.71075": "Broadway & Fulton St",
  "-74.00895,40.71074": "Broadway & Fulton St",
  "-74.0086,40.71056": "Fulton St",
  "-74.00969,40.71039": "Broadway & Dey St",
};

/** The corner at a Fulton St model exit, or null for a spot that is not one. */
export function fultonCorner(exit: readonly [number, number]): string | null {
  return CORNERS[`${exit[0]},${exit[1]}`] ?? null;
}

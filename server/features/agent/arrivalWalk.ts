/** Words that name the same street in short and long form ("Fulton Street" is "Fulton St"). */
const SHORT: Record<string, string> = { street: "st", avenue: "av", ave: "av", road: "rd", square: "sq", place: "pl", boulevard: "blvd" };

function placeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
    .map((w) => SHORT[w] ?? w).join(" ").replace(/ (subway )?station$/, "");
}

/** The last walk of a trip. When the trip ends at the station it arrives at, the walk is only the climb to the street, not a walk "from Fulton St to Fulton St station". */
export function lastWalkLabel(from: string, destination: string): string {
  return placeKey(from) === placeKey(destination) ? `Come up to the street at ${from}` : `Walk from ${from} to ${destination}`;
}

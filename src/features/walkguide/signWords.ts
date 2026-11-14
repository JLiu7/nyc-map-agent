/**
 * The words written on each sign of the walk, exactly as a camera would read
 * them, by checkpoint or wrong-way id. The camera scan matches what it reads
 * against these. A landmark with no words on it (a corridor, a row of
 * turnstiles) has no entry: it can be tapped, not scanned.
 */
export const SIGN_WORDS: Record<string, string> = {
  "fulton-entrance": "Fulton Street Station",
  el728x: "Elevator to A C J Z R W 2 3 4 5 PATH/WTC",
  "dey-passage": "R W E 1 WTC/PATH",
  "to-rwe": "Elevator to R W E",
  "uptown-queens": "Elevator to Uptown & Queens R W",
  "cortlandt-platform": "Cortlandt Street",
  "us-platform": "14 Street",
  "us-to-mezzanine": "To Mezzanine L & Downtown N Q R W",
  "us-to-l": "Elevator to L",
  "us-yellow": "Exit 14 St & 4 Av",
  "us-sw-turnstiles": "Exit 14 St & 4 Av SW corner",
  "us-downtown-sign": "Exit 14 Street Downtown",
  "us-exit-arrow": "Exit 14 Street & 4 Avenue",
  "us-mural-elevator": "Exit 14 Street & 4 Avenue Union Square East NE corner",
  "us-climate-clock": "14 St - Union Square Subway Station",
  "downtown-brooklyn-rw": "Elevator to Downtown & Brooklyn R W",
  "us-west-exit": "Exit 16 Street & Union Square West",
  "us-downtown-elevator": "Downtown & Brooklyn N Q R W",
};

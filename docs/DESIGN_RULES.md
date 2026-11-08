# Design rules

*The owner's standing preferences for how the app looks and behaves, agreed 2026-10-23 and 2026-10-24. Read this before changing anything people see. `PROJECT.md` says what the app is for; this file says how it should feel. The agreed screens are on the design canvas (private to the owner). The chat agent's own rules live in `server/features/agent/prompt.ts`.*

## The map is always there
- The map stays visible on every screen. No full screens of text, and no full-screen lists.
- Everything else opens from a button, as a dropdown or a drawer. Only one is open at a time, it is the single focus while open, and closing it returns to the map.
- A trigger button is an icon plus a short label plus a small arrow. The dropdown it opens is a small dashboard: sections with an icon and a label, all folded except one.
- **Top left is one swipeable menu row** of at most 6 or 7 menus, in this order: My day, Layers, Filters, Data (what we remember, lock icon), City data (311 and crash analytics), Settings. It loops round. Rarer things go inside Settings. The open one is always leftmost, with its icon and label in a pill; the rest follow to its right as icons on small dark discs with no outline (so they read on light and dark maps), each smaller and fainter, and the row fades out at its right edge so you can tell it scrolls. Swipe sideways for more, so every menu opens from there and the screen stays clean.
- The one exception is the technical user's analytics (311 complaints, crashes, research data). That can open as a focused dashboard, and only when they ask for it.
- **A phone has one bottom sheet** (owner, 2026-11-07, "how does google map handle this?"). Something opened from a sheet, such as a line from a station's chips, becomes the sheet's next view with a Back arrow; Close empties the sheet. Two sheets never stack (`src/lib/store/pullSheet.ts`).
- Panels float, translucent with a blur, so the map shows through.
- **Least first, deeper on each tap.** A casual user getting around never has to see sources, agent steps, data or options.
- **The focus stays on screen.** You, the followed train or the answer's place is never hidden under a panel, unless the person has gone three levels deep. On tablet and desktop, panels dock to the sides so the middle stays clear. The full rules, by screen size, are in `docs/PDD.md` under "Screen space".

## Few words
- Minimal text and no tooltips. If a button needs a tooltip, change the icon or the label.
- Show, do not tell: an answer comes with a button that draws it on the map.
- Data sources sit behind **More** on the answer, never in the first view.

## Fixed parts of the screen
- **The chat bar is never hidden.** Left to right: text box, a small grey microphone (dictation), a big blue waveform button (hands-free conversation).
- **Quick bar, top right, icons only:** Change view (one dropdown for Top, Aerial, Closer and Street), a north/compass button that appears only when the map is rotated or tilted, and Center on my location.
- **Layers** lives in the menu row and opens a small panel: Live trains, Live buses, Restrooms, then "More layers". Technical layers (noise, crashes, research data) live under More layers.
- **Home's four task buttons:** Restroom, My train, Plan trip, Find exit.
- **Answer card:** one short line and one main action ("Walk me there"). "What's nearby", "Other options" and the sources wait behind **More**.

## Trains, buses and lines on the map
- Every train or bus drawn on the map carries its line bullet (for example the round orange F), so nobody has to guess which train it is.
- Every notice is clickable. Tapping it shows, on the map, the station where the problem is, which stations and lines it affects and how (delayed, skipped, rerouted), since when and until when.
- An alternative ("Take the C instead") is clickable too: it shows where to transfer, which platform, and the new arrival time on the map.
- Tapping a line shows which line it is and its station names, and opens the line panel with its notices.
- Trains move smoothly between updates. Their path along the track is worked out in advance from the timetable shapes and arrival predictions, and the live feed is synced every 30 seconds to correct it. A train never jumps backwards (`src/features/transit/model.ts`, `dwell.ts`, `monotonic.ts`).
- Repeated taps on the same spot cycle through what is there (owner, 2026-10-25). One train in a station: the first tap picks the train, the second picks the station. Three trains in a station: taps one, two and three pick each train in turn, the fourth picks the station.
- Tapping the train you are following again, when nothing else is on that spot, lets go of it and eases the camera back, like Stop following (#297).
- A station served by several lines highlights all of them when picked, and its panel offers each line's bullet. Tapping a bullet (say the Q) isolates that line on the map and narrows the station panel to the Q's notices, skips and arrivals; tapping it again brings every line back. Tapping a running train isolates its line too.
- A focused line is drawn solid end to end, underground included, and only that line's station repairs and skips show.
- Trains are drawn as simple boxes; the detailed 3D city is optional and off by default. The Top view is a flat 2D map.

## Guidance
- Walking checkpoints use landmarks or big stores, with a photo, never street signs.
- Restrooms use a real restroom icon, never "WC".
- Weather is shown in street view, not only described.

## What the app offers without being asked
- Never suggest food, cafés, shops, events or other things to do unless the person asks.
- Unasked help is limited to their own trip: delays, planned work, skipped stops, elevator outages, weather that affects the trip.
- Never tell people how to manage their time ("leave 8 min later"). Show the facts; they plan their own day.
- One exception, decided by the owner on 2026-10-25 to match the demo video: a trip planned for later has a Remind me button. Tapping it puts the trip in the phone's own calendar with an alert 10 minutes before the time they chose. The agent may offer it for those trips; it never sets one by itself or picks a different time.
- Updates appear inside the app only. No push notifications from the app; the reminder above is the phone calendar's.

## Memory and data
- What the app learns (daily rides, Home and Work, past conversations, trips looked up) stays on the phone by default.
- The agent gets only a short summary that a question needs, never full history or exact coordinates unless the person shares their location.
- "What we remember" lets people see, pause or delete each kind of memory, or everything, and links to the data policy (`docs/PRIVACY.md`, draft in #384).

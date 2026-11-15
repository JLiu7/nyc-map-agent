# NYC Map Agent: finding the step-free way through a subway station

*Written 2026-11-14 for the GISMO NYC GeoAI Hackathon 2026, track Transportation and Mobility. Team: Pujan Bajracharya (Design Bakery) and Jenny Liu. Every number here comes from our own recordings and tests, as written up in the pull requests listed at the end.*

## The problem

We tested this ourselves at Fulton St. A rider looking for the accessible exit asked five people, two of them station staff in vests. One told her "up the escalator". Nobody could tell her the step-free way out. It took about 20 minutes.

That is a gap in the system. The information was not there for anyone to give. Many disabilities cannot be seen, and most people who cannot take the stairs do not look like it, so asking a stranger means explaining yourself first.

Phones do not fill the gap either. On the same trip, Google Maps on the same phone said "No GPS signal" for the first ten minutes of the walk out of 14 St-Union Sq. The location fixes the phone did log underground were 17 to 40 m off, and some were reported with an accuracy as poor as 1,120 m.

Our app does not look at you and decide. You say "step-free", and it gives you the step-free way. It never asks why.

*Judging: problem formulation and relevance.*

## Who it is for

1. Autistic riders.
2. Foreign visitors.
3. People with mobility aids.

The order follows the test above. The rider who needed the step-free way out did not look like someone who did, and the app should work for a person who would rather not ask anyone at all.

*Judging: problem formulation and relevance; impact and feasibility.*

## What we built, and what works today

The live site is `https://nyc.design-bakery.com`. It is a map of New York with live subway lines and a chat agent you can type or talk to.

For this hackathon we filmed one step-free trip, from the street elevator at Cortlandt St to the street at 14 St-Union Sq, and built three things from it.

**The walk guide** is on main and on the live site at `https://nyc.design-bakery.com/?flags=+walkGuide`. The recording became 17 checkpoints, one for each sign or landmark on the way. The map draws the line through the station, the elevators and your dot. A sheet says the station and level, the steps left to the next elevator, the instruction, and a photo of the next sign to look for. The dot moves by the phone's step count and stops at each checkpoint. If you are lost you tap the sign you can see, or point the camera at it, and the dot goes there. Two wrong-way signs say so and point back to the route. "Simulate the trip" plays the whole walk without anyone walking it, which is how we show it away from the station.

**The replay** is on main at `https://nyc.design-bakery.com/?flags=+stationReplay`. It plays Friday's walk out of 14 St-Union Sq (2026-11-13, 5:04 to 5:17 pm) with our dot on the map beside the film of the walk. When this was written, a change that cuts the page down to the video and the map, and plays the whole Cortlandt St to Union Sq trip, was still in review.

**The recorder** at `https://nyc.design-bakery.com/record` opens the phone's back camera, records video together with motion, heading and location, lets you mark Sign, Stairs and Elevator as you pass them, and saves the recording to the phone. Nothing is uploaded. When this was written it was in pull request #187 and not yet merged.

What is not done: nobody has walked the route with the guide on a phone in the station yet. The places of the Cortlandt St checkpoints on the map are estimates fitted to the street corners the signs name. The Union Sq ones come from positions we logged on the mezzanine.

*Judging: completeness of the solution; presentation.*

## Data and method

**Phone sensors.** We carried a phone through both stations with the step counter, barometer, gyroscope and GPS logging. The three recordings hold 49,586 motion rows over about 8 minutes (no GPS), 96,261 rows over about 16 minutes (577 GPS fixes) and 46,520 rows over about 8 minutes (263 fixes).

**From sensors to a path.** Four small functions turn a recording into a path on the map:

1. Each step moves the dot 0.7 m in the direction the gyroscope says the phone is heading.
2. The barometer finds the elevator rides, and so the levels between them: street, mezzanine, platform. On Friday's walk it found both rides.
3. The path is stretched so it starts and ends on fixed points: the elevators, and location fixes with an accuracy of 20 m or better.
4. The underground part is pulled onto the walk's line, only to points on the same level and never backwards.

On Friday's walk the cleaned path ends within 1 m of the elevators and within 30 m of the street fixes. The raw path was more than 30 m off.

**Signs read by a vision model.** This is the GeoAI step: a sign's words become a position. The phone's own text reader returned nothing usable on eight sign frames cut from our video. A vision model on our server read 6 of the 8 exactly and got none wrong, in 2 to 5 seconds each. We first asked the model to pick a sign from a numbered list, and on frames with no sign in view it named a wrong sign 3 times out of ten. So we changed the question: the model only reads the words, and our own code matches them to the signs of the station the rider is in. On the same ten frames that gave no wrong sign. An unreadable sign comes back as "could not read a sign", and the rider taps a photo instead.

**Public data.** MTA feeds give the lines, the live trains, service alerts and elevator outages. NYC Open Data and OpenStreetMap give the streets and places. The track lines place the platforms: the Union Sq platform checkpoint sits on the N/Q/R/W track 130 m north of the elevator, which matches the 220 steps we counted.

**The recording format.** A recording is one JSON file: motion, heading, GPS, barometer, steps, marks, and an optional video. `docs/RECORDING_FORMAT.md` gives each field and its unit, and `parseRecording` in `src/features/recorder/format.ts` checks a file and lists what is wrong in plain language. `pnpm walk:from-sensor-logger` converts an export from the Sensor Logger app. Another team can record a walk with that app, convert it, and run the same cleanup.

*Judging: data selection; methodology and use of GeoAI.*

## What we tried first, and why we changed

We started with a 3D model of the station. Fulton St in the app is a walkable model traced from Project Subway NYC's drawing.

It did not scale. The model's data was incomplete, some exits did not link to the rest of the station, and fitting each station by hand was slow. Cortlandt St and 14 St-Union Sq had no model at all, so the app could plan the R/W ride between them and say nothing about the elevators.

So we turned it around. A person walks the route once with a phone, and the recording is the model: the signs in order, the levels from the barometer, the distances from the step count.

*Judging: methodology and use of GeoAI; novelty.*

## What is next

Anyone records a walk. The recorder page is the first piece of that, and the format and cleanup already exist. New York has 472 stations and we cannot model them by hand, but riders walk through all of them every day.

Video to 3D. A mentor suggested rebuilding the station from the walk video with structure from motion or Gaussian splats, which would give the 3D model back without the hand work.

*Judging: impact and feasibility; novelty.*

## Tech stack

React and TypeScript, built with Vite. MapLibre GL for the map and three.js for the 3D station. A Hono server for the chat agent and the sign-reading route. XState for parts of the app's state. Vitest for unit tests and Playwright for end-to-end and layout tests. The browser's own MediaRecorder, DeviceMotion, DeviceOrientation, Geolocation and Screen Wake Lock for the recorder.

Which parts are AI: the chat agent that answers by calling tools on the map and the transit data, and the vision model that reads signs. The path cleanup, the step counting and the sign matching are ordinary code with tests.

## Questions we expect

**How does it scale to 472 stations?** By recording, not modelling. One walk with a phone gives the checkpoints, levels and distances for a route.

**What happens when an elevator is out?** The app reads the MTA's elevator and alert feeds. The walk guide does not yet change its route around one.

**What data, in what format, and can another team reproduce it?** Phone sensor recordings in the JSON format described in `docs/RECORDING_FORMAT.md`, plus public MTA feeds and NYC Open Data. The converter, the checker and the cleanup functions are in the repository with their tests. The raw recordings and video stay out of the repository.

**What leaves the phone?** One camera frame, when the rider asks the app to read a sign. The server passes it to the model and does not keep it. Recordings made on the recorder page are saved to the phone and not uploaded.

## Credits

3D station model and architecture map: Project Subway NYC, projectsubwaynyc.com.

Map data: OpenStreetMap contributors, OpenFreeMap and OpenMapTiles. Transit data: MTA. City data: NYC Open Data.

## Where each claim comes from

| Claim | Pull request |
| --- | --- |
| 17 checkpoints, step counting, the Lost view, wrong-way signs | #174 |
| Sign reading: 6 of 8 exact and none wrong, the two ways of asking | #175 |
| Simulate the trip, measured places at Union Sq | #176 |
| Union Sq platform on the track, 130 m and 220 steps | #178 |
| Recording format, the three recordings' row counts, GPS accuracy underground | #182 |
| Replay, "No GPS signal" for ten minutes, the cleanup functions and their checks | #184 |
| Recorder page | #187 |

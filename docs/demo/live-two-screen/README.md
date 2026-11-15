# Live two-screen demo: follow a phone without GPS

Built on 2026-11-14 for the GeoAI hackathon pitch. A phone takes one location fix, then stops using location and works out where it is from its own steps and compass. A second screen shows the dot and its trail on a map as the phone moves.

It is a stand-alone demo, not part of the app. It runs from one small Node script and two HTML pages, with no build step and no dependency.

## What is measured and what is not

- **Measured:** steps, from the phone's motion sensor (one push above gravity counts as a step, 0.7 m each), and heading, from the phone's compass.
- **One fix only:** the starting point comes from a single location fix. After that location is off until "Check with location" is pressed, which takes one more fix and shows how far the estimate had drifted.
- **Entered by hand:** the floor. A web page cannot read a phone's barometer, so the floor is set at the start and changed with the Up and Down buttons.
- **Not used:** the camera.
- The estimate drifts, more in a steel building. Nobody had walked with it on a real phone when this was written.

## Run it

Start `relay.mjs` with Node, giving it a port (5190 on the day).

- Phone: open `/phone`. It needs https, because a phone only gives a page its motion sensors and location over https.
- Second screen: open `/screen`.

On hackathon day it was reached over Tailscale: Tailscale's own https forwarding sent the path `/relay` on the machine's `ts.net` name to the port above, so the phone opened `/relay/phone` and the laptop `/relay/screen`. That needs "HTTPS Certificates" switched on in the Tailscale admin console. Safari worked once iCloud Private Relay was off; Brave could not look the Tailscale name up.

## The relay's other endpoint

`POST /push` accepts the Sensor Logger app's HTTP Push (the app can post its readings, barometer included, while it records), and `GET /stream` hands the newest barometer, step and compass readings on. Nothing reads that stream yet. It is the start of sensing the floor from the barometer and was tested only with a sample message.

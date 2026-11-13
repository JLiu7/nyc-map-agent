import { describe, expect, it } from "vitest";
import { initialPlayback, playback, type Playback, type PlaybackEvent } from "./playback";

const run = (...events: PlaybackEvent[]): Playback => events.reduce(playback, initialPlayback);
const load = (tripId = "a", segCount = 5): PlaybackEvent => ({ type: "load", tripId, segCount });

describe("trip preview playback", () => {
  it("a trip from the agent is loaded, not played", () => {
    const s = run(load());
    expect(s.status).toBe("ready");
    expect(s.seg).toBe(0);
  });

  it("plays only on Play, and pause keeps the spot", () => {
    const s = run(load(), { type: "play" }, { type: "legDone" }, { type: "pause" });
    expect(s).toMatchObject({ status: "paused", seg: 1 });
    const resumed = playback(s, { type: "play" });
    expect(resumed).toMatchObject({ status: "playing", seg: 1, restart: s.restart, run: s.run });
  });

  it("choosing another option while playing restarts the new route from its start", () => {
    const before = run(load("a"), { type: "play" }, { type: "legDone" }, { type: "legDone" });
    const s = playback(before, { type: "select", tripId: "b", segCount: 3 });
    expect(s).toMatchObject({ status: "playing", tripId: "b", seg: 0, segCount: 3 });
    // A new run cancels the old animation loop; a new restart resets progress.
    expect(s.run).toBe(before.run + 1);
    expect(s.restart).toBe(before.restart + 1);
  });

  it("choosing another option while paused or finished waits at its start", () => {
    const paused = run(load("a"), { type: "play" }, { type: "legDone" }, { type: "pause" }, { type: "select", tripId: "b", segCount: 4 });
    expect(paused).toMatchObject({ status: "ready", tripId: "b", seg: 0 });
    const ended = run(load("a", 1), { type: "play" }, { type: "legDone" }, { type: "select", tripId: "b", segCount: 4 });
    expect(ended).toMatchObject({ status: "ready", tripId: "b", seg: 0 });
  });

  it("choosing an option with no preview loaded leaves the player off", () => {
    expect(run({ type: "select", tripId: "b", segCount: 3 })).toEqual(initialPlayback);
  });

  it("choosing the same option again changes nothing", () => {
    const s = run(load("a"), { type: "play" });
    expect(playback(s, { type: "select", tripId: "a", segCount: 5 })).toBe(s);
  });

  it("a speed change restarts the loop at the same spot", () => {
    const s = run(load(), { type: "play" }, { type: "legDone" });
    const fast = playback(s, { type: "speed", speed: 30 });
    expect(fast).toMatchObject({ status: "playing", seg: 1, speed: 30, run: s.run + 1, restart: s.restart });
    expect(playback(fast, { type: "speed", speed: 30 })).toBe(fast);
    // Paused: nothing is running, so no loop to restart.
    const paused = playback(fast, { type: "pause" });
    expect(playback(paused, { type: "speed", speed: 5 })).toMatchObject({ speed: 5, run: paused.run });
  });

  it("ends on the last leg and Play starts over", () => {
    const end = run(load("a", 2), { type: "play" }, { type: "legDone" }, { type: "legDone" });
    expect(end).toMatchObject({ status: "ended", seg: 1 });
    const again = playback(end, { type: "play" });
    expect(again).toMatchObject({ status: "playing", seg: 0, restart: end.restart + 1 });
  });

  it("skip moves a leg; stop turns it off and cancels the loop", () => {
    const s = run(load(), { type: "skip" });
    expect(s).toMatchObject({ status: "ready", seg: 1 });
    const off = playback(s, { type: "stop" });
    expect(off).toMatchObject({ status: "idle", tripId: null, run: s.run + 1 });
    expect(playback(off, { type: "play" })).toBe(off);
  });

  it("back goes to the scene before, and replays the last one once the trip has ended", () => {
    const two = run(load("a", 3), { type: "play" }, { type: "legDone" }, { type: "legDone" });
    const one = playback(two, { type: "back" });
    expect(one).toMatchObject({ status: "playing", seg: 1, run: two.run + 1, restart: two.restart + 1 });
    // On the first scene it starts that scene again.
    const first = run(load("a", 3), { type: "play" });
    expect(playback(first, { type: "back" })).toMatchObject({ seg: 0, restart: first.restart + 1 });
    const end = playback(two, { type: "legDone" });
    expect(end.status).toBe("ended");
    expect(playback(end, { type: "back" })).toMatchObject({ status: "playing", seg: 2 });
    expect(playback(initialPlayback, { type: "back" })).toBe(initialPlayback);
  });

  it("seeking jumps to a leg: playing keeps playing, anything else holds still there", () => {
    const playing = run(load("a", 3), { type: "play" });
    expect(playback(playing, { type: "seek", seg: 2 })).toMatchObject({ status: "playing", seg: 2, run: playing.run + 1, restart: playing.restart });
    const ready = run(load("a", 3));
    expect(playback(ready, { type: "seek", seg: 1 })).toMatchObject({ status: "paused", seg: 1 });
    const end = run(load("a", 2), { type: "play" }, { type: "legDone" }, { type: "legDone" });
    expect(end.status).toBe("ended");
    expect(playback(end, { type: "seek", seg: 0 })).toMatchObject({ status: "paused", seg: 0 });
    expect(playback(ready, { type: "seek", seg: 9 }).seg).toBe(2);
    expect(playback(initialPlayback, { type: "seek", seg: 1 })).toBe(initialPlayback);
  });

  it("a trip with no drawable legs never plays", () => {
    expect(run(load("a", 0), { type: "play" }).status).toBe("idle");
  });

  it("loading takes the agent's speed", () => {
    expect(run({ type: "load", tripId: "a", segCount: 3, speed: 5 }).speed).toBe(5);
  });
});

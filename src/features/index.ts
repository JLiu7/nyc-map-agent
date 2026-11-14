import type { FeatureModule } from "@/lib/features/types";
import agent from "./agent";
import daylight from "./daylight";
import hazards from "./hazards";
import parking from "./parking";
import restrooms from "./restrooms";
import traffic from "./traffic";
import transit from "./transit";
import liveview from "./liveview";
import weather from "./weather";
import schools from "./schools";
import storefronts from "./storefronts";
import events from "./events";
import placeToilets from "./place-toilets";
import ferry from "./ferry";
import underground from "./underground";
import streetWeather from "./street-weather";
import signCamera from "./signcam";
import walkGuide from "./walkguide";

/** Every feature module. Core reads features only through this list. */
export const FEATURES: FeatureModule[] = [restrooms, agent, transit, daylight, weather, hazards, traffic, parking, schools, storefronts, liveview, events, placeToilets, ferry, underground, streetWeather, signCamera, walkGuide];

# NYC Map Agent: Spooky Civic AI Hackathon writeup

*2026-10-24, for the 3percentclub submission. Numbers in square brackets, like [204], are entries in `docs/RESEARCH_SOURCES.md`. Only sources marked fetched there (a researcher read the page) are cited as evidence here; a † marks one that is a search summary only.*

## The problem, in one scene
A woman in her fifties has just moved to New York. She is not comfortable with apps and does not read English well. She stands in a crowded station with no signal. The notice on the wall reads like a code, no station agent is in sight, and she needs a restroom. When she comes up to the street, her map's blue dot jumps and she does not know which way she faces or which exit she took.

## Who it helps
Adults who are new to the city and not digitally confident, especially immigrants; also visitors and anyone whose trip goes wrong.
- About 3.1 million New Yorkers are foreign-born (roughly 40%), and just under half of them have limited English [82] [83]. Nearly 2 million residents are limited-English [489].
- Smartphone ownership among adults 65 and older is 79% nationally, against 97% under 50 [93]. In New York, 1 in 3 of the 1.7 million residents aged 60 and older lacked home internet in 2021 [113].
- The city requires its most-used documents in ten languages [495], and the MTA says it translates service changes and safety notices [507].

## Four problems, and what the app does about each

### 1. "I can't understand or predict my trip"
- **The problem.** Service-change notices read like codes, and it is hard to know how a trip will go on a given day. In 2010 only 42% of platforms and 22% of street entrances had service advisory signs [5]. In 2017 nearly 85% of riders graded on-train delay announcements a "C" or lower [21]. The MTA itself admitted in 2021 that alert wording varies by channel and that it does not know which terms work best [22]. The alerts feed carries route icons as bracket text, such as "Delays on the [F] [G] trains" [633].
- **Why it matters.** Planned work is a quarter of subway delays (25%), and equipment and infrastructure another 31% [425]. Weather can stop everything: Hurricane Ida suspended all subway lines in 2021 [437], and heavy rain cuts evening ridership by under 8% to about 29% depending on the station [453].
- **What we do.** The agent reads the disruptions and the weather, then simulates the trip on the map, for a trip now or a future one, at 2x to 30x, so you see what you will face at home and calm. Choose another route and the simulation restarts. Evidence that showing real-time information helps: in a Seattle study, riders without it perceived waits longer than actual, and riders with it did not [462] (a 2011 bus study).

### 2. "I'm underground and lost"
- **The problem.** GPS.gov lists indoor and underground use as a cause of error [143]; NIST says GPS "rarely works well indoors" [156]. Phone barometers differ by device and cannot tell floors reliably without help [159] [160] [161], which is why a map cannot separate the platform from the street above. Google's Live View is documented for outdoors, and its indoor version for an airport station in Sydney, not a New York subway station [172] [173]. The MTA's real-time spec does not provide a position for a train or a person inside a station [629].
- **What we do.** The app asks whether you are underground instead of guessing, then helps you pick the exit and recalibrate which way you face.
- **Status.** Not built. A camera and compass scaffold exists (see below). We found no study of compass error after surfacing, so we do not claim one.

### 3. "I can't read the map"
- **The problem.** Standard maps are dense, and landmarks and exact stops are small or missing.
- **What we do.** A plain map that keeps recognizable landmarks visible and marks the exact stop or entrance.
- **Evidence.** Honest note: we did not read in full any source on this group. The design follows the landmark-navigation and cognitive-load literature listed in `docs/RESEARCH_SOURCES.md` (theme 5), but we found no study showing a plain landmark map lowers stress in the New York subway, and some evidence cuts against adding landmarks to mobile maps.

### 4. "I urgently need a restroom"
- **The problem.** New York ranked 93rd of the 100 largest US cities for park restrooms per resident in 2019, and 69% of park restrooms were not ADA accessible [204]. About 1,100 publicly managed toilets serve the city, and only 69 of 472 stations had a public bathroom in 2022 [205]. In an MTA Inspector General audit, 5 of 32 visited subway bathrooms were closed, and the MTA was poor at communicating where they are or whether they are open [230]. A Council inspection reported about 11% of restrooms closed during posted hours† [209].
- **What we do.** The nearest open restroom, drawn on the map with a walking route, in one tap.
- **Data limits.** The city dataset is a snapshot of 1,066 records, updated about twice a year, and does not reflect real-time conditions [646]. Subway restroom counts differ by source (the audit says 125 at 65 stations†), so the app shows each record's source and age.

## Why not just use what exists
- The rebuilt MTA app (launched March 2026) has an accessibility mode, elevator status and service-change lookup, but supports English and Spanish only [553]. We found no source showing it explains notices in plain language or helps with exits.
- City Hall's MyCity chatbot gave wrong legal advice to businesses and was taken down in February 2026 [545]. That is why our agent shows its data source, never invents numbers, and says "I don't know".
- Station help is thin: the MTA lists 31 customer service centers, 29 of them subway stations staffed 24/7, out of about 470 stations [386]; about 2,000 agents became roving in 2023 [377]; and a judge voided the 2026 policy of leaving booths unstaffed [393]. The agent is help that is always there.
- We found no source showing another app that combines these four. That is an absence of results, not proof that none exists.

## How it works
An agent you talk to, by chat or voice, that answers by showing the answer on a plain map. Built with React, TypeScript, MapLibre, NYC Open Data, MTA feeds, OpenStreetMap routing and a Claude-based agent with tool calls.

## Safe and fair
- Memory is kept on the phone by default; the agent receives only short summaries a question needs, never full history or exact coordinates. A "What we remember" screen lets people see, pause or delete each kind of memory.
- Every number comes from a data query, and the app shows each dataset's limits.
- MTA data terms require telling users when the data is more than a minute stale and supply it "as is" [628]. The app shows data age, but we have not verified that it does so for every feed.

## What runs today, and what does not
- **Runs on `main`:** the map with live subway lines, trains and service notices; the ask bar with chat and voice; nearest restroom with a walking route; trip planning with the exit to use, weather and line trouble for the trip time; and a sped-up trip preview at 2x to 30x.
- **Languages:** the agent answers in the language you write or speak in, and its spoken replies and status lines use that language too. Voice input passes the language to speech-to-text. The app's buttons and labels are English only so far, and the "hey" wake phrase listens for English.
- **About the demo video:** it shows the experience we are building toward. The app scenes are illustrated on real map images from the app, the voices are generated, and the people in the opening and ending are AI-generated. Some of what it shows, such as the facing arrow at the exit, is still being built (see the next line).
- **Not built yet:** help when you come up from underground (which exit, which way you face), landmarks as the always-on guide, and where to board substitute buses.

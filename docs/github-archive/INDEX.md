# Issues and pull requests from Pukujan-lab/nyc-map-agent

GitHub flagged the Pukujan-lab org on 2026-11-01 and would not transfer its repositories, so this one was copied to pukujan-lab-2 with its full git history. Its issues and pull requests could not move with it; every one is kept here as a file named by its old number, so `#123` in an old commit is `00123.md`. Open issues were also recreated as new issues that name their old number (Pukujan-lab/server-management#96).

| # | Type | State | Title |
| --- | --- | --- | --- |
| [653](00653.md) | PR | open | Plan trips with OpenTripPlanner and walks with Valhalla on the VPS |
| [652](00652.md) | Issue | open | Run trips on OpenTripPlanner and walking routes on a self-hosted Valhalla |
| [651](00651.md) | Issue | open | Trips and multi-turn follow-ups fail silently: build a tool-sequence eval suite |
| [650](00650.md) | PR | open | feat(transit): pool learned times by MTA schedule and time of day |
| [649](00649.md) | PR | open | fix(transit): mark the station where a shuttle bus takes over and name it |
| [648](00648.md) | Issue | open | Learned train and bus times should pool by MTA schedule and time of day |
| [647](00647.md) | Issue | open | Shuttle bus label floats with no station marker or name |
| [646](00646.md) | PR | open | docs(task): point NMA-0005 at iteration 3 on the fixed runner |
| [645](00645.md) | PR | closed | fix(agent): read each turn on its own and keep internal names out of replies |
| [644](00644.md) | PR | merged | fix(transit): stop drawing trains parked longer than a real stop |
| [643](00643.md) | Issue | closed | Subway trains are drawn parked far longer than real stops |
| [642](00642.md) | PR | merged | fix(eval): stop scoring a dropped connection as an empty answer |
| [641](00641.md) | Issue | closed | The agent repeats the earlier tool, narrates itself and speaks internal names |
| [640](00640.md) | PR | open | feat(layout): menus as a left column on wide screens |
| [639](00639.md) | PR | open | chore(stack): upgrade agent stack to 1.0.8 |
| [638](00638.md) | PR | merged | docs(records): catch the records up to GitHub and describe the voice path |
| [637](00637.md) | Issue | open | Wide screens: move the menus to a left column like Google Maps |
| [636](00636.md) | PR | merged | chore(coord): record dsh@air taking the expired boss seat |
| [635](00635.md) | PR | merged | fix(voice): remove Groq and use the Pro's multilingual speech server |
| [634](00634.md) | Issue | closed | Voice recordings go to Groq by default; remove it |
| [633](00633.md) | PR | merged | chore(codebuddy): give the workbuddy hooks longer timeouts and no git prompts |
| [632](00632.md) | PR | merged | fix(agent): stop offering to start a trip after a line status answer |
| [631](00631.md) | PR | merged | docs(eval): record the line status baseline on LFM3 |
| [630](00630.md) | PR | merged | feat(eval): score line status answers on replayed cases |
| [629](00629.md) | Issue | open | Line status answers are not measured: build a repeatable eval loop |
| [628](00628.md) | PR | merged | fix(agent): stop line status answers sending riders to skipped stops |
| [627](00627.md) | Issue | closed | The chat told a rider to change trains at stops the A skips |
| [626](00626.md) | PR | merged | feat(agent): ask one short question when a trip request is vague |
| [625](00625.md) | Issue | closed | The trip chat guesses on vague requests instead of asking one question |
| [624](00624.md) | PR | merged | chore(stack): upgrade agent stack to 1.0.7 |
| [623](00623.md) | PR | merged | chore(stack): upgrade agent stack to 1.0.6 |
| [622](00622.md) | PR | merged | docs(deploy): name the Octo workspace the VPS app must use |
| [621](00621.md) | PR | merged | fix(ferry): read the ferry timetables directly instead of from OTP |
| [620](00620.md) | PR | merged | chore(stack): upgrade agent stack to 1.0.5 |
| [619](00619.md) | PR | merged | docs(deploy): record that nyc.design-bakery.com now reaches the VPS |
| [618](00618.md) | Issue | closed | The ferry layer is empty on the VPS because no OpenTripPlanner runs there |
| [617](00617.md) | PR | merged | docs(continuity): mark AGENTS.md reviewed and re-render the index |
| [616](00616.md) | Issue | closed | continuity validate fails because the document index still has the old AGENTS.md hash |
| [615](00615.md) | PR | merged | docs(checkpoints): record that Komodo now deploys main to the VPS |
| [614](00614.md) | Issue | closed | nyc.design-bakery.com answers 530 because tunnel A has no route to the VPS app |
| [613](00613.md) | PR | merged | feat(deploy): let Komodo deploy main to the VPS |
| [612](00612.md) | Issue | open | Unsaved demo screenshot test from an old worktree, now on a wip branch |
| [611](00611.md) | Issue | closed | Merges to main never reach the VPS because nyc-map-agent has no GitHub to Komodo deploy |
| [610](00610.md) | Issue | closed | The live app runs on the VPS from an unmerged branch while main still names gravebuster |
| [609](00609.md) | PR | merged | chore(stack): upgrade agent stack to 1.0.4 |
| [608](00608.md) | PR | merged | docs(checkpoints): restore CURRENT's in-flight and next sections |
| [607](00607.md) | Issue | closed | The stack upgrade moved CURRENT.md's 'In flight' and 'Next' sections into the history file |
| [606](00606.md) | PR | merged | chore(stack): upgrade agent stack to 1.0.3 |
| [605](00605.md) | PR | merged | chore(stack): upgrade agent stack to 1.0.2 |
| [604](00604.md) | Issue | open | Claude Code sessions here followed a week-old copy of the rules and a contradicting memory file, because nothing checks the checkout against GitHub |
| [603](00603.md) | PR | merged | feat(trips): bring the VPS deploy onto main, with MOTIS trips and LFM3 chat |
| [602](00602.md) | PR | merged | feat(agent): read a place back before answering when it is unclear |
| [601](00601.md) | PR | merged | feat(agent): send each turn and speech-to-text call to Phoenix through Octo |
| [600](00600.md) | PR | merged | chore(stack): install agent stack 1.0.1 from one checkout |
| [599](00599.md) | PR | merged | ci: run on GitHub-hosted runners |
| [598](00598.md) | PR | merged | fix(voice): learn background noise so noisy places stop recording when you stop talking |
| [597](00597.md) | PR | merged | chore: point references at Pukujan-lab after the org move |
| [596](00596.md) | PR | merged | fix(deploy): give OpenTripPlanner the MTA bus key it reads |
| [595](00595.md) | PR | merged | fix(deploy): stop passing the app env file to OpenTripPlanner |
| [594](00594.md) | Issue | open | [ISSUE]: Transit estimates cannot get more accurate because we never record how wrong they were |
| [593](00593.md) | PR | merged | chore: warn when a code PR leaves CURRENT.md untouched |
| [592](00592.md) | Issue | closed | test: prose issue log for the shape check |
| [591](00591.md) | PR | merged | chore: flag issue logs that OIO triage would skip |
| [590](00590.md) | Issue | open | App buttons and labels in the rider's language, with a choice at first open |
| [589](00589.md) | Issue | open | Real street photos for station entrances and destinations |
| [588](00588.md) | Issue | open | Problem answers: tour the map spot by spot while the agent speaks |
| [587](00587.md) | Issue | open | Exit help: read the exit sign with the camera, offline, and say whether it's yours |
| [586](00586.md) | Issue | open | Scorecard: compare the app with Google Maps, Citymapper and the MTA app on newcomer tasks |
| [585](00585.md) | PR | merged | fix(street): answer pins keep the street camera at eye level |
| [584](00584.md) | PR | merged | fix(street): restroom answers keep eye level; pad and mini map stay put on tablets |
| [583](00583.md) | PR | merged | fix(street): far stations' markers stay off the horizon in street view |
| [582](00582.md) | PR | merged | fix(agent): in street view the ask box asks from the spot you stand on |
| [581](00581.md) | PR | merged | fix(street): asking in street view keeps the camera at eye level |
| [580](00580.md) | PR | merged | fix(transit): the old layout's Lines list opens the picked line |
| [579](00579.md) | PR | merged | fix(agent): line answers count elevator and escalator outages |
| [578](00578.md) | PR | merged | fix: cards in the left column keep the app's theme |
| [577](00577.md) | PR | merged | fix(agent): fast trips go to the right place at the right time |
| [576](00576.md) | PR | merged | fix(agent): fast answers fill tool defaults; far exit walks go to the model |
| [575](00575.md) | PR | merged | feat(agent): answer plain exit and trip questions before the model |
| [574](00574.md) | PR | merged | fix(agent): short fast answers: today's hours only, no repeated line name |
| [573](00573.md) | PR | merged | feat(agent): answer plain restroom and line questions before the model |
| [572](00572.md) | PR | merged | feat: a minimized card waits in the chip row at the top left on wide screens |
| [571](00571.md) | PR | merged | feat: status chips in one row at the top of the left side on wide screens |
| [570](00570.md) | PR | merged | feat(layout): trip preview and followed train join the left column on desktop |
| [569](00569.md) | PR | merged | feat(layout): line and station-exit cards join the left column, newest on top |
| [568](00568.md) | PR | merged | feat(layout): one left column for answers and cards; phone answers pull up |
| [567](00567.md) | PR | merged | fix(transit): line chooser names only a nearby station and closes when the view moves |
| [566](00566.md) | PR | merged | feat(restrooms): a tapped restroom shows its street photo and a Google Maps link |
| [565](00565.md) | PR | merged | fix(xray): street view sees through the ground only 150 m ahead |
| [564](00564.md) | PR | merged | feat(subway): warn on the wrong train direction and re-plan the walk after the wrong exit |
| [563](00563.md) | PR | merged | feat(walk): say "turn around" when you walk away from your next turn or place |
| [562](00562.md) | PR | merged | feat(compass): fix facing on your marker after the subway and widen the cone when unsure |
| [561](00561.md) | PR | merged | fix: X-ray hides the el behind buildings, street-view line taps go flat, restrooms turn off |
| [560](00560.md) | PR | merged | fix(underground): drop the station question once you have left that station |
| [559](00559.md) | PR | merged | fix(map): keep following you through other camera moves that leave you on screen |
| [558](00558.md) | PR | merged | feat(map): always-on you marker that follows you, plus a ?sim=walk pretend trip |
| [557](00557.md) | PR | merged | fix: closing a trip or restroom answer clears its pins, bus line and bus pill |
| [556](00556.md) | PR | merged | fix: stair labels say entry or exit only and the corner; trip no longer covers a station card |
| [555](00555.md) | PR | merged | feat: line panel and line answers show this weekend's planned work, not just now |
| [554](00554.md) | PR | merged | fix: service changes reach the rider in trip plans and line answers |
| [553](00553.md) | PR | merged | fix: street-level stairs stand on the pavement, names stay on top, bus signs say direction |
| [552](00552.md) | PR | merged | fix: Use this route walks you to the station first, then shows your train |
| [551](00551.md) | PR | merged | fix: bus Hide pill and the phone layers menu stay clear of other controls |
| [550](00550.md) | PR | merged | fix: shop sign logos answer fast when OpenStreetMap's Overpass is slow |
| [549](00549.md) | PR | merged | fix: arrow across a picked line switches lines, from a train too, across the complex |
| [548](00548.md) | PR | merged | fix: skipped-stop tags on the map are red and readable, not pale grey |
| [547](00547.md) | PR | merged | test: phone layout bar at four sizes, required on every screen change |
| [546](00546.md) | PR | merged | fix: restroom answers pin every restroom named and show the others nearby |
| [545](00545.md) | PR | closed | chore: line panel size budget 5.3 kB so main deploys again |
| [544](00544.md) | PR | merged | fix: street view glitches, whole-sign taps, and train names at street level |
| [543](00543.md) | PR | merged | fix: one tap hides live buses; buses painted in MTA livery instead of a white slab |
| [542](00542.md) | PR | merged | fix: bus stop shows its buses coming and route line; tap a next-bus row to follow it |
| [541](00541.md) | PR | merged | fix: map says which way a station is skipped; entrances get stair and elevator icons |
| [540](00540.md) | PR | merged | feat: subway stairs run along the curb and say which way you face coming up |
| [539](00539.md) | PR | merged | fix(agent): hold a too-soon question and send it; a newer question replaces the older |
| [538](00538.md) | PR | merged | fix: live buses stay near you unless focused; choose bus routes by group |
| [537](00537.md) | PR | merged | feat: arrow keys step along a picked subway line, Escape leaves it |
| [536](00536.md) | PR | merged | fix: tap a line bullet under a station to pick that line, even with a train on top |
| [535](00535.md) | PR | merged | fix: exits through a building count as street exits, so stations no longer show none |
| [534](00534.md) | PR | merged | chore: license the project under FSL-1.1-ALv2 |
| [533](00533.md) | PR | merged | chore: stop tracking build output; README explains every folder |
| [532](00532.md) | Issue | open | Accessibility first: show the working entrance and the way to it on the map, not just the outage |
| [531](00531.md) | PR | merged | feat: faint building shadows in street view that follow the sun |
| [530](00530.md) | PR | merged | fix: street-view taps, ride and get off, phone layers, Exit stops the agent |
| [529](00529.md) | PR | merged | fix: useful street mini map, street-view transit defaults, named entrances |
| [528](00528.md) | PR | merged | fix(street): mini map steps left of the corner controls |
| [527](00527.md) | PR | merged | fix(buses): round bus-stop coordinates so Live buses loads |
| [526](00526.md) | PR | merged | fix(ui): group map controls, one line card, bus route chooser, plain street bar |
| [525](00525.md) | PR | merged | fix(voice): no English tail on answers in other scripts |
| [524](00524.md) | PR | merged | fix(trip preview): walking plays four times faster than a ride |
| [523](00523.md) | PR | merged | fix(trip preview): the arrival bubble stays clear of the trip card on wide screens |
| [522](00522.md) | PR | merged | fix(trip preview): the trip card offers Subway, Bus, Walk and Least walking |
| [521](00521.md) | PR | merged | chore(size): raise the transit layers budget to 27.5 kB |
| [520](00520.md) | PR | merged | feat(follow): pull the camera back, add a follow mini map, switch views while following |
| [519](00519.md) | PR | merged | feat(follow): pull the camera back, add a follow mini map, and make the view switch work while following |
| [518](00518.md) | PR | merged | chore(size): raise the agent overlay budget to 26.5 kB |
| [517](00517.md) | PR | merged | Street view: a tapped notice opens Map framed on it, with Back to street view |
| [516](00516.md) | PR | merged | feat(street view): label nearby subway entrances, corner first |
| [515](00515.md) | PR | merged | Map · 3D · Street switch; mini map opens Map centred on you, with Back to street view |
| [514](00514.md) | PR | merged | fix(street view): street names stay in the data up close |
| [513](00513.md) | PR | merged | feat(transit): pick a line, or the station, where several lines meet |
| [512](00512.md) | PR | merged | chore(size): raise the all-JS budget to 1090 kB |
| [511](00511.md) | PR | merged | feat(trip preview): You've arrived as a speech bubble above the chat |
| [510](00510.md) | PR | merged | fix(exits): skip broken-elevator exits, pick the shortest walk |
| [509](00509.md) | Issue | open | Directions need a connection: on-device trip planning for a later release (owner raises it, not agents) |
| [508](00508.md) | PR | merged | fix(trip preview): no jump from the exit back into the station |
| [507](00507.md) | PR | merged | feat(directions): ask the trip planner, with Subway, Bus, Walk and Least walking |
| [506](00506.md) | PR | closed | fix(trip preview): a picked view stays, and a finished trip has Done |
| [505](00505.md) | PR | merged | fix(voice): a Nepali answer is read in a voice that reads Devanagari |
| [504](00504.md) | PR | merged | fix(agent): Use my location sits under the reply; More only when it has something |
| [503](00503.md) | PR | merged | fix(street view): restroom kiosks show up close |
| [502](00502.md) | PR | merged | fix(street-view): shop signs stay visible up close |
| [501](00501.md) | PR | merged | feat(transit): a picked line shows the track its trains are on now |
| [500](00500.md) | PR | merged | fix(transit): an outage card's date range reads soonest to latest |
| [499](00499.md) | PR | merged | fix(transit): one card per station for elevator and escalator outages |
| [498](00498.md) | PR | merged | fix(agent): yes after a which-exit answer opens the walk |
| [497](00497.md) | PR | merged | fix(agent): a which-exit answer stays a card, and yes then opens its walk |
| [496](00496.md) | PR | merged | test(transit): line notice tap frames its station |
| [495](00495.md) | PR | merged | chore(seo): describe the chat helper, add a link preview image, robots and sitemap |
| [494](00494.md) | PR | merged | fix(transit): tapping a line notice takes the map to its stations again |
| [493](00493.md) | PR | merged | fix(agent): a which-exit answer stays a small card over the map |
| [492](00492.md) | PR | merged | docs(readme): lead with the chat-and-voice helper and point at the plan |
| [491](00491.md) | PR | merged | feat(agent): which-exit answers draw on the map, with a compass arrow |
| [490](00490.md) | PR | merged | test(agent): web search fallback edge cases |
| [489](00489.md) | PR | merged | feat(phone): the trip preview comes up from behind the chat |
| [488](00488.md) | PR | merged | feat(phone): station exits come up from behind the chat |
| [487](00487.md) | PR | merged | fix(phone): map credits move left, clear of Center on my location |
| [486](00486.md) | PR | merged | feat(phone): language and the QR code come up from behind the chat |
| [485](00485.md) | PR | merged | fix(follow): the strip's minutes match the stops list |
| [484](00484.md) | PR | merged | feat(phone): a picked line comes up from behind the chat too |
| [483](00483.md) | PR | merged | fix(follow): stops list starts at the train's next stop |
| [482](00482.md) | PR | merged | feat(phone): quick buttons top right, follow sheet pulls up from the chat |
| [481](00481.md) | PR | merged | ci(contract): pin hypothesis<6.170.10 for schemathesis 4.0.0 |
| [480](00480.md) | PR | merged | feat(phone): chat-first layout for small phones |
| [479](00479.md) | PR | merged | fix(agent): answers open in the user's language, and the close X stays solid over scrolled text |
| [478](00478.md) | PR | merged | fix(agent): an answer the model writes twice shows once, and names Use my location in your language |
| [477](00477.md) | PR | merged | fix(agent): the quick buttons ask in the app's language, and every language gets Use my location |
| [476](00476.md) | PR | merged | fix(map): a stopped walk or closed trip takes its dotted route off the map |
| [475](00475.md) | PR | merged | fix(voice): phones detect the spoken language and answer in it |
| [474](00474.md) | PR | merged | fix(phone): walking cards leave the map visible on small phones; a picked line clears the chat bar |
| [473](00473.md) | PR | merged | fix(agent): answers show no markdown stars, and a blocked location says so |
| [472](00472.md) | PR | merged | fix(mobile): close buttons that work, boxed menu bar, QR code button |
| [471](00471.md) | PR | merged | fix(panel): the last lines in the Lines sheet scroll into view on phones |
| [470](00470.md) | PR | merged | perf: show the basemap first on slow phones |
| [469](00469.md) | PR | merged | perf: paint the chat bar before the app script runs; cache build files |
| [468](00468.md) | PR | merged | fix(underground): keep you and your exit between the card and the chat bar on phones |
| [467](00467.md) | PR | merged | fix(underground): exit help checks you are at the station; stale builds no longer blank the page |
| [466](00466.md) | PR | merged | fix(parking): garages answer without waiting on a slow Overpass |
| [465](00465.md) | PR | merged | fix(agent): the AI model never gets your location as numbers |
| [464](00464.md) | PR | merged | fix(agent): words typed while the app loads land in the chat bar |
| [463](00463.md) | PR | merged | fix(storefronts): an unknown Wikidata id answers no_logo, not a 502 |
| [462](00462.md) | PR | merged | fix(agent): Other ways and I'm lost no longer freeze; suspended stretches draw broken under the shuttle |
| [461](00461.md) | PR | merged | feat(blocks): registry sources counted per real tax block |
| [460](00460.md) | PR | merged | feat(street-view): the map glides along with each photo and shows photo coverage |
| [459](00459.md) | PR | merged | feat(assets): version history for published tiles and a build asset manifest |
| [458](00458.md) | PR | closed | feat(assets): version history for published tiles and a build asset manifest |
| [457](00457.md) | PR | merged | feat(api): typed client generated from openapi.json, contract test after deploy |
| [456](00456.md) | PR | merged | feat(liveview): a pin marks the destination over the camera |
| [455](00455.md) | PR | merged | perf(home): chat bar paints before the app's script runs |
| [454](00454.md) | PR | merged | feat(liveview): draw the walking route over the camera picture |
| [453](00453.md) | PR | merged | refactor(map): split threeLayer.ts into one module per 3D layer |
| [452](00452.md) | PR | merged | chore(deps): three.js 0.134 to 0.186.1 |
| [451](00451.md) | PR | merged | docs(perf): cold-load baseline on an emulated mid-range phone |
| [450](00450.md) | PR | merged | feat(walk): noise and crash dots for the street underfoot |
| [449](00449.md) | PR | merged | chore(deps): maplibre-gl 6.15.0 for the sanitizer advisory |
| [448](00448.md) | PR | merged | perf(home): no 311 block counts on the first screen |
| [447](00447.md) | PR | merged | chore(deps): vitest 4.1.12, which drops the vulnerable tinypool |
| [446](00446.md) | PR | merged | fix(ui): map credit and long task labels stop overlapping on phones |
| [445](00445.md) | PR | merged | fix(map): one name per place and a readable map key |
| [444](00444.md) | PR | merged | fix(agent): a long chat keeps working past 15 exchanges |
| [443](00443.md) | PR | merged | docs(checkpoint): record the 2026-10-25 batch and what is in flight now |
| [442](00442.md) | PR | merged | feat(load): keep the last line shapes and stations for the next visit |
| [441](00441.md) | PR | merged | docs(perf): check the live site against the 2026-10-23 baseline |
| [440](00440.md) | PR | merged | feat(agent): restroom and line answers when the model is out |
| [439](00439.md) | PR | merged | fix(street): restroom kiosks stand on the pavement, not inside the building |
| [438](00438.md) | PR | merged | feat(api): per-address limit on every API call at the origin |
| [437](00437.md) | PR | merged | chore(deps): postcss 8.5.31; drop its two audit ignores |
| [436](00436.md) | PR | merged | docs(privacy): describe the app as it ships; say location goes with each question |
| [435](00435.md) | PR | merged | feat(agent): offer a button for the map layer that answers the question |
| [434](00434.md) | PR | merged | fix: finish the small pieces left on six open issues |
| [433](00433.md) | PR | merged | fix(agent): Remind me on the trip preview; neighbourhoods resolve to their centre |
| [432](00432.md) | PR | merged | fix(agent): answer text names Remind me the way the button reads |
| [431](00431.md) | PR | merged | fix(agent): say the Remind me button's name in the asker's language |
| [430](00430.md) | PR | merged | fix(transit): follow view menu opens while following; held trains glide instead of jumping |
| [429](00429.md) | PR | merged | feat(agent): Remind me puts a trip planned ahead in the phone's calendar |
| [428](00428.md) | PR | merged | feat(agent): walks name the landmarks you pass and which side they are on |
| [427](00427.md) | PR | merged | feat(map): tap a landmark for its photo, save Home and Work, Lines at half, one place per switch |
| [426](00426.md) | PR | merged | feat(agent): which way out of a station, with the real exit and the walk from it |
| [425](00425.md) | PR | merged | feat(i18n): trip steps and mode chips follow the app language |
| [424](00424.md) | PR | merged | fix(underground): exits always draw, walk from the exit, transfers labelled |
| [423](00423.md) | PR | merged | fix(map): steady top-down camera while following |
| [422](00422.md) | PR | merged | feat(agent): directions to every place, underground context, wider event search |
| [421](00421.md) | PR | merged | fix(transit): whole focused lines, station notices, and tap cycling |
| [420](00420.md) | PR | merged | fix(transit): trains glide to their next stop again; restrooms closed now are skipped |
| [419](00419.md) | Issue | closed | Live map: trains sit at stations instead of moving, the map hangs, exit panels overlap |
| [418](00418.md) | Issue | closed | Make the app do what the demo video shows |
| [417](00417.md) | PR | merged | feat(i18n): the menu row and My day follow the app language |
| [416](00416.md) | PR | merged | feat(i18n): the app's own text follows the language you ask in |
| [415](00415.md) | PR | merged | feat(transit): show held trains and skipped stops from live MTA data |
| [414](00414.md) | PR | merged | docs: CURRENT checkpoint after sorting the pull request backlog |
| [413](00413.md) | PR | merged | docs: fresh CURRENT checkpoint so any agent can see where the work stands |
| [412](00412.md) | PR | merged | feat: one screen-space arbiter; answer and line panel make room, checked at six sizes |
| [411](00411.md) | PR | merged | docs: screen-space rules for panels, focus and depth on every screen size |
| [410](00410.md) | PR | merged | feat: keep the focus in view on tablet and small phones; answers show one line first |
| [409](00409.md) | PR | merged | fix: line panel layout, map stays clear of panels, quieter map |
| [408](00408.md) | PR | merged | feat(agent): street, nearby places and an arrival message in the trip preview |
| [407](00407.md) | PR | merged | feat: show next trains at your stop when you use a subway route |
| [406](00406.md) | PR | merged | feat(agent): faster first answer, timing logs and agent_runs, stores by name |
| [405](00405.md) | PR | merged | fix: hands-free ends when a trip preview, walk or street view starts |
| [404](00404.md) | PR | merged | refactor: one camera-mode store for street walk and route guidance |
| [403](00403.md) | PR | merged | fix: cleaner trains at city zoom, dim others on a trip, keep chosen view while guiding |
| [402](00402.md) | PR | merged | fix(mobile): sheets above the chat bar, clean trip header, framed restroom |
| [401](00401.md) | PR | merged | feat(voice): server speech-to-text so the mic works in Brave |
| [400](00400.md) | PR | merged | feat(agent): look up a named event on the web and map its venue |
| [399](00399.md) | PR | merged | fix(home): one quick bar for views and zoom, clean answers and trips, exit help on |
| [398](00398.md) | PR | merged | fix(home): side panels on desktop, one-line notices with icons, Walk me there goes straight there |
| [397](00397.md) | PR | merged | fix(map): bus stops off, Live buses near you, 3D street view with shops |
| [396](00396.md) | PR | merged | fix(map): bring back the clean map, restrooms off by default, readable menu icons |
| [395](00395.md) | PR | merged | feat(agent): agent-first home to the agreed design, with menus, task screens and memory |
| [394](00394.md) | PR | merged | chore(agents): give every agent the stack's boot steps and stop stale dev servers |
| [393](00393.md) | PR | closed | feat(map): landmarks that guide you, across all five boroughs |
| [392](00392.md) | PR | closed | feat(map): a clean map that shows only what your current task needs |
| [391](00391.md) | PR | closed | feat(street): show rain and snow in street view, with a heads-up |
| [390](00390.md) | PR | closed | feat(restrooms): add OpenStreetMap public toilets to the city list |
| [389](00389.md) | PR | closed | feat(underground): offline exit help in subway stations |
| [388](00388.md) | PR | closed | fix(agent): don't auto-play trip previews; restart on another option; plan ahead |
| [387](00387.md) | PR | closed | feat(agent): agent-first screen with a bottom chat bar, voice and visible steps |
| [386](00386.md) | PR | closed | feat(agent): explain MTA trouble in plain words and show it on the map |
| [385](00385.md) | PR | closed | feat(agent): show each answer's sources and data age; no guessing; smarter instructions |
| [384](00384.md) | PR | closed | docs(privacy): draft the location data policy |
| [383](00383.md) | PR | closed | feat(agent): map buttons on every answer |
| [382](00382.md) | PR | closed | feat(agent): fair-use limits and a daily model budget |
| [381](00381.md) | PR | closed | perf(transit): one batched live endpoint, edge-cacheable, and pause idle tabs |
| [380](00380.md) | PR | closed | perf(map): flat Top view, simple buildings by default, detailed city optional |
| [379](00379.md) | PR | closed | perf(transit): stop per-frame re-renders and draw trains as boxes |
| [378](00378.md) | PR | open | docs: realign the project around the accessible chat agent |
| [377](00377.md) | PR | merged | fix(agent): retry a busy error that arrives inside a 200 stream |
| [376](00376.md) | Issue | closed | Merge or close the open pull request backlog before new feature work |
| [375](00375.md) | Issue | closed | Show how fresh each answer's data is; say "I don't know" instead of guessing |
| [374](00374.md) | Issue | closed | Decide and state what location data we keep |
| [373](00373.md) | Issue | closed | Help still works underground with no signal |
| [372](00372.md) | Issue | closed | Layer switches appear in two places; keep each in one |
| [371](00371.md) | Issue | closed | Every agent answer comes with buttons that show it on the map |
| [370](00370.md) | Issue | closed | Agent-first screen: chat at the bottom, Siri-style voice, visible agent steps |
| [369](00369.md) | Issue | closed | Protect the API and model budget: idle tabs, rate limits and fair use |
| [368](00368.md) | Issue | closed | Make the first load fast: shell first, last real data, lazy everything else |
| [367](00367.md) | Issue | closed | Cut network calls: one batched live endpoint cached at the edge |
| [366](00366.md) | Issue | closed | Draw trains as colored boxes with a route tag, and details in a side panel |
| [365](00365.md) | Issue | closed | Live trains re-render the transit layer about 15 times a second |
| [364](00364.md) | Issue | closed | Top view still tries to draw 3D; make it flat 2D |
| [363](00363.md) | Issue | closed | Make a simple block map the default and the detailed 3D city optional |
| [362](00362.md) | Issue | closed | Measure how slow the map is before we change it |
| [361](00361.md) | Issue | closed | Agent-first and fast: track the realigned direction |
| [360](00360.md) | PR | closed | chore(deps): migrate zod 3 to 4 to clear a high advisory |
| [359](00359.md) | PR | merged | feat(liveview): camera and compass scaffold behind a flag |
| [358](00358.md) | PR | closed | feat(street): compare slider component |
| [357](00357.md) | PR | closed | feat(data): tax-block counts for 311 at block level |
| [356](00356.md) | PR | closed | feat(datasets): rat activity from DOHMH rodent inspections |
| [355](00355.md) | PR | closed | feat(tiles): per-borough 3D Tiles build script |
| [354](00354.md) | PR | closed | feat(street): prefetch the next Mapillary thumbnails |
| [353](00353.md) | PR | closed | feat(liveview): list restrooms and landmarks near the route in the next-turn card |
| [352](00352.md) | PR | closed | feat(street): walk bubble with noise and crash levels |
| [351](00351.md) | PR | closed | fix(map): show station names with route bullets at street level |
| [350](00350.md) | PR | closed | feat(map): nearest restroom, mini map filters and directions (supersedes #324, #338, #339) |
| [349](00349.md) | PR | merged | chore(deps): upgrade vite 6 and vitest 3 to clear audit advisories |
| [348](00348.md) | PR | merged | test(restrooms): cover the shop & café toilet sheet |
| [347](00347.md) | PR | closed | feat(transit): tapping a bus stop shows its routes and next buses |
| [346](00346.md) | PR | closed | fix(map): keep legends bold and draw one label per station complex |
| [345](00345.md) | PR | merged | chore(deps): baseline the zod advisory until the zod 4 migration |
| [344](00344.md) | Issue | closed | Migrate zod 3 to 4 to clear a high advisory |
| [343](00343.md) | PR | merged | fix(agent): retry when InferHub's market is busy and log the real error |
| [342](00342.md) | PR | merged | feat(transit): pick individual bus lines and cap buses per line |
| [341](00341.md) | PR | closed | feat(map): put the quick Layers dropdown in the top bar row |
| [340](00340.md) | PR | closed | fix(map): keep the follow card and Lines clear on a phone |
| [339](00339.md) | PR | closed | fix(map): show Layers filters on the street-view mini map |
| [338](00338.md) | PR | closed | feat(map): simulate a short walk from a restroom |
| [337](00337.md) | PR | closed | fix(transit): end Follow on Show on map, Show map, and map clicks |
| [336](00336.md) | PR | closed | fix(transit): thicken the underground dash when X-ray is off |
| [335](00335.md) | Issue | closed | Simulate the walk to a restroom when it is under about 20 minutes |
| [334](00334.md) | Issue | closed | Filters that are on do not show on the street-view mini map |
| [333](00333.md) | Issue | closed | Show on map and a map click leave Follow running |
| [332](00332.md) | Issue | closed | On a phone the follow card sits under Layers and Lines sits on the train |
| [331](00331.md) | Issue | closed | Underground dashes are too thin to follow |
| [330](00330.md) | PR | closed | fix(transit): show stops, destination, delays, and notices while following |
| [329](00329.md) | PR | closed | fix(transit): let a train leave the station after its stop |
| [328](00328.md) | Issue | closed | Trains sit at a station long after the stop should end |
| [327](00327.md) | PR | closed | feat(map): save home and work and let Ask set filters |
| [326](00326.md) | PR | closed | feat(map): show city landmarks with a picture |
| [325](00325.md) | Issue | closed | Show recognizable buildings across the city, with a picture |
| [324](00324.md) | PR | closed | fix(map): show restrooms, directions, and a street-view map |
| [323](00323.md) | Issue | closed | Public restrooms are hard to find, and street view cannot show them |
| [322](00322.md) | PR | closed | fix(transit): show follow delays and stop pinning trains at stale stops |
| [321](00321.md) | PR | merged | fix(map): stop 3D trains flashing, sticking after Follow, and riding under the el |
| [320](00320.md) | PR | closed | fix(map): separate phone controls and wire layer switches |
| [319](00319.md) | Issue | closed | 3D trains flash, stick after Follow, and sit under the elevated track |
| [318](00318.md) | PR | merged | fix(map): add a switch to hide bus stop icons and poles |
| [317](00317.md) | Issue | closed | Hide bus-stop icons |
| [316](00316.md) | Issue | closed | Following a bus or train hides delays, stops, and the station |
| [315](00315.md) | Issue | closed | A bus stop should show the next buses and its routes |
| [314](00314.md) | Issue | closed | Phone controls overlap, and a line opens as a short peek |
| [313](00313.md) | Issue | closed | Save home and work, and help choosing filters |
| [312](00312.md) | Issue | closed | Legends and overlapping labels should stay readable |
| [311](00311.md) | Issue | closed | Landmark buildings should open pictures |
| [310](00310.md) | PR | merged | fix(map): add a roads switch and draw bus badges at bullet size |
| [309](00309.md) | Issue | closed | The map cannot hide its roads, and bus badges are too small |
| [308](00308.md) | PR | merged | fix(transit): draw a shared subway trunk once so the underground dash stays even |
| [307](00307.md) | Issue | closed | The underground dash breaks between elevated stretches |
| [306](00306.md) | PR | merged | fix(transit): lift elevated station markers and drop buses when live buses is off |
| [305](00305.md) | Issue | closed | Turning off Live buses leaves the buses sitting on the map |
| [304](00304.md) | PR | merged | fix(transit): turn x-ray off when follow ends and raise the M at Middle Village |
| [303](00303.md) | Issue | closed | Stop following leaves x-ray on, and the M sits on the street at Middle Village |
| [302](00302.md) | PR | merged | fix(transit): show one bus corridor at a time, including a train's replacement bus |
| [301](00301.md) | Issue | closed | Live buses cover the map, and a replacement shuttle is not singled out |
| [300](00300.md) | PR | merged | fix(map): let one owner steer the camera |
| [299](00299.md) | Issue | closed | Follow and a trip preview fight over the camera |
| [298](00298.md) | PR | closed | fix(transit): open a train's stops and delays |
| [297](00297.md) | Issue | closed | A train press should open its stops and delays |
| [296](00296.md) | PR | merged | fix(map): keep the x-ray patch near you |
| [295](00295.md) | Issue | closed | Stability pass: one list for shaky map behavior |
| [294](00294.md) | Issue | closed | X-ray darkens far more than the nearby tunnel |
| [293](00293.md) | PR | merged | fix(map): keep flat buildings light in street view |
| [292](00292.md) | Issue | closed | Flat buildings and simple streets stay slow in street view |
| [291](00291.md) | PR | merged | fix(map): show street restrooms without scanning every look |
| [290](00290.md) | Issue | closed | Restrooms barely show in street view, and street view is very slow |
| [289](00289.md) | PR | merged | fix(ask): make the trip preview speeds play at different rates |
| [288](00288.md) | Issue | closed | The auto trip speed control does not change the preview |
| [287](00287.md) | PR | merged | fix(ask): offer Use my location when a trip starts from here |
| [286](00286.md) | Issue | closed | Ask the map tells you to go find My location on the map |
| [285](00285.md) | PR | merged | fix(transit): ease back when you stop following |
| [284](00284.md) | Issue | closed | Stop following leaves the camera stuck in the chase view |
| [283](00283.md) | PR | merged | fix(ask): send the top-bar question into Ask the map |
| [282](00282.md) | Issue | closed | A question in the top search bar never reaches Ask the map |
| [281](00281.md) | PR | merged | fix(map): keep the layers drawer open on an empty map tap |
| [280](00280.md) | Issue | closed | Empty map tap closes the layers drawer |
| [279](00279.md) | PR | closed | feat(map): sun-driven shadows in the 3D map and street view |
| [278](00278.md) | Issue | closed | Sun-driven shadows in the 3D map and street view |
| [277](00277.md) | PR | merged | feat(ferry): ferry routes, piers and live vessels on the map |
| [276](00276.md) | PR | closed | feat(street): street art murals on their walls |
| [275](00275.md) | PR | merged | feat(buses): learn segment speeds and stop dwell from GTFS-rt history |
| [274](00274.md) | Issue | closed | Handoff checkpoint: in-flight work and next steps |
| [273](00273.md) | PR | merged | feat(text): spell out street names in cards, search and agent route text |
| [272](00272.md) | PR | merged | feat(street): bus stop pole signs and restroom kiosks in street view |
| [271](00271.md) | PR | merged | feat(street): instanced corner street-name signs on poles at every crossing |
| [270](00270.md) | Issue | closed | Street view: no corner street-name sign at intersections |
| [269](00269.md) | PR | merged | fix(trains): float bullets and station labels above elevated track |
| [268](00268.md) | Issue | closed | Bullets and station labels sit at ground level on elevated lines in 3D |
| [267](00267.md) | PR | merged | feat(agent): multimodal trip search via self-hosted OpenTripPlanner |
| [266](00266.md) | Issue | closed | feat(agent): multimodal trip search via self-hosted OpenTripPlanner |
| [265](00265.md) | PR | merged | feat(map): one view switcher (Street/Mid/Up/Top), global X-ray, follow camera modes |
| [264](00264.md) | Issue | closed | One view switcher, global X-ray and a shared follow camera |
| [263](00263.md) | PR | merged | feat(street): live train and bus dots on the street-level mini map |
| [262](00262.md) | PR | merged | feat(transit): clickable alerts, direction-aware skips and a Lines drawer |
| [261](00261.md) | PR | merged | feat(buses): estimate continuous motion along route shapes |
| [260](00260.md) | PR | merged | perf(ui): draw the hour-of-day chart as plain SVG and drop recharts |
| [259](00259.md) | Issue | closed | perf: all-JS budget is full (945 kB); recharts costs ~84 kB for one 24-bar chart |
| [258](00258.md) | PR | merged | fix(voice): reliable hands-free turn-taking |
| [257](00257.md) | Issue | closed | Learn bus segment speeds and stop dwell from GTFS-rt history |
| [256](00256.md) | Issue | closed | Buses skip and jump between 30 s GPS reports |
| [255](00255.md) | PR | merged | fix(trains): live vehicles visible in every view, street level and X-ray |
| [254](00254.md) | Issue | closed | Live trains/buses missing in street view, 3D and when boarded; labels blink |
| [253](00253.md) | Issue | closed | Clickable transit alerts and a Lines drawer |
| [252](00252.md) | Issue | closed | fix(voice): hands-free turn-taking cuts off speech and answers |
| [251](00251.md) | PR | merged | feat(ui): persistent Layers quick drawer + Ask from left, one panel at a time |
| [250](00250.md) | PR | merged | feat(street): storefront brand logos and category shop fronts |
| [249](00249.md) | Issue | closed | feat(street): storefront logos and category shop fronts |
| [248](00248.md) | PR | merged | feat(street): name the street and cross street in the street-level header |
| [247](00247.md) | Issue | closed | Street view header: show nearest street and cross street |
| [246](00246.md) | PR | merged | fix(agent): cb/ model route with fallbacks, landmarks before GeoSearch |
| [245](00245.md) | Issue | closed | Ask: InferHub model id needs cb/ prefix, plus Grand Central geocodes to Harlem |
| [244](00244.md) | PR | merged | ci: run deploy steps in bash inside the node container |
| [243](00243.md) | PR | closed | ci(deploy): run deploy steps in bash so set -o pipefail works |
| [242](00242.md) | PR | merged | feat(street): north-up mini map at street level |
| [241](00241.md) | Issue | closed | feat(street): mini map at street level |
| [240](00240.md) | PR | merged | fix(map): visual polish and transit-first first open |
| [239](00239.md) | Issue | closed | fix(map): visual polish + transit-first first open |
| [238](00238.md) | PR | merged | feat(agent): Ask from street level, plus hands-free voice |
| [237](00237.md) | Issue | closed | Ask from street view, and a hands-free voice mode |
| [236](00236.md) | PR | merged | feat(restrooms): shops & cafés with toilets behind an 'Include shops & cafés' toggle |
| [235](00235.md) | PR | merged | fix(agent): stop every Ask request from returning 400 |
| [234](00234.md) | Issue | closed | Ask box returns 400 for every question |
| [233](00233.md) | Issue | closed | feat(restrooms): shops & cafés with customer toilets (OSM) behind an 'Include shops & cafés' toggle |
| [232](00232.md) | PR | open | chore(main): release 0.2.0 |
| [231](00231.md) | PR | merged | ci: run db:migrate before triggering deploy |
| [230](00230.md) | Issue | closed | ci: run db:migrate in the deploy job |
| [229](00229.md) | PR | merged | perf(map): move landmark GLB export out of the app bundle |
| [228](00228.md) | Issue | closed | main red: all-JS size budget over by 689 B after #227 |
| [227](00227.md) | PR | merged | feat(events): Events layer for NYC street fairs, markets, pop-ups and Parks events |
| [226](00226.md) | Issue | closed | Events layer: NYC street fairs, markets, pop-ups, outdoor shows and Parks events |
| [225](00225.md) | PR | merged | feat(panel): panel slot – one owner for drawer and details sheets |
| [224](00224.md) | Issue | closed | Panel slot: one owner for the drawer and details sheets |
| [223](00223.md) | PR | merged | ci: cancel superseded runs |
| [222](00222.md) | Issue | closed | ci: cancel superseded workflow runs |
| [221](00221.md) | PR | closed | Split threeLayer.ts into src/lib/map/three/ modules (stack migration PR2) |
| [220](00220.md) | PR | closed | Upgrade three.js 0.134.0 → 0.186.1 (stack migration PR1) |
| [219](00219.md) | Issue | closed | Split src/lib/map/threeLayer.ts into modules under src/lib/map/three/ (stack migration PR2) |
| [218](00218.md) | Issue | closed | Upgrade three.js 0.134 → 0.186.1 (stack migration PR1) |
| [217](00217.md) | PR | closed | feat(db): asset version history by name+sha256 and a build asset manifest |
| [216](00216.md) | PR | closed | feat(client): typed API client and schemathesis contract test |
| [215](00215.md) | PR | merged | feat(api): /api/v1 prefix with /api/* alias; spec version tied to the package |
| [214](00214.md) | PR | merged | feat(trains): learn segment and dwell times from GTFS-rt history |
| [213](00213.md) | Issue | closed | Learn subway segment and dwell times from GTFS-rt history |
| [212](00212.md) | PR | merged | ci(release): release-please, commitlint and a PR-title check |
| [211](00211.md) | PR | merged | ci(db): migrations up/down/up on a throwaway Postgres, fail on schema drift |
| [210](00210.md) | PR | merged | fix(trains): keep live trains from moving backward |
| [209](00209.md) | PR | merged | chore(flags): owner and expiry on every flag, test fails on expired flags |
| [208](00208.md) | Issue | closed | Live subway trains jump backward on the map |
| [207](00207.md) | Issue | closed | Flag hygiene: owner and expiry on every feature flag, test fails on expired flags; labels and milestone |
| [206](00206.md) | Issue | closed | CI: migrations up/down/up against a throwaway Postgres, failing on schema drift |
| [205](00205.md) | Issue | closed | Typed API client (openapi-typescript + openapi-fetch) and schemathesis contract test |
| [204](00204.md) | Issue | closed | API versioning: /api/v1 prefix with /api/* alias; openapi info.version tied to package version |
| [203](00203.md) | Issue | closed | Asset version history: published_assets keyed by name+sha256 with a current pointer, plus a build asset manifest |
| [202](00202.md) | Issue | closed | Release automation: release-please, commitlint and a PR-title check |
| [201](00201.md) | Issue | closed | Camera views: Elevated view, labelled view chips with X-ray, solid buildings when looking up, street-view mini map |
| [200](00200.md) | PR | closed | Voice: labelled entry point, no-model fallback intents, fix /api/agent 400, scope + caps + rate limit |
| [199](00199.md) | Issue | closed | Voice: restore a labelled entry point, add no-model fallback intents, fix /api/agent 400 and scope |
| [198](00198.md) | PR | closed | Live trains and stations react to skipped stops, holds, cancellations and MTA alerts |
| [197](00197.md) | Issue | closed | Live trains and stations should react to skipped stops, holds, cancellations and alerts |
| [196](00196.md) | PR | closed | Follow train: ride the track, deck height on the el, x-ray underground |
| [195](00195.md) | PR | merged | fix(trains): dwell at stations, easing, origin wait and terminal stop |
| [194](00194.md) | Issue | closed | Live subway trains glide through stations instead of stopping |
| [193](00193.md) | PR | merged | Keep one previous published asset version and prune older Octo files |
| [192](00192.md) | Issue | closed | Live View (Beta): AR walking arrows over the phone camera |
| [191](00191.md) | Issue | closed | Compare mode: 3D street view next to the camera or a Mapillary photo |
| [190](00190.md) | Issue | closed | Asset publish never deletes old Octo file versions |
| [189](00189.md) | PR | merged | Navigation arrows: glowing route, chevrons, turn arrow and Navigate mode |
| [188](00188.md) | Issue | closed | Navigation arrows for walking directions (street view and 2D Navigate) |
| [187](00187.md) | PR | closed | Station names: bold, readable labels with route bullets |
| [186](00186.md) | Issue | closed | Station names: bold, readable labels with route bullets |
| [185](00185.md) | PR | closed | Each 3D subway train shows its own route bullet on its front and rear signs |
| [184](00184.md) | Issue | closed | Every 3D subway train shows 'A' on its front and rear signs |
| [183](00183.md) | PR | closed | Subway entrance signs: station name and route bullets |
| [182](00182.md) | Issue | closed | Subway entrance signs: station name and route bullets on the 3D kiosks |
| [181](00181.md) | PR | merged | Jump to a neighborhood now moves the map |
| [180](00180.md) | Issue | closed | Jump to a neighborhood selects it but doesn't move the map |
| [179](00179.md) | Issue | closed | Follow train: camera rides elevated track and switches to x-ray underground |
| [178](00178.md) | PR | merged | feat(map): calm map – flat buildings, bus badges, station labels, rotation, spacing, Auto theme |
| [177](00177.md) | Issue | closed | Calm map: flat buildings, square bus badges, vehicle sheet with alerts |
| [176](00176.md) | PR | merged | ci: run every workflow on the self-hosted gravebuster runner |
| [175](00175.md) | Issue | closed | CI: run all workflows on the self-hosted gravebuster runner |
| [174](00174.md) | PR | merged | CD: deploy main to gravebuster after every check passes |
| [173](00173.md) | PR | merged | Layout A: one Layers & filters drawer instead of the dashboard and the rail |
| [172](00172.md) | PR | merged | Readable transit map on phones: pale streets, place icons off by default |
| [171](00171.md) | Issue | closed | Layout A: one Layers & filters drawer replaces the left dashboard and the right rail |
| [170](00170.md) | Issue | closed | Readable transit map on phones: pale streets, no place icons by default |
| [169](00169.md) | PR | merged | My location: share only on tap, exact position for directions, never kept |
| [168](00168.md) | PR | merged | Restrooms: show only the nearest few, not the whole city |
| [167](00167.md) | PR | merged | Transit Focus: fade the rest of the map so subway and bus stand out |
| [166](00166.md) | PR | merged | Open the details panel when you tap a building at street level |
| [165](00165.md) | PR | merged | Vehicle models: per-mode glTF slots served from R2 |
| [164](00164.md) | Issue | closed | Tapping a building at street level opens no details panel |
| [163](00163.md) | Issue | closed | Vehicle models: CC BY glTF for subway, bus and rail, served from R2 |
| [162](00162.md) | PR | merged | Simple controls: labelled buttons and layer chips instead of an icon rail |
| [161](00161.md) | Issue | closed | My location: ask only on tap, use exact coordinates for directions, never keep them |
| [160](00160.md) | Issue | closed | Restrooms: show only the nearest few, not the whole city |
| [159](00159.md) | Issue | closed | Transit Focus: dim the rest of the map so subway and bus stand out |
| [158](00158.md) | Issue | closed | Simple controls: labelled buttons and layer chips instead of an icon rail |
| [157](00157.md) | PR | merged | Show the Manhattan skyline from zoom 11 in waterfront views |
| [156](00156.md) | Issue | closed | Show the Manhattan skyline from zoom 11-12 so waterfront views don't load late |
| [155](00155.md) | PR | merged | Adopt PCM 0.7.0, pin the certified stack and ship the seat protocol |
| [154](00154.md) | Issue | closed | Adopt PCM 0.7.0, re-pin ACS 0.2.0 and ship the seat protocol so agents can claim seats |
| [153](00153.md) | PR | merged | Street level: look up at buildings and sky |
| [152](00152.md) | Issue | closed | Street level: look up at buildings and sky (pitch > 90) |
| [151](00151.md) | PR | merged | Hero landmarks (glTF) + shared renderer dispose fix |
| [150](00150.md) | PR | merged | Transit: x-ray station view |
| [149](00149.md) | Issue | closed | Transit: x-ray station view |
| [148](00148.md) | PR | merged | Building variety: material variants per facade class |
| [147](00147.md) | Issue | closed | Building variety: material variants within a facade class |
| [146](00146.md) | PR | merged | 3D bridges: raised decks, railings and piers |
| [145](00145.md) | Issue | closed | 3D bridges: raised decks, railings and piers |
| [144](00144.md) | PR | merged | Storefront signboards visibly render (#67) |
| [143](00143.md) | PR | merged | Storefront signboards + three.js crash fix (shared renderer) |
| [142](00142.md) | PR | merged | Transit: subway entrances (3D kit) |
| [141](00141.md) | Issue | closed | Transit: subway entrances (3D kit) |
| [140](00140.md) | PR | closed | Storefront signboards on facades + three.js crash fix (shared renderer) |
| [139](00139.md) | PR | merged | Camera height slider verified at 390px; d-pad clears attribution (#138) |
| [138](00138.md) | Issue | closed | Verify camera height slider (PR #125) at 390px mobile |
| [137](00137.md) | PR | merged | Street-level grass texture (#136) |
| [136](00136.md) | Issue | closed | Street-level grass looks like flat paint / shimmers |
| [135](00135.md) | PR | merged | Transit: detailed elevated structure |
| [134](00134.md) | Issue | closed | Transit: detailed elevated structure |
| [133](00133.md) | PR | merged | NYC-style fire hydrant models (#132) |
| [132](00132.md) | Issue | closed | NYC-style fire hydrant models at street level |
| [131](00131.md) | PR | merged | Manhattan skyline pass: building:part massing, facades, darker roofs, water tanks |
| [130](00130.md) | PR | merged | Street-name legibility at street level (#129) |
| [129](00129.md) | Issue | closed | Street-name legibility at street level |
| [128](00128.md) | PR | merged | Parking (DCWP garages, OSM, DOT signs and meters) feature module |
| [127](00127.md) | PR | merged | Filled areas no longer hide streets when zoomed in |
| [126](00126.md) | PR | merged | Live traffic layer (NYC DOT speeds + closures) feature module |
| [125](00125.md) | PR | merged | Camera height slider |
| [124](00124.md) | PR | merged | Floods and hazards (NWS alerts, FloodNet) feature module |
| [123](00123.md) | PR | merged | Live weather (Open-Meteo, NWS fallback) feature module |
| [122](00122.md) | PR | merged | Transit: bridge tracks follow deck height |
| [121](00121.md) | Issue | closed | Transit: bridge tracks follow deck height |
| [120](00120.md) | Issue | closed | Blocks scale: BBL-keyed counts for registry sources (All 311, HPD, trees…) |
| [119](00119.md) | PR | merged | Crash views render in Octo mode |
| [118](00118.md) | PR | merged | Time-of-day lighting (suncalc) feature module |
| [117](00117.md) | PR | closed | Ambient lighting, weather, hazards, traffic and parking modules |
| [116](00116.md) | PR | merged | PR template: checklist + OSS reuse justification |
| [115](00115.md) | PR | merged | Layers: one registry-driven list |
| [114](00114.md) | PR | merged | City tiles: short cache so republished tiles show up |
| [113](00113.md) | Issue | closed | City tiles: browsers keep old tiles for a day after a publish |
| [112](00112.md) | PR | merged | CI: Playwright smoke e2e |
| [111](00111.md) | PR | merged | Smart mode: voice + text trip agent (transit + drive) on the Ask button |
| [110](00110.md) | PR | merged | Street props stay on the sidewalk |
| [109](00109.md) | Issue | closed | Street level: trees, benches and other props stand in the roadway |
| [108](00108.md) | PR | merged | API contract: OpenAPI via @hono/zod-openapi + oasdiff in CI |
| [107](00107.md) | PR | merged | Live MTA transit: subway, LIRR, Metro-North, buses, alerts, accessibility, 3D vehicles |
| [106](00106.md) | Issue | closed | Manhattan skyline pass: building:part setbacks, facade variety, water towers, hero landmarks |
| [105](00105.md) | PR | merged | Real blocks: parks stop soaking up street crashes; per-hectare shading; block-titled panel; cached /api/aggregate |
| [104](00104.md) | PR | merged | CI: dead code and orphans (knip + dependency-cruiser) |
| [103](00103.md) | PR | merged | CI: ESLint (type-aware typescript-eslint, react-hooks, jsx-a11y) |
| [102](00102.md) | Issue | closed | Parking |
| [101](00101.md) | Issue | closed | Live traffic layer |
| [100](00100.md) | Issue | closed | Floods and hazards |
| [99](00099.md) | Issue | closed | Live weather visuals |
| [98](00098.md) | PR | closed | Storefront signboards on facades (OSM + DuckDB spatial + three.js) [WIP] |
| [97](00097.md) | Issue | closed | Time-of-day lighting |
| [96](00096.md) | PR | merged | School buildings: distinct facade in the 3D city (DuckDB spatial join) |
| [95](00095.md) | PR | merged | CI: gitleaks secret scan (+ CodeQL default setup) |
| [94](00094.md) | PR | merged | CI: dependency safety job |
| [93](00093.md) | Issue | closed | Upgrade vite 6 / vitest 3 / maplibre 6 to clear baselined audit advisories |
| [92](00092.md) | Issue | closed | PR template with OSS reuse checklist + required checks on main |
| [91](00091.md) | Issue | closed | CI: gitleaks secret scan + CodeQL |
| [90](00090.md) | Issue | closed | CI: dependency safety (pnpm audit high+, license allowlist, frozen lockfile) |
| [89](00089.md) | Issue | closed | CI: Playwright smoke e2e against vite preview + fixture API |
| [88](00088.md) | Issue | closed | CI: OpenAPI contract (zod-openapi, openapi.json freshness, oasdiff breaking check) + hono/client |
| [87](00087.md) | Issue | closed | CI: dead code and orphans (knip + dependency-cruiser no-orphans/no-circular) |
| [86](00086.md) | Issue | closed | CI: ESLint flat config (typescript-eslint type-aware, react-hooks, jsx-a11y) |
| [85](00085.md) | Issue | closed | Real blocks: parks soak up snapped street crashes; density shading; panel title; /api/aggregate ~93 s |
| [84](00084.md) | Issue | closed | Smart mode: voice + text trip agent on the Ask button |
| [83](00083.md) | PR | merged | Feed health check: pnpm feeds:health + scheduled workflow |
| [82](00082.md) | PR | merged | Performance budget: size-limit per JS chunk in CI |
| [81](00081.md) | PR | merged | Modular monolith: feature module convention + dependency-cruiser boundaries in CI |
| [80](00080.md) | PR | merged | Feature flags + simple-by-default Advanced switch |
| [79](00079.md) | PR | merged | Mobile polish + right-hand control rail (replaces bottom dock) |
| [78](00078.md) | PR | merged | Street level: sidewalks, trees and road stripe |
| [77](00077.md) | Issue | closed | Street level props: knee-high slabs, cube trees, pale road stripe |
| [76](00076.md) | PR | merged | docs: ARCHITECTURE.md (modular monolith) |
| [75](00075.md) | Issue | closed | Simple-by-default: advancedMode setting hides analytics layers |
| [74](00074.md) | Issue | closed | Feed health check: pnpm script + scheduled Action pinging upstreams via our proxy |
| [73](00073.md) | Issue | closed | Performance budget: size-limit on JS chunks in CI, lazy feature chunks |
| [72](00072.md) | Issue | closed | Feature flags: typed registry (env + URL override) per module |
| [71](00071.md) | Issue | closed | Modular monolith: src/features/<name> convention + dependency-cruiser boundaries in CI |
| [70](00070.md) | Issue | closed | Architecture: docs/ARCHITECTURE.md module map, features, feeds, caching, env, licenses |
| [69](00069.md) | PR | merged | Blocks scale: real NYC tax blocks (MapPLUTO → PMTiles via Octo/R2, DuckDB spatial join into marts) |
| [68](00068.md) | PR | merged | Street-level NYC street-name signs at every intersection |
| [67](00067.md) | Issue | closed | Storefront signboards at street level (OSM shops, 3D facade signs) |
| [66](00066.md) | Issue | closed | Mobile polish: no hover card on touch, merged toolbar, scrollable chips, thin progress line, loading state, crisp outlines, compact peek |
| [65](00065.md) | PR | merged | One Google Maps-style map panel (search, chips, left panel / vaul bottom sheet) |
| [64](00064.md) | PR | merged | Street level: camera never sinks underground |
| [63](00063.md) | Issue | closed | Street level: camera sinks underground (black lower half, pale band) when looking up/down |
| [62](00062.md) | PR | merged | Street level: drag up to look up |
| [61](00061.md) | Issue | closed | Google Maps–style single panel: search + chips, left panel (desktop), snapping bottom sheet (mobile) |
| [60](00060.md) | Issue | closed | Street-level NYC street-name sign poles at every intersection |
| [59](00059.md) | Issue | closed | Blocks scale: replace the ~300 m grid with real NYC tax blocks |
| [58](00058.md) | PR | merged | Public restrooms layer (Octo ingest + icon layer + click card) |
| [57](00057.md) | PR | merged | Draggable floating panels (block card + neighborhood side panel) |
| [56](00056.md) | Issue | closed | Live MTA transit layers: subway, LIRR, Metro-North, buses |
| [55](00055.md) | Issue | closed | School buildings: distinct facade in the 3D city |
| [54](00054.md) | Issue | closed | Public restrooms layer (NYC Open Data) via Octo ingest |
| [53](00053.md) | PR | merged | Walking directions: typed A/B addresses with GeoSearch autocomplete (downshift), map pick kept |
| [52](00052.md) | Issue | closed | Street level: vertical drag to look is inverted |
| [51](00051.md) | Issue | closed | Walking directions: typed address inputs with autocomplete |
| [50](00050.md) | Issue | closed | Real NYC blocks instead of the ~300 m grid |
| [49](00049.md) | Issue | closed | Walking directions: type addresses for A and B with autocomplete |
| [48](00048.md) | Issue | closed | Draggable floating panels (hover card, block card, neighborhood side panel) |
| [47](00047.md) | Issue | closed | Camera height slider: eye level (1.7 m) to overhead |
| [46](00046.md) | Issue | closed | Floating panels stack; block fill hides streets at z17 |
| [45](00045.md) | Issue | closed | Octo mode: Crashes and Noise + crashes render nothing; add an all-options render check |
| [44](00044.md) | Issue | closed | Unify the Layers dropdown: one registry-driven list, drop the classic path |
| [43](00043.md) | PR | merged | City tiles from R2 via Octo files (/api/city-tiles) |
| [42](00042.md) | PR | merged | Host-agnostic API: Hono app + Node entry + Dockerfile |
| [41](00041.md) | Issue | closed | Make the API host-agnostic (no Vercel): Hono server runnable on Node/Docker/Cloudflare |
| [40](00040.md) | PR | merged | Ingest: always rebuild areas + aggregates after refresh |
| [39](00039.md) | Issue | closed | nightly-ingest: one flaky source skips area + aggregate rebuilds |
| [38](00038.md) | PR | merged | Facade textures at ~3.2 m per floor |
| [37](00037.md) | PR | merged | Street level: asphalt roads, sidewalks and ground |
| [36](00036.md) | PR | merged | Street level: spawn on the nearest street centreline |
| [35](00035.md) | Issue | closed | Facade textures tile too densely on tall walls |
| [34](00034.md) | Issue | closed | Ground and roads render flat white at eye level |
| [33](00033.md) | Issue | closed | Street level spawns the eye inside or against a building |
| [32](00032.md) | PR | merged | Octo mode: /api/areas + /api/aggregate, no browser Socrata calls |
| [31](00031.md) | Issue | closed | Octo mode: zero browser calls to NYC Open Data (boundaries + street panel via /api) |
| [30](00030.md) | Issue | closed | Host citywide 3D city PMTiles on R2/S3 + CDN |
| [29](00029.md) | PR | merged | Fix console 404: add favicon |
| [28](00028.md) | Issue | closed | Console 404: /favicon.ico |
| [27](00027.md) | PR | merged | Mobile: attribution above the dock |
| [26](00026.md) | Issue | closed | Mobile: map attribution and its 'i' button sit under the bottom dock |
| [25](00025.md) | PR | merged | Pin pnpm 11.19.0 via packageManager (fixes nightly-ingest setup) |
| [24](00024.md) | Issue | closed | nightly-ingest fails: pnpm/action-setup@v4 has no pnpm version |
| [23](00023.md) | PR | merged | Fix 'Top neighborhood (NTA 2020)s' heading |
| [22](00022.md) | Issue | closed | Drawer heading reads 'Top neighborhood (nta 2020)s' |
| [21](00021.md) | PR | merged | Street level at a 1.7 m eye; citywide textured 3D city |
| [20](00020.md) | Issue | closed | Street level is still a drone view; textures don't load outside the pilot |
| [19](00019.md) | PR | merged | Hide POI labels at street level with the 3D city on |
| [18](00018.md) | Issue | closed | Basemap POI/shop labels clutter street level when textured 3D city is on |
| [17](00017.md) | PR | merged | Textured 3D city pilot with street props |
| [16](00016.md) | PR | merged | Octo data layer, API, and a unit/style dashboard with filters and guides |
| [15](00015.md) | Issue | closed | Stylized textured 3D city with street props |
| [14](00014.md) | PR | merged | Install the ACS multi-agent hotloader |
| [13](00013.md) | Issue | closed | Plan: Octo data layer + reusable registry-driven dashboard |
| [12](00012.md) | Issue | closed | Add more filterable NYC datasets |
| [11](00011.md) | Issue | closed | Self-hosted NYC 3D buildings as static 3D Tiles |
| [10](00010.md) | Issue | closed | Mapillary sequence walk with block-by-block gliding |
| [9](00009.md) | Issue | closed | Fix two leftover mobile overlaps |
| [8](00008.md) | Issue | closed | Walk along a route with turn-by-turn and POIs |
| [7](00007.md) | Issue | closed | Walk bubble with noise and accident levels |
| [6](00006.md) | Issue | closed | Registry-driven dashboard: filters, legends, guides |
| [5](00005.md) | Issue | closed | Server API for sources, blocks, areas and streets |
| [4](00004.md) | Issue | closed | Migrations, versioning and nightly ingestion |
| [3](00003.md) | Issue | closed | Octo data model: raw, core and marts schemas |
| [2](00002.md) | Issue | closed | ACS hotload install |
| [1](00001.md) | PR | merged | Dataset registry, per-source/average views, shadcn drawers, Mapillary widening, sharper walk + walking directions |

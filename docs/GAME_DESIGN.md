# Game design

Roadster Escape is an endless chase on a Texas desert highway. You drive a flying roadster with cold-gas thrusters. The cops try to PIT you off the road. You dodge them with barrel rolls and hop over traffic until they bust you. Then you share the clip.

The game exists to make a five-second clip worth posting on X. Every design call below serves that clip.

## Where the idea comes from

On 15 October 2026 Tesla showed its new Roadster near Waco, Texas. It drove up an inverted ramp, flipped in mid-air, and hopped over five other cars on cold-gas thrusters. The car carries 600 liters of compressed air for those thrusters. X answered with memes within minutes. People joked about traffic, about Back to the Future, about "flying cars before GTA 6", and about the car jumping over a police car.

The game turns those memes into mechanics. It is an unofficial fan game. It uses no Tesla or SpaceX logos, and the car is called "the Roadster".

## The core loop

1. You drive forward on a three-lane highway. Speed rises slowly over the run.
2. Traffic fills the lanes. You change lanes or hop over it.
3. Police cars chase you. A cop lines up beside you, flashes a warning, and lunges for a PIT.
4. You barrel-roll away from the lunge. The cop misses and often hits traffic or another cop.
5. Wrecked cops raise your combo. Your wanted level rises with time and with wrecks.
6. A successful PIT, a crash into traffic, or a roadblock busts you.
7. The busted screen shows your score and a replay of your best moment, ready to share.

A run lasts about one to three minutes for a new player. A good player survives five minutes or more.

## Controls

Every action maps to one gesture or one key. The game never needs two simultaneous inputs.

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Change lane left or right | Swipe left or right | `A` `D` or arrow keys | Left stick or D-pad |
| Hop | Swipe up | `W`, up arrow, or `Space` | `A` button |
| Barrel roll left or right | Swipe diagonally up-left or up-right | `Q` `E`, or `Shift` plus a direction | Bumpers |

An input that arrives a little early is buffered for about 150 ms, so a swipe made just before landing still fires.

## Mechanics

### Air tank

The air tank holds 600 liters, like the real car. A hop costs air and a barrel roll costs more. A near miss refills some air. A near miss means passing a car or a cop within a small margin. Clearing a car with a hop or a roll counts, and a clean hop over a car refills more air than the hop costs. The design rewards risk. You run dry when you play safe, and you fill up when you play close.

The tank is the only resource in the game. It replaces lives, shields, and power-ups.

### Barrel roll

A barrel roll moves you one lane sideways in a full spin. You cannot be hit during the spin. It is the answer to a PIT. A roll that dodges a PIT inside the last 200 ms is a "perfect dodge". A perfect dodge triggers a short slow-motion shot and marks that moment for the replay.

### Hop

A hop lifts you over one car or one low obstacle. It is the answer to traffic, spike strips, and low roadblocks. You can roll while airborne, which is the move expert players chase.

### Police

Each cop follows one cycle: cruise, line up, warn, lunge, then recover or crash. During the warning the light bar flashes and an arrow points at you. The warning gets shorter as the wanted level rises. A cop that misses a lunge loses control for a moment. If anything is in its path, it crashes.

### Wanted level

The wanted level runs from one to five stars. Time and wrecked cops raise it. Each star adds a new threat type to the spawn table.

| Stars | New threat |
| --- | --- |
| 1 | Patrol cars that try single PITs |
| 2 | Pairs of cops that box you in from both sides |
| 3 | Spike strips across one or two lanes |
| 4 | Roadblocks that leave one gap, and a helicopter spotlight that marks your lane for a lunge |
| 5 | An armored interceptor that lunges twice. This is the boss moment, and it should look absurd. |

### Score

The score is distance plus style. Wrecked cops, near misses, and perfect dodges add style points through a combo multiplier. The combo resets when you go five seconds without a style event.

## The share moment

The busted screen is the most important screen in the game.

- It shows the distance, the cops wrecked, the best combo, and the wanted level reached.
- It plays an automatic replay of the best moment from a cinematic camera. The best moment is usually the last perfect dodge or the biggest pile-up.
- One button shares that replay as a short video with a ready-made post. On a phone it opens the share sheet. On a desktop it downloads the video and opens a prepared post on X.
- The daily chase uses the same seed for every player that day. The share text includes the date and the score, so friends can compare runs fairly.

## Platforms

The game runs in a browser on phones, tablets, and computers. That includes the in-app browser of X, because most players arrive from a post. The game installs as a PWA, but it never requires installing.

Targets for a mid-range phone from 2023:

- 60 frames per second at the default quality tier.
- Under 3 MB transferred before the title screen is playable.
- Playable within 3 seconds on a 4G connection.

## Out of scope for version 1

- Multiplayer.
- Accounts and a global leaderboard. Scores stay local and in the share text. A small global leaderboard can come later.
- Ads and payments.
- Car customization beyond a few color choices.

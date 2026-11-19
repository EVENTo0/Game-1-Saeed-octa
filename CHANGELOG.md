# Changelog

## 2.0.0

Full match loop rebuilt to current mobile battle-royale expectations. v1.0.0
(commit `c70c43c`, SKU SAEED-ROYALE-WEB-V1) is unchanged and stays the sellable baseline.

- **Lobby**: Saeed on a lit turntable, account level and XP bar, outfit picker
  (4 outfits unlocked by level), tap-to-choose drop-zone map, build version.
- **Skydive**: every match opens with a steerable freefall and parachute; bots
  hold fire until touchdown plus the spawn grace.
- **Combat feedback**: floating damage numbers, X hitmarker (red on a kill),
  kill feed, elimination / double / triple kill banner.
- **Death**: kill-cam turns to face the opponent who eliminated Saeed.
- **Results**: placement, kills, damage, accuracy and time; itemised XP,
  animated level bar, level-up and outfit unlock call-outs. Progress is saved.
- **Onboarding**: first-match coaching lines that wait for the player to do
  each step (steer, move, look, fire).
- **Performance**: dynamic resolution keeps frame rate steady on busy fights.
- **Localisation**: opponent names in Arabic; all new strings in AR and EN.
- **Fixes**: XP counter direction in RTL; landing event no longer repeats if
  Saeed dies on touchdown.
- **Tooling**: `npm run build:single` for a one-file test build;
  `npm run preview:report` records the whole loop (video + 20 scenes).

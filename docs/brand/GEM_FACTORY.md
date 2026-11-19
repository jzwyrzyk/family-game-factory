# Gem Factory

A complete, cheerful starter game: match a gem to a gift order, time its cut,
rub or hold to polish it, and pack it with a burst of sparkles. It appears first
in **Ready to Play jems**. This game has its own local play progress and does not
depend on mining, achievements, or GemBots.

## Play

- Match by name, color, and shape. A mistaken pick gives a helpful retry.
- Cut as the pointer crosses the mint stripe. Every cut succeeds; timing earns
  one, two, or three stars and changes the coins awarded for the packed gem.
- Polish by rubbing the gem, holding the button, or activating it repeatedly
  with a keyboard or assistive technology.
- Complete the day's order to reach the existing required learning activity.
  The normal host **Next level** action opens the next day.
- Day two adds amethyst. Day three adds sunshine stars.
- Sound is opt-in. Pause, reduced motion, touch cancellation, and host learning
  pauses are supported. Day and earned coins save separately for each profile.

The game exposes three real remix settings: gems per order, cutter speed, and
extra sparkle power. There is no shared gem currency, purchase system, network
call, new achievement database, or new child data field.

## Artwork

`public/gem-factory-workshop.webp` and `public/gem-factory-helper.webp` were
created with the built-in image-generation tool for this game. They are local
assets (about 311 KB combined), not external image dependencies. SVG game pieces
remain crisp and preserve distinct heart, diamond, hexagon, crystal, and star
silhouettes. All order labels, controls, live gems, animation, and rewards are
functional UI drawn above the backdrop.

Workshop prompt direction: a luminous premium cartoon gem workshop, cream
plaster walls, honey-colored curved timber beams, sunny round window, rainbow
bunting, crystal shelves, substantial mint hopper, coral cutter, lilac/turquoise
polisher and a ribboned gift station. Empty continuous teal conveyor, bright
Jems palette, no baked-in text or UI, no industrial grime.

Helper prompt direction: a lovable mint robot with large navy eyes, rosy cheeks,
amethyst crystal hat, golden goggles and coral tool belt, waving on transparency,
with soft dimensional casual-game shading.

## Verification

`npm run test:gem-factory` plays the actual Studio starter at desktop, tablet and
phone widths. It covers wrong choices, keyboard input, the four making steps,
pointer cancellation, both kinds of pause, required learning, next day,
profile isolation, persistence and scene coverage. It also captures the running
game in `test-results/gem-factory/`. The visual-review workflow retains those
captures as `gem-factory-gameplay`.

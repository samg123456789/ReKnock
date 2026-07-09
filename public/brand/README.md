# ReKnock brand library

Concept: a message bubble (the follow-up) carrying a double chevron (again →),
with two knock arcs. Blue #1d5fdb on white; ink #101828; dark bg #0d2b66.

## Files
SVG masters (infinitely scalable — use these whenever possible):
- reknock-icon-{blue|white|black}.svg      icon only, 3 contrasts
- reknock-wordmark-{blue|white|black}.svg  icon + name

PNG exports:
- avatar-1024.png        social profile (X, LinkedIn, Facebook, Instagram)
- avatar-400.png         small avatar contexts
- avatar-light-1024.png  light-tile variant
- og.png                 1200x630 link-share card (set in site metadata)
- /apple-icon.png        iOS home screen (served automatically by Next)
- /app/icon.svg          favicon (served automatically by Next)

## Usage rules
- White icon on blue/dark; blue icon on white/light; black = single-color print.
- Don't recolor, rotate, or add effects. Keep clear space ≈ the chevron width.
- Wordmark SVGs use the Barlow Condensed webfont with system fallback; for
  pixel-perfect exports at new sizes, render from the site's Logo component.

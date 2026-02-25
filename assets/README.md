# Background Assets

Place these two image files here to activate the background design:

## Required files

| Filename | Description |
|---|---|
| `bg-nebula.jpg` | The deep space nebula (James Webb / NGC image — red/blue star-forming region) |
| `bg-sun.png` | The red sun flare image — save as PNG with transparent background (remove black background) OR keep JPG and use CSS `mix-blend-mode: screen` |

## Enabling the background

Once images are saved here, open `homepage-new.css` and uncomment the `body` background-image block and the `#bg-sun` background-image block (search for "Uncomment once images are in /assets/").

## Design intent

- **Nebula** = full-screen background behind everything (`background-attachment: fixed`)
- **Red sun** = fixed centered element visible at the top, bleeds through the dark UI via `mix-blend-mode: screen` so the corona glow shows without the black background
- The existing crimson gradient overlays and card backgrounds naturally complement both images

## Quick setup (copy files then run)

```bash
cp /path/to/nebula.jpg assets/bg-nebula.jpg
cp /path/to/sun.png assets/bg-sun.png
```

Then uncomment in `homepage-new.css`:
1. Search for `Uncomment once images are in /assets/` — there are 2 blocks
2. Uncomment the `background-image` and related properties inside each block

# CleanMetaDATA

Strips EXIF, GPS, C2PA, and AI generator metadata from images. Free, no signup, runs in your browser.

---

## Why free

The core of this is a canvas re-render. Your image gets drawn onto an HTML5 Canvas and exported as a new file, and the browser builds it from raw pixels, so all metadata containers fall off automatically. Charging for that felt wrong, so I didn't.

---

## What it removes

- **EXIF** — camera model, lens, ISO, timestamps, device serial numbers
- **GPS** — exact coordinates and altitude embedded by phones
- **XMP** — editing history and Adobe workflow data
- **IPTC** — author, copyright, keywords
- **C2PA** — content credentials that trigger "Made with AI" labels on Instagram and Facebook
- **PNG chunks** — Stable Diffusion prompts, seeds, and model hashes stored by A1111, ComfyUI, Forge
- **AI signatures** — DALL-E, MidJourney, Firefly generator fingerprints
- **Image hash** — pixel-level noise (~4% of pixels, max ±1 RGB per channel) to change the perceptual fingerprint and disrupt reverse image search

---

## What it won't do

SynthID and invisible watermarks are baked into the pixels themselves, not stored as metadata. No canvas operation touches them, including this one. It also can't remove a label a platform has already applied server-side.

---

## How to use

Open `index.html` in a browser and drop an image. That's the whole thing. No install, no build step. CDN scripts load at runtime: `exifr` for reading metadata before cleaning, `heic2any` for HEIC support, and `jszip` for packaging multi-file batches into a single ZIP download.

There's also a second page, `content-credentials.html` — a C2PA / Content Credentials checker that verifies image provenance using the `@contentauth/c2pa-web` WebAssembly engine, loaded on demand from a CDN.

---

## Supported formats

JPEG, PNG, WebP, HEIC. Files up to 30 MB. Up to 10 files at once (delivered as a ZIP).

---

## Project structure

No build step — the HTML files load plain CSS and JS straight from `src/`.

```
index.html                  Metadata cleaner page (markup only)
content-credentials.html    C2PA checker page (markup only)
src/
  styles/
    index.css               Styles for the cleaner page
    content-credentials.css Styles for the C2PA checker
  scripts/
    index.js                Cleaner logic (canvas re-render, metadata read, batch ZIP)
    content-credentials.js  C2PA verification logic (ES module)
og-image.jpg                Social preview image (served from root)
robots.txt, sitemap.xml     SEO
```

Each page references its own stylesheet and script; no bundler or framework is involved.

---

## Deploy on GitHub Pages

Push the repo to the root of your `main` branch — keep `index.html`, `content-credentials.html`, the `src/` folder, `robots.txt`, `sitemap.xml`, and `og-image.jpg` at the root. Then go to Settings → Pages and set the source to deploy from branch `main` at root. Takes about a minute.

For a custom domain, add a `CNAME` file with your domain and point DNS to GitHub Pages IPs.

---

## Stack

Vanilla JS and CSS, no framework, no build system — markup, styles, and scripts split into plain files under `src/`. CDN dependencies: [exifr 7.1.3](https://github.com/MikeKovarik/exifr), [heic2any 0.0.4](https://github.com/alexcorvi/heic2any), [jszip 3.10.1](https://github.com/Stuk/jszip), and [@contentauth/c2pa-web 0.9.0](https://github.com/contentauth/c2pa-js) for the C2PA checker.

---

## License

MIT. Take it, fork it, do whatever.
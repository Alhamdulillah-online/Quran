# Quran Chapters Reader

A premium, English-language Quran PDF reader with Arabic headings, a calm emerald-and-gold design, and responsive page rendering. The chapter list is intentionally simple: add each PDF to `chapters/`, then add one short entry to `chapters.json`.

No Quran PDF is included yet. Add only the chapter files you want to publish.

## Add a chapter

1. Upload the PDF to the repository's `chapters/` folder. Example filename: `001-Al-Fatihah.pdf`.
2. Open `chapters.json` and add a matching entry inside the `chapters` list:

```json
{
  "chapters": [
    {
      "number": 1,
      "name": "Al-Fatihah",
      "arabicName": "الفاتحة",
      "file": "chapters/001-Al-Fatihah.pdf"
    }
  ]
}
```

`number` must be from `1` to `114`; `name` is the English name shown in the list; `arabicName` is optional; `file` must match the PDF path exactly. To add another chapter, place a comma after the previous object and add another object. Keep chapter numbers unique. Save and commit both the PDF and `chapters.json`; the website reads the list directly, so there is no build step.

The PDFs are public because this is a public repository. Anyone may open or download a file from its GitHub path, even though the on-page reader does not show download or print buttons.

## Run the site locally

From the repository folder, run:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Use an HTTP server rather than opening `index.html` as a `file://` URL, because the browser must fetch `chapters.json` and PDF.js must load its worker.

## Publish with GitHub Pages

GitHub Pages is not enabled by this source-only upload. When you want to publish, open the repository's **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save. GitHub will show the Pages URL when setup completes. This repository does not automatically enable Pages or run a deployment workflow.

After the Pages URL is confirmed, add that exact address as the canonical and social URL, and create the matching sitemap if you want those origin-specific SEO entries. The page already includes English/Arabic/Malayalam discovery keywords, semantic headings, robots metadata, Open Graph text, JSON-LD, and a favicon; no unverified domain is hard-coded.

## Files

```text
index.html       English reader page and SEO metadata
styles.css       Responsive emerald-and-gold design
app.js           Chapter list, PDF.js viewer, theme, page navigation
chapters.json    Easy-to-edit chapter names and PDF paths
chapters/        Add public Surah PDFs here
favicon.svg      Site icon
og-image.jpg     Social/hero artwork
robots.txt       Crawler policy
.nojekyll        Keep GitHub Pages from applying Jekyll processing
```

This version does not connect to Firebase, show public view counters, or include an admin panel. No Firebase rules or settings were changed. If you later want those features, they can be added separately after the database access is set up.

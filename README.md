# Quran Chapters Reader

A calm, premium Quran reading room that loads all 114 Surah names and Arabic Uthmani ayahs for a focused reading experience. The home page is a library landing page; selecting a Surah opens the dedicated `reader.html` reading page. No account or API key is required.

## Quran.com API integration

The browser client uses these public API endpoints:

- `GET https://api.quran.com/api/v4/chapters?language=en` for all Surah metadata.
- `GET https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number={1-114}` for Arabic Uthmani verse text.

The integration is implemented in `app.js`. It includes loading states, HTTP/API error handling, accessible search, Quran.com attribution links, and a local `chapters.json` fallback if chapter metadata is temporarily unavailable. The API is called directly from the static site, so no secret credentials are stored in the repository.

## Run the site locally

From the repository folder, run:

```sh
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Use an HTTP server rather than opening `index.html` as a `file://` URL because the page uses `fetch()` to load API data.

## Publish with GitHub Pages

This repository is compatible with GitHub Pages. In **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save. The site must be served over HTTPS for the browser to allow the cross-origin Quran.com API request.

## Files

```text
index.html       Reader page and SEO metadata
styles.css       Responsive emerald-and-gold design
app.js           Quran.com API client, Surah search and verse reader
chapters.json    Offline metadata fallback (optional)
manus-routes.json Static route declaration
favicon.svg      Site icon
og-image.jpg     Social/hero artwork
robots.txt       Crawler policy
.nojekyll        Keep GitHub Pages from applying Jekyll processing
```

The repository PDFs remain available as source files, but the main reader now uses Quran.com as its live text source.

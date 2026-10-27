const QURAN_API_BASE = "https://api.quran.com/api/v4";
const $ = (selector) => document.querySelector(selector);

const chapterList = $("#chapter-list");
const libraryStatus = $("#library-status");
const readerStatus = $("#reader-status");
const versesContainer = $("#pdf-pages");
const IS_READER_PAGE = Boolean($("#reader-panel"));
let chapters = [];
let currentChapter = null;
let currentVerses = [];
let apiRequestGeneration = 0;

function setStatus(element, message, kind = "") {
  if (!element) return;
  element.textContent = message;
  if (kind) element.dataset.kind = kind;
  else delete element.dataset.kind;
}

function setTheme(theme) {
  const chosen = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = chosen;
  const button = $("#theme-toggle");
  button.setAttribute("aria-pressed", String(chosen === "light"));
  button.setAttribute("aria-label", chosen === "dark" ? "Switch to light theme" : "Switch to dark theme");
  try { localStorage.setItem("quran-reader-theme", chosen); } catch { /* Storage may be unavailable. */ }
}

async function fetchJson(path) {
  const response = await fetch(`${QURAN_API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Quran.com API returned HTTP ${response.status}.`);
  return response.json();
}

function normalizeChapter(item) {
  const number = Number(item.id ?? item.number);
  return {
    id: String(number).padStart(3, "0"),
    number,
    name: String(item.name_simple ?? item.name ?? `Surah ${number}`),
    arabicName: String(item.name_arabic ?? item.arabicName ?? ""),
    translatedName: String(item.translated_name?.name ?? item.translationName ?? ""),
    versesCount: Number(item.verses_count ?? item.versesCount ?? 0),
    revelationPlace: String(item.revelation_place ?? item.revelationPlace ?? ""),
    file: typeof item.file === "string" ? item.file : ""
  };
}

function validateLocalChapters(data) {
  if (!data || !Array.isArray(data.chapters)) throw new Error('chapters.json must contain a "chapters" list.');
  return data.chapters.map(normalizeChapter).filter((chapter) => Number.isInteger(chapter.number) && chapter.number >= 1 && chapter.number <= 114);
}

function renderLibrary() {
  const query = $("#chapter-search").value.trim().toLocaleLowerCase();
  const focusedId = chapterList.querySelector(".chapter-button:focus")?.dataset.chapterId;
  const matches = chapters.filter((chapter) => `${chapter.name} ${chapter.arabicName} ${chapter.translatedName} ${chapter.number}`.toLocaleLowerCase().includes(query));
  const fragment = document.createDocumentFragment();

  for (const chapter of matches) {
    const item = document.createElement("li");
    item.className = "chapter-item";
    const button = document.createElement("a");
    button.className = "chapter-button";
    button.href = `reader.html?surah=${chapter.number}`;
    button.dataset.chapterId = chapter.id;
    button.setAttribute("aria-current", String(currentChapter?.id === chapter.id));

    const number = document.createElement("span");
    number.className = "chapter-number";
    number.textContent = String(chapter.number).padStart(3, "0");
    const copy = document.createElement("span");
    copy.className = "chapter-copy";
    const name = document.createElement("span");
    name.className = "chapter-name";
    name.textContent = chapter.name;
    copy.append(name);
    if (chapter.translatedName) {
      const translation = document.createElement("span");
      translation.className = "chapter-translation";
      translation.textContent = chapter.translatedName;
      copy.append(translation);
    }
    if (chapter.arabicName) {
      const arabic = document.createElement("span");
      arabic.className = "chapter-arabic";
      arabic.lang = "ar";
      arabic.dir = "rtl";
      arabic.textContent = chapter.arabicName;
      copy.append(arabic);
    }
    button.append(number, copy);
    item.append(button);
    fragment.append(item);
  }

  chapterList.replaceChildren(fragment);
  $("#chapter-count").textContent = String(chapters.length);
  if (focusedId) chapterList.querySelector(`[data-chapter-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
  if (!chapters.length) setStatus(libraryStatus, "No chapters are available right now.");
  else if (query && !matches.length) setStatus(libraryStatus, "No chapters match your search.");
  else setStatus(libraryStatus, `${matches.length} of ${chapters.length} Surah${chapters.length === 1 ? "" : "s"} available.`);
}

async function loadChapters() {
  try {
    const data = await fetchJson("/chapters?language=en");
    chapters = data.chapters.map(normalizeChapter).sort((a, b) => a.number - b.number);
    setStatus(libraryStatus, "Loading the Surah library…");
  } catch (apiError) {
    console.warn("Quran.com chapter metadata could not be loaded; trying local data.", apiError);
    const response = await fetch(new URL("chapters.json", document.baseURI), { cache: "no-store" });
    if (!response.ok) throw new Error(`Chapter list returned HTTP ${response.status}.`);
    chapters = validateLocalChapters(await response.json());
    setStatus(libraryStatus, "Using the saved chapter list. Live text is temporarily unavailable.", "error");
  }
  renderLibrary();
}

function renderVerses(chapter, verses) {
  const fragment = document.createDocumentFragment();
  verses.forEach((verse) => {
    const article = document.createElement("article");
    article.className = "verse-card";
    article.id = `ayah-${verse.verse_key}`;
    article.setAttribute("aria-label", `Ayah ${verse.verse_key}`);

    const meta = document.createElement("div");
    meta.className = "verse-meta";
    const key = document.createElement("span");
    key.className = "verse-key";
    key.textContent = verse.verse_key;
    meta.append(key);

    const text = document.createElement("p");
    text.className = "verse-text";
    text.lang = "ar";
    text.dir = "rtl";
    text.textContent = verse.text_uthmani || "";
    article.append(meta, text);
    fragment.append(article);
  });
  versesContainer.replaceChildren(fragment);
}

async function openChapter(chapter) {
  if (!IS_READER_PAGE) {
    window.location.href = `reader.html?surah=${chapter.number}`;
    return;
  }
  currentChapter = chapter;
  const generation = ++apiRequestGeneration;
  $("#reader-title").textContent = chapter.name;
  $("#reader-subtitle").textContent = `${chapter.arabicName || ""}${chapter.translatedName ? ` · ${chapter.translatedName}` : ""} · ${chapter.versesCount || ""} ayahs`;
  $("#reader-toolbar").hidden = false;
  $("#empty-state").hidden = true;
  versesContainer.hidden = false;
  renderLibrary();
  versesContainer.replaceChildren();
  setStatus(readerStatus, `Loading ${chapter.name}…`);

  try {
    const data = await fetchJson(`/quran/verses/uthmani?chapter_number=${chapter.number}`);
    if (generation !== apiRequestGeneration) return;
    currentVerses = Array.isArray(data.verses) ? data.verses : [];
    if (!currentVerses.length) throw new Error("The API returned no ayahs for this Surah.");
    renderVerses(chapter, currentVerses);
    $("#verse-count").textContent = `${currentVerses.length} ayahs`;
    setStatus(readerStatus, `${chapter.name} is ready · verified Arabic Uthmani text.`, "success");
    versesContainer.focus({ preventScroll: true });
  } catch (error) {
    console.error("Surah could not be loaded from Quran.com.", error);
    currentVerses = [];
    versesContainer.hidden = true;
    $("#empty-state").hidden = false;
    $("#empty-state h3").textContent = "This Surah could not be loaded";
    $("#empty-state p").textContent = "The reading service could not be reached right now. Please check your connection and try again.";
    setStatus(readerStatus, "The text request failed. Other Surahs remain available.", "error");
  }
}

$("#theme-toggle").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
$("#chapter-search").addEventListener("input", renderLibrary);

try {
  setTheme(localStorage.getItem("quran-reader-theme") || "dark");
} catch {
  setTheme("dark");
}

loadChapters().catch((error) => {
  console.error("Chapter list could not be loaded.", error);
  setStatus(libraryStatus, "The Surah library could not be loaded. Refresh to try again.", "error");
  setStatus(readerStatus, "The reader is available once the chapter list loads.", "error");
});

if (IS_READER_PAGE) {
  const requestedSurah = Number(new URLSearchParams(window.location.search).get("surah"));
  if (requestedSurah) {
    const waitForChapters = window.setInterval(() => {
      const chapter = chapters.find((item) => item.number === requestedSurah);
      if (!chapter) return;
      window.clearInterval(waitForChapters);
      openChapter(chapter);
    }, 50);
    window.setTimeout(() => window.clearInterval(waitForChapters), 10000);
  }
}

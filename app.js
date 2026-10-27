const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.mjs";
const $ = (selector) => document.querySelector(selector);

const chapterList = $("#chapter-list");
const libraryStatus = $("#library-status");
const readerStatus = $("#reader-status");
const pagesContainer = $("#pdf-pages");
const readerPanel = $("#reader-panel");
let chapters = [];
let currentChapter = null;
let currentPdf = null;
let pageObserver = null;
let currentPage = 1;
let pdfGeneration = 0;
let pdfjsPromise;

function setStatus(element, message, kind = "") {
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

function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_MODULE_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function checkedFileUrl(file) {
  if (typeof file !== "string" || !file.startsWith("chapters/")) {
    throw new Error("Each PDF path must start with chapters/.");
  }
  const url = new URL(file, document.baseURI);
  const chaptersPath = new URL("chapters/", document.baseURI).pathname;
  if (url.origin !== window.location.origin || !url.pathname.startsWith(chaptersPath)) {
    throw new Error("A chapter PDF must be stored inside the local chapters/ folder.");
  }
  return url.href;
}

function validateChapterList(data) {
  if (!data || !Array.isArray(data.chapters)) {
    throw new Error('chapters.json must contain a "chapters" list.');
  }
  const seen = new Set();
  return data.chapters.map((item) => {
    const number = Number(item?.number);
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const file = typeof item?.file === "string" ? item.file.trim() : "";
    if (!Number.isInteger(number) || number < 1 || number > 114) {
      throw new Error("Every chapter needs a number from 1 to 114.");
    }
    if (!name) throw new Error(`Chapter ${number} needs a name.`);
    checkedFileUrl(file);
    if (seen.has(number)) throw new Error(`Chapter number ${number} is listed more than once.`);
    seen.add(number);
    return {
      id: String(number).padStart(3, "0"),
      number,
      name,
      arabicName: typeof item.arabicName === "string" ? item.arabicName.trim() : "",
      file
    };
  }).sort((a, b) => a.number - b.number);
}

function renderLibrary() {
  const query = $("#chapter-search").value.trim().toLocaleLowerCase();
  const focusedId = chapterList.querySelector(".chapter-button:focus")?.dataset.chapterId;
  const matches = chapters.filter((chapter) => `${chapter.name} ${chapter.arabicName} ${chapter.number}`.toLocaleLowerCase().includes(query));
  const fragment = document.createDocumentFragment();

  for (const chapter of matches) {
    const item = document.createElement("li");
    item.className = "chapter-item";
    const button = document.createElement("button");
    button.className = "chapter-button";
    button.type = "button";
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
    if (chapter.arabicName) {
      const arabic = document.createElement("span");
      arabic.className = "chapter-arabic";
      arabic.lang = "ar";
      arabic.dir = "rtl";
      arabic.textContent = chapter.arabicName;
      copy.append(arabic);
    }
    button.append(number, copy);
    button.addEventListener("click", () => openChapter(chapter));
    item.append(button);
    fragment.append(item);
  }

  chapterList.replaceChildren(fragment);
  $("#chapter-count").textContent = String(chapters.length);
  if (focusedId) chapterList.querySelector(`[data-chapter-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });

  if (!chapters.length) {
    setStatus(libraryStatus, "No chapters yet. Add a PDF and a matching entry to chapters.json.");
  } else if (query && !matches.length) {
    setStatus(libraryStatus, "No chapters match your search.");
  } else {
    setStatus(libraryStatus, `${matches.length} chapter${matches.length === 1 ? "" : "s"} available.`);
  }
}

async function loadChapters() {
  const response = await fetch(new URL("chapters.json", document.baseURI), { cache: "no-store" });
  if (!response.ok) throw new Error(`Chapter list returned HTTP ${response.status}.`);
  chapters = validateChapterList(await response.json());
  renderLibrary();
  if (!chapters.length) $("#empty-state").hidden = false;
}

function destroyCurrentPdf() {
  pdfGeneration += 1;
  pageObserver?.disconnect();
  pageObserver = null;
  if (currentPdf) {
    currentPdf.destroy().catch(() => {});
    currentPdf = null;
  }
  pagesContainer.replaceChildren();
  pagesContainer.scrollTop = 0;
  $("#previous-page").disabled = true;
  $("#next-page").disabled = true;
}

function setCurrentPage(number, total = currentPdf?.numPages || 0) {
  currentPage = Math.min(Math.max(1, number), Math.max(1, total));
  $("#page-number").value = String(currentPage);
  $("#page-total").textContent = `of ${total || "—"}`;
  $("#previous-page").disabled = !total || currentPage <= 1;
  $("#next-page").disabled = !total || currentPage >= total;
}

function scrollToPage(number) {
  const card = pagesContainer.querySelector(`[data-page-number="${number}"]`);
  if (!card) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  card.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
}

async function renderPage(card, doc, generation) {
  if (card.dataset.rendering === "true" || card.dataset.rendered === "true" || doc !== currentPdf) return;
  card.dataset.rendering = "true";
  const pageNumber = Number(card.dataset.pageNumber);
  try {
    const page = await doc.getPage(pageNumber);
    if (generation !== pdfGeneration || doc !== currentPdf) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(250, Math.min(pagesContainer.clientWidth - 24, 920));
    const cssScale = Math.min(availableWidth / baseViewport.width, 2);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: cssScale * pixelRatio });
    card.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;

    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas drawing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    card.querySelector(".page-skeleton")?.before(canvas);
    await page.render({ canvasContext: context, viewport }).promise;
    if (generation !== pdfGeneration || doc !== currentPdf) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
      return;
    }

    const textContent = await page.getTextContent();
    const readableText = textContent.items.map((item) => item.str || "").filter(Boolean).join(" ").trim();
    const screenReaderText = card.querySelector(".screen-reader-text");
    screenReaderText.lang = /[\u0600-\u06FF]/.test(readableText) ? "ar" : "en";
    screenReaderText.textContent = readableText || "No selectable text is available on this PDF page.";
    card.dataset.rendered = "true";
    card.classList.add("is-rendered");
  } catch (error) {
    console.error("PDF page could not be rendered.", error);
    const skeleton = card.querySelector(".page-skeleton");
    if (skeleton) skeleton.textContent = "This page could not be displayed. Scroll away and back to retry.";
  } finally {
    delete card.dataset.rendering;
  }
}

function releasePage(card) {
  if (card.dataset.rendered !== "true") return;
  const canvas = card.querySelector("canvas");
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.remove();
  }
  delete card.dataset.rendered;
  card.classList.remove("is-rendered");
}

function observePages(doc, generation) {
  pageObserver?.disconnect();
  pageObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target;
      if (entry.isIntersecting) {
        renderPage(card, doc, generation);
        if (entry.intersectionRatio >= 0.35) setCurrentPage(Number(card.dataset.pageNumber), doc.numPages);
      } else if (card.dataset.rendered === "true") {
        const cardRect = card.getBoundingClientRect();
        const rootRect = pagesContainer.getBoundingClientRect();
        if (cardRect.bottom < rootRect.top - 1500 || cardRect.top > rootRect.bottom + 1500) releasePage(card);
      }
    }
  }, { root: pagesContainer, rootMargin: "700px 0px", threshold: [0, 0.35] });
  pagesContainer.querySelectorAll(".pdf-page").forEach((card) => pageObserver.observe(card));
}

function createPageCard(pageNumber, total) {
  const card = document.createElement("article");
  card.className = "pdf-page";
  card.dataset.pageNumber = String(pageNumber);
  card.setAttribute("aria-label", `Page ${pageNumber} of ${total}`);
  const skeleton = document.createElement("div");
  skeleton.className = "page-skeleton";
  skeleton.textContent = `Preparing page ${pageNumber}…`;
  const text = document.createElement("div");
  text.className = "screen-reader-text";
  text.lang = "ar";
  text.dir = "auto";
  const caption = document.createElement("span");
  caption.className = "pdf-caption";
  caption.textContent = `${pageNumber} / ${total}`;
  card.append(skeleton, text, caption);
  return card;
}

async function openChapter(chapter) {
  currentChapter = chapter;
  $("#reader-title").textContent = chapter.name;
  $("#reader-subtitle").textContent = `Surah ${chapter.number} · Original chapter PDF`;
  $("#reader-toolbar").hidden = false;
  $("#empty-state").hidden = true;
  pagesContainer.hidden = false;
  renderLibrary();
  destroyCurrentPdf();
  const generation = pdfGeneration;
  setCurrentPage(1, 0);
  setStatus(readerStatus, "Opening the chapter PDF…");

  try {
    const pdfjs = await getPdfJs();
    const doc = await pdfjs.getDocument({ url: checkedFileUrl(chapter.file) }).promise;
    if (generation !== pdfGeneration) {
      doc.destroy().catch(() => {});
      return;
    }
    currentPdf = doc;
    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      fragment.append(createPageCard(pageNumber, doc.numPages));
    }
    pagesContainer.replaceChildren(fragment);
    setCurrentPage(1, doc.numPages);
    observePages(doc, generation);
    setStatus(readerStatus, `${chapter.name} is ready · ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}.` , "success");
    pagesContainer.focus({ preventScroll: true });
  } catch (error) {
    console.error("Chapter PDF could not be opened.", error);
    pagesContainer.replaceChildren();
    pagesContainer.hidden = true;
    $("#empty-state").hidden = false;
    $("#empty-state h3").textContent = "This chapter could not be opened";
    $("#empty-state p").textContent = "Check the PDF path in chapters.json and confirm that the file is present in the chapters/ folder.";
    setStatus(readerStatus, "The chapter PDF could not be loaded. Other chapters remain available.", "error");
  }
}

$("#theme-toggle").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
$("#chapter-search").addEventListener("input", renderLibrary);
$("#previous-page").addEventListener("click", () => { if (currentPage > 1) scrollToPage(currentPage - 1); });
$("#next-page").addEventListener("click", () => { if (currentPdf && currentPage < currentPdf.numPages) scrollToPage(currentPage + 1); });
$("#page-number").addEventListener("change", (event) => {
  if (!currentPdf) return;
  const target = Math.min(Math.max(1, Number(event.target.value) || 1), currentPdf.numPages);
  setCurrentPage(target, currentPdf.numPages);
  scrollToPage(target);
});
$("#fullscreen-toggle").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (readerPanel.requestFullscreen) await readerPanel.requestFullscreen();
    else setStatus(readerStatus, "Fullscreen is not available in this browser.", "error");
  } catch {
    setStatus(readerStatus, "Fullscreen could not be opened. You can continue reading here.", "error");
  }
});
document.addEventListener("fullscreenchange", () => {
  const active = document.fullscreenElement === readerPanel;
  $("#fullscreen-toggle").setAttribute("aria-pressed", String(active));
  $("#fullscreen-toggle span").textContent = active ? "Exit fullscreen" : "Fullscreen";
});
window.addEventListener("resize", () => {
  if (!currentPdf) return;
  pagesContainer.querySelectorAll('.pdf-page[data-rendered="true"]').forEach(releasePage);
  pagesContainer.querySelectorAll(".pdf-page").forEach((card) => {
    const rect = card.getBoundingClientRect();
    const root = pagesContainer.getBoundingClientRect();
    if (rect.bottom >= root.top - 700 && rect.top <= root.bottom + 700) renderPage(card, currentPdf, pdfGeneration);
  });
});

try {
  const savedTheme = localStorage.getItem("quran-reader-theme");
  setTheme(savedTheme || "dark");
} catch {
  setTheme("dark");
}

loadChapters().catch((error) => {
  console.error("Chapter list could not be loaded.", error);
  setStatus(libraryStatus, "The chapter list could not be loaded. Check chapters.json and refresh the page.", "error");
  setStatus(readerStatus, "The reader is available once the chapter list loads.", "error");
});

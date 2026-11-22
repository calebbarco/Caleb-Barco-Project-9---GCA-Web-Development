/* Get references to DOM elements */
const dirToggleBtn = document.getElementById("dirToggleBtn");
const dirToggleLabel = document.getElementById("dirToggleLabel");
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedBtn = document.getElementById("clearSelectedBtn");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

/* Modal DOM elements */
const productModal = document.getElementById("productModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalProductImage = document.getElementById("modalProductImage");
const modalProductMeta = document.getElementById("modalProductMeta");
const modalProductName = document.getElementById("modalProductName");
const modalProductDescription = document.getElementById("modalProductDescription");
const modalSelectBtn = document.getElementById("modalSelectBtn");

/* Keys used to save selected products and manual RTL preference in localStorage */
const STORAGE_KEY = "lorealSelectedProducts";
const DIR_STORAGE_KEY = "lorealTextDirection";

/*
 * Cloudflare Worker URL for static deployments (such as GitHub Pages).
 * GitHub Pages only serves static files and returns HTTP 405 on POST /api/chat.
 * Paste your class Cloudflare Worker URL here (e.g. "https://loreal-routine.your-subdomain.workers.dev/")
 * or set <meta name="openai-worker-url" content="..." /> in index.html.
 */
const CLOUDFLARE_WORKER_URL = "https://loreal-worker.cbarco21.workers.dev/";

/* Known RTL ISO 639 language codes and RTL script subtags */
const RTL_LANG_CODES = new Set([
  "ar", "arc", "azb", "bcc", "bgn", "bqi", "ckb", "dv", "fa",
  "glk", "he", "iw", "ji", "khw", "ks", "ku", "lrc", "mzn",
  "nqo", "pnb", "ps", "sd", "sdh", "syr", "ug", "ur", "yi",
]);
const RTL_SCRIPT_SUBTAGS = new Set([
  "arab", "hebr", "syrc", "thaa", "nkoo", "adlm", "mend", "rohg", "yezi",
]);
const LTR_SCRIPT_SUBTAGS = new Set(["latn", "cyrl"]);
const RTL_CHAR_PATTERN =
  /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;

/* Keep track of loaded products, selected products, and UI state */
let allProducts = [];
let selectedProducts = loadSavedProducts();
let activeModalProductId = null;
let lastFocusedElement = null;
let isSending = false;
let manualDirectionOverride = false;
let autoEngagedRtl = false;

/* Check whether a BCP-47 language tag (e.g. "ar-SA", "he", "ku-Arab") uses RTL */
function isRtlLanguageTag(langTag) {
  if (typeof langTag !== "string" || !langTag.trim()) return false;

  const normalized = langTag.trim().toLowerCase().replace(/_/g, "-");
  const subtags = normalized.split("-").filter(Boolean);
  const primaryLang = subtags[0];

  /* Respect explicit LTR script subtags such as ku-Latn or az-Cyrl */
  if (subtags.some((tag) => LTR_SCRIPT_SUBTAGS.has(tag))) {
    return false;
  }

  /* Match explicit RTL script subtags such as pa-Arab or uz-Arab */
  if (subtags.some((tag) => RTL_SCRIPT_SUBTAGS.has(tag))) {
    return true;
  }

  /* Use the standard Intl.Locale textInfo API when available */
  if (typeof Intl !== "undefined" && typeof Intl.Locale === "function") {
    try {
      const locale = new Intl.Locale(normalized);
      const textInfo =
        typeof locale.getTextInfo === "function"
          ? locale.getTextInfo()
          : locale.textInfo;
      if (textInfo && textInfo.direction) {
        return textInfo.direction === "rtl";
      }
    } catch {
      /* Fall back to language code lookup for non-standard tags */
    }
  }

  return RTL_LANG_CODES.has(primaryLang);
}

/* Check whether a string contains any RTL script characters */
function containsRtlCharacters(text) {
  return typeof text === "string" && RTL_CHAR_PATTERN.test(text);
}

/* Detect whether the user is currently using an RTL language */
function detectUserRtlLanguage() {
  const htmlEl = document.documentElement;

  /* 1. Google Translate or explicit RTL document class / lang attribute */
  if (htmlEl.classList.contains("translated-rtl")) {
    return true;
  }
  if (isRtlLanguageTag(htmlEl.lang)) {
    return true;
  }

  /* 2. Active browser / OS language preferences */
  const candidateLocales = [];
  if (typeof navigator !== "undefined") {
    if (navigator.language) candidateLocales.push(navigator.language);
    if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
      candidateLocales.push(navigator.languages[0]);
    }
    if (navigator.userLanguage) candidateLocales.push(navigator.userLanguage);
  }
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
      if (resolved) candidateLocales.push(resolved);
    } catch {
      /* Ignore environments where resolvedOptions throws */
    }
  }

  return candidateLocales.some((locale) => isRtlLanguageTag(locale));
}

/* Apply "ltr" or "rtl" direction to the document and update the toggle button */
function applyDirection(direction) {
  const normalizedDir = direction === "rtl" ? "rtl" : "ltr";
  const isRtl = normalizedDir === "rtl";

  document.documentElement.dir = normalizedDir;

  if (dirToggleBtn) {
    dirToggleBtn.setAttribute("aria-pressed", String(isRtl));
    dirToggleBtn.setAttribute(
      "aria-label",
      isRtl
        ? "Switch layout to left-to-right (LTR)"
        : "Switch layout to right-to-left (RTL)"
    );
  }

  if (dirToggleLabel) {
    dirToggleLabel.textContent = isRtl ? "LTR Mode" : "RTL Mode";
  }
}

/* Automatically engage RTL when an RTL language is detected */
function syncAutomaticDirection(allowRevertToLtr = false) {
  if (manualDirectionOverride) return;

  if (detectUserRtlLanguage()) {
    autoEngagedRtl = true;
    applyDirection("rtl");
    return;
  }

  if (allowRevertToLtr && autoEngagedRtl) {
    autoEngagedRtl = false;
    applyDirection("ltr");
  }
}

/* Initialize layout direction: automatic RTL detection first, then manual preference */
function initializeDirection() {
  const initialHtmlDir = document.documentElement.getAttribute("dir");

  if (detectUserRtlLanguage() || initialHtmlDir === "rtl") {
    autoEngagedRtl = true;
    applyDirection("rtl");
    return;
  }

  let savedDir = null;
  try {
    savedDir = localStorage.getItem(DIR_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not load text direction:", error);
  }

  applyDirection(savedDir === "rtl" ? "rtl" : "ltr");
}

initializeDirection();

/* Keep the manual RTL/LTR toggle button working while preserving automatic detection */
if (dirToggleBtn) {
  dirToggleBtn.addEventListener("click", () => {
    const nextDir = document.documentElement.dir === "rtl" ? "ltr" : "rtl";
    manualDirectionOverride = true;
    autoEngagedRtl = false;
    applyDirection(nextDir);

    try {
      if (nextDir === "rtl") {
        localStorage.setItem(DIR_STORAGE_KEY, "rtl");
      } else {
        localStorage.removeItem(DIR_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Could not update saved text direction:", error);
    }
  });
}

/* Re-check if the browser/OS language changes dynamically */
window.addEventListener("languagechange", () => {
  manualDirectionOverride = false;
  syncAutomaticDirection(true);
});

/* Automatically engage RTL if <html lang> or browser translation updates the page */
if (typeof MutationObserver === "function") {
  const htmlLangObserver = new MutationObserver(() => {
    manualDirectionOverride = false;
    syncAutomaticDirection(true);
  });

  htmlLangObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang", "class"],
  });
}

/* Engage RTL automatically if the user types right-to-left text in search or chat */
function handleRtlTextInput(event) {
  if (manualDirectionOverride) return;
  if (containsRtlCharacters(event.target.value)) {
    autoEngagedRtl = true;
    applyDirection("rtl");
  }
}

if (productSearch) {
  productSearch.addEventListener("input", handleRtlTextInput);
}
if (userInput) {
  userInput.addEventListener("input", handleRtlTextInput);
}

/* Store the full conversation history for OpenAI follow-up questions */
const conversationMessages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal skincare, haircare, makeup, and beauty advisor with real-time web search access. Use the JSON product details provided by the user along with current web information on L'Oréal products, ingredients, and routines to build clear, personalized, step-by-step routines and answer follow-up questions accurately with helpful links or citations.",
  },
];

/* Show initial placeholder until user selects a category or searches */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category or enter a keyword to view products
  </div>
`;

/* Show initial empty state in the Selected Products section */
renderSelectedProducts();

/* Show a welcoming prompt inside the chat window */
appendChatMessage(
  "assistant",
  'Select the products you want above and click "Generate Routine" to build your personalized routine.'
);

/* Load any previously saved products from localStorage */
function loadSavedProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "number" &&
        typeof item.name === "string" &&
        typeof item.brand === "string" &&
        typeof item.category === "string" &&
        typeof item.description === "string"
    );
  } catch (error) {
    console.warn("Could not load saved products:", error);
    return [];
  }
}

/* Save the current selectedProducts array to localStorage */
function saveSelectedProducts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProducts));
  } catch (error) {
    console.warn("Could not save selected products:", error);
  }
}

/* Load product data from JSON file */
async function loadProducts() {
  if (allProducts.length > 0) {
    return allProducts;
  }

  const response = await fetch("products.json");
  const data = await response.json();
  allProducts = data.products;
  return allProducts;
}

/* Check whether a product is currently in the selectedProducts array */
function isProductSelected(productId) {
  return selectedProducts.some((item) => item.id === productId);
}

/* Add or remove a product when the user clicks its card or modal CTA */
function toggleProductSelection(productId) {
  const alreadySelected = isProductSelected(productId);

  if (alreadySelected) {
    /* Remove the product from selectedProducts */
    selectedProducts = selectedProducts.filter((item) => item.id !== productId);
  } else {
    /* Find the full product object and add it to selectedProducts */
    const productToAdd = allProducts.find((item) => item.id === productId);
    if (productToAdd) {
      selectedProducts.push(productToAdd);
    }
  }

  /* Save to localStorage and refresh UI */
  saveSelectedProducts();
  updateProductCardStates();
  renderSelectedProducts();

  if (activeModalProductId === productId) {
    updateModalSelectButton(productId);
  }
}

/* Sync the visual selected state on every visible product card */
function updateProductCardStates() {
  const cards = productsContainer.querySelectorAll(".product-card");

  cards.forEach((card) => {
    const productId = Number(card.dataset.id);
    const selected = isProductSelected(productId);
    const selectTrigger = card.querySelector(".product-card-select");

    card.classList.toggle("selected", selected);
    if (selectTrigger) {
      selectTrigger.setAttribute("aria-pressed", String(selected));
    }
  });
}

/* Render the list of selected products with a remove button for each item */
function renderSelectedProducts() {
  clearSelectedBtn.hidden = selectedProducts.length === 0;
  selectedProductsList.replaceChildren();

  if (selectedProducts.length === 0) {
    const emptyText = document.createElement("p");
    emptyText.className = "selected-empty";
    emptyText.textContent =
      "No products selected yet. Click any product card above to add it to your routine.";
    selectedProductsList.appendChild(emptyText);
    return;
  }

  selectedProducts.forEach((product) => {
    const item = document.createElement("div");
    item.className = "selected-product-item";
    item.dataset.id = String(product.id);

    const meta = document.createElement("div");
    meta.className = "selected-product-meta";

    const nameEl = document.createElement("span");
    nameEl.className = "selected-product-name";
    nameEl.textContent = product.name;

    const brandEl = document.createElement("span");
    brandEl.className = "selected-product-brand";
    brandEl.textContent = product.brand;

    meta.appendChild(nameEl);
    meta.appendChild(brandEl);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-product-btn";
    removeBtn.dataset.id = String(product.id);
    removeBtn.setAttribute("aria-label", `Remove ${product.name}`);
    removeBtn.title = `Remove ${product.name}`;

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-xmark";
    icon.setAttribute("aria-hidden", "true");
    removeBtn.appendChild(icon);

    item.appendChild(meta);
    item.appendChild(removeBtn);
    selectedProductsList.appendChild(item);
  });
}

/* Update the modal's Add / Remove button text and style */
function updateModalSelectButton(productId) {
  const selected = isProductSelected(productId);
  modalSelectBtn.textContent = selected
    ? "Remove from Routine"
    : "Add to Routine";
  modalSelectBtn.classList.toggle("is-selected", selected);
}

/* Open the Product Details modal for the chosen product */
function openProductModal(productId) {
  const product = allProducts.find((item) => item.id === productId);
  if (!product) return;

  activeModalProductId = productId;
  lastFocusedElement = document.activeElement;

  /* Populate modal fields with product details */
  modalProductImage.src = product.image;
  modalProductImage.alt = product.name;
  modalProductMeta.textContent = `${product.brand} · ${product.category}`;
  modalProductName.textContent = product.name;
  modalProductDescription.dir = "auto";
  modalProductDescription.textContent = product.description;

  updateModalSelectButton(productId);

  /* Reveal modal and move keyboard focus to the close button */
  productModal.hidden = false;
  document.body.classList.add("modal-open");
  closeModalBtn.focus();
}

/* Close the Product Details modal and restore focus to the trigger button */
function closeProductModal() {
  if (productModal.hidden) return;

  productModal.hidden = true;
  document.body.classList.remove("modal-open");
  activeModalProductId = null;

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const selected = isProductSelected(product.id);

      return `
        <article
          class="product-card ${selected ? "selected" : ""}"
          data-id="${product.id}"
        >
          <div
            class="product-card-select"
            role="button"
            tabindex="0"
            aria-pressed="${selected}"
            aria-label="${product.name} by ${product.brand}. Click to ${
              selected ? "unselect" : "select"
            }."
          >
            <img src="${product.image}" alt="${product.name}">
            <div class="product-info">
              <h3>${product.name}</h3>
              <p>${product.brand}</p>
            </div>
          </div>

          <div class="product-card-footer">
            <button
              type="button"
              class="details-btn"
              data-id="${product.id}"
              aria-label="View details for ${product.name}"
            >
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
              View Details
            </button>
            <span class="selected-status">
              <i class="fa-solid fa-check" aria-hidden="true"></i> Selected
            </span>
          </div>
        </article>
      `;
    })
    .join("");
}

/* Handle clicks inside the product grid (Details button vs card selection) */
productsContainer.addEventListener("click", (e) => {
  const detailsBtn = e.target.closest(".details-btn");
  if (detailsBtn) {
    const productId = Number(detailsBtn.dataset.id);
    openProductModal(productId);
    return;
  }

  const card = e.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.id);
  toggleProductSelection(productId);
});

/* Allow keyboard users to toggle selection on a focused product card */
productsContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;

  const selectArea = e.target.closest(".product-card-select");
  if (!selectArea) return;

  e.preventDefault();
  const card = selectArea.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.id);
  toggleProductSelection(productId);
});

/* Handle clicks on remove buttons inside the Selected Products list */
selectedProductsList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest(".remove-product-btn");
  if (!removeBtn) return;

  const productId = Number(removeBtn.dataset.id);
  selectedProducts = selectedProducts.filter((item) => item.id !== productId);

  /* Save updated selections and refresh the list, grid, and modal CTA */
  saveSelectedProducts();
  renderSelectedProducts();
  updateProductCardStates();
  if (activeModalProductId === productId) {
    updateModalSelectButton(productId);
  }
});

/* Clear all selected products at once */
clearSelectedBtn.addEventListener("click", () => {
  selectedProducts = [];
  saveSelectedProducts();
  renderSelectedProducts();
  updateProductCardStates();

  if (activeModalProductId !== null) {
    updateModalSelectButton(activeModalProductId);
  }
});

/* Modal button and backdrop click handlers */
closeModalBtn.addEventListener("click", closeProductModal);

modalSelectBtn.addEventListener("click", () => {
  if (activeModalProductId !== null) {
    toggleProductSelection(activeModalProductId);
  }
});

productModal.addEventListener("click", (e) => {
  if (e.target === productModal) {
    closeProductModal();
  }
});

/* Close modal on Escape and trap Tab focus inside the open dialog */
document.addEventListener("keydown", (e) => {
  if (productModal.hidden) return;

  if (e.key === "Escape") {
    closeProductModal();
    return;
  }

  if (e.key === "Tab") {
    const focusableElements = [closeModalBtn, modalSelectBtn];
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
});

/* Filter products by both the active category and search keyword */
async function filterAndDisplayProducts() {
  const selectedCategory = categoryFilter.value;
  const searchQuery = productSearch.value.trim().toLowerCase();

  /* Show initial prompt if neither a category nor a search term is active */
  if (!selectedCategory && !searchQuery) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or enter a keyword to view products
      </div>
    `;
    return;
  }

  const products = await loadProducts();

  const filteredProducts = products.filter((product) => {
    const matchesCategory =
      !selectedCategory ||
      selectedCategory === "all" ||
      product.category === selectedCategory;

    const matchesKeyword =
      !searchQuery ||
      product.name.toLowerCase().includes(searchQuery) ||
      product.brand.toLowerCase().includes(searchQuery) ||
      product.category.toLowerCase().includes(searchQuery) ||
      product.description.toLowerCase().includes(searchQuery);

    return matchesCategory && matchesKeyword;
  });

  if (filteredProducts.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No matching products found. Try another keyword or category.
      </div>
    `;
    return;
  }

  displayProducts(filteredProducts);
}

/* Re-filter products when category changes or user types in the search field */
categoryFilter.addEventListener("change", filterAndDisplayProducts);
productSearch.addEventListener("input", filterAndDisplayProducts);

/* Validate that a URL uses http: or https: before turning it into a link */
function getSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

/* Safely append text with **bold** segments and clickable [label](url) or bare URLs */
function appendFormattedInlineText(parent, text) {
  const tokenPattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)<>]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(
        document.createTextNode(text.slice(lastIndex, match.index))
      );
    }

    const token = match[0];

    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      parent.appendChild(strong);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      const safeUrl = linkMatch ? getSafeHttpUrl(linkMatch[2]) : null;
      if (linkMatch && safeUrl) {
        const anchor = document.createElement("a");
        anchor.href = safeUrl;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "chat-inline-link";
        anchor.textContent = linkMatch[1];
        parent.appendChild(anchor);
      } else {
        parent.appendChild(document.createTextNode(token));
      }
    } else {
      const cleanedUrl = token.replace(/[.,;:!?]+$/, "");
      const trailingPunctuation = token.slice(cleanedUrl.length);
      const safeUrl = getSafeHttpUrl(cleanedUrl);

      if (safeUrl) {
        const anchor = document.createElement("a");
        anchor.href = safeUrl;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.className = "chat-inline-link";
        anchor.textContent = cleanedUrl;
        parent.appendChild(anchor);
        if (trailingPunctuation) {
          parent.appendChild(document.createTextNode(trailingPunctuation));
        }
      } else {
        parent.appendChild(document.createTextNode(token));
      }
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

/* Collect deduplicated citations from API annotations/citations or inline markdown links */
function collectMessageCitations(messageObj, replyText) {
  const seenUrls = new Set();
  const collected = [];

  function addCitation(rawUrl, rawTitle) {
    const safeUrl = getSafeHttpUrl(rawUrl);
    if (!safeUrl || seenUrls.has(safeUrl)) return;
    seenUrls.add(safeUrl);

    const title =
      typeof rawTitle === "string" && rawTitle.trim()
        ? rawTitle.trim()
        : new URL(safeUrl).hostname;

    collected.push({ title, url: safeUrl });
  }

  if (Array.isArray(messageObj?.citations)) {
    messageObj.citations.forEach((item) => addCitation(item?.url, item?.title));
  }

  if (Array.isArray(messageObj?.annotations)) {
    messageObj.annotations.forEach((ann) => {
      if (ann?.type === "url_citation") {
        const source = ann.url_citation || ann;
        addCitation(source?.url, source?.title);
      }
    });
  }

  const mdLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  while ((match = mdLinkPattern.exec(replyText)) !== null) {
    addCitation(match[2], match[1]);
  }

  return collected;
}

/* Render plain or markdown-like text safely into a chat message element */
function renderMessageContent(container, text) {
  const lines = text.split("\n");
  let activeList = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      activeList = null;
      return;
    }

    if (line.startsWith("### ") || line.startsWith("## ")) {
      activeList = null;
      const heading = document.createElement("h3");
      heading.className = "chat-heading";
      heading.dir = "auto";
      heading.textContent = line.replace(/^#{2,3}\s+/, "");
      container.appendChild(heading);
      return;
    }

    if (/^[-*]\s+/.test(line)) {
      if (!activeList || activeList.tagName !== "UL") {
        activeList = document.createElement("ul");
        activeList.className = "chat-list";
        container.appendChild(activeList);
      }
      const li = document.createElement("li");
      const liSpan = document.createElement("span");
      liSpan.className = "chat-list-text";
      liSpan.dir = "auto";
      appendFormattedInlineText(liSpan, line.replace(/^[-*]\s+/, ""));
      li.appendChild(liSpan);
      activeList.appendChild(li);
      return;
    }

    if (/^\d+\.\s+/.test(line)) {
      if (!activeList || activeList.tagName !== "OL") {
        activeList = document.createElement("ol");
        activeList.className = "chat-list";
        container.appendChild(activeList);
      }
      const li = document.createElement("li");
      const liSpan = document.createElement("span");
      liSpan.className = "chat-list-text";
      liSpan.dir = "auto";
      appendFormattedInlineText(liSpan, line.replace(/^\d+\.\s+/, ""));
      li.appendChild(liSpan);
      activeList.appendChild(li);
      return;
    }

    activeList = null;
    const paragraph = document.createElement("p");
    paragraph.dir = "auto";
    appendFormattedInlineText(paragraph, line);
    container.appendChild(paragraph);
  });
}

/* Add a styled chat bubble (and optional web search citations) to the chat window */
function appendChatMessage(sender, text, variant = "", citations = []) {
  if (!manualDirectionOverride && containsRtlCharacters(text)) {
    autoEngagedRtl = true;
    applyDirection("rtl");
  }

  const bubble = document.createElement("div");
  bubble.className = `chat-message ${sender} ${variant}`.trim();

  const label = document.createElement("span");
  label.className = "chat-sender";
  label.textContent = sender === "user" ? "You" : "L'Oréal Advisor";
  bubble.appendChild(label);

  const body = document.createElement("div");
  body.className = "chat-text";
  renderMessageContent(body, text);
  bubble.appendChild(body);

  if (Array.isArray(citations) && citations.length > 0) {
    const sourcesBox = document.createElement("div");
    sourcesBox.className = "chat-citations";

    const sourcesHeading = document.createElement("span");
    sourcesHeading.className = "chat-citations-title";
    sourcesHeading.textContent = "Sources";
    sourcesBox.appendChild(sourcesHeading);

    const sourcesList = document.createElement("ol");
    sourcesList.className = "chat-citations-list";

    citations.forEach((citation) => {
      const safeUrl = getSafeHttpUrl(citation.url);
      if (!safeUrl) return;

      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = safeUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = citation.title || safeUrl;
      li.appendChild(link);
      sourcesList.appendChild(li);
    });

    if (sourcesList.childElementCount > 0) {
      sourcesBox.appendChild(sourcesList);
      bubble.appendChild(sourcesBox);
    }
  }

  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return bubble;
}

/* Enable or disable request buttons while waiting for the API */
function setLoadingState(loading) {
  isSending = loading;
  generateRoutineBtn.disabled = loading;
  sendBtn.disabled = loading;
}

/* Determine which endpoint should receive chat/routine requests */
function getChatEndpoint() {
  if (CLOUDFLARE_WORKER_URL.trim()) {
    return CLOUDFLARE_WORKER_URL.trim();
  }

  const metaWorkerUrl = document
    .querySelector('meta[name="openai-worker-url"]')
    ?.getAttribute("content")
    ?.trim();
  if (metaWorkerUrl) {
    return metaWorkerUrl;
  }

  return "/api/chat";
}

/* Check if the app is running on static hosting that cannot handle POST /api/chat */
function isStaticHostingEnvironment() {
  const { hostname, protocol } = window.location;
  return protocol === "file:" || hostname.endsWith(".github.io");
}

/* Build a clear setup message when a static host (like GitHub Pages) has no backend */
function getStaticHostSetupMessage() {
  return 'GitHub Pages hosts static files only and cannot run the local "/api/chat" server (which causes HTTP 405). To enable the AI chatbot on GitHub Pages, set CLOUDFLARE_WORKER_URL in script.js (or <meta name="openai-worker-url"> in index.html) to your HTTPS Cloudflare Worker URL.';
}

/* Send the conversation history to our backend or Cloudflare Worker endpoint */
async function requestRoutineReply(displayText, apiUserContent, loadingText) {
  if (isSending) return;

  const endpoint = getChatEndpoint();

  appendChatMessage("user", displayText);

  /* Avoid sending a doomed POST /api/chat on GitHub Pages if no Worker URL is set */
  if (endpoint === "/api/chat" && isStaticHostingEnvironment()) {
    appendChatMessage("assistant", getStaticHostSetupMessage(), "is-notice");
    return;
  }

  const loadingBubble = appendChatMessage("assistant", loadingText, "is-loading");
  setLoadingState(true);

  const nextMessages = [
    ...conversationMessages,
    { role: "user", content: apiUserContent },
  ];

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-search-preview",
        messages: nextMessages,
      }),
    });

    if (response.status === 405 && endpoint === "/api/chat") {
      throw new Error(getStaticHostSetupMessage());
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMessage =
        typeof data?.error === "string"
          ? data.error
          : data?.error?.message ||
            `Request failed with status ${response.status}.`;
      throw new Error(errorMessage);
    }

    const messageObj = data?.choices?.[0]?.message;
    const reply = messageObj?.content;
    if (!reply) {
      throw new Error("No routine response was returned.");
    }

    const citations = collectMessageCitations(messageObj, reply);

    /* Save both the user message and AI reply so follow-up questions keep context */
    conversationMessages.push({ role: "user", content: apiUserContent });
    conversationMessages.push({ role: "assistant", content: reply });

    loadingBubble.remove();
    appendChatMessage("assistant", reply, "", citations);
  } catch (error) {
    loadingBubble.remove();
    appendChatMessage("assistant", error.message, "is-error");
  } finally {
    setLoadingState(false);
  }
}

/* Generate Routine button handler: collect selected products and call OpenAI */
generateRoutineBtn.addEventListener("click", async () => {
  if (selectedProducts.length === 0) {
    appendChatMessage(
      "assistant",
      "Please select at least one product from the grid above before generating a routine.",
      "is-notice"
    );
    chatWindow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  /* Collect only the selected products and their key JSON details */
  const selectedProductsData = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  const selectedNames = selectedProductsData.map((item) => item.name).join(", ");
  const displayPrompt = `Generate a routine using my selected products: ${selectedNames}`;
  const apiPrompt = `Build a personalized step-by-step routine using only these selected L'Oréal products (provided as JSON):\n\n${JSON.stringify(
    selectedProductsData,
    null,
    2
  )}`;

  chatWindow.scrollIntoView({ behavior: "smooth", block: "nearest" });
  await requestRoutineReply(
    displayPrompt,
    apiPrompt,
    "Creating your personalized L'Oréal routine…"
  );
});

/* Chat form submission handler for follow-up questions */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const question = userInput.value.trim();
  if (!question || isSending) return;

  userInput.value = "";
  await requestRoutineReply(question, question, "Thinking…");
});

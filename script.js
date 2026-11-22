/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
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

/* Key used to save selected products in localStorage */
const STORAGE_KEY = "lorealSelectedProducts";

/* Keep track of loaded products, selected products, and active modal state */
let allProducts = [];
let selectedProducts = loadSavedProducts();
let activeModalProductId = null;
let lastFocusedElement = null;
let isSending = false;

/* Store the full conversation history for OpenAI follow-up questions */
const conversationMessages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal skincare, haircare, makeup, and beauty advisor. Use the JSON product details provided by the user to build a clear, personalized, step-by-step routine (explaining the order and purpose of each product) and answer any follow-up questions accurately.",
  },
];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
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

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Safely append text with **bold** inline segments using textContent (no raw HTML) */
function appendFormattedInlineText(parent, text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  parts.forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else if (part) {
      parent.appendChild(document.createTextNode(part));
    }
  });
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
      appendFormattedInlineText(li, line.replace(/^[-*]\s+/, ""));
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
      appendFormattedInlineText(li, line.replace(/^\d+\.\s+/, ""));
      activeList.appendChild(li);
      return;
    }

    activeList = null;
    const paragraph = document.createElement("p");
    appendFormattedInlineText(paragraph, line);
    container.appendChild(paragraph);
  });
}

/* Add a styled chat bubble to the chat window */
function appendChatMessage(sender, text, variant = "") {
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

/* Send the conversation history to our backend OpenAI endpoint and display the reply */
async function requestRoutineReply(displayText, apiUserContent, loadingText) {
  if (isSending) return;

  appendChatMessage("user", displayText);
  const loadingBubble = appendChatMessage("assistant", loadingText, "is-loading");
  setLoadingState(true);

  const nextMessages = [
    ...conversationMessages,
    { role: "user", content: apiUserContent },
  ];

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: nextMessages,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.error || `Request failed with status ${response.status}.`
      );
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error("No routine response was returned.");
    }

    /* Save both the user message and AI reply so follow-up questions keep context */
    conversationMessages.push({ role: "user", content: apiUserContent });
    conversationMessages.push({ role: "assistant", content: reply });

    loadingBubble.remove();
    appendChatMessage("assistant", reply);
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

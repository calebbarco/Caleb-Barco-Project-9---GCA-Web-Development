/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* Modal DOM elements */
const productModal = document.getElementById("productModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalProductImage = document.getElementById("modalProductImage");
const modalProductMeta = document.getElementById("modalProductMeta");
const modalProductName = document.getElementById("modalProductName");
const modalProductDescription = document.getElementById("modalProductDescription");
const modalSelectBtn = document.getElementById("modalSelectBtn");

/* Keep track of loaded products, selected products, and active modal state */
let allProducts = [];
let selectedProducts = [];
let activeModalProductId = null;
let lastFocusedElement = null;

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Show initial empty state in the Selected Products section */
renderSelectedProducts();

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

  /* Update the card highlight, Selected Products list, and modal button if open */
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
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-empty">
        No products selected yet. Click any product card above to add it to your routine.
      </p>
    `;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-product-item" data-id="${product.id}">
        <div class="selected-product-meta">
          <span class="selected-product-name">${product.name}</span>
          <span class="selected-product-brand">${product.brand}</span>
        </div>
        <button
          type="button"
          class="remove-product-btn"
          data-id="${product.id}"
          aria-label="Remove ${product.name}"
          title="Remove ${product.name}"
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    `
    )
    .join("");
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

  /* Refresh the Selected Products list, product grid, and modal CTA if open */
  renderSelectedProducts();
  updateProductCardStates();
  if (activeModalProductId === productId) {
    updateModalSelectButton(productId);
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

/* Chat form submission handler - placeholder for OpenAI integration */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});

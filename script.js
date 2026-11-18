/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

/* Keep track of all loaded products and currently selected products */
let allProducts = [];
let selectedProducts = [];

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

/* Add or remove a product when the user clicks its card */
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

  /* Update the card highlight in the grid and refresh the Selected Products list */
  updateProductCardStates();
  renderSelectedProducts();
}

/* Sync the visual selected state on every visible product card */
function updateProductCardStates() {
  const cards = productsContainer.querySelectorAll(".product-card");

  cards.forEach((card) => {
    const productId = Number(card.dataset.id);
    const selected = isProductSelected(productId);

    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
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

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const selected = isProductSelected(product.id);

      return `
        <div
          class="product-card ${selected ? "selected" : ""}"
          data-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${selected}"
        >
          <img src="${product.image}" alt="${product.name}">
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
            <span class="selected-status">
              <i class="fa-solid fa-check" aria-hidden="true"></i> Selected
            </span>
          </div>
        </div>
      `;
    })
    .join("");
}

/* Handle clicks on product cards to select or unselect them */
productsContainer.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.id);
  toggleProductSelection(productId);
});

/* Allow keyboard users to select or unselect product cards with Enter or Space */
productsContainer.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;

  const card = e.target.closest(".product-card");
  if (!card) return;

  e.preventDefault();
  const productId = Number(card.dataset.id);
  toggleProductSelection(productId);
});

/* Handle clicks on remove buttons inside the Selected Products list */
selectedProductsList.addEventListener("click", (e) => {
  const removeBtn = e.target.closest(".remove-product-btn");
  if (!removeBtn) return;

  const productId = Number(removeBtn.dataset.id);
  selectedProducts = selectedProducts.filter((item) => item.id !== productId);

  /* Refresh both the Selected Products list and the visible product grid */
  renderSelectedProducts();
  updateProductCardStates();
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

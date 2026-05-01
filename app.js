// Default Inventory State
const defaultInventory = {
  shirts: {
    price: 30,
    sizes: {
      S: { total: 20, rented: 0 },
      M: { total: 30, rented: 0 },
      L: { total: 40, rented: 0 },
      XL: { total: 20, rented: 0 },
      XXL: { total: 10, rented: 0 }
    }
  },
  trousers: {
    price: 30,
    sizes: {
      S: { total: 20, rented: 0 },
      M: { total: 30, rented: 0 },
      L: { total: 40, rented: 0 },
      XL: { total: 20, rented: 0 },
      XXL: { total: 10, rented: 0 }
    }
  }
};

// --- Storage Utilities ---
function getInventory() {
  const stored = localStorage.getItem('sr_inventory');
  if (stored) {
    return JSON.parse(stored);
  }
  // Initialize if empty
  saveInventory(defaultInventory);
  return defaultInventory;
}

function saveInventory(inventory) {
  localStorage.setItem('sr_inventory', JSON.stringify(inventory));
}

// --- Cart State ---
let cart = {
  shirts: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 },
  trousers: { S: 0, M: 0, L: 0, XL: 0, XXL: 0 }
};

// --- Client UI Functions (index.html) ---

function renderCatalog() {
  const inventory = getInventory();
  renderProductSizes('shirts', 'shirts-container', inventory.shirts);
  renderProductSizes('trousers', 'trousers-container', inventory.trousers);
  updateCartSummary();
}

function renderProductSizes(type, containerId, productData) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.keys(productData.sizes).forEach(size => {
    const sizeData = productData.sizes[size];
    const available = sizeData.total - sizeData.rented;
    const isOutOfStock = available <= 0;
    
    const sizeRow = document.createElement('div');
    sizeRow.className = 'size-selector';
    
    sizeRow.innerHTML = `
      <span class="size-label">${size}</span>
      <span class="size-stock ${isOutOfStock ? 'stock-warning' : ''}">${available} left</span>
      <div style="display:flex; align-items:center; gap:0.5rem;">
        <button type="button" class="btn btn-small btn-outline" onclick="updateCart('${type}', '${size}', -1)">-</button>
        <span id="qty-${type}-${size}" style="width:20px; text-align:center; font-weight:bold;">${cart[type][size]}</span>
        <button type="button" class="btn btn-small btn-primary" onclick="updateCart('${type}', '${size}', 1)" ${isOutOfStock ? 'disabled' : ''}>+</button>
      </div>
    `;
    
    container.appendChild(sizeRow);
  });
}

function updateCart(type, size, change) {
  const inventory = getInventory();
  const available = inventory[type].sizes[size].total - inventory[type].sizes[size].rented;
  
  let newQty = cart[type][size] + change;
  if (newQty < 0) newQty = 0;
  if (newQty > available) {
    alert(`Only ${available} ${type} in size ${size} are available.`);
    newQty = available;
  }
  
  cart[type][size] = newQty;
  document.getElementById(`qty-${type}-${size}`).innerText = newQty;
  updateCartSummary();
}

function updateCartSummary() {
  const summaryContainer = document.getElementById('cart-items');
  if (!summaryContainer) return;
  
  summaryContainer.innerHTML = '';
  let totalCost = 0;
  let totalItems = 0;
  
  // Calculate Combos (1 shirt + 1 trouser = 60 Rs, but individual are 30 Rs each anyway, so math is same, but let's show it cleanly)
  
  const addItemsToSummary = (type) => {
    Object.keys(cart[type]).forEach(size => {
      const qty = cart[type][size];
      if (qty > 0) {
        totalItems += qty;
        const itemCost = qty * 30; // 30 Rs per item
        totalCost += itemCost;
        
        const itemRow = document.createElement('div');
        itemRow.className = 'cart-item';
        itemRow.innerHTML = `
          <span>${type.charAt(0).toUpperCase() + type.slice(1)} (${size}) x ${qty}</span>
          <span>₹${itemCost}</span>
        `;
        summaryContainer.appendChild(itemRow);
      }
    });
  };
  
  addItemsToSummary('shirts');
  addItemsToSummary('trousers');
  
  if (totalItems === 0) {
    summaryContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">No items selected yet.</p>';
  }
  
  document.getElementById('cart-total-price').innerText = `₹${totalCost}`;
}

function handleWhatsAppBooking(e) {
  e.preventDefault();
  
  const eventDate = document.getElementById('event-date').value;
  const returnDate = document.getElementById('return-date').value;
  const clientName = document.getElementById('client-name').value;
  
  if (!eventDate || !returnDate || !clientName) {
    alert("Please fill in all booking details.");
    return;
  }
  
  let totalItems = 0;
  let orderDetails = "";
  
  const buildDetails = (type) => {
    let typeStr = "";
    Object.keys(cart[type]).forEach(size => {
      if (cart[type][size] > 0) {
        typeStr += `- ${size}: ${cart[type][size]} pcs\n`;
        totalItems += cart[type][size];
      }
    });
    if (typeStr) {
      orderDetails += `*${type.charAt(0).toUpperCase() + type.slice(1)}:*\n${typeStr}`;
    }
  };
  
  buildDetails('shirts');
  buildDetails('trousers');
  
  if (totalItems === 0) {
    alert("Please select at least one item to book.");
    return;
  }
  
  const totalCost = totalItems * 30;
  
  let message = `*New Booking Request - S.R Uniform Rentals*\n\n`;
  message += `*Client:* ${clientName}\n`;
  message += `*Event Date:* ${eventDate}\n`;
  message += `*Return Date:* ${returnDate}\n\n`;
  message += `*Order Details:*\n${orderDetails}\n`;
  message += `*Total Estimated Cost:* ₹${totalCost}\n\n`;
  message += `Please confirm availability.`;
  
  const encodedMessage = encodeURIComponent(message);
  const phoneNumber = "910000000000"; // Placeholder
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
  
  window.open(whatsappUrl, '_blank');
}


// --- Admin UI Functions (admin.html) ---

function renderAdminDashboard() {
  const inventory = getInventory();
  renderAdminTable('shirts', 'admin-shirts-body', inventory.shirts);
  renderAdminTable('trousers', 'admin-trousers-body', inventory.trousers);
  updateAdminStats(inventory);
}

function renderAdminTable(type, tbodyId, productData) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  Object.keys(productData.sizes).forEach(size => {
    const data = productData.sizes[size];
    const available = data.total - data.rented;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${size}</strong></td>
      <td>${data.total}</td>
      <td><span class="status-badge status-available">${available}</span></td>
      <td><span class="status-badge status-rented">${data.rented}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-small btn-outline" onclick="adminUpdateStock('${type}', '${size}', 'rent', 1)">Rent 1</button>
          <button class="btn btn-small btn-primary" onclick="adminUpdateStock('${type}', '${size}', 'return', 1)">Return 1</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adminUpdateStock(type, size, action, qty) {
  const inventory = getInventory();
  const sizeData = inventory[type].sizes[size];
  
  if (action === 'rent') {
    if (sizeData.rented + qty <= sizeData.total) {
      sizeData.rented += qty;
    } else {
      alert("Cannot rent more than total stock!");
    }
  } else if (action === 'return') {
    if (sizeData.rented - qty >= 0) {
      sizeData.rented -= qty;
    } else {
      alert("Rented amount cannot be negative!");
    }
  }
  
  saveInventory(inventory);
  renderAdminDashboard();
}

function updateAdminStats(inventory) {
  const totalItemsEl = document.getElementById('stat-total');
  const rentedItemsEl = document.getElementById('stat-rented');
  const availableItemsEl = document.getElementById('stat-available');
  
  if (!totalItemsEl) return;
  
  let total = 0;
  let rented = 0;
  
  ['shirts', 'trousers'].forEach(type => {
    Object.keys(inventory[type].sizes).forEach(size => {
      total += inventory[type].sizes[size].total;
      rented += inventory[type].sizes[size].rented;
    });
  });
  
  totalItemsEl.innerText = total;
  rentedItemsEl.innerText = rented;
  availableItemsEl.innerText = total - rented;
}

// Reset data helper (for testing)
function resetInventory() {
  if (confirm("Are you sure you want to reset all inventory data?")) {
    saveInventory(defaultInventory);
    renderAdminDashboard();
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Check which page we are on
  if (document.getElementById('catalog-form')) {
    renderCatalog();
    document.getElementById('catalog-form').addEventListener('submit', handleWhatsAppBooking);
  } else if (document.getElementById('admin-dashboard')) {
    renderAdminDashboard();
  }
  
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      }).catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
    });
  }
});

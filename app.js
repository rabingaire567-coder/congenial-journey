/* AI Business Suite - all-in-one AI-integrated business platform */
(function () {
  "use strict";

  const LS_KEY = "aiBusinessSuite_v1";
  const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  const GEMINI_ACTION = ":generateContent";

  /* ---------------- State ---------------- */
  const defaultState = {
    settings: { bizName: "My Business", tagline: "Your trusted local business", currency: "$", phone: "", email: "", address: "", apiKey: "", model: "gemini-2.0-flash", provider: "gemini", nvidiaKey: "", nvidiaModel: "meta/llama-3.1-8b-instruct" },
    products: [],
    orders: [],
    services: [],
    appointments: [],
    customers: [],
    leads: [],
    sales: [],
    stockLog: []
  };

  let state = load();

  (function autoProvision() {
    try {
      const q = new URLSearchParams(location.search);
      const nvid = q.get("nvid");
      const nm = q.get("nm");
      if (nvid) {
        state.settings.nvidiaKey = nvid;
        state.settings.provider = "nvidia";
        state.settings.nvidiaModel = nm || state.settings.nvidiaModel || "meta/llama-3.1-8b-instruct";
        save();
        history.replaceState(null, "", location.pathname);
      }
    } catch (e) { /* ignore */ }
  })();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      const s = JSON.parse(raw);
      return Object.assign(JSON.parse(JSON.stringify(defaultState)), s);
    } catch (e) { return JSON.parse(JSON.stringify(defaultState)); }
  }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  function uid() { return "ID" + Math.random().toString(36).slice(2, 8).toUpperCase(); }
  function fmt(n) { return state.settings.currency + Number(n || 0).toFixed(2); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function money(n) { return state.settings.currency + Number(n || 0).toFixed(2); }

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------------- Modal ---------------- */
  function openModal(html) {
    const m = document.getElementById("modal");
    document.getElementById("modalContent").innerHTML = html;
    m.style.display = "grid";
  }
  function closeModal() { document.getElementById("modal").style.display = "none"; }
  function modalInputs() {
    const data = {};
    document.querySelectorAll("#modalContent [data-k]").forEach(el => { data[el.getAttribute("data-k")] = el.value.trim(); });
    return data;
  }

  /* ---------------- Navigation ---------------- */
  const titles = {
    dashboard: ["Dashboard", "Overview of your business"],
    store: ["Store", "Products and customer cart"],
    orders: ["Orders", "Manage all incoming orders"],
    booking: ["Booking", "Services and appointments"],
    crm: ["CRM", "Customers and leads pipeline"],
    inventory: ["Inventory / POS", "Stock control and point of sale"],
    landing: ["Landing Page", "Customer-facing page with AI chatbot"],
    ai: ["AI Tools", "AI content generator & assistant"],
    settings: ["Settings", "Business info, AI key, data"]
  };
  function navigate(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + view).classList.add("active");
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === view));
    document.getElementById("pageTitle").textContent = titles[view][0];
    document.getElementById("pageSubtitle").textContent = titles[view][1];
  }
  document.querySelectorAll(".nav-item").forEach(n => n.addEventListener("click", () => {
    navigate(n.dataset.view); renderAll();
  }));

  /* ---------------- AI: Gemini ---------------- */
  function activeKey() {
    return state.settings.provider === "nvidia" ? state.settings.nvidiaKey : state.settings.apiKey;
  }
  async function callGemini(prompt, system) {
    const key = activeKey();
    if (!key) throw new Error("NO_KEY");
    if ((state.settings.provider || "gemini") === "nvidia") return callNvidia(prompt, system);
    const model = state.settings.model || "gemini-2.0-flash";
    const parts = [];
    if (system) parts.push({ text: system });
    parts.push({ text: prompt });
    const res = await fetch(GEMINI_BASE + model + GEMINI_ACTION + "?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error("HTTP " + res.status + ": " + errText.slice(0, 200));
    }
    const data = await res.json();
    const out = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts)
      ? data.candidates[0].content.parts.map(p => p.text || "").join("")
      : "No response received.";
    return out;
  }

  async function callNvidia(prompt, system) {
    const model = state.settings.nvidiaModel || "meta/llama-3.3-70b-instruct";
    const messages = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const isHttp = location.protocol === "http:" || location.protocol === "https:";
    if (isHttp) {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: activeKey(), model: model, messages: messages })
      });
      if (!res.ok) throw new Error("HTTP " + res.status + ": " + (await res.text()).slice(0, 200));
      const data = await res.json();
      const out = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : "No response received.";
      return out;
    }
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + activeKey()
      },
      body: JSON.stringify({ model: model, messages: messages, max_tokens: 1024, temperature: 0.7 })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error("HTTP " + res.status + ": " + errText.slice(0, 200));
    }
    const data = await res.json();
    const out = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ? data.choices[0].message.content : "No response received.";
    return out;
  }

  function businessContext() {
    const p = state.products.slice(0, 40).map(x => `- ${x.name} (${money(x.price)}), stock ${x.stock}`).join("\n");
    const sv = state.services.slice(0, 40).map(x => `- ${x.name} (${x.duration}min, ${money(x.price)})`).join("\n");
    return [
      "BUSINESS PROFILE",
      "Name: " + state.settings.bizName,
      "Tagline: " + state.settings.tagline,
      "Phone: " + state.settings.phone + " | Email: " + state.settings.email + " | Address: " + state.settings.address,
      "",
      "PRODUCTS (" + state.products.length + "):",
      p || "- none",
      "",
      "SERVICES (" + state.services.length + "):",
      sv || "- none",
      "",
      "CUSTOMERS (" + state.customers.length + "): " + state.customers.slice(0, 20).map(c => c.name).join(", ") || "- none",
      "OPEN ORDERS: " + state.orders.filter(o => o.status !== "Delivered" && o.status !== "Cancelled").length,
      "UPCOMING APPOINTMENTS: " + state.appointments.filter(a => a.status === "Upcoming").length,
      "LOW STOCK ITEMS: " + state.products.filter(x => x.stock <= x.lowThreshold).map(x => x.name).join(", ") || "none"
    ].join("\n");
  }

  function aiStatusBar() {
    const ok = !!activeKey();
    const p = state.settings.provider === "nvidia" ? "NVIDIA" : "Gemini";
    const model = state.settings.provider === "nvidia" ? (state.settings.nvidiaModel || "llama-3.3-70b") : (state.settings.model || "gemini-2.0-flash");
    document.getElementById("aiStatusDot").classList.toggle("ok", ok);
    document.getElementById("aiStatusText").textContent = ok ? "AI: " + p + " · " + model : "AI: not configured";
  }

  /* ---------------- Dashboard ---------------- */
  function renderDashboard() {
    const totalRevenue = state.orders.filter(o => o.status !== "Cancelled").reduce((a, o) => a + o.total, 0);
    const stockValue = state.products.reduce((a, p) => a + p.price * p.stock, 0);
    const lowStock = state.products.filter(p => p.stock <= p.lowThreshold).length;
    const cards = [
      ["Revenue", money(totalRevenue), state.orders.length + " orders"],
      ["Products", state.products.length, stockValue > 0 ? "Stock value " + money(stockValue) : ""],
      ["Customers", state.customers.length, state.leads.length + " leads"],
      ["Appointments", state.appointments.length, state.appointments.filter(a => a.status === "Upcoming").length + " upcoming"],
      ["Low Stock Items", lowStock, lowStock ? "Reorder soon" : "All good"],
      ["Sales Today", state.sales.filter(s => isToday(s.date)).length, money(state.sales.filter(s => isToday(s.date)).reduce((a, s) => a + s.total, 0))]
    ];
    document.getElementById("statsGrid").innerHTML = cards.map(c =>
      `<div class="stat"><div class="stat-label">${c[0]}</div><div class="stat-value">${c[1]}</div><div class="stat-sub">${c[2]}</div></div>`
    ).join("");
    const ro = state.orders.slice(-6).reverse();
    document.getElementById("dashRecentOrders").innerHTML = ro.length ? (
      `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead><tbody>` +
      ro.map(o => `<tr><td>${esc(o.id)}</td><td>${esc(o.customer)}</td><td>${money(o.total)}</td><td>${statusBadge(o.status)}</td></tr>`).join("") +
      `</tbody></table></div>`
    ) : `<div class="empty">No orders yet — create products in Store and checkout.</div>`;
    const ub = state.appointments.filter(a => a.status === "Upcoming").slice(0, 6);
    document.getElementById("dashUpcomingBookings").innerHTML = ub.length ? (
      `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Service</th><th>When</th></tr></thead><tbody>` +
      ub.map(a => `<tr><td>${esc(a.customer)}</td><td>${esc(a.service)}</td><td>${esc(a.date)}</td></tr>`).join("") +
      `</tbody></table></div>`
    ) : `<div class="empty">No upcoming appointments.</div>`;
  }
  function isToday(d) { try { return new Date(d).toDateString() === new Date().toDateString(); } catch (e) { return false; } }
  function statusBadge(s) {
    const map = { Delivered: "badge-green", Paid: "badge-green", Pending: "badge-amber", "In Progress": "badge-blue", Cancelled: "badge-red", Upcoming: "badge-blue", Completed: "badge-green" };
    const cls = map[s] || "badge-gray";
    return `<span class="badge ${cls}">${esc(s)}</span>`;
  }

  /* ---------------- Store ---------------- */
  function renderStore() {
    const tbody = document.getElementById("productsTable");
    tbody.innerHTML = state.products.length ? state.products.map(p => `
      <tr>
        <td><b>${esc(p.name)}</b>${p.description ? `<div class="muted">${esc(p.description)}</div>` : ""}</td>
        <td>${money(p.price)}</td>
        <td>${esc(p.category || "-")}</td>
        <td>${p.stock} ${p.stock <= p.lowThreshold ? `<span class="badge badge-red">LOW</span>` : ""}</td>
        <td>
          <button class="btn btn-sm" data-act="addCart" data-id="${p.id}">Add to cart</button>
          <button class="btn btn-sm" data-act="editProd" data-id="${p.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-act="delProd" data-id="${p.id}">✕</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="5"><div class="empty">No products yet. Click "+ Add Product".</div></td></tr>`;
    renderCart();
  }
  function renderCart() {
    const items = state.cart || [];
    const el = document.getElementById("cartItems");
    el.innerHTML = items.length ? items.map((it, i) => `
      <div class="cart-item">
        <span>${esc(it.name)} × ${it.qty}</span>
        <span>${money(it.price * it.qty)} <button class="btn btn-sm btn-danger" data-act="rmCart" data-i="${i}">✕</button></span>
      </div>`).join("") : `<div class="empty">Cart is empty.</div>`;
    const total = items.reduce((a, it) => a + it.price * it.qty, 0);
    document.getElementById("btnCheckout").textContent = `Checkout (${items.reduce((a, it) => a + it.qty, 0)} items · ${money(total)})`;
  }
  function productForm(prod) {
    const p = prod || { name: "", price: "", category: "", stock: "", lowThreshold: 5, description: "" };
    openModal(`
      <h3>${prod ? "Edit Product" : "Add Product"}</h3>
      <label>Name</label><input data-k="name" value="${esc(p.name)}" placeholder="Product name">
      <label>Price</label><input data-k="price" type="number" value="${esc(p.price)}" placeholder="0.00">
      <label>Category</label><input data-k="category" value="${esc(p.category)}" placeholder="e.g. Electronics">
      <label>Stock quantity</label><input data-k="stock" type="number" value="${esc(p.stock)}" placeholder="0">
      <label>Low-stock threshold</label><input data-k="lowThreshold" type="number" value="${esc(p.lowThreshold)}">
      <label>Description</label><textarea data-k="description" rows="3" placeholder="Short description">${esc(p.description)}</textarea>
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="saveProdBtn">${prod ? "Save" : "Add"}</button></div>
    `);
    document.getElementById("saveProdBtn").onclick = () => {
      const d = modalInputs();
      if (!d.name || !d.price) return toast("Name and price required");
      if (prod) {
        const t = state.products.find(x => x.id === prod.id);
        if (t) { Object.assign(t, d, { price: +d.price, stock: +d.stock, lowThreshold: +d.lowThreshold || 5 }); }
      } else {
        state.products.push({ id: uid(), name: d.name, price: +d.price, category: d.category, stock: +d.stock || 0, lowThreshold: +d.lowThreshold || 5, description: d.description });
      }
      save(); closeModal(); renderStore(); toast("Product saved"); updateAiStatus();
    };
  }

  /* ---------------- Orders ---------------- */
  function renderOrders() {
    const tbody = document.getElementById("ordersTable");
    tbody.innerHTML = state.orders.length ? state.orders.slice().reverse().map(o => `
      <tr>
        <td>${esc(o.id)}</td>
        <td>${esc(o.customer)}</td>
        <td>${o.items.map(i => `${esc(i.name)}×${i.qty}`).join(", ")}</td>
        <td>${money(o.total)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>
          <button class="btn btn-sm" data-act="setOrder" data-id="${o.id}" data-status="Paid">Paid</button>
          <button class="btn btn-sm" data-act="setOrder" data-id="${o.id}" data-status="Delivered">Delivered</button>
          <button class="btn btn-sm btn-danger" data-act="setOrder" data-id="${o.id}" data-status="Cancelled">Cancel</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="6"><div class="empty">No orders yet.</div></td></tr>`;
  }

  /* ---------------- Booking ---------------- */
  function renderBooking() {
    const st = document.getElementById("servicesTable");
    st.innerHTML = state.services.length ? state.services.map(s => `
      <tr><td><b>${esc(s.name)}</b></td><td>${s.duration} min</td><td>${money(s.price)}</td>
        <td><button class="btn btn-sm" data-act="editSvc" data-id="${s.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-act="delSvc" data-id="${s.id}">✕</button></td></tr>`).join("")
      : `<tr><td colspan="4"><div class="empty">No services yet.</div></td></tr>`;
    const at = document.getElementById("appointmentsTable");
    at.innerHTML = state.appointments.length ? state.appointments.slice().reverse().map(a => `
      <tr>
        <td>${esc(a.customer)}</td><td>${esc(a.service)}</td><td>${esc(a.date)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>
          <button class="btn btn-sm" data-act="setAppt" data-id="${a.id}" data-status="Upcoming">Upcoming</button>
          <button class="btn btn-sm" data-act="setAppt" data-id="${a.id}" data-status="Completed">Done</button>
          <button class="btn btn-sm btn-danger" data-act="setAppt" data-id="${a.id}" data-status="Cancelled">✕</button>
        </td>
      </tr>`).join("") : `<tr><td colspan="5"><div class="empty">No appointments yet.</div></td></tr>`;
  }
  function serviceForm(svc) {
    const s = svc || { name: "", duration: 30, price: "" };
    openModal(`
      <h3>${svc ? "Edit Service" : "Add Service"}</h3>
      <label>Service name</label><input data-k="name" value="${esc(s.name)}" placeholder="e.g. Haircut">
      <label>Duration (minutes)</label><input data-k="duration" type="number" value="${esc(s.duration)}">
      <label>Price</label><input data-k="price" type="number" value="${esc(s.price)}">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="saveSvcBtn">${svc ? "Save" : "Add"}</button></div>
    `);
    document.getElementById("saveSvcBtn").onclick = () => {
      const d = modalInputs();
      if (!d.name) return toast("Service name required");
      if (svc) { const t = state.services.find(x => x.id === svc.id); if (t) Object.assign(t, d, { duration: +d.duration || 30, price: +d.price || 0 }); }
      else state.services.push({ id: uid(), name: d.name, duration: +d.duration || 30, price: +d.price || 0 });
      save(); closeModal(); renderBooking(); toast("Service saved");
    };
  }
  function appointmentForm() {
    const svcOpts = state.services.map(s => `<option value="${esc(s.name)}">${esc(s.name)} — ${money(s.price)}</option>`).join("");
    openModal(`
      <h3>Book Appointment</h3>
      <label>Customer name</label><input data-k="customer" placeholder="Full name">
      <label>Service</label><select data-k="service">${svcOpts || "<option>General service</option>"}</select>
      <label>Date &amp; time</label><input data-k="date" type="datetime-local">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="saveApptBtn">Book</button></div>
    `);
    document.getElementById("saveApptBtn").onclick = () => {
      const d = modalInputs();
      if (!d.customer || !d.date) return toast("Customer and date required");
      state.appointments.push({ id: uid(), customer: d.customer, service: d.service || "General", date: d.date.replace("T", " "), status: "Upcoming" });
      save(); closeModal(); renderBooking(); toast("Appointment booked");
    };
  }

  /* ---------------- CRM ---------------- */
  function renderCrm() {
    const ct = document.getElementById("customersTable");
    ct.innerHTML = state.customers.length ? state.customers.slice().reverse().map(c => `
      <tr><td><b>${esc(c.name)}</b></td><td>${esc(c.email)}</td><td>${esc(c.phone)}</td><td>${money(c.spent)}</td>
        <td><button class="btn btn-sm" data-act="editCust" data-id="${c.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-act="delCust" data-id="${c.id}">✕</button></td></tr>`).join("")
      : `<tr><td colspan="5"><div class="empty">No customers yet.</div></td></tr>`;
    const lt = document.getElementById("leadsTable");
    lt.innerHTML = state.leads.length ? state.leads.map(l => `
      <tr><td><b>${esc(l.name)}</b></td><td>${esc(l.source)}</td><td>${statusBadge(l.stage)}</td><td>${money(l.value)}</td>
        <td>
          <button class="btn btn-sm" data-act="leadStage" data-id="${l.id}" data-stage="New">New</button>
          <button class="btn btn-sm" data-act="leadStage" data-id="${l.id}" data-stage="Contacted">Contacted</button>
          <button class="btn btn-sm" data-act="leadStage" data-id="${l.id}" data-stage="Won">Won</button>
          <button class="btn btn-sm btn-danger" data-act="delLead" data-id="${l.id}">✕</button>
        </td></tr>`).join("")
      : `<tr><td colspan="5"><div class="empty">No leads yet.</div></td></tr>`;
  }
  function customerForm(c) {
    const cust = c || { name: "", email: "", phone: "", spent: 0 };
    openModal(`
      <h3>${c ? "Edit Customer" : "Add Customer"}</h3>
      <label>Name</label><input data-k="name" value="${esc(cust.name)}">
      <label>Email</label><input data-k="email" value="${esc(cust.email)}">
      <label>Phone</label><input data-k="phone" value="${esc(cust.phone)}">
      <label>Total spent</label><input data-k="spent" type="number" value="${esc(cust.spent)}">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="saveCustBtn">${c ? "Save" : "Add"}</button></div>
    `);
    document.getElementById("saveCustBtn").onclick = () => {
      const d = modalInputs();
      if (!d.name) return toast("Name required");
      if (c) { const t = state.customers.find(x => x.id === c.id); if (t) Object.assign(t, d, { spent: +d.spent || 0 }); }
      else state.customers.push({ id: uid(), name: d.name, email: d.email, phone: d.phone, spent: +d.spent || 0 });
      save(); closeModal(); renderCrm(); toast("Customer saved");
    };
  }
  function leadForm() {
    openModal(`
      <h3>Add Lead</h3>
      <label>Lead name</label><input data-k="name" placeholder="Potential customer">
      <label>Source</label><input data-k="source" placeholder="e.g. Website, Referral, Instagram">
      <label>Value</label><input data-k="value" type="number" placeholder="0">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="saveLeadBtn">Add</button></div>
    `);
    document.getElementById("saveLeadBtn").onclick = () => {
      const d = modalInputs();
      if (!d.name) return toast("Name required");
      state.leads.push({ id: uid(), name: d.name, source: d.source || "Unknown", stage: "New", value: +d.value || 0 });
      save(); closeModal(); renderCrm(); toast("Lead added");
    };
  }

  /* ---------------- Inventory / POS ---------------- */
  function renderInventory() {
    const totalStock = state.products.reduce((a, p) => a + p.stock, 0);
    const low = state.products.filter(p => p.stock <= p.lowThreshold);
    const out = state.products.filter(p => p.stock <= 0);
    document.getElementById("invStats").innerHTML = [
      ["Products", state.products.length, ""],
      ["Total Stock", totalStock, "units"],
      ["Low Stock", low.length, low.length ? "Need reorder" : "OK"],
      ["Out of Stock", out.length, out.length ? "Reorder now" : "OK"]
    ].map(c => `<div class="stat"><div class="stat-label">${c[0]}</div><div class="stat-value">${c[1]}</div><div class="stat-sub">${c[2]}</div></div>`).join("");

    const it = document.getElementById("inventoryTable");
    it.innerHTML = state.products.length ? state.products.map(p => `
      <tr><td><b>${esc(p.name)}</b></td><td>${p.stock}</td><td>${p.lowThreshold}</td>
        <td>${p.stock <= 0 ? `<span class="badge badge-red">OUT</span>` : p.stock <= p.lowThreshold ? `<span class="badge badge-amber">LOW</span>` : `<span class="badge badge-green">OK</span>`}</td></tr>`).join("")
      : `<tr><td colspan="4"><div class="empty">No inventory items — add products in Store.</div></td></tr>`;

    const sh = document.getElementById("salesHistory");
    sh.innerHTML = state.sales.length ? state.sales.slice().reverse().map(s => `
      <tr><td>${esc(s.id)}</td><td>${esc(s.date)}</td><td>${s.items.map(i => `${esc(i.name)}×${i.qty}`).join(", ")}</td><td>${money(s.total)}</td></tr>`).join("")
      : `<tr><td colspan="4"><div class="empty">No sales recorded yet.</div></td></tr>`;

    const pos = document.getElementById("posItems");
    pos.innerHTML = state.products.length ? state.products.map(p => `
      <div class="cart-item">
        <span>${esc(p.name)} — <b>${money(p.price)}</b> (${p.stock} in stock)</span>
        <button class="btn btn-sm" data-act="posAdd" data-id="${p.id}">+ Add</button>
      </div>`).join("") : `<div class="empty">Add products first (Store → + Add Product).</div>`;
  }
  function posAddToCart(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const cart = state.cart || [];
    const found = cart.find(i => i.id === id);
    if (p.stock - (found ? found.qty : 0) <= 0) return toast("Not enough stock");
    if (found) found.qty++;
    else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 });
    state.cart = cart;
    save(); renderInventory(); renderStore(); renderCart();
  }
  function posCheckout() {
    const cart = state.cart || [];
    if (!cart.length) return toast("Cart is empty");
    const total = cart.reduce((a, i) => a + i.price * i.qty, 0);
    openModal(`
      <h3>Complete Sale</h3>
      <p class="muted">Total: <b style="font-size:18px">${money(total)}</b></p>
      <label>Customer name (optional)</label><input id="posCustName" placeholder="Walk-in customer">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="posConfirm">Complete Sale</button></div>
    `);
    document.getElementById("posConfirm").onclick = () => {
      cart.forEach(i => { const p = state.products.find(x => x.id === i.id); if (p) p.stock = Math.max(0, p.stock - i.qty); });
      const name = document.getElementById("posCustName").value.trim() || "Walk-in";
      state.sales.push({ id: uid(), date: new Date().toLocaleString(), items: cart.map(i => ({ name: i.name, qty: i.qty })), total });
      let cust = state.customers.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (cust) cust.spent += total;
      else state.customers.push({ id: uid(), name, email: "", phone: "", spent: total });
      state.cart = [];
      save(); closeModal(); renderInventory(); renderStore(); toast("Sale completed!");
    };
  }

  /* ---------------- Landing ---------------- */
  function renderLanding() {
    const s = state.settings;
    const prods = state.products.slice(0, 3);
    document.getElementById("landingPreview").innerHTML = `
      <div class="landing-hero">
        <h2>${esc(s.bizName)}</h2>
        <p>${esc(s.tagline || "Welcome to our business")}</p>
        ${s.phone ? `<p>📞 ${esc(s.phone)} ${s.email ? "· ✉ " + esc(s.email) : ""}</p>` : ""}
      </div>
      <div style="padding:20px">
        <h3>Popular products</h3>
        <div class="stats-grid" style="margin-top:12px">
          ${prods.length ? prods.map(p => `<div class="stat"><div class="stat-label">${esc(p.name)}</div><div class="stat-value" style="font-size:18px">${money(p.price)}</div><div class="stat-sub">${esc(p.category || "General")}</div></div>`).join("") : `<div class="stat"><div class="stat-label">No products yet</div><div class="stat-value" style="font-size:18px">—</div></div>`}
        </div>
      </div>`;
  }

  /* ---------------- AI Tools ---------------- */
  function renderAiTools() {
    // no static rendering needed
  }
  async function generateContent() {
    const type = document.getElementById("aiToolType").value;
    const topic = document.getElementById("aiTopic").value.trim();
    const extra = document.getElementById("aiPrompt").value.trim();
    if (!topic) return toast("Enter a topic first");
    const out = document.getElementById("aiGenerateOutput");
    out.classList.add("show");
    out.textContent = "Thinking...";
    const template = {
      description: `Write a persuasive product description for: "${topic}". Include: a catchy title, key selling points, and a closing call to action. ${extra}`,
      post: `Write a short social media marketing post for: "${topic}". Include an attention-grabbing hook and a call to action. ${extra}`,
      email: `Write a promotional email for: "${topic}". Include subject line, greeting, body, and sign-off for ${state.settings.bizName}. ${extra}`,
      ad: `Write 3 short ad variations for: "${topic}". Keep each under 40 words. ${extra}`
    }[type];
    try {
      const text = await callGemini(template, "You are a marketing expert for the business '" + state.settings.bizName + "'. Be concise and helpful.");
      out.textContent = text;
    } catch (e) {
      out.textContent = e.message === "NO_KEY"
        ? "⚠ No API key yet. Open Settings → paste your free Gemini API key → Save. Get one at aistudio.google.com/apikey"
        : "⚠ AI error: " + e.message;
    }
  }

  /* ---------------- Chat ---------------- */
  function appendMsg(box, who, text) {
    const el = document.createElement("div");
    el.className = "chat-msg " + who;
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }
  function typingMsg(box) {
    const el = document.createElement("div");
    el.className = "chat-msg bot typing";
    el.textContent = "…";
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }
  async function aiReply(userText, box) {
    const typing = typingMsg(box);
    try {
      const system = "You are the AI assistant for the business below. Answer questions helpfully and briefly using the data. If asked to create sales or orders, just explain how.\n\n" + businessContext();
      const reply = await callGemini(userText, system);
      typing.remove();
      appendMsg(box, "bot", reply);
    } catch (e) {
      typing.remove();
      appendMsg(box, "bot", e.message === "NO_KEY"
        ? "AI is not configured yet. Open Settings and paste your free Gemini API key (from aistudio.google.com/apikey), then save."
        : "AI error: " + e.message);
    }
  }
  function sendChat(input, box) {
    const text = input.value.trim();
    if (!text) return;
    appendMsg(box, "user", text);
    input.value = "";
    aiReply(text, box);
  }

  /* ---------------- Settings ---------------- */
  function fillSettings() {
    const s = state.settings;
    document.getElementById("setBizName").value = s.bizName;
    document.getElementById("setTagline").value = s.tagline;
    document.getElementById("setCurrency").value = s.currency;
    document.getElementById("setPhone").value = s.phone;
    document.getElementById("setEmail").value = s.email;
    document.getElementById("setAddress").value = s.address;
    document.getElementById("setApiKey").value = s.apiKey;
    document.getElementById("setModel").value = s.model || "gemini-2.0-flash";
    document.getElementById("setProvider").value = s.provider || "gemini";
    document.getElementById("setNvidiaKey").value = s.nvidiaKey || "";
    document.getElementById("setNvidiaModel").value = s.nvidiaModel || "meta/llama-3.3-70b-instruct";
    toggleProviderFields();
  }
  function toggleProviderFields() {
    const p = document.getElementById("setProvider").value;
    document.getElementById("providerGemini").style.display = p === "nvidia" ? "none" : "block";
    document.getElementById("providerNvidia").style.display = p === "nvidia" ? "block" : "none";
  }
  function saveSettings() {
    const s = state.settings;
    s.bizName = document.getElementById("setBizName").value.trim() || "My Business";
    s.tagline = document.getElementById("setTagline").value.trim();
    s.currency = document.getElementById("setCurrency").value;
    s.phone = document.getElementById("setPhone").value.trim();
    s.email = document.getElementById("setEmail").value.trim();
    s.address = document.getElementById("setAddress").value.trim();
    s.apiKey = document.getElementById("setApiKey").value.trim();
    s.model = document.getElementById("setModel").value || "gemini-2.0-flash";
    s.provider = document.getElementById("setProvider").value || "gemini";
    s.nvidiaKey = document.getElementById("setNvidiaKey").value.trim();
    s.nvidiaModel = document.getElementById("setNvidiaModel").value || "meta/llama-3.3-70b-instruct";
    save();
    fillSettings(); aiStatusBar(); renderLanding();
    toast("Settings saved");
  }
  async function testAi() {
    const provider = document.getElementById("setProvider").value || "gemini";
    const key = provider === "nvidia" ? document.getElementById("setNvidiaKey").value.trim() : document.getElementById("setApiKey").value.trim();
    const model = provider === "nvidia" ? (document.getElementById("setNvidiaModel").value || "meta/llama-3.3-70b-instruct") : (document.getElementById("setModel").value || "gemini-2.0-flash");
    if (!key) { document.getElementById("aiTestResult").textContent = "Enter the API key first"; return; }
    document.getElementById("aiTestResult").textContent = "Testing " + provider + " (" + model + ")...";
    const old = JSON.stringify(state.settings);
    state.settings.provider = provider;
    if (provider === "nvidia") { state.settings.nvidiaKey = key; state.settings.nvidiaModel = model; }
    else { state.settings.apiKey = key; state.settings.model = model; }
    try {
      await callGemini("Reply with exactly: OK");
      document.getElementById("aiTestResult").innerHTML = "✅ Connected with " + model + "!";
      save(); aiStatusBar();
    } catch (e) {
      document.getElementById("aiTestResult").textContent = "❌ Failed: " + e.message.slice(0, 80);
      state.settings = JSON.parse(old);
    }
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ai-business-suite-backup.json";
    a.click();
    toast("Backup downloaded");
  }
  function importData(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        state = Object.assign(JSON.parse(JSON.stringify(defaultState)), data);
        save(); renderAll(); fillSettings(); toast("Data imported");
      } catch (e) { toast("Invalid backup file"); }
    };
    r.readAsText(file);
  }

  /* ---------------- Global events ---------------- */
  document.getElementById("btnExport").addEventListener("click", exportData);
  document.getElementById("btnImport").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; });
  document.getElementById("btnSaveSettings").addEventListener("click", saveSettings);
  document.getElementById("btnTestAi").addEventListener("click", testAi);
  document.getElementById("setProvider").addEventListener("change", toggleProviderFields);
  document.getElementById("btnResetData").addEventListener("click", () => {
    if (confirm("Reset ALL business data? This cannot be undone.")) { localStorage.removeItem(LS_KEY); location.reload(); }
  });
  document.getElementById("btnAddProduct").addEventListener("click", () => productForm());
  document.getElementById("btnAddService").addEventListener("click", () => serviceForm());
  document.getElementById("btnAddAppointment").addEventListener("click", appointmentForm);
  document.getElementById("btnAddCustomer").addEventListener("click", () => customerForm());
  document.getElementById("btnAddLead").addEventListener("click", leadForm);
  document.getElementById("btnAdjustStock").addEventListener("click", () => {
    const opts = state.products.map(p => `<option value="${p.id}">${esc(p.name)} (stock ${p.stock})</option>`).join("");
    if (!opts) return toast("No products to adjust");
    openModal(`
      <h3>Adjust Stock</h3>
      <label>Product</label><select id="stockProd">${opts}</select>
      <label>New quantity</label><input id="stockQty" type="number" placeholder="Enter stock level">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="stockOk">Update</button></div>
    `);
    document.getElementById("stockOk").onclick = () => {
      const p = state.products.find(x => x.id === document.getElementById("stockProd").value);
      const qty = +document.getElementById("stockQty").value;
      if (p && !isNaN(qty)) {
        p.stock = Math.max(0, qty);
        state.stockLog.push({ name: p.name, to: qty, date: new Date().toLocaleString() });
        save(); closeModal(); renderInventory(); renderStore(); toast("Stock updated");
      }
    };
  });
  document.getElementById("btnNewSale").addEventListener("click", posCheckout);
  document.getElementById("btnGenerate").addEventListener("click", generateContent);
  document.getElementById("btnChatSend").addEventListener("click", () => sendChat(document.getElementById("aiChatInput"), document.getElementById("aiChatBox")));
  document.getElementById("aiChatInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(e.target, document.getElementById("aiChatBox")); });
  document.querySelectorAll("#chatSuggestions .chip").forEach(c => c.addEventListener("click", () => {
    appendMsg(document.getElementById("aiChatBox"), "user", c.dataset.q);
    aiReply(c.dataset.q, document.getElementById("aiChatBox"));
  }));

  /* Chatbot widget */
  const widgetToggle = document.getElementById("chatbotToggle");
  const widgetBody = document.getElementById("chatbotBody");
  let widgetOpen = false;
  widgetToggle.addEventListener("click", () => {
    widgetOpen = !widgetOpen;
    widgetBody.style.display = widgetOpen ? "block" : "none";
    document.querySelector(".cb-close").textContent = widgetOpen ? "▾" : "✕";
    if (widgetOpen && !document.getElementById("chatbotMsgs").children.length) {
      appendMsg(document.getElementById("chatbotMsgs"), "bot", "Hi! I'm " + state.settings.bizName + "'s AI assistant. Ask me about products, services, stock, or your business.");
    }
  });
  document.getElementById("chatbotSend").addEventListener("click", () => sendChat(document.getElementById("chatbotInput"), document.getElementById("chatbotMsgs")));
  document.getElementById("chatbotInput").addEventListener("keydown", e => { if (e.key === "Enter") sendChat(e.target, document.getElementById("chatbotMsgs")); });

  /* Delegate clicks for table actions */
  document.body.addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act, id = btn.dataset.id;
    if (act === "addCart") { const p = state.products.find(x => x.id === id); if (!p) return; const cart = state.cart || []; const f = cart.find(i => i.id === id); if (f) f.qty++; else cart.push({ id: p.id, name: p.name, price: p.price, qty: 1 }); state.cart = cart; save(); renderStore(); renderCart(); toast("Added to cart"); }
    if (act === "rmCart") { const cart = state.cart || []; cart.splice(+btn.dataset.i, 1); state.cart = cart; save(); renderStore(); renderCart(); }
    if (act === "checkout") { doCheckout(); }
    if (act === "editProd") { const p = state.products.find(x => x.id === id); if (p) productForm(p); }
    if (act === "delProd") { state.products = state.products.filter(x => x.id !== id); save(); renderStore(); renderInventory(); toast("Product deleted"); }
    if (act === "setOrder") { const o = state.orders.find(x => x.id === id); if (o) { o.status = btn.dataset.status; save(); renderOrders(); renderDashboard(); toast("Order " + o.status); } }
    if (act === "editSvc") { const s = state.services.find(x => x.id === id); if (s) serviceForm(s); }
    if (act === "delSvc") { state.services = state.services.filter(x => x.id !== id); save(); renderBooking(); toast("Service deleted"); }
    if (act === "setAppt") { const a = state.appointments.find(x => x.id === id); if (a) { a.status = btn.dataset.status; save(); renderBooking(); renderDashboard(); toast("Appointment updated"); } }
    if (act === "editCust") { const c = state.customers.find(x => x.id === id); if (c) customerForm(c); }
    if (act === "delCust") { state.customers = state.customers.filter(x => x.id !== id); save(); renderCrm(); toast("Customer deleted"); }
    if (act === "leadStage") { const l = state.leads.find(x => x.id === id); if (l) { l.stage = btn.dataset.stage; if (l.stage === "Won") { const c = state.customers.find(c => c.name.toLowerCase() === l.name.toLowerCase()); if (c) c.spent += l.value; else state.customers.push({ id: uid(), name: l.name, email: "", phone: "", spent: l.value }); } save(); renderCrm(); toast("Lead " + l.stage); } }
    if (act === "delLead") { state.leads = state.leads.filter(x => x.id !== id); save(); renderCrm(); toast("Lead deleted"); }
    if (act === "posAdd") { posAddToCart(id); }
  });

  function doCheckout() {
    const cart = state.cart || [];
    if (!cart.length) return toast("Cart is empty");
    const total = cart.reduce((a, i) => a + i.price * i.qty, 0);
    openModal(`
      <h3>Place Order</h3>
      <p class="muted">Items: ${cart.map(i => esc(i.name) + " ×" + i.qty).join(", ")}</p>
      <p style="margin:8px 0">Total: <b style="font-size:18px">${money(total)}</b></p>
      <label>Customer name</label><input id="orderCustName" placeholder="Customer name">
      <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').style.display='none'">Cancel</button><button class="btn btn-primary" id="orderOk">Place Order</button></div>
    `);
    document.getElementById("orderOk").onclick = () => {
      const name = document.getElementById("orderCustName").value.trim() || "Guest";
      const order = { id: uid(), customer: name, items: cart.map(i => ({ name: i.name, qty: i.qty })), total, status: "Pending", date: new Date().toLocaleString() };
      state.orders.push(order);
      cart.forEach(i => { const p = state.products.find(x => x.id === i.id); if (p) p.stock = Math.max(0, p.stock - i.qty); });
      let cust = state.customers.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (cust) cust.spent += total; else state.customers.push({ id: uid(), name, email: "", phone: "", spent: total });
      state.cart = [];
      save(); closeModal(); renderStore(); renderOrders(); renderDashboard(); toast("Order placed: " + order.id);
    };
  }
  document.getElementById("btnCheckout").addEventListener("click", doCheckout);

  /* ---------------- Render all ---------------- */
  function renderAll() {
    renderDashboard();
    renderStore();
    renderOrders();
    renderBooking();
    renderCrm();
    renderInventory();
    renderLanding();
    renderAiTools();
    fillSettings();
    aiStatusBar();
    document.getElementById("businessBadge").textContent = state.settings.bizName;
  }
  function updateAiStatus() { aiStatusBar(); }

  /* ---------------- Seed sample data (first run) ---------------- */
  if (!localStorage.getItem(LS_KEY)) {
    state.products = [
      { id: uid(), name: "Organic Green Tea (Tin)", price: 12.5, category: "Beverages", stock: 42, lowThreshold: 10, description: "Premium loose-leaf green tea in a reusable tin." },
      { id: uid(), name: "Wireless Earbuds Pro", price: 49.0, category: "Electronics", stock: 6, lowThreshold: 8, description: "Noise-cancelling earbuds with 30h battery." },
      { id: uid(), name: "Handmade Notebook", price: 8.75, category: "Stationery", stock: 120, lowThreshold: 20, description: "A5 recycled paper notebook with linen cover." }
    ];
    state.services = [
      { id: uid(), name: "Home Cleaning", duration: 120, price: 35 },
      { id: uid(), name: "Tech Support Session", duration: 60, price: 25 }
    ];
    state.customers = [
      { id: uid(), name: "Alex Johnson", email: "alex@example.com", phone: "+1 555 0100", spent: 132.5 },
      { id: uid(), name: "Maya Patel", email: "maya@example.com", phone: "+1 555 0101", spent: 61.25 }
    ];
    save();
  }

  /* ---------------- Init ---------------- */
  renderAll();
  navigate("dashboard");
})();

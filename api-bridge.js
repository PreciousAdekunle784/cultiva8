/* ============================================
   Cultiv8 — API Bridge Layer
   Add this BEFORE app.js in your HTML:
   <script src="api-bridge.js"></script>
   <script src="app.js"></script>
   
   This intercepts AuthManager and data functions
   to route them through the backend API instead
   of localStorage.
   ============================================ */

const API_BASE = window.location.origin + "/api";
// During development on different port:
// const API_BASE = "http://localhost:3000/api";

// Flag so app.js knows to skip its own AuthManager
window._apiBridgeLoaded = true;

// ============================================
// API Helper
// ============================================
const api = {
  token: localStorage.getItem("cultiv8_api_token") || null,

  async request(endpoint, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  },

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem("cultiv8_api_token", token);
    else localStorage.removeItem("cultiv8_api_token");
  }
};

// ============================================
// Override AuthManager to use Backend API
// ============================================
// This must be loaded BEFORE app.js so it
// replaces the localStorage-based AuthManager
// ============================================
var AuthManager = {
  currentUser: null,

  // --- Sign Up (Backend) ---
  async signUp(name, location, email, password) {
    const data = await api.request("/auth/signup", {
      method: "POST",
      body: { name, email, password, location }
    });
    api.setToken(data.token);
    this.currentUser = data.user;
    // Set avatar from initials
    this.currentUser.avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    return data.user;
  },

  // --- Sign In (Backend) ---
  async signIn(email, password) {
    const data = await api.request("/auth/login", {
      method: "POST",
      body: { email, password }
    });
    api.setToken(data.token);
    this.currentUser = data.user;
    return data.user;
  },

  // --- Google Sign-In (Backend) ---
  async googleSignIn(credentialResponse) {
    const data = await api.request("/auth/google", {
      method: "POST",
      body: { credential: credentialResponse.credential }
    });
    api.setToken(data.token);
    this.currentUser = data.user;
    return data.user;
  },

  // --- Restore Session (check if token is still valid) ---
  restoreSession() {
    if (!api.token) return null;

    // We can't do async in restoreSession (called synchronously),
    // so we verify the token by trying to decode it client-side
    try {
      const parts = api.token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      
      // Check if expired
      if (payload.exp * 1000 < Date.now()) {
        this.signOut();
        return null;
      }

      // Token looks valid — load user from cached profile
      const cached = localStorage.getItem("cultiv8_user_profile");
      if (cached) {
        this.currentUser = JSON.parse(cached);
        return this.currentUser;
      }

      // No cached profile but valid token — will async-load later
      this.currentUser = { id: payload.userId, name: "Loading...", email: "", avatar: "?" };
      
      // Async fetch real profile
      api.request("/auth/me").then(data => {
        this.currentUser = data.user;
        localStorage.setItem("cultiv8_user_profile", JSON.stringify(data.user));
        updateProfileUI(data.user);
      }).catch(() => {
        this.signOut();
        showAuthScreen();
      });

      return this.currentUser;
    } catch {
      this.signOut();
      return null;
    }
  },

  // --- Sign Out ---
  signOut() {
    api.setToken(null);
    this.currentUser = null;
    localStorage.removeItem("cultiv8_user_profile");
  },

  // --- Get Initials ---
  getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  },

  // --- Load User Data from Backend ---
  loadUserData(userId) {
    // This is called synchronously in the original code.
    // Return empty data — the real data will be loaded async.
    // We override showApp() below to handle async loading.
    return { farms: [], storage: [], activities: [], alerts: [] };
  },

  // --- Save User Data (no-op — backend auto-saves) ---
  saveUserData(userId, data) {
    // No-op — backend persists on each API call
  },

  // --- Decode JWT (for Google, kept for compatibility) ---
  decodeJWT(token) {
    try {
      const base64 = token.split('.')[1];
      const decoded = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decoded);
    } catch { return null; }
  },

  // --- Stubs for compatibility ---
  getUsers() { return []; },
  saveUsers() {},
  getSession() { return api.token ? { userId: 'api' } : null; },
  saveSession() {},
  clearSession() { this.signOut(); },
  generateSalt() { return ''; },
  generateId() { return 'u_' + Date.now(); },
  async hashPassword() { return ''; },
  getUserDataKey() { return ''; }
};

// ============================================
// Override showApp to load data from API
// ============================================
const _originalShowApp = typeof showApp === 'function' ? showApp : null;

// This will be called after app.js loads via DOMContentLoaded
window._patchShowApp = function() {
  const originalShowApp = window.showApp;
  
  window.showApp = async function(user) {
    // Show the app UI immediately
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Cache the user profile
    if (user.name !== "Loading...") {
      localStorage.setItem("cultiv8_user_profile", JSON.stringify(user));
    }

    // Initialize APP with empty data first
    APP.farms = [];
    APP.storage = [];
    APP.activities = [];
    APP.alerts = [];
    APP.maps = {};
    APP.markers = {};

    // Update profile UI
    updateProfileUI(user);

    // Initialize maps and navigation
    initApp();

    // Now async-load real data from backend
    try {
      const dashboard = await api.request("/dashboard");

      // Map backend field names to frontend field names
      APP.farms = (dashboard.farms || []).map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        crop: f.crop,
        lat: f.lat,
        lng: f.lng,
        practices: f.practices || [],
        totalCarbon: f.total_carbon || 0,
        breakdown: (f.breakdown || []).map(b => ({
          practice: b.practice || b.p,
          carbon: b.carbon || b.c
        })),
        ndvi: f.ndvi || 0.5,
        soc: f.soc || 15,
        registeredAt: f.created_at
      }));

      APP.storage = (dashboard.storage || []).map(s => ({
        id: s.id,
        crop: s.crop,
        qty: s.qty,
        method: s.method,
        lat: s.lat,
        lng: s.lng,
        weather: s.weather || {},
        spoilage: s.spoilage || { daysLeft: 30, status: 'safe', advice: '' },
        loggedAt: s.created_at
      }));

      APP.activities = (dashboard.activities || []).map(a => ({
        message: a.message,
        color: a.color || 'green',
        time: new Date(a.created_at)
      }));

      APP.alerts = (dashboard.alerts || []).map(a => ({
        message: a.message,
        type: a.type || 'warning',
        time: new Date(a.created_at)
      }));

      // Refresh all UI with real data
      updateDashboard();
      updateFarmsList();
      updateStorageList();

      // Re-add map markers
      APP.farms.forEach(f => {
        if (APP.maps.dashboard) {
          const marker = L.marker([f.lat, f.lng], { icon: createFarmIcon() })
            .bindPopup(`<b>${f.name}</b><br>${f.size} ha • ${f.crop}<br>${f.totalCarbon.toFixed(2)} tCO₂e/yr`)
            .addTo(APP.maps.dashboard);
          APP.markers.dashboard.push(marker);
        }
      });

      APP.storage.forEach(s => {
        if (APP.maps.dashboard) {
          L.marker([s.lat, s.lng], { icon: createStorageIcon() })
            .bindPopup(`<b>${capitalize(s.crop)}</b><br>${s.qty} kg<br>~${s.spoilage.daysLeft} days left`)
            .addTo(APP.maps.dashboard);
        }
      });

    } catch (err) {
      console.error("Failed to load dashboard data:", err);
      // App still works, just empty
    }
  };
};

// ============================================
// Override registerFarm to use API
// ============================================
window._patchRegisterFarm = function() {
  window.registerFarm = async function() {
    const name = document.getElementById('farmName').value.trim();
    const size = parseFloat(document.getElementById('farmSize').value);
    const crop = document.getElementById('farmCrop').value;
    const lat = parseFloat(document.getElementById('farmLat').value);
    const lng = parseFloat(document.getElementById('farmLng').value);

    const practices = [];
    document.querySelectorAll('.practice-input:checked').forEach(cb => practices.push(cb.value));

    // Validation (same as original)
    if (!name) return showToast('Please enter a farm name.', 'error');
    if (!size || size <= 0) return showToast('Please enter a valid farm size.', 'error');
    if (!crop) return showToast('Please select a primary crop.', 'error');
    if (isNaN(lat) || isNaN(lng)) return showToast('Please set farm location on the map.', 'error');
    if (practices.length === 0) return showToast('Please select at least one regenerative practice.', 'error');

    try {
      // Send to backend API
      const result = await api.request("/farms", {
        method: "POST",
        body: { name, size, crop, lat, lng, practices }
      });

      const f = result.farm;
      const farm = {
        id: f.id,
        name: f.name, size: f.size, crop: f.crop,
        lat: f.lat, lng: f.lng,
        practices: f.practices || practices,
        totalCarbon: f.total_carbon || 0,
        breakdown: (f.breakdown || []).map(b => ({ practice: b.practice || b.p, carbon: b.carbon || b.c })),
        ndvi: f.ndvi || 0.5,
        soc: f.soc || 15,
        registeredAt: f.created_at
      };

      APP.farms.push(farm);

      // Add to dashboard map
      if (APP.maps.dashboard) {
        const marker = L.marker([lat, lng], { icon: createFarmIcon() })
          .bindPopup(`<b>${name}</b><br>${size} ha • ${crop}<br>${farm.totalCarbon.toFixed(2)} tCO₂e/yr`)
          .addTo(APP.maps.dashboard);
        APP.markers.dashboard.push(marker);
      }

      // Activity (already added by backend, just update local)
      APP.activities.unshift({ message: `Registered farm "${name}" (${size} ha)`, color: 'green', time: new Date() });

      // Reset form
      document.getElementById('farmName').value = '';
      document.getElementById('farmSize').value = '';
      document.getElementById('farmCrop').value = '';
      document.getElementById('farmLat').value = '';
      document.getElementById('farmLng').value = '';
      document.querySelectorAll('.practice-input').forEach(cb => cb.checked = false);

      showToast(result.message || `Farm "${name}" registered!`);
      updateFarmsList();
      updateDashboard();

    } catch (err) {
      showToast(err.message || 'Failed to register farm.', 'error');
    }
  };
};

// ============================================
// Override logStorage to use API
// ============================================
window._patchLogStorage = function() {
  window.logStorage = async function() {
    const crop = document.getElementById('storageCrop').value;
    const qty = parseFloat(document.getElementById('storageQty').value);
    const method = document.getElementById('storageMethod').value;
    const lat = parseFloat(document.getElementById('storageLat').value);
    const lng = parseFloat(document.getElementById('storageLng').value);

    if (!crop) return showToast('Please select a crop type.', 'error');
    if (!qty || qty <= 0) return showToast('Please enter a valid quantity.', 'error');
    if (isNaN(lat) || isNaN(lng)) return showToast('Please enter storage location.', 'error');

    try {
      // Send to backend — it fetches weather + calculates spoilage
      const result = await api.request("/storage", {
        method: "POST",
        body: { crop, qty, method, lat, lng }
      });

      const s = result.storage;
      const entry = {
        id: s.id,
        crop: s.crop, qty: s.qty, method: s.method,
        lat: s.lat, lng: s.lng,
        weather: s.weather || result.weather,
        spoilage: s.spoilage || result.spoilage,
        loggedAt: s.created_at
      };

      APP.storage.push(entry);

      // Add marker to dashboard map
      if (APP.maps.dashboard) {
        L.marker([lat, lng], { icon: createStorageIcon() })
          .bindPopup(`<b>${capitalize(crop)}</b><br>${qty} kg • ${STORAGE_NAMES[method]}<br>~${entry.spoilage.daysLeft} days`)
          .addTo(APP.maps.dashboard);
      }

      // Update local alerts
      if (entry.spoilage.daysLeft <= 3) {
        APP.alerts.unshift({ message: `URGENT: Your ${crop} will spoil in ~${entry.spoilage.daysLeft} days!`, type: 'danger', time: new Date() });
      } else if (entry.spoilage.daysLeft <= 7) {
        APP.alerts.unshift({ message: `Warning: ${crop} has ~${entry.spoilage.daysLeft} days remaining.`, type: 'warning', time: new Date() });
      }

      APP.activities.unshift({ message: `Logged ${qty} kg of ${crop} in ${STORAGE_NAMES[method]}`, color: 'orange', time: new Date() });

      // Display weather
      if (result.weather || entry.weather) {
        displayWeather(result.weather || entry.weather);
      }

      // Reset form
      document.getElementById('storageCrop').value = '';
      document.getElementById('storageQty').value = '';

      showToast(result.message || `${capitalize(crop)} logged!`);
      updateStorageList();
      updateDashboard();

    } catch (err) {
      showToast(err.message || 'Failed to log storage.', 'error');
    }
  };
};

// ============================================
// Override contactBuyer to use API
// ============================================
window._patchContactBuyer = function() {
  window.contactBuyer = async function(name) {
    try {
      await api.request("/storage/contact-buyer", {
        method: "POST",
        body: { storageId: 0, buyerName: name, buyerType: 'buyer' }
      });
      APP.activities.unshift({ message: `Contacted buyer: ${name}`, color: 'blue', time: new Date() });
      showToast(`Request sent to ${name}! They will be notified.`);
    } catch {
      showToast(`Request sent to ${name}!`);
    }
  };
};

// ============================================
// Override persistUserData to no-op
// ============================================
window._patchPersistUserData = function() {
  window.persistUserData = function() {
    // No-op — backend auto-persists on each API call
  };
};

// ============================================
// Override handleSignOut
// ============================================
window._patchHandleSignOut = function() {
  const originalHandleSignOut = window.handleSignOut;
  window.handleSignOut = function() {
    document.getElementById('profileDropdown').classList.add('hidden');
    AuthManager.signOut();
    APP.farms = [];
    APP.storage = [];
    APP.activities = [];
    APP.alerts = [];
    Object.values(APP.maps).forEach(m => { if (m) m.remove(); });
    APP.maps = {};
    APP.markers = {};
    showAuthScreen();
    document.getElementById('loginForm')?.reset();
    document.getElementById('signupForm')?.reset();
    document.getElementById('loginError')?.classList.add('hidden');
    document.getElementById('signupError')?.classList.add('hidden');
    switchAuthTab('login');
  };
};

// ============================================
// Apply all patches after app.js loads
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure app.js has defined all functions
  setTimeout(() => {
    if (window._patchShowApp) window._patchShowApp();
    if (window._patchRegisterFarm) window._patchRegisterFarm();
    if (window._patchLogStorage) window._patchLogStorage();
    if (window._patchContactBuyer) window._patchContactBuyer();
    if (window._patchPersistUserData) window._patchPersistUserData();
    if (window._patchHandleSignOut) window._patchHandleSignOut();
    console.log("🌱 Cultiv8 API Bridge: All patches applied — using backend API");
  }, 50);
});

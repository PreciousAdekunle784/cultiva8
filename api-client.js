// ============================================
// Cultiv8 — Frontend API Client
// Drop this into your frontend to connect to the backend
// Replace localStorage calls with these functions
// ============================================

const API_BASE = window.location.origin + "/api";
// If backend runs on different port during development:
// const API_BASE = "http://localhost:3000/api";

const api = {
  token: localStorage.getItem("cultiv8_token") || null,

  // ---- Core request method ----
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

  // ---- Auth ----
  async signup(name, location, email, password) {
    const data = await this.request("/auth/signup", {
      method: "POST",
      body: { name, email, password, location }
    });
    this.token = data.token;
    localStorage.setItem("cultiv8_token", data.token);
    return data.user;
  },

  async login(email, password) {
    const data = await this.request("/auth/login", {
      method: "POST",
      body: { email, password }
    });
    this.token = data.token;
    localStorage.setItem("cultiv8_token", data.token);
    return data.user;
  },

  async googleSignIn(credential) {
    const data = await this.request("/auth/google", {
      method: "POST",
      body: { credential }
    });
    this.token = data.token;
    localStorage.setItem("cultiv8_token", data.token);
    return data.user;
  },

  async getProfile() {
    const data = await this.request("/auth/me");
    return data.user;
  },

  async updateProfile(name, location) {
    const data = await this.request("/auth/profile", {
      method: "PUT",
      body: { name, location }
    });
    return data.user;
  },

  logout() {
    this.token = null;
    localStorage.removeItem("cultiv8_token");
  },

  isLoggedIn() {
    return !!this.token;
  },

  // ---- Dashboard ----
  async getDashboard() {
    return this.request("/dashboard");
  },

  // ---- Farms ----
  async getFarms() {
    const data = await this.request("/farms");
    return data.farms;
  },

  async createFarm(farm) {
    const data = await this.request("/farms", {
      method: "POST",
      body: farm
    });
    return data;
  },

  async updateFarm(id, updates) {
    const data = await this.request(`/farms/${id}`, {
      method: "PUT",
      body: updates
    });
    return data.farm;
  },

  async deleteFarm(id) {
    return this.request(`/farms/${id}`, { method: "DELETE" });
  },

  async getFarmStats() {
    return this.request("/farms/stats/summary");
  },

  // ---- Storage ----
  async getStorage() {
    const data = await this.request("/storage");
    return data.storage;
  },

  async logStorage(entry) {
    return this.request("/storage", {
      method: "POST",
      body: entry
    });
  },

  async deleteStorage(id) {
    return this.request(`/storage/${id}`, { method: "DELETE" });
  },

  async getWeather(lat, lng) {
    const data = await this.request(`/storage/weather?lat=${lat}&lng=${lng}`);
    return data.weather;
  },

  async getSpoilageAll() {
    const data = await this.request("/storage/spoilage-all");
    return data.storage;
  },

  async getBuyers() {
    const data = await this.request("/storage/buyers");
    return data.buyers;
  },

  async contactBuyer(storageId, buyerName, buyerType) {
    return this.request("/storage/contact-buyer", {
      method: "POST",
      body: { storageId, buyerName, buyerType }
    });
  },

  async getStorageStats() {
    return this.request("/storage/stats");
  },

  // ---- Activities & Alerts ----
  async getActivities(limit = 20) {
    const data = await this.request(`/activities?limit=${limit}`);
    return data.activities;
  },

  async getAlerts() {
    const data = await this.request("/alerts");
    return data.alerts;
  },

  async markAlertRead(id) {
    return this.request(`/alerts/${id}/read`, { method: "PUT" });
  },

  // ---- Marketplace ----
  async getMarketplace() {
    return this.request("/marketplace");
  },

  async sellCredits(farmId, buyerName, tonnes) {
    return this.request("/marketplace/sell", {
      method: "POST",
      body: { farmId, buyerName, tonnes }
    });
  }
};

// ============================================
// USAGE EXAMPLES:
// ============================================
//
// // Sign up
// const user = await api.signup("Amina Okafor", "Oyo State", "amina@email.com", "password123");
//
// // Login
// const user = await api.login("amina@email.com", "password123");
//
// // Get dashboard
// const dashboard = await api.getDashboard();
// console.log(dashboard.stats.totalCarbon);
//
// // Register farm
// const result = await api.createFarm({
//   name: "Northern Plot",
//   size: 2.5,
//   crop: "maize",
//   lat: 7.3775,
//   lng: 3.9470,
//   practices: ["no_till", "cover_crops", "composting"]
// });
//
// // Log storage
// const result = await api.logStorage({
//   crop: "tomatoes",
//   qty: 500,
//   method: "covered_room",
//   lat: 7.3775,
//   lng: 3.9470
// });
//
// // Get matched buyers
// const buyers = await api.getBuyers();
//
// // Sell carbon credits
// await api.sellCredits(1, "GreenCorp International", 4.2);

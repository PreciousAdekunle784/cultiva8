/* ============================================
   Cultiv8 — Application Logic
   Carbon Credits & Post-Harvest Intelligence
   ============================================ */

// ============================================
// Configuration
// ============================================
const CONFIG = {
    // Replace with your Google Cloud OAuth Client ID
    GOOGLE_CLIENT_ID: '1019579940917-grrvafpk9mamucmeg9dnf68gngndavc9.apps.googleusercontent.com',
    STORAGE_PREFIX: 'cultiv8_',
    SESSION_KEY: 'cultiv8_session',
    USERS_KEY: 'cultiv8_users',
    MIN_PASSWORD_LENGTH: 8
};

// ============================================
// Auth Manager (skipped if api-bridge.js already loaded)
// ============================================
if (typeof window._apiBridgeLoaded === 'undefined') {
var AuthManager = {
    currentUser: null,

    /** Get all registered users */
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.USERS_KEY)) || [];
        } catch { return []; }
    },

    /** Save users array */
    saveUsers(users) {
        localStorage.setItem(CONFIG.USERS_KEY, JSON.stringify(users));
    },

    /** Get active session */
    getSession() {
        try {
            const session = JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY));
            if (session && session.userId) return session;
            return null;
        } catch { return null; }
    },

    /** Save session */
    saveSession(userId) {
        localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({
            userId,
            loginAt: new Date().toISOString()
        }));
    },

    /** Clear session */
    clearSession() {
        localStorage.removeItem(CONFIG.SESSION_KEY);
        this.currentUser = null;
    },

    /** Generate a crypto-random salt */
    generateSalt() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    },

    /** Hash password with salt using SHA-256 (Web Crypto API) */
    async hashPassword(password, salt) {
        const encoder = new TextEncoder();
        const data = encoder.encode(salt + password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /** Generate user ID */
    generateId() {
        return 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 8);
    },

    /** Get initials from name */
    getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    },

    /** Sign up a new user */
    async signUp(name, location, email, password) {
        const users = this.getUsers();

        // Check if email already exists
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
            throw new Error('An account with this email already exists.');
        }

        // Validate password strength
        if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            throw new Error(`Password must be at least ${CONFIG.MIN_PASSWORD_LENGTH} characters.`);
        }

        const salt = this.generateSalt();
        const passwordHash = await this.hashPassword(password, salt);

        const user = {
            id: this.generateId(),
            name: name.trim(),
            email: email.toLowerCase().trim(),
            location: location.trim(),
            avatar: this.getInitials(name),
            provider: 'local',
            passwordHash,
            salt,
            createdAt: new Date().toISOString()
        };

        users.push(user);
        this.saveUsers(users);
        this.saveSession(user.id);
        this.currentUser = user;

        // Initialize empty data for this user
        this.saveUserData(user.id, { farms: [], storage: [], activities: [], alerts: [] });

        return user;
    },

    /** Sign in with email/password */
    async signIn(email, password) {
        const users = this.getUsers();
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!user) {
            throw new Error('No account found with this email address.');
        }

        if (user.provider === 'google') {
            throw new Error('This account uses Google Sign-In. Please use the Google button.');
        }

        const hash = await this.hashPassword(password, user.salt);
        if (hash !== user.passwordHash) {
            throw new Error('Incorrect password. Please try again.');
        }

        this.saveSession(user.id);
        this.currentUser = user;
        return user;
    },

    /** Handle Google Sign-In credential */
    async googleSignIn(credentialResponse) {
        // Decode the JWT token (header.payload.signature)
        const payload = this.decodeJWT(credentialResponse.credential);

        if (!payload || !payload.email) {
            throw new Error('Failed to process Google sign-in. Please try again.');
        }

        const users = this.getUsers();
        let user = users.find(u => u.email.toLowerCase() === payload.email.toLowerCase());

        if (user) {
            // Existing user — update their name/picture if changed
            user.name = payload.name || user.name;
            user.avatar = this.getInitials(payload.name || user.name);
            user.googlePicture = payload.picture || user.googlePicture;
            this.saveUsers(users);
        } else {
            // New user from Google
            user = {
                id: this.generateId(),
                name: payload.name || payload.email.split('@')[0],
                email: payload.email.toLowerCase(),
                location: '',
                avatar: this.getInitials(payload.name || 'G'),
                provider: 'google',
                googlePicture: payload.picture || null,
                passwordHash: null,
                salt: null,
                createdAt: new Date().toISOString()
            };
            users.push(user);
            this.saveUsers(users);

            // Initialize empty data
            this.saveUserData(user.id, { farms: [], storage: [], activities: [], alerts: [] });
        }

        this.saveSession(user.id);
        this.currentUser = user;
        return user;
    },

    /** Decode a JWT token (client-side only — not for security validation) */
    decodeJWT(token) {
        try {
            const base64 = token.split('.')[1];
            const decoded = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch {
            return null;
        }
    },

    /** Restore session on page load */
    restoreSession() {
        const session = this.getSession();
        if (!session) return null;

        const users = this.getUsers();
        const user = users.find(u => u.id === session.userId);
        if (!user) {
            this.clearSession();
            return null;
        }

        this.currentUser = user;
        return user;
    },

    /** Sign out */
    signOut() {
        this.clearSession();
    },

    /** Get user-specific data key */
    getUserDataKey(userId) {
        return CONFIG.STORAGE_PREFIX + 'data_' + userId;
    },

    /** Load user data from localStorage */
    loadUserData(userId) {
        try {
            const data = JSON.parse(localStorage.getItem(this.getUserDataKey(userId)));
            return data || { farms: [], storage: [], activities: [], alerts: [] };
        } catch {
            return { farms: [], storage: [], activities: [], alerts: [] };
        }
    },

    /** Save user data to localStorage */
    saveUserData(userId, data) {
        localStorage.setItem(this.getUserDataKey(userId), JSON.stringify({
            farms: data.farms || [],
            storage: data.storage || [],
            activities: data.activities || [],
            alerts: data.alerts || []
        }));
    }
};
} // end if — AuthManager not already loaded by api-bridge.js

// ============================================
// Data Store (loaded per user)
// ============================================
var APP = {
    farms: [],
    storage: [],
    activities: [],
    alerts: [],
    maps: {},
    markers: {}
};

// ============================================
// Carbon Sequestration Rates (IPCC-based)
// tonnes CO2e per hectare per year
// ============================================
const CARBON_RATES = {
    cover_crops: { rate: 0.32, name: 'Cover Cropping', icon: '🌱' },
    no_till: { rate: 0.54, name: 'No-Till Farming', icon: '🚜' },
    composting: { rate: 0.28, name: 'Composting', icon: '♻️' },
    agroforestry: { rate: 1.20, name: 'Agroforestry', icon: '🌳' },
    crop_rotation: { rate: 0.18, name: 'Crop Rotation', icon: '🔄' },
    mulching: { rate: 0.22, name: 'Mulching', icon: '🍂' }
};

// ============================================
// Spoilage Models (FAO-based data)
// base_days: shelf life under ideal conditions
// temp_factor: multiplier per degree C above ideal
// humidity_factor: multiplier per % RH above ideal
// storage_multiplier: how much each method extends life
// ============================================
const SPOILAGE_MODELS = {
    tomatoes: { base_days: 14, ideal_temp: 13, ideal_rh: 85, temp_factor: 0.8, humidity_factor: 0.15, icon: '🍅' },
    maize: { base_days: 180, ideal_temp: 15, ideal_rh: 45, temp_factor: 0.3, humidity_factor: 0.5, icon: '🌽' },
    rice: { base_days: 365, ideal_temp: 15, ideal_rh: 40, temp_factor: 0.2, humidity_factor: 0.4, icon: '🍚' },
    cassava: { base_days: 3, ideal_temp: 20, ideal_rh: 85, temp_factor: 0.5, humidity_factor: 0.2, icon: '🥔' },
    yam: { base_days: 90, ideal_temp: 16, ideal_rh: 70, temp_factor: 0.4, humidity_factor: 0.3, icon: '🍠' },
    peppers: { base_days: 21, ideal_temp: 8, ideal_rh: 90, temp_factor: 0.6, humidity_factor: 0.2, icon: '🌶️' },
    onions: { base_days: 120, ideal_temp: 0, ideal_rh: 65, temp_factor: 0.25, humidity_factor: 0.35, icon: '🧅' },
    beans: { base_days: 365, ideal_temp: 15, ideal_rh: 40, temp_factor: 0.15, humidity_factor: 0.4, icon: '🫘' },
    plantain: { base_days: 10, ideal_temp: 14, ideal_rh: 85, temp_factor: 0.7, humidity_factor: 0.15, icon: '🍌' },
    oranges: { base_days: 56, ideal_temp: 5, ideal_rh: 90, temp_factor: 0.5, humidity_factor: 0.2, icon: '🍊' }
};

const STORAGE_MULTIPLIERS = {
    open_air: 0.5,
    covered_room: 0.75,
    hermetic_bag: 1.2,
    traditional_silo: 0.9,
    cold_storage: 2.0
};

const STORAGE_NAMES = {
    open_air: 'Open Air',
    covered_room: 'Covered Room',
    hermetic_bag: 'Hermetic Bags',
    traditional_silo: 'Traditional Silo',
    cold_storage: 'Cold Storage'
};

// ============================================
// Simulated Buyer Data
// ============================================
const NEARBY_BUYERS = [
    { name: 'Mama Nkechi Market', type: 'Market Trader', distance: '3.2 km', crops: ['tomatoes', 'peppers', 'onions', 'plantain'], phone: '+234 803 XXX XXXX', color: '#e74c3c' },
    { name: 'FreshCo Aggregators', type: 'Aggregator', distance: '8.5 km', crops: ['maize', 'rice', 'beans', 'yam'], phone: '+234 812 XXX XXXX', color: '#3498db' },
    { name: 'Oyo Cold Storage Hub', type: 'Cold Storage', distance: '15 km', crops: ['tomatoes', 'peppers', 'oranges', 'plantain'], phone: '+234 706 XXX XXXX', color: '#2ecc71' },
    { name: 'AgroTrade Nigeria', type: 'Export Buyer', distance: '22 km', crops: ['cassava', 'cocoa', 'beans', 'rice'], phone: '+234 901 XXX XXXX', color: '#9b59b6' },
    { name: 'Iya Basira Foods', type: 'Processor', distance: '5.8 km', crops: ['cassava', 'maize', 'tomatoes', 'peppers'], phone: '+234 816 XXX XXXX', color: '#f39c12' },
];

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Splash screen
    setTimeout(() => {
        document.getElementById('splash').classList.add('fade-out');
        setTimeout(() => {
            document.getElementById('splash').style.display = 'none';

            // Check for existing session
            const user = AuthManager.restoreSession();
            if (user) {
                showApp(user);
            } else {
                showAuthScreen();
            }
        }, 600);
    }, 2200);

    // Setup password strength meter
    const signupPw = document.getElementById('signupPassword');
    if (signupPw) {
        signupPw.addEventListener('input', () => updatePasswordStrength(signupPw.value));
    }

    // Close profile dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('profileDropdown');
        const trigger = document.getElementById('profileTrigger');
        if (dropdown && !dropdown.classList.contains('hidden') &&
            !dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Initialize Google Sign-In once the GIS script loads
    initializeGoogleSignIn();
});

/** Show auth screen */
function showAuthScreen() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

/** Show main app with user data */
function showApp(user) {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadUserDataIntoApp(user);
    initApp();
    updateProfileUI(user);
}

/** Load user data into APP object */
function loadUserDataIntoApp(user) {
    const data = AuthManager.loadUserData(user.id);
    APP.farms = data.farms || [];
    APP.storage = data.storage || [];
    APP.activities = data.activities || [];
    APP.alerts = data.alerts || [];
    APP.maps = {};
    APP.markers = {};
}

/** Persist current APP data to localStorage for the current user */
function persistUserData() {
    if (!AuthManager.currentUser) return;
    AuthManager.saveUserData(AuthManager.currentUser.id, {
        farms: APP.farms,
        storage: APP.storage,
        activities: APP.activities,
        alerts: APP.alerts
    });
}

/** Update the sidebar profile UI */
function updateProfileUI(user) {
    document.getElementById('profileAvatar').textContent = user.avatar || '?';
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileLocation').textContent = user.location || user.email;

    document.getElementById('dropdownAvatar').textContent = user.avatar || '?';
    document.getElementById('dropdownName').textContent = user.name;
    document.getElementById('dropdownEmail').textContent = user.email;

    // Update dashboard greeting
    const greeting = document.getElementById('dashboardGreeting');
    if (greeting) {
        const firstName = user.name.split(' ')[0];
        greeting.textContent = `Welcome back, ${firstName}. Here's your farm overview.`;
    }
}

function initApp() {
    setupNavigation();
    setupMobileMenu();
    setCurrentDate();
    initDashboardMap();
    initRegisterMap();
    updateDashboard();
}


// ============================================
// Mobile Hamburger Menu
// ============================================
function setupMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    function openMenu() {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        menuToggle.classList.add('active');
    }

    function closeMenu() {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        menuToggle.classList.remove('active');
    }

    function toggleMenu() {
        if (sidebar.classList.contains('open')) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    menuToggle.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', closeMenu);

    // Close menu when a nav button is clicked (mobile)
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                closeMenu();
            }
        });
    });
}

// ============================================
// Navigation
// ============================================
function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    // Update nav
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');

    // Page-specific init
    if (page === 'carbon-track') updateCarbonPage();
    if (page === 'spoilage') updateSpoilagePage();
    if (page === 'buyer-match') updateBuyerPage();
    if (page === 'marketplace') updateMarketplace();

    // Invalidate maps
    setTimeout(() => {
        Object.values(APP.maps).forEach(m => { if (m) m.invalidateSize(); });
    }, 100);
}

// ============================================
// Date Display
// ============================================
function setCurrentDate() {
    const d = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = d.toLocaleDateString('en-NG', options);
}

// ============================================
// Maps
// ============================================
function initDashboardMap() {
    const map = L.map('dashboardMap').setView([7.3775, 3.9470], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    APP.maps.dashboard = map;
    APP.markers.dashboard = [];
}

function initRegisterMap() {
    const map = L.map('registerMap').setView([7.3775, 3.9470], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    let marker = null;
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        document.getElementById('farmLat').value = lat.toFixed(4);
        document.getElementById('farmLng').value = lng.toFixed(4);
        if (marker) map.removeLayer(marker);
        marker = L.marker([lat, lng]).addTo(map);
    });

    APP.maps.register = map;
}

function createFarmIcon() {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width:32px;height:32px;border-radius:50%;
            background:#40916C;border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            color:white;font-size:14px;
        ">🌱</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function createStorageIcon() {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width:32px;height:32px;border-radius:50%;
            background:#E67E22;border:3px solid white;
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
            display:flex;align-items:center;justify-content:center;
            color:white;font-size:14px;
        ">📦</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

// ============================================
// Farm Registration
// ============================================
function registerFarm() {
    const name = document.getElementById('farmName').value.trim();
    const size = parseFloat(document.getElementById('farmSize').value);
    const crop = document.getElementById('farmCrop').value;
    const lat = parseFloat(document.getElementById('farmLat').value);
    const lng = parseFloat(document.getElementById('farmLng').value);

    const practices = [];
    document.querySelectorAll('.practice-input:checked').forEach(cb => {
        practices.push(cb.value);
    });

    // Validation
    if (!name) return showToast('Please enter a farm name.', 'error');
    if (!size || size <= 0) return showToast('Please enter a valid farm size.', 'error');
    if (!crop) return showToast('Please select a primary crop.', 'error');
    if (isNaN(lat) || isNaN(lng)) return showToast('Please set farm location on the map.', 'error');
    if (practices.length === 0) return showToast('Please select at least one regenerative practice.', 'error');

    // Calculate carbon
    let totalCarbon = 0;
    const breakdown = [];
    practices.forEach(p => {
        const carbon = CARBON_RATES[p].rate * size;
        totalCarbon += carbon;
        breakdown.push({ practice: p, carbon });
    });

    // Generate NDVI (simulated)
    const ndvi = 0.35 + Math.random() * 0.45; // 0.35-0.80

    // Generate SOC (simulated)
    const soc = 8 + Math.random() * 25; // 8-33 g/kg

    const farm = {
        id: Date.now(),
        name, size, crop, lat, lng, practices,
        totalCarbon: parseFloat(totalCarbon.toFixed(2)),
        breakdown,
        ndvi: parseFloat(ndvi.toFixed(2)),
        soc: parseFloat(soc.toFixed(1)),
        registeredAt: new Date()
    };

    APP.farms.push(farm);

    // Add to dashboard map
    const marker = L.marker([lat, lng], { icon: createFarmIcon() })
        .bindPopup(`<b>${name}</b><br>${size} ha • ${crop}<br>${totalCarbon.toFixed(2)} tCO₂e/yr`)
        .addTo(APP.maps.dashboard);
    APP.markers.dashboard.push(marker);

    // Activity
    addActivity(`Registered farm "${name}" (${size} ha)`, 'green');

    // Reset form
    document.getElementById('farmName').value = '';
    document.getElementById('farmSize').value = '';
    document.getElementById('farmCrop').value = '';
    document.getElementById('farmLat').value = '';
    document.getElementById('farmLng').value = '';
    document.querySelectorAll('.practice-input').forEach(cb => cb.checked = false);

    showToast(`Farm "${name}" registered! Estimated ${totalCarbon.toFixed(2)} tCO₂e/year.`);
    updateFarmsList();
    updateDashboard();
    persistUserData();
}

function updateFarmsList() {
    const container = document.getElementById('farmsList');
    if (APP.farms.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No farms registered yet.</p></div>';
        return;
    }

    container.innerHTML = APP.farms.map(f => `
        <div class="farm-item">
            <div class="farm-icon">🌾</div>
            <div class="farm-details">
                <h4>${f.name}</h4>
                <p>${f.size} ha • ${capitalize(f.crop)} • ${f.practices.length} practices • NDVI: ${f.ndvi}</p>
            </div>
            <div class="farm-meta">
                <div class="carbon-est">${f.totalCarbon} tCO₂e</div>
                <small>per year</small>
            </div>
        </div>
    `).join('');
}

// ============================================
// Carbon Tracking Page
// ============================================
function updateCarbonPage() {
    if (APP.farms.length === 0) {
        document.getElementById('carbonNoFarms').classList.remove('hidden');
        document.getElementById('carbonContent').classList.add('hidden');
        return;
    }

    document.getElementById('carbonNoFarms').classList.add('hidden');
    document.getElementById('carbonContent').classList.remove('hidden');

    // Populate farm selector
    const select = document.getElementById('carbonFarmSelect');
    select.innerHTML = APP.farms.map(f =>
        `<option value="${f.id}">${f.name} (${f.size} ha)</option>`
    ).join('');

    updateCarbonView();
}

function updateCarbonView() {
    const farmId = parseInt(document.getElementById('carbonFarmSelect').value);
    const farm = APP.farms.find(f => f.id === farmId);
    if (!farm) return;

    // NDVI
    document.getElementById('ndviScore').textContent = farm.ndvi.toFixed(2);
    const ndviPercent = ((farm.ndvi - 0) / 1.0) * 100;
    document.getElementById('ndviBar').style.left = `calc(${ndviPercent}% - 8px)`;

    // SOC
    document.getElementById('socValue').textContent = farm.soc.toFixed(1);

    // Sequestration
    document.getElementById('seqValue').textContent = farm.totalCarbon.toFixed(2);

    // Breakdown
    const maxCarbon = Math.max(...farm.breakdown.map(b => b.carbon));
    const breakdownHtml = farm.breakdown.map(b => {
        const info = CARBON_RATES[b.practice];
        const pct = (b.carbon / maxCarbon) * 100;
        return `
            <div class="breakdown-item">
                <span class="breakdown-icon">${info.icon}</span>
                <div class="breakdown-info">
                    <div class="breakdown-name">${info.name}</div>
                    <div class="breakdown-bar-bg">
                        <div class="breakdown-bar-fill" style="width:${pct}%"></div>
                    </div>
                </div>
                <span class="breakdown-val">${b.carbon.toFixed(2)} tCO₂e</span>
            </div>
        `;
    }).join('');
    document.getElementById('carbonBreakdown').innerHTML = breakdownHtml;

    document.getElementById('carbonTotalBar').innerHTML = `
        <span>Total Sequestration</span>
        <span style="color:var(--green-700)">${farm.totalCarbon.toFixed(2)} tCO₂e/year</span>
    `;

    // NDVI Timeline (simulated seasonal pattern)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const baseNDVI = farm.ndvi;
    const seasonal = [0.3, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0, 0.95, 0.85, 0.7, 0.5, 0.35];

    const timelineHtml = months.map((m, i) => {
        const val = baseNDVI * seasonal[i];
        const height = val * 130;
        const hue = val < 0.3 ? 0 : val < 0.5 ? 40 : 140;
        const sat = 60;
        const light = 45;
        return `
            <div class="ndvi-col">
                <div class="ndvi-col-bar" style="height:${height}px;background:hsl(${hue},${sat}%,${light}%)"></div>
                <span class="ndvi-col-label">${m}</span>
            </div>
        `;
    }).join('');
    document.getElementById('ndviTimeline').innerHTML = timelineHtml;
}

// ============================================
// Marketplace
// ============================================
function updateMarketplace() {
    const totalCredits = APP.farms.reduce((sum, f) => sum + f.totalCarbon, 0);
    document.getElementById('mkCredits').textContent = totalCredits.toFixed(2);
    const revenue = totalCredits * 12.40 * 1580; // USD to NGN approx
    document.getElementById('mkRevenue').textContent = '₦' + Math.round(revenue).toLocaleString();
}

// ============================================
// Storage Logging
// ============================================
function logStorage() {
    const crop = document.getElementById('storageCrop').value;
    const qty = parseFloat(document.getElementById('storageQty').value);
    const method = document.getElementById('storageMethod').value;
    const lat = parseFloat(document.getElementById('storageLat').value);
    const lng = parseFloat(document.getElementById('storageLng').value);

    if (!crop) return showToast('Please select a crop type.', 'error');
    if (!qty || qty <= 0) return showToast('Please enter a valid quantity.', 'error');
    if (isNaN(lat) || isNaN(lng)) return showToast('Please enter storage location.', 'error');

    // Fetch weather
    fetchWeather(lat, lng).then(weather => {
        const spoilage = calculateSpoilage(crop, method, weather);

        const entry = {
            id: Date.now(),
            crop, qty, method, lat, lng,
            weather,
            spoilage,
            loggedAt: new Date()
        };

        APP.storage.push(entry);

        // Add marker to dashboard map
        const marker = L.marker([lat, lng], { icon: createStorageIcon() })
            .bindPopup(`<b>${capitalize(crop)}</b><br>${qty} kg • ${STORAGE_NAMES[method]}<br>~${spoilage.daysLeft} days until spoilage`)
            .addTo(APP.maps.dashboard);

        // Check for alerts
        if (spoilage.daysLeft <= 3) {
            addAlert(`URGENT: Your ${crop} will spoil in ~${spoilage.daysLeft} days! Find a buyer now.`, 'danger');
        } else if (spoilage.daysLeft <= 7) {
            addAlert(`Warning: Your ${crop} has ~${spoilage.daysLeft} days remaining. Consider selling soon.`, 'warning');
        }

        addActivity(`Logged ${qty} kg of ${crop} in ${STORAGE_NAMES[method]}`, 'orange');
        displayWeather(weather);

        // Reset form
        document.getElementById('storageCrop').value = '';
        document.getElementById('storageQty').value = '';

        showToast(`${capitalize(crop)} logged! Estimated ${spoilage.daysLeft} days shelf life.`);
        updateStorageList();
        updateDashboard();
        persistUserData();
    });
}

function useCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            document.getElementById('storageLat').value = pos.coords.latitude.toFixed(4);
            document.getElementById('storageLng').value = pos.coords.longitude.toFixed(4);
            showToast('Location captured!');
        }, () => {
            // Default to Lagos area
            document.getElementById('storageLat').value = '7.3775';
            document.getElementById('storageLng').value = '3.9470';
            showToast('Using default location (Oyo State).');
        });
    } else {
        document.getElementById('storageLat').value = '7.3775';
        document.getElementById('storageLng').value = '3.9470';
        showToast('Using default location (Oyo State).');
    }
}

// ============================================
// Weather API (Open-Meteo — Free, No Key)
// ============================================
async function fetchWeather(lat, lng) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
        const res = await fetch(url);
        const data = await res.json();

        return {
            temp: data.current.temperature_2m,
            humidity: data.current.relative_humidity_2m,
            wind: data.current.wind_speed_10m,
            precipitation: data.current.precipitation,
            forecast: data.daily ? {
                dates: data.daily.time,
                tempMax: data.daily.temperature_2m_max,
                tempMin: data.daily.temperature_2m_min,
                rainProb: data.daily.precipitation_probability_max
            } : null
        };
    } catch (e) {
        console.error('Weather fetch failed:', e);
        // Fallback simulated data
        return {
            temp: 28 + Math.random() * 8,
            humidity: 55 + Math.random() * 30,
            wind: 5 + Math.random() * 15,
            precipitation: Math.random() > 0.7 ? Math.random() * 5 : 0,
            forecast: null
        };
    }
}

function displayWeather(weather) {
    const container = document.getElementById('weatherDisplay');
    container.innerHTML = `
        <div class="weather-grid">
            <div class="weather-item">
                <div class="weather-item-value">${weather.temp.toFixed(1)}°C</div>
                <div class="weather-item-label">Temperature</div>
            </div>
            <div class="weather-item">
                <div class="weather-item-value">${weather.humidity.toFixed(0)}%</div>
                <div class="weather-item-label">Relative Humidity</div>
            </div>
            <div class="weather-item">
                <div class="weather-item-value">${weather.wind.toFixed(1)}</div>
                <div class="weather-item-label">Wind (km/h)</div>
            </div>
            <div class="weather-item">
                <div class="weather-item-value">${weather.precipitation.toFixed(1)}mm</div>
                <div class="weather-item-label">Precipitation</div>
            </div>
        </div>
        ${weather.forecast ? renderForecast(weather.forecast) : ''}
    `;
}

function renderForecast(forecast) {
    const days = forecast.dates.slice(1, 6).map((d, i) => {
        const date = new Date(d);
        const dayName = date.toLocaleDateString('en', { weekday: 'short' });
        const rainProb = forecast.rainProb[i + 1];
        return `
            <div style="text-align:center;flex:1">
                <div style="font-size:0.75rem;color:var(--text-muted)">${dayName}</div>
                <div style="font-size:0.85rem;font-weight:600;margin:4px 0">${forecast.tempMax[i + 1]?.toFixed(0) || '--'}°</div>
                <div style="font-size:0.7rem;color:${rainProb > 50 ? 'var(--blue-500)' : 'var(--text-muted)'}">${rainProb || 0}% 🌧</div>
            </div>
        `;
    }).join('');

    return `
        <div style="display:flex;gap:4px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border-color)">
            ${days}
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;text-align:center">5-Day Forecast (Open-Meteo API)</div>
    `;
}

// ============================================
// Spoilage Calculation (FAO-based model)
// ============================================
function calculateSpoilage(crop, storageMethod, weather) {
    const model = SPOILAGE_MODELS[crop];
    if (!model) return { daysLeft: 30, quality: 80, status: 'safe', advice: 'No specific data for this crop.' };

    const storageMult = STORAGE_MULTIPLIERS[storageMethod];
    let baseDays = model.base_days * storageMult;

    // Temperature penalty
    const tempDiff = Math.max(0, weather.temp - model.ideal_temp);
    const tempPenalty = tempDiff * model.temp_factor;
    baseDays -= tempPenalty;

    // Humidity penalty
    const humidityDiff = Math.abs(weather.humidity - model.ideal_rh);
    const humidityPenalty = (humidityDiff / 100) * model.humidity_factor * model.base_days;
    baseDays -= humidityPenalty;

    // Ensure minimum 1 day
    const daysLeft = Math.max(1, Math.round(baseDays));

    // Quality percentage
    const maxDays = model.base_days * 2;
    const quality = Math.min(100, Math.max(5, Math.round((daysLeft / maxDays) * 100)));

    // Status
    let status = 'safe';
    if (daysLeft <= 3) status = 'danger';
    else if (daysLeft <= 7) status = 'warning';

    // Advice
    let advice = '';
    if (status === 'danger') {
        advice = `<strong>Sell immediately!</strong> Your ${crop} may spoil within ${daysLeft} day(s). High temperature (${weather.temp.toFixed(1)}°C) is accelerating decay. Contact nearby buyers or move to cold storage.`;
    } else if (status === 'warning') {
        advice = `<strong>Plan to sell within ${daysLeft} days.</strong> Current conditions (${weather.temp.toFixed(1)}°C, ${weather.humidity.toFixed(0)}% humidity) are reducing shelf life. Consider upgrading storage or finding a buyer.`;
    } else {
        advice = `Your ${crop} is in good condition. At current temperature (${weather.temp.toFixed(1)}°C), you have approximately ${daysLeft} days. Monitor weather changes.`;
    }

    return { daysLeft, quality, status, advice };
}

// ============================================
// Storage List
// ============================================
function updateStorageList() {
    const container = document.getElementById('storageList');
    if (APP.storage.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No produce currently logged in storage.</p></div>';
        return;
    }

    container.innerHTML = APP.storage.map(s => {
        const model = SPOILAGE_MODELS[s.crop];
        const icon = model ? model.icon : '📦';
        const statusClass = s.spoilage.status;
        const statusText = s.spoilage.status === 'safe' ? 'Safe' : s.spoilage.status === 'warning' ? 'Warning' : 'Critical';

        return `
            <div class="storage-item">
                <div class="farm-icon" style="font-size:1.6rem">${icon}</div>
                <div class="farm-details">
                    <h4>${capitalize(s.crop)} — ${s.qty} kg</h4>
                    <p>${STORAGE_NAMES[s.method]} • ${s.weather.temp.toFixed(1)}°C, ${s.weather.humidity.toFixed(0)}% RH</p>
                </div>
                <div class="farm-meta">
                    <span class="badge ${statusClass === 'safe' ? 'green' : statusClass === 'warning' ? 'orange' : 'red'}">${statusText}</span>
                    <div style="margin-top:4px"><small>${s.spoilage.daysLeft} days left</small></div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// Spoilage Predictor Page
// ============================================
function updateSpoilagePage() {
    if (APP.storage.length === 0) {
        document.getElementById('spoilageNoStorage').classList.remove('hidden');
        document.getElementById('spoilageContent').classList.add('hidden');
        return;
    }

    document.getElementById('spoilageNoStorage').classList.add('hidden');
    document.getElementById('spoilageContent').classList.remove('hidden');

    const container = document.getElementById('spoilageCards');
    container.innerHTML = APP.storage.map(s => {
        const model = SPOILAGE_MODELS[s.crop];
        const icon = model ? model.icon : '📦';
        const maxDays = model ? model.base_days * 2 : 60;
        const barPct = Math.min(100, (s.spoilage.daysLeft / maxDays) * 100);
        const statusLabel = s.spoilage.status === 'safe' ? 'Safe' : s.spoilage.status === 'warning' ? 'At Risk' : 'Critical';

        return `
            <div class="spoilage-card ${s.spoilage.status}">
                <div class="spoilage-header">
                    <div>
                        <div class="spoilage-crop">${icon} ${capitalize(s.crop)}</div>
                        <div class="spoilage-qty">${s.qty} kg • ${STORAGE_NAMES[s.method]}</div>
                    </div>
                    <span class="spoilage-status">${statusLabel}</span>
                </div>
                <div class="spoilage-countdown">
                    <div class="countdown-value">${s.spoilage.daysLeft}</div>
                    <div class="countdown-label">days until quality drops</div>
                </div>
                <div class="spoilage-bar-container">
                    <div class="spoilage-bar-fill" style="width:${barPct}%"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-muted)">
                    <span>Spoiled</span>
                    <span>Fresh</span>
                </div>
                <div class="spoilage-advice">${s.spoilage.advice}</div>
                ${s.spoilage.status !== 'safe' ? `<button class="btn btn-primary btn-full btn-sm" style="margin-top:12px" onclick="navigateTo('buyer-match')">Find Buyers Now</button>` : ''}
            </div>
        `;
    }).join('');
}

// ============================================
// Buyer Matching Page
// ============================================
function updateBuyerPage() {
    if (APP.storage.length === 0) {
        document.getElementById('buyerNoStorage').classList.remove('hidden');
        document.getElementById('buyerContent').classList.add('hidden');
        return;
    }

    document.getElementById('buyerNoStorage').classList.add('hidden');
    document.getElementById('buyerContent').classList.remove('hidden');

    // Get unique stored crops
    const storedCrops = [...new Set(APP.storage.map(s => s.crop))];

    // Filter & sort buyers by relevance
    const relevantBuyers = NEARBY_BUYERS
        .map(b => {
            const matchingCrops = b.crops.filter(c => storedCrops.includes(c));
            return { ...b, matchingCrops, relevance: matchingCrops.length };
        })
        .filter(b => b.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance);

    // All buyers (including non-matching as backup)
    const allBuyers = relevantBuyers.length > 0 ? relevantBuyers : NEARBY_BUYERS;

    // Map
    if (!APP.maps.buyer) {
        const lat = APP.storage[0].lat;
        const lng = APP.storage[0].lng;
        const map = L.map('buyerMap').setView([lat, lng], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        APP.maps.buyer = map;

        // Storage marker
        L.marker([lat, lng], { icon: createStorageIcon() })
            .bindPopup('Your Storage Location')
            .addTo(map);

        // Buyer markers (simulated nearby positions)
        allBuyers.forEach((b, i) => {
            const bLat = lat + (Math.random() - 0.5) * 0.2;
            const bLng = lng + (Math.random() - 0.5) * 0.2;
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="
                    width:28px;height:28px;border-radius:50%;
                    background:${b.color};border:2px solid white;
                    box-shadow:0 2px 6px rgba(0,0,0,0.3);
                    display:flex;align-items:center;justify-content:center;
                    color:white;font-size:11px;font-weight:700;
                ">${b.name[0]}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14]
            });
            L.marker([bLat, bLng], { icon })
                .bindPopup(`<b>${b.name}</b><br>${b.type}<br>${b.distance}`)
                .addTo(map);
        });
    }

    // Buyer cards
    const container = document.getElementById('buyerCards');
    container.innerHTML = allBuyers.map(b => {
        const cropsTag = b.matchingCrops
            ? b.matchingCrops.map(c => `<span class="badge green" style="margin-right:4px">${capitalize(c)}</span>`).join('')
            : '';

        return `
            <div class="buyer-card">
                <div class="buyer-logo" style="background:${b.color}">${b.name[0]}</div>
                <div class="buyer-info">
                    <div class="buyer-name">${b.name}</div>
                    <div class="buyer-detail">${b.type} • ${b.distance} away</div>
                    <div style="margin-top:6px">${cropsTag}</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="contactBuyer('${b.name}')">Contact</button>
            </div>
        `;
    }).join('');
}

function contactBuyer(name) {
    addActivity(`Contacted buyer: ${name}`, 'blue');
    showToast(`Request sent to ${name}! They will be notified.`);
}

// ============================================
// Dashboard Updates
// ============================================
function updateDashboard() {
    // Carbon stats
    const totalCarbon = APP.farms.reduce((sum, f) => sum + f.totalCarbon, 0);
    animateCounter('totalCarbon', totalCarbon, 1);

    const totalCredits = Math.floor(totalCarbon);
    animateCounter('totalCredits', totalCredits, 0);

    const creditVal = Math.round(totalCredits * 12.40 * 1580);
    document.getElementById('creditValue').textContent = creditVal.toLocaleString();

    // Storage stats
    const totalStored = APP.storage.reduce((sum, s) => sum + s.qty, 0);
    animateCounter('totalStored', totalStored, 0);

    const savedKg = APP.storage.reduce((sum, s) => {
        if (s.spoilage.status === 'safe') return sum + s.qty * 0.35; // 35% would have been lost
        return sum;
    }, 0);
    animateCounter('totalSaved', Math.round(savedKg), 0);

    const savedValue = Math.round(savedKg * 250); // ₦250/kg average
    document.getElementById('savedValue').textContent = savedValue.toLocaleString();

    // Farm count
    document.getElementById('farmCount').textContent = `${APP.farms.length} farms registered`;

    // Storage trend
    const trend = document.getElementById('storageTrend');
    if (APP.storage.length > 0) {
        const urgent = APP.storage.filter(s => s.spoilage.status === 'danger').length;
        if (urgent > 0) {
            trend.textContent = `${urgent} item(s) need urgent attention`;
            trend.className = 'stat-trend down';
        } else {
            trend.textContent = `${APP.storage.length} items monitored`;
            trend.className = 'stat-trend up';
        }
    }

    // Alerts count
    document.getElementById('alertCount').textContent = `${APP.alerts.length} alerts`;

    // Render alerts
    renderAlerts();
    renderActivities();
}

// ============================================
// Alerts & Activity
// ============================================
function addAlert(message, type) {
    APP.alerts.unshift({ message, type, time: new Date() });
    persistUserData();
    updateDashboard();
}

function renderAlerts() {
    const container = document.getElementById('alertsList');
    if (APP.alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <p>No active alerts. Your produce is safe!</p>
            </div>
        `;
        return;
    }

    const iconSvg = {
        warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        danger: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    };

    container.innerHTML = APP.alerts.map(a => `
        <div class="alert-item ${a.type}">
            ${iconSvg[a.type] || ''}
            <span>${a.message}</span>
        </div>
    `).join('');
}

function addActivity(message, color) {
    APP.activities.unshift({ message, color, time: new Date() });
    persistUserData();
}

function renderActivities() {
    const container = document.getElementById('activityFeed');
    if (APP.activities.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No recent activity. Start by registering a farm or logging storage.</p></div>';
        return;
    }

    container.innerHTML = APP.activities.slice(0, 10).map(a => {
        const timeAgo = getTimeAgo(a.time);
        return `
            <div class="activity-item">
                <div class="activity-dot ${a.color}"></div>
                <span>${a.message}</span>
                <span class="activity-time">${timeAgo}</span>
            </div>
        `;
    }).join('');
}

// ============================================
// Utilities
// ============================================
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getTimeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function animateCounter(elementId, target, decimals) {
    const el = document.getElementById(elementId);
    const start = parseFloat(el.textContent) || 0;
    const duration = 800;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = start + (target - start) * eased;
        el.textContent = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString();
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMsg');
    msg.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(APP.toastTimer);
    APP.toastTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3500);
}

// ============================================
// Auth UI Handlers
// ============================================

/** Switch between Login and Signup tabs */
function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');

    // Clear errors
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('signupError').classList.add('hidden');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabSignup.classList.add('active');
    }
}

/** Handle login form submission */
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    // Show loading
    btn.disabled = true;
    btn.querySelector('.auth-btn-text').textContent = 'Signing in...';
    btn.querySelector('.auth-btn-spinner').classList.remove('hidden');
    errorEl.classList.add('hidden');

    try {
        const user = await AuthManager.signIn(email, password);
        showApp(user);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('.auth-btn-text').textContent = 'Sign In';
        btn.querySelector('.auth-btn-spinner').classList.add('hidden');
    }
}

/** Handle signup form submission */
async function handleSignup(e) {
    e.preventDefault();
    const btn = document.getElementById('signupBtn');
    const errorEl = document.getElementById('signupError');
    const name = document.getElementById('signupName').value.trim();
    const location = document.getElementById('signupLocation').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirm = document.getElementById('signupConfirm').value;

    // Validation
    if (password !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        errorEl.classList.remove('hidden');
        return;
    }

    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters long.';
        errorEl.classList.remove('hidden');
        return;
    }

    // Show loading
    btn.disabled = true;
    btn.querySelector('.auth-btn-text').textContent = 'Creating account...';
    btn.querySelector('.auth-btn-spinner').classList.remove('hidden');
    errorEl.classList.add('hidden');

    try {
        const user = await AuthManager.signUp(name, location, email, password);
        showApp(user);
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.querySelector('.auth-btn-text').textContent = 'Create Account';
        btn.querySelector('.auth-btn-spinner').classList.add('hidden');
    }
}

/** Initialize Google Identity Services and render the sign-in button */
function initializeGoogleSignIn() {
    const signinContainer = document.getElementById('g_id_signin');
    const fallbackBtn = document.getElementById('googleSignInBtn');

    function tryInit() {
        if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
            // GIS not loaded yet, show fallback button and retry
            if (fallbackBtn) fallbackBtn.style.display = 'flex';
            if (signinContainer) signinContainer.style.display = 'none';
            setTimeout(tryInit, 1000);
            return;
        }

        // GIS is loaded — initialize
        google.accounts.id.initialize({
            client_id: CONFIG.GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true
        });

        // Render the official Google sign-in button
        if (signinContainer) {
            google.accounts.id.renderButton(signinContainer, {
                type: 'standard',
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width: 340
            });

            // Show the rendered button, hide fallback
            signinContainer.style.display = 'flex';
            if (fallbackBtn) fallbackBtn.style.display = 'none';
        }
    }

    tryInit();
}

/** Callback handler for Google credential response */
async function handleGoogleCredentialResponse(credentialResponse) {
    try {
        const user = await AuthManager.googleSignIn(credentialResponse);
        showApp(user);
    } catch (err) {
        showAuthError(err.message);
    }
}

/** Handle Google Sign-In (fallback for when GIS official button fails to render) */
function handleGoogleSignIn() {
    if (typeof google === 'undefined' || !google.accounts) {
        showAuthError('Google Sign-In is still loading. Please wait a moment and try again.');
        return;
    }

    try {
        google.accounts.id.initialize({
            client_id: CONFIG.GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true
        });

        // Try the One Tap / popup prompt
        google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                const reason = notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || '';
                console.warn('Google Sign-In prompt issue:', reason);
                showAuthError(
                    'Google Sign-In popup could not open. This can happen if:\n' +
                    '• You\'re not using HTTPS or localhost\n' +
                    '• Third-party cookies are blocked\n' +
                    '• Pop-ups are blocked by your browser\n\n' +
                    'Please use email/password sign-in, or try the Google button above.'
                );
            }
        });
    } catch (err) {
        console.error('Google Sign-In error:', err);
        showAuthError('Google Sign-In failed: ' + err.message);
    }
}

/** Show error on whichever auth form is currently visible */
function showAuthError(message) {
    const loginForm = document.getElementById('loginForm');
    const errorId = loginForm.classList.contains('hidden') ? 'signupError' : 'loginError';
    const errorEl = document.getElementById(errorId);
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

/** Toggle password visibility */
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const eyeOpen = btn.querySelector('.eye-open');
    const eyeClosed = btn.querySelector('.eye-closed');

    if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.style.display = 'none';
        eyeClosed.style.display = 'block';
    } else {
        input.type = 'password';
        eyeOpen.style.display = 'block';
        eyeClosed.style.display = 'none';
    }
}

/** Update password strength meter */
function updatePasswordStrength(password) {
    const bars = document.querySelectorAll('#passwordStrength .strength-bar');
    const text = document.querySelector('#passwordStrength .strength-text');
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    score = Math.min(4, score);

    const levels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const classes = ['', 'weak', 'fair', 'good', 'strong'];
    const colors = ['', 'var(--red-500)', 'var(--orange-500)', 'var(--orange-400)', 'var(--green-600)'];

    bars.forEach((bar, i) => {
        bar.className = 'strength-bar';
        if (i < score) {
            bar.classList.add(classes[score]);
        }
    });

    text.textContent = password.length > 0 ? levels[score] : '';
    text.style.color = colors[score] || 'var(--text-muted)';
}

/** Toggle profile dropdown */
function toggleProfileDropdown() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('hidden');
}

/** Handle sign out */
function handleSignOut() {
    // Close profile dropdown
    document.getElementById('profileDropdown').classList.add('hidden');

    // Persist current data before signing out
    persistUserData();

    // Clear auth session
    AuthManager.signOut();

    // Reset APP state
    APP.farms = [];
    APP.storage = [];
    APP.activities = [];
    APP.alerts = [];

    // Destroy maps to prevent duplication on next login
    Object.values(APP.maps).forEach(m => { if (m) m.remove(); });
    APP.maps = {};
    APP.markers = {};

    // Show auth screen
    showAuthScreen();

    // Reset auth forms
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('signupError').classList.add('hidden');
    switchAuthTab('login');
}
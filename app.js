const firebaseConfig = {
  apiKey: "AIzaSyAcLzBVkW5ljQikoRD5DmJoyKqg56cmK00",
  authDomain: "smart-ai-manual-parking.firebaseapp.com",
  databaseURL: "https://smart-ai-manual-parking-default-rtdb.firebaseio.com",
  projectId: "smart-ai-manual-parking",
  storageBucket: "smart-ai-manual-parking.firebasestorage.app",
  messagingSenderId: "692246369597",
  appId: "1:692246369597:web:84668caf6bce6bfad62154",
  measurementId: "G-8KQ958GLRV"
};

// Initialize Firebase using compat scripts loaded in index.html
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentFloor: 1,
        isManualMode: false,
        floors: {
            1: [],
            2: [],
            3: [],
            4: []
        }
    };

    // DOM Elements
    const gridContainer = document.getElementById('parking-grid');
    const floorBtns = document.querySelectorAll('.nav-btn');
    const globalFreeCount = document.getElementById('global-free-count');
    const globalOccupiedCount = document.getElementById('global-occupied-count');
    const currentFloorTitle = document.getElementById('current-floor-title');
    const manualModeBtn = document.getElementById('manual-mode-btn');
    const modeText = document.getElementById('mode-text');
    const appTitle = document.getElementById('app-title');
    const statusText = document.querySelector('.status-indicator').nextElementSibling;

    // Modal elements
    const reportModal = document.getElementById('report-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const modalSpotId = document.getElementById('modal-spot-id');
    const modalCurrentDuration = document.getElementById('modal-current-duration');
    const modalHistoryList = document.getElementById('modal-history-list');

    // Timer for live duration update
    let durationInterval = null;

    // Initialize App
    init();

    async function init() {
        setupNavigation();
        setupModeToggle();
        setupModal();

        statusText.textContent = "Connecting to Firebase...";

        // Check if DB is empty, if so, seed it
        await checkAndSeedDatabase();

        // Start listening to live data
        listenToFirebase();
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    function formatDuration(ms) {
        if (!ms || ms < 0) return '0m 0s';
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    function formatTimestamp(ts) {
        if (!ts) return 'Unknown time';
        const d = new Date(ts);
        return d.toLocaleString();
    }

    // ─── Database seeding ────────────────────────────────────────────────────────

    function generateFloorData(floorNum, totalSpots) {
        const spots = [];
        const floorPrefix = floorNum === 1 ? 'G' : floorNum === 2 ? 'S' : floorNum === 3 ? 'T' : 'VIP';

        for (let i = 1; i <= totalSpots; i++) {
            spots.push({
                id: `${floorPrefix}-${i.toString().padStart(3, '0')}`,
                status: 'free',
                isVip: floorNum === 4,
                history: []
            });
        }
        return spots;
    }

    async function checkAndSeedDatabase() {
        const dbRef = db.ref('floors');
        const snapshot = await dbRef.once('value');

        if (!snapshot.exists()) {
            console.log("Database empty, seeding initial parking layout...");
            const initialData = {
                1: generateFloorData(1, 100),
                2: generateFloorData(2, 100),
                3: generateFloorData(3, 100),
                4: generateFloorData(4, 20)
            };
            await dbRef.set(initialData);
            console.log("Seeding complete.");
        }
    }

    // ─── Firebase listener ───────────────────────────────────────────────────────

    function listenToFirebase() {
        const floorsRef = db.ref('floors');
        floorsRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                state.floors = snapshot.val();

                if (!state.isManualMode) {
                    statusText.textContent = "Firebase Live Connection (AI Active)";
                }

                renderFloor(state.currentFloor);
                updateDashboard();
            }
        });
    }

    // ─── Render ──────────────────────────────────────────────────────────────────

    function renderFloor(floorNum) {
        gridContainer.classList.remove('fade-in');
        void gridContainer.offsetWidth;
        gridContainer.classList.add('fade-in');

        const floorData = state.floors[floorNum] || [];
        gridContainer.innerHTML = '';

        const floorNames = { 1: "Ground Floor Layout", 2: "Second Floor Layout", 3: "Third Floor Layout", 4: "VIP Lounge Layout" };
        currentFloorTitle.textContent = floorNames[floorNum];

        floorData.forEach((spot, index) => {
            if (!spot) return;

            const spotEl = document.createElement('div');
            spotEl.className = `parking-spot ${spot.status}`;
            if (spot.isVip) spotEl.classList.add('vip');
            spotEl.id = `spot-${spot.id}`;
            spotEl.style.animationDelay = `${(index % 20) * 0.02}s`;

            // ── EV charger icon (always present) ──
            const evSvg = `<svg class="ev-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.5 2.5L6 14h7l-1.5 7.5L20 8h-7l1.5-5.5z"/>
            </svg>`;

            // ── Car SVG (only when occupied) ──
            let carSvg = '';
            if (spot.status === 'occupied') {
                carSvg = `<svg class="car-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
                </svg>`;
            }

            // ── Report (!) button ──
            const reportBtn = `<button class="report-btn" data-spot-id="${spot.id}" data-floor="${floorNum}" data-index="${index}" title="View parking report">!</button>`;

            spotEl.innerHTML = evSvg + carSvg + `<span class="spot-id">${spot.id}</span>` + reportBtn;

            // Click on the spot itself (manual mode only)
            spotEl.addEventListener('click', (e) => {
                // Don't toggle if the report button was clicked
                if (e.target.classList.contains('report-btn')) return;
                if (state.isManualMode) {
                    toggleSpotStatusInFirebase(floorNum, index, spot);
                }
            });

            // Report button click — always available
            const btn = spotEl.querySelector('.report-btn');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openReportModal(spot);
            });

            gridContainer.appendChild(spotEl);
        });
    }

    // ─── Dashboard ───────────────────────────────────────────────────────────────

    function updateDashboard() {
        let totalFree = 0;
        let totalOccupied = 0;

        Object.values(state.floors).forEach(floor => {
            if (!floor) return;
            floor.forEach(spot => {
                if (!spot) return;
                if (spot.status === 'free') totalFree++;
                else totalOccupied++;
            });
        });

        globalFreeCount.textContent = totalFree;
        globalOccupiedCount.textContent = totalOccupied;
    }

    // ─── Navigation ──────────────────────────────────────────────────────────────

    function setupNavigation() {
        floorBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.currentTarget;
                const floor = parseInt(targetBtn.dataset.floor);

                if (state.currentFloor === floor) return;

                floorBtns.forEach(b => b.classList.remove('active'));
                targetBtn.classList.add('active');

                state.currentFloor = floor;
                renderFloor(floor);
            });
        });
    }

    // ─── Mode Toggle ─────────────────────────────────────────────────────────────

    function setupModeToggle() {
        manualModeBtn.addEventListener('click', () => {
            state.isManualMode = !state.isManualMode;

            if (state.isManualMode) {
                document.body.classList.add('manual-mode');
                appTitle.textContent = "Manual Parking";
                modeText.textContent = "Switch to AI Mode";
                statusText.textContent = "Live Connection Paused (Manual Edit Mode)";
            } else {
                document.body.classList.remove('manual-mode');
                appTitle.textContent = "AIParking";
                modeText.textContent = "Switch to Manual";
                statusText.textContent = "Firebase Live Connection (AI Active)";
            }
        });
    }

    // ─── Toggle spot in Firebase ─────────────────────────────────────────────────

    function toggleSpotStatusInFirebase(floorNum, spotIndex, spot) {
        const newStatus = spot.status === 'free' ? 'occupied' : 'free';
        const now = Date.now();
        const spotRef = db.ref(`floors/${floorNum}/${spotIndex}`);

        if (newStatus === 'occupied') {
            // Car just arrived — record arrival timestamp
            spotRef.update({
                status: 'occupied',
                arrivedAt: now
            });
        } else {
            // Car just left — push to history, clear current session
            const arrivedAt = spot.arrivedAt || now;
            const duration = now - arrivedAt;

            const historyEntry = {
                arrivedAt: arrivedAt,
                leftAt: now,
                duration: duration
            };

            // Append to history array (max 10 entries stored)
            const currentHistory = Array.isArray(spot.history) ? spot.history : [];
            const updatedHistory = [...currentHistory, historyEntry].slice(-10);

            spotRef.update({
                status: 'free',
                arrivedAt: null,
                history: updatedHistory
            });
        }
    }

    // ─── Report Modal ────────────────────────────────────────────────────────────

    function setupModal() {
        closeModalBtn.addEventListener('click', closeReportModal);
        reportModal.addEventListener('click', (e) => {
            if (e.target === reportModal) closeReportModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeReportModal();
        });
    }

    function openReportModal(spot) {
        // Update title
        modalSpotId.textContent = `Spot ${spot.id}`;

        // Clear old interval if any
        if (durationInterval) clearInterval(durationInterval);

        // ── Current status section ──
        if (spot.status === 'occupied' && spot.arrivedAt) {
            const updateDurationDisplay = () => {
                const elapsed = Date.now() - spot.arrivedAt;
                modalCurrentDuration.textContent = `🚗 Occupied — parked for ${formatDuration(elapsed)}`;
            };
            updateDurationDisplay();
            durationInterval = setInterval(updateDurationDisplay, 1000);
        } else {
            modalCurrentDuration.textContent = '✅ Currently free';
        }

        // ── History section ──
        modalHistoryList.innerHTML = '';
        const history = Array.isArray(spot.history) ? spot.history : [];

        if (history.length === 0) {
            const li = document.createElement('li');
            li.className = 'history-empty';
            li.textContent = 'No previous cars recorded for this spot.';
            modalHistoryList.appendChild(li);
        } else {
            // Show most recent first
            [...history].reverse().forEach((entry, i) => {
                const li = document.createElement('li');
                const dur = formatDuration(entry.duration);
                const arrived = formatTimestamp(entry.arrivedAt);
                const left = formatTimestamp(entry.leftAt);
                li.innerHTML = `
                    <div class="history-entry-num">#${history.length - i}</div>
                    <div class="history-entry-detail">
                        <span class="history-duration">⏱ ${dur}</span>
                        <span class="history-times">Arrived: ${arrived}</span>
                        <span class="history-times">Left: ${left}</span>
                    </div>
                `;
                modalHistoryList.appendChild(li);
            });
        }

        reportModal.classList.remove('hidden');
    }

    function closeReportModal() {
        reportModal.classList.add('hidden');
        if (durationInterval) {
            clearInterval(durationInterval);
            durationInterval = null;
        }
    }
});

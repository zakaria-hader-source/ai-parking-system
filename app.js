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

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.database();

document.addEventListener('DOMContentLoaded', () => {

    // ─── State ────────────────────────────────────────────────────────────────────
    const state = {
        currentFloor: 1,
        isManualMode: false,
        floors: { 1: [], 2: [], 3: [], 4: [] },
        autoResetEnabled: false,
        autoResetTime: '23:00',
        autoResetFired: false  // prevent firing twice in the same minute
    };

    // ─── DOM ──────────────────────────────────────────────────────────────────────
    const gridContainer       = document.getElementById('parking-grid');
    const floorBtns           = document.querySelectorAll('.nav-btn');
    const globalFreeCount     = document.getElementById('global-free-count');
    const globalOccupiedCount = document.getElementById('global-occupied-count');
    const currentFloorTitle   = document.getElementById('current-floor-title');
    const manualModeBtn       = document.getElementById('manual-mode-btn');
    const modeText            = document.getElementById('mode-text');
    const appTitle            = document.getElementById('app-title');
    const statusText          = document.querySelector('.status-indicator').nextElementSibling;

    // Clock
    const clockTime = document.getElementById('clock-time');
    const clockDate = document.getElementById('clock-date');

    // Reset panel
    const resetAllBtn       = document.getElementById('reset-all-btn');
    const autoResetToggle   = document.getElementById('auto-reset-toggle');
    const autoResetTimeInput= document.getElementById('auto-reset-time');
    const autoResetStatus   = document.getElementById('auto-reset-status');

    // Confirm modal
    const confirmModal      = document.getElementById('confirm-modal');
    const confirmTitle      = document.getElementById('confirm-title');
    const confirmMessage    = document.getElementById('confirm-message');
    const confirmOkBtn      = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn  = document.getElementById('confirm-cancel-btn');

    // Report modal
    const reportModal           = document.getElementById('report-modal');
    const closeModalBtn         = document.getElementById('close-modal');
    const modalSpotId           = document.getElementById('modal-spot-id');
    const modalCurrentDuration  = document.getElementById('modal-current-duration');
    const modalHistoryList      = document.getElementById('modal-history-list');

    let durationInterval = null;
    let pendingConfirmCallback = null;

    // ─── Boot ─────────────────────────────────────────────────────────────────────
    init();

    async function init() {
        setupClock();
        setupNavigation();
        setupModeToggle();
        setupModal();
        setupResetPanel();
        setupConfirmModal();

        statusText.textContent = "Connecting to Firebase...";
        await checkAndSeedDatabase();
        listenToFirebase();
    }

    // ─── Clock ────────────────────────────────────────────────────────────────────

    function setupClock() {
        const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

        function tick() {
            const now = new Date();
            const hh  = String(now.getHours()).padStart(2, '0');
            const mm  = String(now.getMinutes()).padStart(2, '0');
            const ss  = String(now.getSeconds()).padStart(2, '0');
            clockTime.textContent = `${hh}:${mm}:${ss}`;

            const day   = DAYS[now.getDay()];
            const date  = String(now.getDate()).padStart(2, '0');
            const month = MONTHS[now.getMonth()];
            const year  = now.getFullYear();
            clockDate.textContent = `${day}, ${date} ${month} ${year}`;

            // ── Auto-reset check (runs every second, acts only at :00) ──
            if (state.autoResetEnabled) {
                const currentHHMM = `${hh}:${mm}`;
                if (ss === '00' && currentHHMM === state.autoResetTime) {
                    if (!state.autoResetFired) {
                        state.autoResetFired = true;
                        triggerAutoReset();
                    }
                } else if (ss !== '00') {
                    state.autoResetFired = false; // reset flag each new second
                }
            }
        }

        tick();
        setInterval(tick, 1000);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────────

    function formatDuration(ms) {
        if (!ms || ms < 0) return '0s';
        const totalSeconds = Math.floor(ms / 1000);
        const hours   = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0)   return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    function formatTimestamp(ts) {
        if (!ts) return 'Unknown';
        return new Date(ts).toLocaleString();
    }

    // ─── Database seeding ─────────────────────────────────────────────────────────

    function generateFloorData(floorNum, totalSpots) {
        const prefix = floorNum === 1 ? 'G' : floorNum === 2 ? 'S' : floorNum === 3 ? 'T' : 'VIP';
        return Array.from({ length: totalSpots }, (_, i) => ({
            id:      `${prefix}-${String(i + 1).padStart(3, '0')}`,
            status:  'free',
            isVip:   floorNum === 4,
            history: []
        }));
    }

    async function checkAndSeedDatabase() {
        const snap = await db.ref('floors').once('value');
        if (!snap.exists()) {
            await db.ref('floors').set({
                1: generateFloorData(1, 100),
                2: generateFloorData(2, 100),
                3: generateFloorData(3, 100),
                4: generateFloorData(4, 20)
            });
        }
    }

    // ─── Firebase listener ────────────────────────────────────────────────────────

    function listenToFirebase() {
        db.ref('floors').on('value', (snap) => {
            if (snap.exists()) {
                state.floors = snap.val();
                if (!state.isManualMode) {
                    statusText.textContent = "Firebase Live Connection (AI Active)";
                }
                renderFloor(state.currentFloor);
                updateDashboard();
            }
        });
    }

    // ─── Render ───────────────────────────────────────────────────────────────────

    function renderFloor(floorNum) {
        gridContainer.classList.remove('fade-in');
        void gridContainer.offsetWidth;
        gridContainer.classList.add('fade-in');

        const floorData = state.floors[floorNum] || [];
        gridContainer.innerHTML = '';

        const names = { 1: "Ground Floor Layout", 2: "Second Floor Layout", 3: "Third Floor Layout", 4: "VIP Lounge Layout" };
        currentFloorTitle.textContent = names[floorNum];

        floorData.forEach((spot, index) => {
            if (!spot) return;

            const el = document.createElement('div');
            el.className = `parking-spot ${spot.status}${spot.isVip ? ' vip' : ''}`;
            el.id = `spot-${spot.id}`;
            el.style.animationDelay = `${(index % 20) * 0.02}s`;

            const evSvg = `<svg class="ev-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.5 2.5L6 14h7l-1.5 7.5L20 8h-7l1.5-5.5z"/>
            </svg>`;

            const carSvg = spot.status === 'occupied' ? `<svg class="car-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>` : '';

            const reportBtnHtml = `<button class="report-btn" title="View spot report">!</button>`;

            el.innerHTML = evSvg + carSvg + `<span class="spot-id">${spot.id}</span>` + reportBtnHtml;

            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('report-btn')) return;
                if (state.isManualMode) toggleSpotStatusInFirebase(floorNum, index, spot);
            });

            el.querySelector('.report-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openReportModal(spot);
            });

            gridContainer.appendChild(el);
        });
    }

    // ─── Dashboard ────────────────────────────────────────────────────────────────

    function updateDashboard() {
        let free = 0, occupied = 0;
        Object.values(state.floors).forEach(floor => {
            if (!floor) return;
            floor.forEach(spot => {
                if (!spot) return;
                spot.status === 'free' ? free++ : occupied++;
            });
        });
        globalFreeCount.textContent     = free;
        globalOccupiedCount.textContent = occupied;
    }

    // ─── Navigation ───────────────────────────────────────────────────────────────

    function setupNavigation() {
        floorBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const floor = parseInt(e.currentTarget.dataset.floor);
                if (state.currentFloor === floor) return;
                floorBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                state.currentFloor = floor;
                renderFloor(floor);
            });
        });
    }

    // ─── Mode Toggle ──────────────────────────────────────────────────────────────

    function setupModeToggle() {
        manualModeBtn.addEventListener('click', () => {
            state.isManualMode = !state.isManualMode;
            if (state.isManualMode) {
                document.body.classList.add('manual-mode');
                appTitle.textContent    = "Manual Parking";
                modeText.textContent    = "Switch to AI Mode";
                statusText.textContent  = "Live Connection Paused (Manual Edit Mode)";
            } else {
                document.body.classList.remove('manual-mode');
                appTitle.textContent    = "AIParking";
                modeText.textContent    = "Switch to Manual";
                statusText.textContent  = "Firebase Live Connection (AI Active)";
            }
        });
    }

    // ─── Toggle spot ──────────────────────────────────────────────────────────────

    function toggleSpotStatusInFirebase(floorNum, index, spot) {
        const now       = Date.now();
        const newStatus = spot.status === 'free' ? 'occupied' : 'free';
        const spotRef   = db.ref(`floors/${floorNum}/${index}`);

        if (newStatus === 'occupied') {
            spotRef.update({ status: 'occupied', arrivedAt: now });
        } else {
            const arrivedAt = spot.arrivedAt || now;
            const entry = { arrivedAt, leftAt: now, duration: now - arrivedAt };
            const history = [...(Array.isArray(spot.history) ? spot.history : []), entry].slice(-10);
            spotRef.update({ status: 'free', arrivedAt: null, history });
        }
    }

    // ─── Reset All ────────────────────────────────────────────────────────────────

    function setupResetPanel() {
        resetAllBtn.addEventListener('click', () => {
            showConfirm(
                'Reset All Spots?',
                'This will mark all 320 parking spots as <strong>free</strong> and save current sessions to history.',
                () => performResetAll('Manual reset by operator')
            );
        });

        autoResetToggle.addEventListener('change', () => {
            state.autoResetEnabled = autoResetToggle.checked;
            updateAutoResetStatus();
        });

        autoResetTimeInput.addEventListener('change', () => {
            state.autoResetTime = autoResetTimeInput.value;
            updateAutoResetStatus();
        });
    }

    function updateAutoResetStatus() {
        if (state.autoResetEnabled) {
            const [h, m] = state.autoResetTime.split(':');
            const hour = parseInt(h);
            const suffix = hour >= 12 ? 'PM' : 'AM';
            const display12 = ((hour % 12) || 12) + ':' + m + ' ' + suffix;
            autoResetStatus.textContent = `Auto-reset scheduled at ${display12}`;
            autoResetStatus.classList.add('active');
        } else {
            autoResetStatus.textContent = 'Auto-reset: off';
            autoResetStatus.classList.remove('active');
        }
    }

    async function performResetAll(reason) {
        const now = Date.now();
        const updates = {};

        // Build flat update for every spot across all floors
        [1, 2, 3, 4].forEach(floorNum => {
            const floor = state.floors[floorNum];
            if (!Array.isArray(floor)) return;

            floor.forEach((spot, index) => {
                if (!spot) return;
                const history = Array.isArray(spot.history) ? spot.history : [];
                let updatedHistory = history;

                if (spot.status === 'occupied' && spot.arrivedAt) {
                    // Save this session to history before clearing
                    const entry = {
                        arrivedAt: spot.arrivedAt,
                        leftAt: now,
                        duration: now - spot.arrivedAt,
                        resetReason: reason
                    };
                    updatedHistory = [...history, entry].slice(-10);
                }

                updates[`floors/${floorNum}/${index}/status`]    = 'free';
                updates[`floors/${floorNum}/${index}/arrivedAt`]  = null;
                updates[`floors/${floorNum}/${index}/history`]    = updatedHistory;
            });
        });

        await db.ref('/').update(updates);
        showResetFlash();
    }

    function triggerAutoReset() {
        const [h, m] = state.autoResetTime.split(':');
        const hour = parseInt(h);
        const suffix = hour >= 12 ? 'PM' : 'AM';
        const display12 = ((hour % 12) || 12) + ':' + m + ' ' + suffix;

        showConfirm(
            `⏰ Scheduled Reset at ${display12}`,
            `The automatic nightly reset has triggered. All spots will be cleared and sessions saved to history.`,
            () => performResetAll(`Auto-reset at ${state.autoResetTime}`),
            true // auto-confirm after 10s
        );
    }

    // Flash the grid to signal a successful reset
    function showResetFlash() {
        gridContainer.classList.add('reset-flash');
        setTimeout(() => gridContainer.classList.remove('reset-flash'), 700);
    }

    // ─── Confirm Modal ────────────────────────────────────────────────────────────

    let autoConfirmTimer = null;

    function setupConfirmModal() {
        confirmOkBtn.addEventListener('click', () => {
            closeConfirmModal();
            if (pendingConfirmCallback) pendingConfirmCallback();
        });
        confirmCancelBtn.addEventListener('click', closeConfirmModal);
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) closeConfirmModal();
        });
    }

    function showConfirm(title, message, onOk, autoConfirm = false) {
        confirmTitle.textContent   = title;
        confirmMessage.innerHTML   = message;
        pendingConfirmCallback     = onOk;
        confirmModal.classList.remove('hidden');

        if (autoConfirm) {
            let countdown = 10;
            confirmOkBtn.textContent = `Reset Now (${countdown}s)`;
            autoConfirmTimer = setInterval(() => {
                countdown--;
                confirmOkBtn.textContent = countdown > 0
                    ? `Reset Now (${countdown}s)`
                    : 'Reset Now';
                if (countdown <= 0) {
                    clearInterval(autoConfirmTimer);
                    closeConfirmModal();
                    if (pendingConfirmCallback) pendingConfirmCallback();
                }
            }, 1000);
        }
    }

    function closeConfirmModal() {
        confirmModal.classList.add('hidden');
        confirmOkBtn.textContent = 'Reset Now';
        if (autoConfirmTimer) {
            clearInterval(autoConfirmTimer);
            autoConfirmTimer = null;
        }
        pendingConfirmCallback = null;
    }

    // ─── Report Modal ─────────────────────────────────────────────────────────────

    function setupModal() {
        closeModalBtn.addEventListener('click', closeReportModal);
        reportModal.addEventListener('click', (e) => {
            if (e.target === reportModal) closeReportModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { closeReportModal(); closeConfirmModal(); }
        });
    }

    function openReportModal(spot) {
        modalSpotId.textContent = `Spot ${spot.id}`;
        if (durationInterval) clearInterval(durationInterval);

        if (spot.status === 'occupied' && spot.arrivedAt) {
            const update = () => {
                const elapsed = Date.now() - spot.arrivedAt;
                modalCurrentDuration.textContent = `🚗 Occupied — parked for ${formatDuration(elapsed)}`;
            };
            update();
            durationInterval = setInterval(update, 1000);
        } else {
            modalCurrentDuration.textContent = '✅ Currently free';
        }

        modalHistoryList.innerHTML = '';
        const history = Array.isArray(spot.history) ? spot.history : [];

        if (history.length === 0) {
            const li = document.createElement('li');
            li.className = 'history-empty';
            li.textContent = 'No previous cars recorded for this spot.';
            modalHistoryList.appendChild(li);
        } else {
            [...history].reverse().forEach((entry, i) => {
                const li = document.createElement('li');
                const label = entry.resetReason ? `⚠️ Reset — ${entry.resetReason}` : '';
                li.innerHTML = `
                    <div class="history-entry-num">#${history.length - i}</div>
                    <div class="history-entry-detail">
                        <span class="history-duration">⏱ ${formatDuration(entry.duration)}</span>
                        <span class="history-times">Arrived: ${formatTimestamp(entry.arrivedAt)}</span>
                        <span class="history-times">Left: ${formatTimestamp(entry.leftAt)}</span>
                        ${label ? `<span class="history-reset-tag">${label}</span>` : ''}
                    </div>
                `;
                modalHistoryList.appendChild(li);
            });
        }

        reportModal.classList.remove('hidden');
    }

    function closeReportModal() {
        reportModal.classList.add('hidden');
        if (durationInterval) { clearInterval(durationInterval); durationInterval = null; }
    }
});

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

    // Initialize App
    init();

    async function init() {
        setupNavigation();
        setupModeToggle();
        
        statusText.textContent = "Connecting to Firebase...";
        
        // Check if DB is empty, if so, seed it
        await checkAndSeedDatabase();
        
        // Start listening to live data
        listenToFirebase();
    }

    // Generate initial dummy data for seeding
    function generateFloorData(floorNum, totalSpots) {
        const spots = [];
        const floorPrefix = floorNum === 1 ? 'G' : floorNum === 2 ? 'S' : floorNum === 3 ? 'T' : 'VIP';
        
        for (let i = 1; i <= totalSpots; i++) {
            spots.push({
                id: `${floorPrefix}-${i.toString().padStart(3, '0')}`,
                status: 'free', // Start all free
                isVip: floorNum === 4
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

    function listenToFirebase() {
        const floorsRef = db.ref('floors');
        floorsRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                state.floors = snapshot.val();
                
                // If not in manual mode, the AI is "running" (live connection)
                if (!state.isManualMode) {
                    statusText.textContent = "Firebase Live Connection (AI Active)";
                }
                
                renderFloor(state.currentFloor);
                updateDashboard();
            }
        });
    }

    // Render a specific floor
    function renderFloor(floorNum) {
        // Trigger CSS animation by removing and re-adding class
        gridContainer.classList.remove('fade-in');
        void gridContainer.offsetWidth; // trigger reflow
        gridContainer.classList.add('fade-in');

        const floorData = state.floors[floorNum] || [];
        gridContainer.innerHTML = ''; // clear current
        
        // Update Title
        const floorNames = { 1: "Ground Floor Layout", 2: "Second Floor Layout", 3: "Third Floor Layout", 4: "VIP Lounge Layout" };
        currentFloorTitle.textContent = floorNames[floorNum];

        floorData.forEach((spot, index) => {
            if (!spot) return; // safety
            const spotEl = document.createElement('div');
            spotEl.className = `parking-spot ${spot.status}`;
            if (spot.isVip) {
                spotEl.classList.add('vip');
            }
            spotEl.id = `spot-${spot.id}`;
            // Add a slight stagger effect based on index to the initial load 
            spotEl.style.animationDelay = `${(index % 20) * 0.02}s`;
            
            let innerHtml = `<span class="spot-id">${spot.id}</span>`;
            if (spot.status === 'occupied') {
                // SVG Graphic for a car
                const carSvg = `<svg class="car-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`;
                innerHtml = carSvg + innerHtml;
            }
            spotEl.innerHTML = innerHtml;
            
            // Allow click interaction only in manual mode
            spotEl.addEventListener('click', () => {
                if (state.isManualMode) {
                    toggleSpotStatusInFirebase(floorNum, index, spot);
                }
            });

            gridContainer.appendChild(spotEl);
        });
    }

    // Update global dashboard statistics
    function updateDashboard() {
        let totalFree = 0;
        let totalOccupied = 0;

        Object.values(state.floors).forEach(floor => {
            if(!floor) return;
            floor.forEach(spot => {
                if(!spot) return;
                if (spot.status === 'free') totalFree++;
                else totalOccupied++;
            });
        });

        globalFreeCount.textContent = totalFree;
        globalOccupiedCount.textContent = totalOccupied;
    }

    // Setup floor navigation buttons
    function setupNavigation() {
        floorBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetBtn = e.currentTarget;
                const floor = parseInt(targetBtn.dataset.floor);
                
                if (state.currentFloor === floor) return;

                // Update active state on buttons
                floorBtns.forEach(b => b.classList.remove('active'));
                targetBtn.classList.add('active');

                // Switch floor
                state.currentFloor = floor;
                renderFloor(floor);
            });
        });
    }

    // Setup mode toggle button
    function setupModeToggle() {
        manualModeBtn.addEventListener('click', () => {
            state.isManualMode = !state.isManualMode;
            
            if (state.isManualMode) {
                // Enter Manual Mode
                document.body.classList.add('manual-mode');
                appTitle.textContent = "Manual Parking";
                modeText.textContent = "Switch to AI Mode";
                statusText.textContent = "Live Connection Paused (Manual Edit Mode)";
                
            } else {
                // Enter AI Mode
                document.body.classList.remove('manual-mode');
                appTitle.textContent = "AIParking";
                modeText.textContent = "Switch to Manual";
                statusText.textContent = "Firebase Live Connection (AI Active)";
            }
        });
    }

    // Toggle spot status manually by pushing to Firebase
    function toggleSpotStatusInFirebase(floorNum, spotIndex, spot) {
        const newStatus = spot.status === 'free' ? 'occupied' : 'free';
        
        // Update directly in Firebase
        const spotRef = db.ref(`floors/${floorNum}/${spotIndex}`);
        spotRef.update({
            status: newStatus
        });
        
        // No need to manually update the DOM here because the `on('value')` listener
        // will automatically detect the database change and re-render the floor!
    }
});

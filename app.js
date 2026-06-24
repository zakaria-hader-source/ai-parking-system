document.addEventListener('DOMContentLoaded', () => {
    const state = {
        currentFloor: 1,
        isManualMode: false,
        simulationInterval: null,
        floors: {
            1: generateFloorData(1, 100),
            2: generateFloorData(2, 100),
            3: generateFloorData(3, 100),
            4: generateFloorData(4, 20),
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

    // Initialize App
    init();

    function init() {
        renderFloor(state.currentFloor);
        updateDashboard();
        setupNavigation();
        setupModeToggle();
        startSimulation();
    }

    // Generate initial dummy data
    function generateFloorData(floorNum, totalSpots) {
        const spots = [];
        const floorPrefix = floorNum === 1 ? 'G' : floorNum === 2 ? 'S' : floorNum === 3 ? 'T' : 'VIP';
        
        for (let i = 1; i <= totalSpots; i++) {
            spots.push({
                id: `${floorPrefix}-${i.toString().padStart(3, '0')}`,
                // ~70% occupied, 30% free initially
                status: Math.random() > 0.3 ? 'occupied' : 'free',
                isVip: floorNum === 4
            });
        }
        return spots;
    }

    // Render a specific floor
    function renderFloor(floorNum) {
        // Trigger CSS animation by removing and re-adding class
        gridContainer.classList.remove('fade-in');
        void gridContainer.offsetWidth; // trigger reflow
        gridContainer.classList.add('fade-in');

        const floorData = state.floors[floorNum];
        gridContainer.innerHTML = ''; // clear current
        
        // Update Title
        const floorNames = { 1: "Ground Floor Layout", 2: "Second Floor Layout", 3: "Third Floor Layout", 4: "VIP Lounge Layout" };
        currentFloorTitle.textContent = floorNames[floorNum];

        floorData.forEach((spot, index) => {
            const spotEl = document.createElement('div');
            spotEl.className = `parking-spot ${spot.status}`;
            if (spot.isVip) {
                spotEl.classList.add('vip');
            }
            spotEl.id = `spot-${spot.id}`;
            // Add a slight stagger effect based on index to the initial load 
            spotEl.style.animationDelay = `${(index % 20) * 0.02}s`;
            
            spotEl.innerHTML = `<span class="spot-id">${spot.id}</span>`;
            
            // Allow click interaction only in manual mode
            spotEl.addEventListener('click', () => {
                if (state.isManualMode) {
                    toggleSpotStatus(floorNum, index);
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
            floor.forEach(spot => {
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
                document.querySelector('.status-indicator').nextElementSibling.textContent = "Simulation Paused (Manual)";
                
                // Stop simulation
                if (state.simulationInterval) {
                    clearInterval(state.simulationInterval);
                }
            } else {
                // Enter AI Mode
                document.body.classList.remove('manual-mode');
                appTitle.textContent = "AIParking";
                modeText.textContent = "Switch to Manual";
                document.querySelector('.status-indicator').nextElementSibling.textContent = "Firebase Connected (Simulated)";
                
                // Restart simulation
                startSimulation();
            }
        });
    }

    // Toggle spot status manually
    function toggleSpotStatus(floorNum, spotIndex) {
        const spot = state.floors[floorNum][spotIndex];
        spot.status = spot.status === 'free' ? 'occupied' : 'free';
        
        // Update DOM if currently on that floor
        if (state.currentFloor === floorNum) {
            const spotEl = document.getElementById(`spot-${spot.id}`);
            spotEl.className = `parking-spot ${spot.status}${spot.isVip ? ' vip' : ''}`;
        }
        
        updateDashboard();
    }

    // Simulate real-time updates (AI processing cars coming and going)
    function startSimulation() {
        if (state.simulationInterval) {
            clearInterval(state.simulationInterval);
        }
        
        state.simulationInterval = setInterval(() => {
            // Pick a random floor (1 to 4)
            const randomFloor = Math.floor(Math.random() * 4) + 1;
            // Pick a random spot based on floor
            const floorSpotsCount = randomFloor === 4 ? 20 : 100;
            const randomSpotIndex = Math.floor(Math.random() * floorSpotsCount);
            
            // Toggle it
            toggleSpotStatus(randomFloor, randomSpotIndex);
            
        }, 60000); // Every 1 minute a car arrives or leaves
    }
});

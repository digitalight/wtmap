// Application State Management
const AppState = {
  towers: [],
  towersLoaded: false,
  position: null,
  heading: 0,
  nearestTower: null,
  lastCalculationPosition: null,
  permissions: {
    location: false,
    orientation: false,
  },
};

// Configuration
const CONFIG = {
  UPDATE_INTERVAL: 100, // Update every 100ms max
  HEADING_HISTORY_SIZE: 5,
  MOVEMENT_THRESHOLD: 100, // meters
  MAX_TOWER_DISTANCE: 50000, // 50km
  MIN_HEADING_CHANGE: 2, // degrees
};

// DOM Elements
const info = document.getElementById("info");
const status = document.getElementById("status");
const needle = document.getElementById("compass-needle");
const compassBase = document.getElementById("compass-base");
const enableBtn = document.getElementById("enable-compass");

// State variables
let compassCalibration = 0;
let lastKnownHeading = 0;
let headingHistory = [];
let lastUpdateTime = 0;
let wakeLock = null;
let watchId = null;

// Utility Functions
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function calculateCentroid(coordinates) {
  let latSum = 0,
    lngSum = 0,
    count = 0;

  if (Array.isArray(coordinates[0][0])) {
    // Handle Polygons
    coordinates[0].forEach((coord) => {
      lngSum += coord[0];
      latSum += coord[1];
      count++;
    });
  } else {
    // Handle LineStrings
    coordinates.forEach((coord) => {
      lngSum += coord[0];
      latSum += coord[1];
      count++;
    });
  }

  return [latSum / count, lngSum / count];
}

// Status Management
function setStatus(message, type = "info") {
  status.textContent = message;
  status.className = `status-${type}`;
}

function showLoading(message) {
  setStatus(`${message}...`, "loading");
}

function showError(message) {
  setStatus(message, "error");
}

function showSuccess(message) {
  setStatus(message, "success");
}

// Wake Lock Management
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("Wake lock acquired");
    }
  } catch (err) {
    console.warn("Wake lock failed:", err);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
    console.log("Wake lock released");
  }
}

// Data Loading
async function loadWaterTowers() {
  try {
    showLoading("Loading water towers");

    const res = await fetch("data/wt.geojson");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    AppState.towers = data.features
      .map((f) => {
        if (f.geometry?.type === "Point") {
          const [lon, lat] = f.geometry.coordinates;
          return {
            lat,
            lon,
            name: f.properties?.name || "Unnamed Tower",
            county: f.properties?.county || "Unknown County",
          };
        }
        // Handle polygons/linestrings with centroid
        if (
          f.geometry?.type === "Polygon" ||
          f.geometry?.type === "LineString"
        ) {
          const centroid = calculateCentroid(f.geometry.coordinates);
          return {
            lat: centroid[0],
            lon: centroid[1],
            name: f.properties?.name || "Unnamed Tower",
            county: f.properties?.county || "Unknown County",
          };
        }
        return null;
      })
      .filter(Boolean);

    AppState.towersLoaded = true;
    showSuccess(`Loaded ${AppState.towers.length} towers`);
    tryUpdateCompass();
  } catch (err) {
    showError(`Failed to load towers: ${err.message}`);
    console.error("Tower loading error:", err);
  }
}

// Location Management
function enableLocationListener() {
  if (!navigator.geolocation) {
    showError("Geolocation not supported");
    return;
  }

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  };

  showLoading("Getting location");

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      AppState.position = position;
      AppState.permissions.location = true;
      showSuccess("Location acquired");
      tryUpdateCompass();
    },
    (error) => {
      let errorMessage = "Location error: ";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMessage += "Permission denied";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage += "Position unavailable";
          break;
        case error.TIMEOUT:
          errorMessage += "Request timeout";
          break;
        default:
          errorMessage += "Unknown error";
      }
      showError(errorMessage);
    },
    options
  );
}

// Compass Management
function enableCompassListener() {
  // Check for compass support
  if (!window.DeviceOrientationEvent) {
    showError("Compass not supported");
    return;
  }

  // Request permission on iOS 13+
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((response) => {
        if (response === "granted") {
          startCompassListening();
        } else {
          showError("Compass permission denied");
        }
      })
      .catch((err) => {
        showError("Compass permission error");
        console.error(err);
      });
  } else {
    startCompassListening();
  }
}

function startCompassListening() {
  AppState.permissions.orientation = true;
  showSuccess("Compass enabled");

  // Use absolute orientation if available (more accurate)
  window.addEventListener("deviceorientationabsolute", handleOrientation, true);
  window.addEventListener("deviceorientation", handleOrientation, true);

  showCalibrationPrompt();
}

function handleOrientation(e) {
  let rawHeading;

  if (e.webkitCompassHeading !== undefined) {
    // iOS - already magnetic north
    rawHeading = e.webkitCompassHeading;
  } else if (e.alpha !== null) {
    // Android - convert from device orientation to compass heading
    rawHeading = (360 - e.alpha) % 360;
  } else {
    return;
  }

  // Apply smoothing to reduce jitter
  headingHistory.push(rawHeading);
  if (headingHistory.length > CONFIG.HEADING_HISTORY_SIZE) {
    headingHistory.shift();
  }

  const smoothedHeading =
    headingHistory.reduce((a, b) => a + b) / headingHistory.length;

  if (
    Math.abs(smoothedHeading - lastKnownHeading) > CONFIG.MIN_HEADING_CHANGE
  ) {
    AppState.heading = (smoothedHeading + compassCalibration) % 360;
    lastKnownHeading = smoothedHeading;
    tryUpdateCompass();
  }
}

// Tower Finding
function shouldRecalculateNearest() {
  if (!AppState.lastCalculationPosition || !AppState.position) return true;

  const moved = haversineDistance(
    AppState.lastCalculationPosition.lat,
    AppState.lastCalculationPosition.lon,
    AppState.position.coords.latitude,
    AppState.position.coords.longitude
  );

  return moved > CONFIG.MOVEMENT_THRESHOLD;
}

function findNearestTower(lat, lon, towers) {
  if (!towers.length) return null;

  const nearby = towers
    .map((tower) => ({
      ...tower,
      distance: haversineDistance(lat, lon, tower.lat, tower.lon),
    }))
    .filter((tower) => tower.distance < CONFIG.MAX_TOWER_DISTANCE)
    .sort((a, b) => a.distance - b.distance);

  return nearby[0] || null;
}

// Compass Display
function rotateNeedle(targetAngle) {
  let currentAngle = parseFloat(needle.dataset.currentAngle) || 0;

  // Calculate shortest path
  let delta = targetAngle - currentAngle;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;

  const newAngle = currentAngle + delta;
  needle.dataset.currentAngle = newAngle;
  needle.style.transform = `rotate(${newAngle}deg)`;
}

function updateCompassDisplay() {
  if (!AppState.nearestTower) return;

  const bearing = calculateBearing(
    AppState.position.coords.latitude,
    AppState.position.coords.longitude,
    AppState.nearestTower.lat,
    AppState.nearestTower.lon
  );

  const adjustedBearing = (bearing - AppState.heading + 360) % 360;
  rotateNeedle(adjustedBearing);

  // Update info display
  const distance = AppState.nearestTower.distance;
  const distanceText =
    distance < 1000
      ? `${Math.round(distance)}m`
      : `${(distance / 1000).toFixed(1)}km`;

  info.innerHTML = `
    <strong>${AppState.nearestTower.name}</strong><br>
    <small>${AppState.nearestTower.county}</small><br>
    Distance: ${distanceText}<br>
    Bearing: ${Math.round(bearing)}°
  `;
}

// Main Update Function
function tryUpdateCompass() {
  const now = Date.now();
  if (now - lastUpdateTime < CONFIG.UPDATE_INTERVAL) return;
  lastUpdateTime = now;

  if (!AppState.towersLoaded || !AppState.position) return;

  // Cache calculations
  if (!AppState.nearestTower || shouldRecalculateNearest()) {
    AppState.nearestTower = findNearestTower(
      AppState.position.coords.latitude,
      AppState.position.coords.longitude,
      AppState.towers
    );

    AppState.lastCalculationPosition = {
      lat: AppState.position.coords.latitude,
      lon: AppState.position.coords.longitude,
    };
  }

  if (!AppState.nearestTower) {
    info.textContent = "No towers found nearby.";
    return;
  }

  updateCompassDisplay();
}

// Calibration
function showCalibrationPrompt() {
  const calibrateBtn = document.createElement("button");
  calibrateBtn.textContent = "Calibrate Compass";
  calibrateBtn.className = "calibrate-btn";
  calibrateBtn.onclick = () => {
    alert("Move your device in a figure-8 pattern to calibrate the compass");
    calibrateBtn.remove();
  };

  // Insert after compass container
  const compassContainer = document.getElementById("compass-container");
  compassContainer.parentNode.insertBefore(
    calibrateBtn,
    compassContainer.nextSibling
  );

  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (calibrateBtn.parentNode) {
      calibrateBtn.remove();
    }
  }, 10000);
}

// Event Listeners
enableBtn.addEventListener("click", async () => {
  enableBtn.disabled = true;
  enableBtn.textContent = "Enabling...";

  await requestWakeLock();

  // Load towers and enable sensors
  await loadWaterTowers();
  enableLocationListener();
  enableCompassListener();

  enableBtn.style.display = "none";
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  releaseWakeLock();
  if (watchId) {
    navigator.geolocation.clearWatch(watchId);
  }
});

// Handle visibility change
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    releaseWakeLock();
  } else if (
    AppState.permissions.location &&
    AppState.permissions.orientation
  ) {
    requestWakeLock();
  }
});

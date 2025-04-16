let waterTowers = [];
let towersLoaded = false;
let currentPosition = null;
let currentHeading = 0;
let headingValid = false;

const info = document.getElementById('info');
const status = document.getElementById('status');
const needle = document.getElementById('compass-needle');

// Fetch the water tower GeoJSON
fetch('data/wt.geojson')
  .then(res => res.json())
  .then(data => {
    waterTowers = data.features.map(f => {
      const coords = f.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return { lat: coords[1], lon: coords[0] };
    }).filter(Boolean);
    towersLoaded = true;
    tryUpdateCompass();
  })
  .catch(err => {
    console.error('Failed to load water towers:', err);
    status.textContent = 'Data load error';
  });

// Get compass heading (device orientation)
window.addEventListener(
  'deviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation',
  (e) => {
    let heading = null;

    if (typeof e.webkitCompassHeading !== 'undefined') {
      // iOS
      heading = e.webkitCompassHeading;
    } else if (e.absolute && e.alpha != null) {
      // Android with absolute orientation
      heading = 360 - e.alpha;
    }

    if (heading != null && !isNaN(heading)) {
      currentHeading = heading;
      headingValid = true;
      tryUpdateCompass();
    } else {
      status.textContent = 'Compass not supported';
    }
  },
  true
);


// Watch GPS position
navigator.geolocation.watchPosition(
  (pos) => {
    currentPosition = pos;
    tryUpdateCompass();
  },
  (err) => {
    status.textContent = 'Location error: ' + err.message;
    console.error(err);
  },
  {
    enableHighAccuracy: true,
    maximumAge: 1000,
  }
);

// Update when both GPS and data are ready
function tryUpdateCompass() {
  if (!towersLoaded || !currentPosition || !headingValid) return;

  const lat = currentPosition.coords.latitude;
  const lon = currentPosition.coords.longitude;

  const nearest = findNearestTower(lat, lon, waterTowers);
  if (!nearest) {
    info.textContent = 'No towers found.';
    return;
  }

  const distance = haversineDistance(lat, lon, nearest.lat, nearest.lon);
  const bearing = calculateBearing(lat, lon, nearest.lat, nearest.lon);

  if (isNaN(bearing) || isNaN(currentHeading)) {
    status.textContent = 'Invalid compass or bearing data.';
    return;
  }

  const adjustedBearing = bearing - currentHeading;

  rotateCompass(currentHeading);
  rotateNeedle(adjustedBearing);
  updateDisplay(distance, bearing);
  status.textContent = 'Live';
}

// Rotate compass base
function rotateCompass(angle) {
  const base = document.getElementById('compass-base');
  const deg = (360 - angle + 360) % 360; // Invert if needed
  base.style.transform = `rotate(${deg}deg)`;
}


// Rotate needle to point to target
function rotateNeedle(angle) {
  const deg = (angle + 360) % 360;
  needle.style.transform = `rotate(${deg}deg)`;
}

// Update UI with distance and cardinal direction
function updateDisplay(distanceMeters, bearing) {
  const units = distanceMeters >= 1609.34
    ? `${(distanceMeters / 1609.34).toFixed(2)} mi`
    : `${Math.round(distanceMeters)} m`;

  const direction = getCardinalDirection(bearing);
  info.textContent = `${units} • ${direction}`;
}

// Haversine distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = φ2 - φ1;
  const Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Bearing in degrees
function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Helper: Convert angle to N/NE/E... etc.
function getCardinalDirection(angle) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(angle / 45) % 8];
}

// Find the closest water tower
function findNearestTower(lat, lon, towers) {
  if (!towers.length) return null;
  return towers.reduce((nearest, tower) => {
    const dist = haversineDistance(lat, lon, tower.lat, tower.lon);
    return (!nearest || dist < nearest.distance)
      ? { ...tower, distance: dist }
      : nearest;
  }, null);
}

// Degrees ↔ Radians
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

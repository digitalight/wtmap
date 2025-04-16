let waterTowers = [];
let towersLoaded = false;
let currentPosition = null;
let currentHeading = 0;

const info = document.getElementById('info');
const status = document.getElementById('status');
const needle = document.getElementById('compass-needle');
const compassBase = document.getElementById('compass-base');
const enableBtn = document.getElementById('enable-compass');

// Fetch water tower GeoJSON
fetch('data/wt.geojson')
  .then(res => res.json())
  .then(data => {
    waterTowers = data.features.map(f => {
      const coords = f.geometry.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      return { lat: coords[1], lon: coords[0] };
    }).filter(t => t);
    towersLoaded = true;
    tryUpdateCompass();
  });

// Request motion permission (if needed)
enableBtn.addEventListener('click', async () => {
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response === 'granted') {
        enableCompassListener();
        enableBtn.style.display = 'none';
      } else {
        status.textContent = 'Permission denied.';
      }
    } catch (err) {
      status.textContent = 'Permission error: ' + err.message;
    }
  } else {
    enableCompassListener(); // Older Androids
    enableBtn.style.display = 'none';
  }
});

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;


// Enable heading tracking
function enableCompassListener() {
  window.addEventListener(
    'deviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation',
    (e) => {
      let heading;

      if (e.webkitCompassHeading != null) {
        // iOS
        heading = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        // Android (alpha is relative to magnetic north)
        heading = 360 - e.alpha;
      }

      if (heading != null && !isNaN(heading)) {
        currentHeading = isIOS ? heading : (heading + 180) % 360;
        tryUpdateCompass();
      } else {
        status.textContent = 'Compass data unavailable';
      }
    },
    true
  );
}

// Watch GPS
navigator.geolocation.watchPosition(pos => {
  currentPosition = pos;
  tryUpdateCompass();
}, err => {
  status.textContent = 'Location error: ' + err.message;
}, {
  enableHighAccuracy: true,
  maximumAge: 1000
});

// Compass logic
function tryUpdateCompass() {
  if (!towersLoaded || !currentPosition) return;

  const lat = currentPosition.coords.latitude;
  const lon = currentPosition.coords.longitude;

  const nearest = findNearestTower(lat, lon, waterTowers);
  if (!nearest) {
    info.textContent = 'No towers found.';
    return;
  }

  const distance = haversineDistance(lat, lon, nearest.lat, nearest.lon);
  const bearing = calculateBearing(lat, lon, nearest.lat, nearest.lon);
  const relativeBearing = (bearing - currentHeading + 360) % 360;

  rotateCompass(currentHeading);
  rotateNeedle(relativeBearing);
  updateDisplay(distance, bearing);
  status.textContent = 'Live';
}

// DOM updates
function rotateCompass(angle) {
  const deg = (360 - angle + 360) % 360; // Invert if needed
  compassBase.style.transform = `rotate(${deg}deg)`;
}

function rotateNeedle(angle) {
  needle.style.transform = `rotate(${angle}deg)`;
}

function updateDisplay(distanceMeters, bearing) {
  const units = distanceMeters >= 1609.34
    ? `${(distanceMeters / 1609.34).toFixed(2)} mi`
    : `${Math.round(distanceMeters)} m`;

  const direction = getCardinalDirection(bearing);
  info.textContent = `${units} • ${direction}`;
}

// Utils
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δφ = φ2 - φ1, Δλ = toRad(lon2 - lon1);
  const a = Math.sin(Δφ / 2)**2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function getCardinalDirection(angle) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(angle / 45) % 8];
}

function findNearestTower(lat, lon, towers) {
  if (!towers.length) return null;
  return towers.reduce((nearest, tower) => {
    const dist = haversineDistance(lat, lon, tower.lat, tower.lon);
    return (!nearest || dist < nearest.distance)
      ? { ...tower, distance: dist }
      : nearest;
  }, null);
}

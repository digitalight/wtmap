document.addEventListener("DOMContentLoaded", function () {
  // Default location (fallback): London, UK
  const defaultLat = 52.24;
  const defaultLng = -0.75;

  // Initialize the map
  const map = L.map("map").setView([defaultLat, defaultLng], 12);

  // Add tile layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Define the custom icon
  const rabbitIcon = L.icon({
    iconUrl: "assets/rabbit.png", // Path to the rabbit PNG
    iconSize: [40, 40], // Adjust size as needed
    iconAnchor: [20, 40], // Anchor point of the icon (center bottom)
  });

  // Variable to store the user's marker
  let userMarker = null;

  // Flag to track if the map has been centered
  let isMapCentered = false;

  // Function to update the user's location
  function updateUserLocation(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    // If the marker doesn't exist, create it
    if (!userMarker) {
      userMarker = L.marker([userLat, userLng], {
        icon: rabbitIcon,
      }).addTo(map);
    } else {
      // Update the marker's position
      userMarker.setLatLng([userLat, userLng]);
    }

    // Center the map only on the first load
    if (!isMapCentered) {
      map.setView([userLat, userLng], 12);
      isMapCentered = true; // Set the flag to true after centering
    }
  }

  // Try to get the user's location and update it every 15 seconds
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      updateUserLocation,
      (error) => {
        console.warn(
          "Geolocation failed or denied. Using default location.",
          error
        );
      },
      {
        enableHighAccuracy: true, // Enable high-precision mode
        minmumAge: 5000, // Minimum age of cached positions
        maximumAge: 10000, // Allow cached positions up to 10 seconds old
        timeout: 10000, // Timeout for each location request
      }
    );
  } else {
    console.warn("Geolocation is not supported by this browser.");
  }

  // Add event listener to the recenter button
  const recenterButton = document.getElementById("recenterButton");
  recenterButton.addEventListener("click", function (event) {
    event.preventDefault(); // Prevent the default link behavior

    if (userMarker) {
      // Temporarily set isMapCentered to false
      isMapCentered = false;

      // Recenter the map to the user's current location
      const userLat = userMarker.getLatLng().lat;
      const userLng = userMarker.getLatLng().lng;

      // Center the map on the user's location
      map.setView([userLat, userLng], 12);

      // Set the flag back to true after centering
      isMapCentered = true;
    }
  });

  // // Initialize the map and set the view to the UK
  // const map = L.map('map').setView([52.24, -0.75], 12); // Latitude and Longitude for the UK

  // // Add OpenStreetMap tile layer
  // L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  //     maxZoom: 19,
  //     attribution: '© OpenStreetMap contributors'
  // }).addTo(map);

  // Initialize a marker cluster group
  const markers = L.markerClusterGroup({
    maxClusterRadius: 140, // Default is 80. Lower values result in tighter clusters
  });
  const individualMarkers = L.layerGroup();

  // Function to calculate the centroid of a polygon or linestring
  function calculateCentroid(coordinates) {
    let latSum = 0,
      lngSum = 0,
      count = 0;

    if (Array.isArray(coordinates[0][0])) {
      // Handle Polygons (array of arrays of coordinates)
      coordinates[0].forEach((coord) => {
        lngSum += coord[0];
        latSum += coord[1];
        count++;
      });
    } else {
      // Handle LineStrings (array of coordinates)
      coordinates.forEach((coord) => {
        lngSum += coord[0];
        latSum += coord[1];
        count++;
      });
    }

    return [latSum / count, lngSum / count];
  }

  // Load the GeoJSON data
  fetch("data/wt.geojson") // Get Water Tower data
    .then((response) => response.json())
    .then((data) => {
      // Process each feature in the GeoJSON
      data.features.forEach((feature) => {
        const geometryType = feature.geometry.type;

        // Handle Points (Nodes)
        if (geometryType === "Point") {
          const coords = feature.geometry.coordinates;
          const marker = L.marker([coords[1], coords[0]]);

          // Add a popup with the name tag, if it exists
          marker.bindPopup(`
                    <b>${
                      feature.properties?.name || "Unnamed Water Tower"
                    }</b></br>
                    <div class="d-grid gap-3">
                    <a href="https://www.waze.com/ul?ll=${coords[1]},${
            coords[0]
          }&navigate=yes" target="_blank">
        <button class="btn btn-info btn-sm">Directions with Waze</button>
    </a>
                    <button class="btn btn-primary btn-sm" onclick="openStreetView(${
                      coords[1]
                    }, ${coords[0]})">Open Street View</button></div>
                `);

          // Add marker to both the cluster and individual layers
          markers.addLayer(marker);
          individualMarkers.addLayer(marker);
        }

        // Handle Polygons and LineStrings (Ways)
        if (geometryType === "Polygon" || geometryType === "LineString") {
          const centroid = calculateCentroid(feature.geometry.coordinates);
          const marker = L.marker([centroid[0], centroid[1]]);

          // Add a popup for ways
          marker.bindPopup(`
                    <b>${
                      feature.properties?.name || "Unnamed Water Tower"
                    }</b><br>
                    <div class="d-grid gap-3">
                    <a href="https://www.waze.com/ul?ll=${centroid[0]},${
            centroid[1]
          }&navigate=yes" target="_blank">
        <button class="btn btn-info btn-sm">Directions with Waze</button>
    </a>
                    <button class="btn btn-primary btn-sm" onclick="openStreetView(${
                      centroid[0]
                    }, ${centroid[1]})">Open Street View</button></div>
                `);

          // Add marker to both the cluster and individual layers
          markers.addLayer(marker);
          individualMarkers.addLayer(marker);
        }
      });

      // Initially add the clustered markers to the map
      map.addLayer(markers);

      // Update clustering based on zoom level
      map.on("zoomend", () => {
        if (map.getZoom() > 9) {
          if (map.hasLayer(markers)) {
            map.removeLayer(markers);
            map.addLayer(individualMarkers);
          }
        } else {
          if (map.hasLayer(individualMarkers)) {
            map.removeLayer(individualMarkers);
            map.addLayer(markers);
          }
        }
      });
    })
    .catch((error) => console.error("Error loading GeoJSON:", error));
});

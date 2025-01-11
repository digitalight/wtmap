function openStreetView(lat, lng) {
    const streetViewUrl = `https://www.google.com/maps/embed/v1/streetview?key=AIzaSyDS4VAi38mihr2R841bCDQ0KfbULPdscQg&location=${lat},${lng}`;
    const popup = document.getElementById('streetViewPopup');
    const iframe = document.getElementById('streetViewFrame');
    const spinner = document.getElementById('loadingSpinner');

    // Show the popup with animation
    popup.classList.add('show');

    // Show the loading spinner
    spinner.style.display = 'block';

    // Load the iframe content
    iframe.src = streetViewUrl;

    // Hide the spinner once the iframe has loaded
    iframe.onload = () => {
        spinner.style.display = 'none';
    };
}

// Function to close the popup
function closeStreetView() {
    const popup = document.getElementById('streetViewPopup');
    const iframe = document.getElementById('streetViewFrame');
    const spinner = document.getElementById('loadingSpinner');

    // Hide the popup
    popup.classList.remove('show');

    // Clear the iframe and spinner
    iframe.src = '';
    spinner.style.display = 'none';
}

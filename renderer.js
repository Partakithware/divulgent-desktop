document.addEventListener('DOMContentLoaded', () => {
    const desktopIconsContainer = document.getElementById('desktop-icons');

       function renderIcons(icons) {
           desktopIconsContainer.innerHTML = ''; // Clear existing icons
           icons.forEach(iconData => {
               const iconElement = document.createElement('div');
               iconElement.className = 'desktop-icon';
               iconElement.title = iconData.name; // Tooltip
               iconElement.setAttribute('data-filepath', iconData.filePath); // ADD THIS LINE
               const img = document.createElement('img');
               // Use the resolvedIconPath directly. If it's empty, use a simple fallback.
               img.src = iconData.resolvedIconPath || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0AAAAABJRU5ErkJggg=='; // Tiny red dot fallback

               const span = document.createElement('span');
               span.textContent = iconData.name;

               iconElement.appendChild(img);
               iconElement.appendChild(span);
               // --- NEW: Right-click to show context menu ---
               iconElement.addEventListener('contextmenu', (e) => {
                   e.preventDefault(); // Prevent the default browser context menu
                   // Send the full iconData (which includes filePath) to the main process
                   window.electronAPI.showIconContextMenu(iconData);
               });
               // Handle click to launch app
               iconElement.addEventListener('click', () => {
                   if (iconData.exec) {
                       window.electronAPI.launchApp(iconData.exec);
                   } else {
                       console.warn(`No executable path found for ${iconData.name}`);
                   }
               });

               desktopIconsContainer.appendChild(iconElement);
           });
       }

    // --- NEW: Listener for icon updates from the main process ---
// This function will be called by main.js when the user selects a custom icon
window.electronAPI.onUpdateIconSrc((event, { filePath, newIconPath }) => {
    // Find the specific icon's <img> element using its data-filepath attribute
    const iconToUpdateImg = document.querySelector(`.desktop-icon[data-filepath="${filePath}"] img`);
    if (iconToUpdateImg) {
        iconToUpdateImg.src = newIconPath; // Update the image source
        console.log(`[Renderer] Updated icon for ${filePath} to ${newIconPath}`);
    } else {
        console.warn(`[Renderer] Could not find icon element with filePath: ${filePath} to update.`);
    }
});



    // Listen for desktop icon updates from the main process
    window.electronAPI.onDesktopIconsUpdate((icons) => {
        console.log('Received desktop icons update:', icons);
        renderIcons(icons);
    });

    // Request initial set of desktop icons
    window.electronAPI.getDesktopIcons();
});

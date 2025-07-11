# divulgent-desktop
*Electron*/*Vite* based, Desktop intended layer. Allows for live wallpapers/etc. choose desktop icons for the .desktop files found on your desktop, sadly manually.

Early concept used on Ubuntu 24.04. Sits directly above the desktop.

In the project folder its set to load the video-file named live-test-a.mp4.
This option will likely later on be set via the context menu.

As of now it loads your Desktop Entries from "/home/$yourusername/Desktop" so that should be fine.

It does not auto-magically get the icons for you, they must be set manually in which it will base64 them.
They can be set by right-clicking the desktop icons once opened and then choose "Choose custom icon...".

It currently sits below everything but above the usual desktop layer. So it fits but lets say you were to use nemo-desktop....it would appear below this application.
Hence why I began adding support to have the icons itself.

In short you have the power of the web to use as a desktop background (sort of, as I said it does not count as the legit BG layer but in appearance it works like such)

You of course need nodejs/npm and then set it up.

Right now only posted for reference of those that want to self build test.

Example of my desktop (live-bg) using it. note my panel is not part of it.

[![](https://i.ibb.co/5h5GPgBM/Screenshot-from-2025-07-11-14-34-52.png)](https://ibb.co/ZzhG0pWL)





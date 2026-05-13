#!/bin/bash

# =======================================================
# UpfittersOS - Raspberry Pi Kiosk Monitor Setup
# =======================================================

echo "Starting UpfittersOS Kiosk Setup..."

# Replace these variables with your actual credentials before running
TENANT_ID="YOUR_TENANT_ID"
DISPLAY_EMAIL="monitor@saegrp.com"
DISPLAY_PASSWORD="YOUR_SECURE_PASSWORD"

# Construct the magic URL
MAGIC_URL="https://upfittersos.com/tv?t=${TENANT_ID}&u=${DISPLAY_EMAIL}&p=${DISPLAY_PASSWORD}"

echo "Configuring Chromium Kiosk Mode..."

# The path to the autostart file on Raspberry Pi OS
AUTOSTART_FILE="/etc/xdg/lxsession/LXDE-pi/autostart"

if [ ! -f "$AUTOSTART_FILE" ]; then
    echo "Warning: LXDE autostart file not found at $AUTOSTART_FILE."
    echo "If you are using a newer version of Raspberry Pi OS (Wayland), this script might need adjustments."
    # Wayland uses wayfire
    WAYFIRE_FILE="$HOME/.config/wayfire.ini"
    if [ -f "$WAYFIRE_FILE" ]; then
        echo "Wayfire detected. Please configure kiosk mode manually via wayfire.ini"
    fi
else
    # Backup existing file
    sudo cp "$AUTOSTART_FILE" "$AUTOSTART_FILE.backup"

    # Remove any existing chromium calls
    sudo sed -i '/chromium-browser/d' "$AUTOSTART_FILE"
    sudo sed -i '/@xset/d' "$AUTOSTART_FILE"

    # Append our kiosk config
    echo "@xset s off" | sudo tee -a "$AUTOSTART_FILE"
    echo "@xset -dpms" | sudo tee -a "$AUTOSTART_FILE"
    echo "@xset s noblank" | sudo tee -a "$AUTOSTART_FILE"
    echo "@chromium-browser --noerrdialogs --disable-infobars --kiosk \"$MAGIC_URL\"" | sudo tee -a "$AUTOSTART_FILE"
    
    echo "Autostart configured successfully."
fi

echo "Setup complete! Please restart your Raspberry Pi to test the kiosk mode."
echo "sudo reboot"

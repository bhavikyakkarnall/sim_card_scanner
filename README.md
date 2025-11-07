# SIM Card Reader

A ReactJS web-based application for scanning SIM card numbers and exporting them to CSV format.

## Features

- 📷 **Camera OCR Scanning**: Use your phone's camera to read SIM card numbers directly from the card using OCR (Optical Character Recognition)
- 🔌 **Web Serial API Integration**: Connect to USB SIM card readers via Web Serial API (optional)
- 📝 **Manual Entry**: Add SIM numbers manually as a fallback option
- 📊 **Real-time Display**: View all scanned SIM numbers in a table format
- 📥 **CSV Export**: Export all scanned SIM numbers to a CSV file
- 🎨 **Modern UI**: Beautiful, responsive user interface optimized for mobile devices
- ✅ **Duplicate Prevention**: Automatically prevents duplicate entries

## Browser Compatibility

- **Camera Scanning**: Works in all modern browsers that support camera access (Chrome, Firefox, Safari, Edge, Opera)
- **Web Serial API**: Only supported in Chrome, Edge, and Opera (for USB reader connection)
- **HTTPS Required**: Camera access requires HTTPS (or localhost for development)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`)

## Usage

### Camera OCR Scanning (Recommended)

1. Click the "📷 Start Camera" button
2. Grant camera permissions when prompted
3. Position the SIM card so the number is clearly visible in the camera view
4. Click "📸 Capture & Read" to take a photo and process it with OCR
5. The app will extract the SIM number from the image
6. Scanned numbers will appear in the table below
7. Click "🛑 Stop Camera" when finished scanning

**Tips for Best Results:**
- Ensure good, even lighting (avoid shadows and glare)
- Hold the SIM card steady and flat
- Make sure the SIM number is clearly visible and in focus
- Position the card so the text fills most of the camera view
- The app automatically prefers the back camera on mobile devices
- If OCR doesn't work, try adjusting lighting or repositioning the card

### USB Reader Connection (Optional)

1. Click the "🔌 Connect USB Reader" button
2. Select your SIM card reader device from the browser's device selection dialog
3. The app will automatically start scanning for SIM numbers
4. Scanned numbers will appear in the table below

### Manual Entry

1. Enter a SIM number in the manual input field
2. Click "Add" or press Enter
3. The number will be added to the list

### Exporting to CSV

1. Scan or add SIM numbers
2. Click the "Export to CSV" button
3. A CSV file will be downloaded with all the scanned SIM numbers and timestamps

## Project Structure

```
SIM Card Reader/
├── src/
│   ├── App.jsx          # Main application component
│   ├── App.css          # Application styles
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles
├── index.html           # HTML template
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite configuration
└── README.md           # This file
```

## Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist` directory.

## Notes

- The app uses OCR (Optical Character Recognition) to read SIM numbers directly from the card
- SIM numbers are automatically extracted from the OCR text (looks for 10+ digit numbers)
- SIM numbers are stored with timestamps for tracking
- The CSV export includes both the SIM number and the scan timestamp
- Duplicate SIM numbers are automatically prevented
- OCR works best with clear, well-lit images of the SIM card
- If OCR doesn't work well, you can use the manual entry feature as a fallback

## Troubleshooting

### Camera OCR Issues
- **Camera not starting**: Make sure you've granted camera permissions in your browser settings
- **No camera found**: Ensure your device has a working camera and it's not being used by another app
- **OCR not reading correctly**: 
  - Ensure good, even lighting (avoid shadows and glare)
  - Hold the SIM card steady and make sure it's in focus
  - Position the card so the number is clearly visible
  - Try capturing multiple times if the first attempt doesn't work
- **HTTPS required**: Camera access requires HTTPS in production (localhost works for development)
- **Processing is slow**: OCR processing may take a few seconds, especially on first use

### USB Reader Issues
- **Device not found**: Make sure your SIM card reader is connected and the drivers are installed
- **Connection error**: Try disconnecting and reconnecting the device
- **No data received**: Check that your SIM card reader is sending data in a readable format
- **Browser compatibility**: Use Chrome, Edge, or Opera for Web Serial API support


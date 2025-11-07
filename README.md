# SIM Card Scanner

A modern React application that captures SIM/ICCID numbers using camera-based OCR, USB serial readers, or manual entry. The latest rebuild focuses on accuracy, resilience, and operator feedback.

## Features

- 📷 **High-Fidelity Camera OCR**: Auto-upscales, thresholds (Otsu), and trims the region of interest before running multi-strategy Tesseract OCR.
- 🔌 **USB Serial Capture**: Stream ICCID data from compatible readers through the Web Serial API with live deduplication.
- 🧠 **Smart Deduplication & Storage**: Entries persist locally with timestamps, source metadata, and OCR confidence.
- 👀 **Side-by-Side Previews**: Inspect both the raw frame and the processed OCR image to fine-tune technique.
- 📊 **Operational Dashboard**: Status widgets for OCR readiness, reader connectivity, and duplicate statistics.
- 📥 **CSV Export**: Download curated results (`#`, number, timestamp, source, confidence) at any time.
- ✍️ **Manual Safeguard**: Quickly add or correct numbers while preserving traceability.

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

### Camera OCR Workflow

1. Press **📷 Start Camera** and grant browser access when asked.
2. Align the SIM so the ICCID fills most of the preview.
3. Tap **📸 Capture & Scan** – preprocessing previews (original + processed) appear immediately.
4. Confirm the debug chip to review detection confidence and detected digits.
5. Successes populate the results table automatically; duplicates are skipped with an alert.
6. Use **🛑 Stop Camera** when finished to release the device.

**Pro tips**
- Favor indirect daylight or diffused LED light to avoid glare.
- Keep the card steady; brace elbows or rest the card on a contrasting surface.
- For low-contrast prints, move slightly closer so digits fill the frame.
- Re-capture from a slightly different angle if characters smear in the processed preview.

### USB Reader Capture

1. Launch Chromium-based browser (Chrome, Edge, Opera).
2. Choose **🔌 Connect Reader**; select the USB device in the prompt.
3. Incoming ICCID strings appear instantly; duplicates trigger a warning instead of duplication.
4. Disconnect safely with **🔌 Disconnect** to release the port.

### Manual Entry

1. Type or paste the ICCID (non-digit characters are stripped automatically).
2. Press **Enter** or **➕ Add**.
3. The entry is logged with a `manual` source label.

### Exporting Results

1. Capture at least one entry.
2. Use **📥 Export to CSV**.
3. The downloaded file includes row number, SIM number, timestamp (local), capture source, and OCR confidence.

## What’s New in This Rebuild

- Dedicated hooks for OCR, serial connectivity, and registry management (`src/hooks`).
- Deterministic preprocessing pipeline (`src/utils/imageProcessing.js`) with upscaling, Otsu thresholding, and density-based cropping.
- Enhanced error/success messaging with auto-dismiss timers and operator guidance.
- Local persistence for sessions (refresh-safe) and confidence telemetry on each entry.
- Fully reimagined UI with status dashboard, preview grid, and responsive layouts.

## Project Structure

```
SIM Card Reader/
├── src/
│   ├── App.jsx          # Main application component
│   ├── App.css          # Application styles
│   ├── index.css        # Global styles
│   ├── main.jsx         # React entry point
│   ├── hooks/
│   │   ├── useSerialConnection.js
│   │   ├── useSimRegistry.js
│   │   └── useTesseractWorker.js
│   └── utils/
│       ├── extractSimNumber.js
│       └── imageProcessing.js
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

- OCR runs in the browser via `tesseract.js` – first load downloads trained data, so allow ~5s on slow networks.
- SIM numbers persist in `localStorage`; clear via the **🗑️ Clear All** action.
- ICCID extraction prefers 19–20 digit strings but gracefully falls back to the longest 10+ digit sequence.
- USB reader support depends on the reader emitting plain-text ICCID data; refer to your hardware manual.

## Troubleshooting

### Camera OCR Issues
- **Camera not starting**: Ensure permissions are granted and no other app is locking the camera.
- **Preview too dark/bright**: Adjust lighting; the processed thumbnail should display crisp black text on white.
- **Digits misread**: Re-capture slightly closer; make sure the ICCID is horizontal and fills at least 60% of the frame.
- **Slow first scan**: The first OCR run loads language data; subsequent scans are faster.
- **Production HTTPS**: Browsers require secure context (HTTPS) to access cameras outside localhost.

### USB Reader Issues
- **Unsupported browser**: Switch to Chrome, Edge, or Opera – Firefox/Safari do not expose Web Serial.
- **Device not listed**: Confirm drivers are installed and the reader is not claimed by another app.
- **Garbled data**: Verify baud rate (default 9600); adjust in `useSerialConnection` if your hardware differs.
- **No digits detected**: Ensure the reader outputs ASCII ICCID strings without proprietary framing.


import { useState, useEffect, useRef } from 'react'
import { createWorker } from 'tesseract.js'
import './App.css'

function App() {
  const [simNumbers, setSimNumbers] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [port, setPort] = useState(null)
  const [reader, setReader] = useState(null)
  const [manualInput, setManualInput] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [capturedImage, setCapturedImage] = useState(null)
  const [ocrDebugText, setOcrDebugText] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [maxZoom, setMaxZoom] = useState(1)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const workerRef = useRef(null)
  const fileInputRef = useRef(null)

  // Check if Web Serial API is supported
  const isWebSerialSupported = 'serial' in navigator

  // Initialize Tesseract worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        const worker = await createWorker('eng', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              // Optional: show progress
            }
          }
        })
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '8', // Single word
          tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine only
        })
        workerRef.current = worker
      } catch (err) {
        console.error('Failed to initialize OCR worker:', err)
      }
    }
    initWorker()

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [])

  // Image preprocessing to enhance OCR accuracy (especially for non-auto-focus cameras)
  const preprocessImage = (canvas) => {
    // First, upscale the image for better OCR (helps with blurry images)
    const upscaleFactor = 2
    const upscaledCanvas = document.createElement('canvas')
    upscaledCanvas.width = canvas.width * upscaleFactor
    upscaledCanvas.height = canvas.height * upscaleFactor
    const upscaledCtx = upscaledCanvas.getContext('2d')
    
    // Use high-quality image scaling
    upscaledCtx.imageSmoothingEnabled = true
    upscaledCtx.imageSmoothingQuality = 'high'
    upscaledCtx.drawImage(canvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height)
    
    const ctx = upscaledCanvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, upscaledCanvas.width, upscaledCanvas.height)
    const data = imageData.data

    // Convert to grayscale and enhance contrast
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      
      // Convert to grayscale
      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      
      // Enhance contrast more aggressively for blurry images
      let enhanced = gray
      if (gray < 128) {
        enhanced = gray * 0.6 // Darken dark areas more
      } else {
        enhanced = 128 + (gray - 128) * 1.4 // Brighten light areas more
      }
      
      // Clamp values
      enhanced = Math.max(0, Math.min(255, enhanced))
      
      data[i] = enhanced     // R
      data[i + 1] = enhanced // G
      data[i + 2] = enhanced // B
      // Alpha stays the same
    }

    // Apply processed image data back
    ctx.putImageData(imageData, 0, 0)
    
    return upscaledCanvas
  }

  // Connect to SIM card reader via Web Serial API
  const connectToReader = async () => {
    try {
      setError('')
      if (!isWebSerialSupported) {
        setError('Web Serial API is not supported in your browser. Please use Chrome, Edge, or Opera.')
        return
      }

      const selectedPort = await navigator.serial.requestPort()
      await selectedPort.open({ baudRate: 9600 })
      
      setPort(selectedPort)
      setIsConnected(true)
      setSuccess('Connected to SIM card reader!')

      // Start reading data
      const textDecoder = new TextDecoderStream()
      const readableStreamClosed = selectedPort.readable.pipeTo(textDecoder.writable)
      const readerInstance = textDecoder.readable.getReader()

      setReader(readerInstance)
      setIsScanning(true)

      // Read data from the port
      readFromPort(readerInstance)
    } catch (err) {
      if (err.name === 'NotFoundError') {
        setError('No device selected.')
      } else {
        setError(`Connection error: ${err.message}`)
      }
      setIsConnected(false)
    }
  }

  // Read data from the serial port
  const readFromPort = async (readerInstance) => {
    try {
      while (true) {
        const { value, done } = await readerInstance.read()
        if (done) {
          break
        }
        
        // Parse the received data (adjust based on your SIM reader's output format)
        const data = value.trim()
        if (data && data.length > 0) {
          // Extract SIM number (ICCID) from the data
          // Common formats: ICCID is usually 19-20 digits
          const simNumber = extractSimNumber(data)
          if (simNumber) {
            addSimNumber(simNumber)
            setSuccess(`SIM number scanned: ${simNumber}`)
            setTimeout(() => setSuccess(''), 3000)
          }
        }
      }
    } catch (err) {
      setError(`Reading error: ${err.message}`)
      setIsScanning(false)
    }
  }

  // Extract SIM number from data string
  const extractSimNumber = (data) => {
    // Clean the text - remove whitespace and common OCR errors
    const cleaned = data.replace(/\s+/g, '').replace(/[Oo]/g, '0').replace(/[Il]/g, '1')
    
    // Try to find ICCID pattern (19-20 digits) - most common SIM number format
    const iccidMatch = cleaned.match(/\d{19,20}/)
    if (iccidMatch) {
      return iccidMatch[0]
    }
    
    // Try to find 15-20 digit numbers (common SIM number lengths)
    const longNumberMatch = cleaned.match(/\d{15,20}/)
    if (longNumberMatch) {
      return longNumberMatch[0]
    }
    
    // Try to find any number sequence (10+ digits) - minimum for SIM numbers
    const numberMatch = cleaned.match(/\d{10,}/)
    if (numberMatch) {
      return numberMatch[0]
    }
    
    // If the entire cleaned string is digits and long enough
    if (/^\d+$/.test(cleaned) && cleaned.length >= 10) {
      return cleaned
    }
    
    // Try to find numbers separated by spaces or other characters
    const allNumbers = cleaned.match(/\d+/g)
    if (allNumbers) {
      // Join all numbers and check if total length is valid
      const joined = allNumbers.join('')
      if (joined.length >= 10) {
        return joined
      }
    }
    
    return null
  }

  // Disconnect from the reader
  const disconnectFromReader = async () => {
    try {
      if (reader) {
        await reader.cancel()
        setReader(null)
      }
      if (port) {
        await port.close()
        setPort(null)
      }
      setIsConnected(false)
      setIsScanning(false)
      setSuccess('Disconnected from SIM card reader.')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(`Disconnection error: ${err.message}`)
    }
  }

  // Add SIM number to the list
  const addSimNumber = (number) => {
    // Check for duplicates
    const exists = simNumbers.some(item => item.number === number)
    if (!exists) {
      setSimNumbers(prev => [...prev, {
        id: Date.now() + Math.random(),
        number: number,
        timestamp: new Date().toISOString()
      }])
      return true
    }
    return false
  }

  // Start camera for OCR scanning
  const startCamera = async () => {
    try {
      setError('')
      setCapturedImage(null)
      setZoomLevel(1)
      
      // Set camera active first so video element is rendered
      setIsCameraActive(true)
      
      // Small delay to ensure video element is in DOM
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Get user media with zoom support
      const constraints = {
        video: {
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          zoom: { ideal: 1, max: 8 } // Request zoom capability
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      // Get camera capabilities
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities()
      if (capabilities.zoom) {
        setMaxZoom(capabilities.zoom.max || 8)
      }
      
      // Wait a bit more and check if video element exists
      await new Promise(resolve => setTimeout(resolve, 100))
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.muted = true // Required for autoplay in some browsers
        await videoRef.current.play()
        setSuccess('Camera started! Use zoom controls and position the SIM card clearly.')
        setTimeout(() => setSuccess(''), 4000)
      } else {
        throw new Error('Video element not found. Please try again.')
      }
    } catch (err) {
      setError(`Camera error: ${err.message}. Make sure you grant camera permissions.`)
      setIsCameraActive(false)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
    }
  }

  // Adjust camera zoom
  const adjustZoom = (newZoom) => {
    if (!streamRef.current) return
    
    const track = streamRef.current.getVideoTracks()[0]
    const capabilities = track.getCapabilities()
    
    if (capabilities.zoom) {
      const clampedZoom = Math.max(1, Math.min(newZoom, capabilities.zoom.max || maxZoom))
      track.applyConstraints({ advanced: [{ zoom: clampedZoom }] })
      setZoomLevel(clampedZoom)
    }
  }

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
    setCapturedImage(null)
    setSuccess('Camera stopped.')
    setTimeout(() => setSuccess(''), 3000)
  }

  // Process image with OCR (used by both camera capture and file upload)
  const processImageWithOCR = async (imageSource) => {
    if (!workerRef.current) {
      setError('OCR not ready.')
      return
    }

    try {
      setIsProcessing(true)
      setError('')
      setOcrDebugText('')
      
      // Create canvas from image source
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
          resolve()
        }
        img.onerror = reject
        img.src = imageSource
      })
      
      // Convert to image data URL for preview
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9)
      setCapturedImage(imageDataUrl)
      
      // Create a copy for preprocessing (don't modify original)
      const processedCanvas = document.createElement('canvas')
      processedCanvas.width = canvas.width
      processedCanvas.height = canvas.height
      const processedCtx = processedCanvas.getContext('2d')
      processedCtx.drawImage(canvas, 0, 0)
      
      // Preprocess image for better OCR
      const enhancedCanvas = preprocessImage(processedCanvas)

      // Process with OCR using the enhanced canvas
      const { data: { text, words } } = await workerRef.current.recognize(enhancedCanvas)
      
      // Show debug info
      setOcrDebugText(`OCR detected: "${text}"`)
      console.log('OCR Text:', text)
      console.log('OCR Words:', words)
      
      // Extract SIM number from OCR text
      const simNumber = extractSimNumber(text)
      
      if (simNumber) {
        const added = addSimNumber(simNumber)
        if (added) {
          setSuccess(`SIM number read: ${simNumber}`)
          setTimeout(() => setSuccess(''), 3000)
        } else {
          setError('SIM number already exists in the list.')
          setTimeout(() => setError(''), 3000)
        }
      } else {
        // Show what OCR actually detected
        const detectedNumbers = text.match(/\d+/g) || []
        if (detectedNumbers.length > 0) {
          setError(`Could not extract valid SIM number. OCR detected: ${detectedNumbers.join(', ')}. Try again with better positioning.`)
        } else {
          setError('Could not find any numbers in the image. Ensure the SIM number is clearly visible and in focus.')
        }
        setTimeout(() => setError(''), 5000)
      }
    } catch (err) {
      setError(`OCR processing error: ${err.message}`)
      setTimeout(() => setError(''), 4000)
    } finally {
      setIsProcessing(false)
    }
  }

  // Capture image and process with OCR
  const captureAndRead = async () => {
    if (!videoRef.current) {
      setError('Camera not ready.')
      return
    }

    try {
      // Capture frame from video
      const canvas = canvasRef.current || document.createElement('canvas')
      const video = videoRef.current
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      
      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      // Process with OCR
      await processImageWithOCR(canvas.toDataURL('image/jpeg', 0.9))
    } catch (err) {
      setError(`Capture error: ${err.message}`)
      setTimeout(() => setError(''), 4000)
    }
  }

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.')
      setTimeout(() => setError(''), 3000)
      return
    }

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        await processImageWithOCR(e.target.result)
      }
      reader.readAsDataURL(file)
    } catch (err) {
      setError(`File upload error: ${err.message}`)
      setTimeout(() => setError(''), 4000)
    }
  }

  // Add manual SIM number
  const handleManualAdd = () => {
    if (manualInput.trim()) {
      const cleaned = manualInput.trim().replace(/\s+/g, '')
      if (cleaned.length >= 10) {
        addSimNumber(cleaned)
        setManualInput('')
        setSuccess('SIM number added manually!')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError('SIM number must be at least 10 digits.')
        setTimeout(() => setError(''), 3000)
      }
    }
  }

  // Remove SIM number
  const removeSimNumber = (id) => {
    setSimNumbers(prev => prev.filter(item => item.id !== id))
  }

  // Clear all SIM numbers
  const clearAll = () => {
    if (window.confirm('Are you sure you want to clear all SIM numbers?')) {
      setSimNumbers([])
      setSuccess('All SIM numbers cleared.')
      setTimeout(() => setSuccess(''), 3000)
    }
  }

  // Export to CSV
  const exportToCSV = () => {
    if (simNumbers.length === 0) {
      setError('No SIM numbers to export.')
      setTimeout(() => setError(''), 3000)
      return
    }

    // Create CSV content
    const headers = ['SIM Number', 'Timestamp']
    const rows = simNumbers.map(item => [
      item.number,
      new Date(item.timestamp).toLocaleString()
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', `sim_numbers_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    setSuccess('CSV file exported successfully!')
    setTimeout(() => setSuccess(''), 3000)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reader) {
        reader.cancel()
      }
      if (port) {
        port.close()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [reader, port])

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>📱 SIM Card Reader</h1>
          <p>Read SIM card numbers using camera OCR and export to CSV</p>
        </header>

        <div className="controls">
          <div className="scanning-modes">
            <div className="mode-section">
              <h3>📷 Camera OCR Scanning</h3>
              <div className="connection-section">
                {!isCameraActive ? (
                  <button 
                    onClick={startCamera} 
                    className="btn btn-primary"
                  >
                    📷 Start Camera
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={stopCamera} 
                      className="btn btn-danger"
                    >
                      🛑 Stop Camera
                    </button>
                    <button 
                      onClick={captureAndRead} 
                      className="btn btn-success"
                      disabled={isProcessing}
                    >
                      {isProcessing ? '⏳ Processing...' : '📸 Capture & Read'}
                    </button>
                  </>
                )}
                {isProcessing && (
                  <span className="scanning-indicator">🟢 Processing OCR...</span>
                )}
              </div>
              
              {isCameraActive && maxZoom > 1 && (
                <div className="zoom-controls">
                  <label className="zoom-label">Zoom: {zoomLevel.toFixed(1)}x</label>
                  <div className="zoom-buttons">
                    <button 
                      onClick={() => adjustZoom(zoomLevel - 0.5)} 
                      className="btn-zoom"
                      disabled={zoomLevel <= 1}
                    >
                      ➖
                    </button>
                    <input
                      type="range"
                      min="1"
                      max={maxZoom}
                      step="0.5"
                      value={zoomLevel}
                      onChange={(e) => adjustZoom(parseFloat(e.target.value))}
                      className="zoom-slider"
                    />
                    <button 
                      onClick={() => adjustZoom(zoomLevel + 0.5)} 
                      className="btn-zoom"
                      disabled={zoomLevel >= maxZoom}
                    >
                      ➕
                    </button>
                  </div>
                </div>
              )}
              
              <div className="upload-section">
                <h4>Or Upload Photo</h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="btn btn-secondary"
                  disabled={isProcessing}
                >
                  📁 Upload Photo
                </button>
              </div>
              
              {isCameraActive && (
                <div className="camera-container">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-preview"
                    style={{ minHeight: '300px' }}
                  />
                  {capturedImage && (
                    <div className="captured-image-container">
                      <p className="captured-label">Last Captured Image:</p>
                      <img src={capturedImage} alt="Captured SIM card" className="captured-image" />
                    </div>
                  )}
                  {ocrDebugText && (
                    <div className="ocr-debug">
                      <p className="debug-label">OCR Detection:</p>
                      <p className="debug-text">{ocrDebugText}</p>
                    </div>
                  )}
                </div>
              )}
              
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>

            <div className="mode-section">
              <h3>🔌 USB Reader (Optional)</h3>
              <div className="connection-section">
                {!isConnected ? (
                  <button 
                    onClick={connectToReader} 
                    className="btn btn-secondary"
                    disabled={!isWebSerialSupported}
                  >
                    {isWebSerialSupported ? '🔌 Connect USB Reader' : '❌ Not Supported'}
                  </button>
                ) : (
                  <button 
                    onClick={disconnectFromReader} 
                    className="btn btn-danger"
                  >
                    🔌 Disconnect
                  </button>
                )}
                {isScanning && (
                  <span className="scanning-indicator">🟢 USB Scanning...</span>
                )}
              </div>
            </div>
          </div>

          <div className="manual-input-section">
            <h3>Manual Entry</h3>
            <div className="input-group">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter SIM number manually"
                className="input"
                onKeyPress={(e) => e.key === 'Enter' && handleManualAdd()}
              />
              <button onClick={handleManualAdd} className="btn btn-secondary">
                ➕ Add
              </button>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">{simNumbers.length}</div>
            <div className="stat-label">SIM Numbers Scanned</div>
          </div>
        </div>

        {simNumbers.length > 0 && (
          <div className="actions">
            <button onClick={exportToCSV} className="btn btn-success">
              📥 Export to CSV
            </button>
            <button onClick={clearAll} className="btn btn-warning">
              🗑️ Clear All
            </button>
          </div>
        )}

        <div className="sim-list">
          <h2>Scanned SIM Numbers</h2>
          {simNumbers.length === 0 ? (
            <div className="empty-state">
              <p>No SIM numbers scanned yet.</p>
              <p>Use your camera to read the SIM number from the card, or enter numbers manually.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="sim-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>SIM Number</th>
                    <th>Timestamp</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {simNumbers.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td className="sim-number">{item.number}</td>
                      <td>{new Date(item.timestamp).toLocaleString()}</td>
                      <td>
                        <button
                          onClick={() => removeSimNumber(item.id)}
                          className="btn-remove"
                          title="Remove"
                        >
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!isWebSerialSupported && (
          <div className="info-box">
            <h3>⚠️ Browser Compatibility</h3>
            <p>
              Web Serial API is only supported in Chrome, Edge, and Opera browsers.
              Camera OCR scanning works in all modern browsers with camera access.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

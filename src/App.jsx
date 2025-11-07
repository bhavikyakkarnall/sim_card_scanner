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
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const canvasRef = useRef(null)
  const workerRef = useRef(null)

  // Check if Web Serial API is supported
  const isWebSerialSupported = 'serial' in navigator

  // Initialize Tesseract worker
  useEffect(() => {
    const initWorker = async () => {
      try {
        const worker = await createWorker('eng')
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '6', // Assume a single uniform block of text
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
    // Try to find ICCID pattern (19-20 digits)
    const iccidMatch = data.match(/\d{19,20}/)
    if (iccidMatch) {
      return iccidMatch[0]
    }
    
    // Try to find any long number sequence (10+ digits)
    const numberMatch = data.match(/\d{10,}/)
    if (numberMatch) {
      return numberMatch[0]
    }
    
    // Return the data as-is if it looks like a SIM number
    if (/^\d+$/.test(data) && data.length >= 10) {
      return data
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
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setIsCameraActive(true)
        setSuccess('Camera started! Position the SIM card in view and click "Capture & Read"')
        setTimeout(() => setSuccess(''), 4000)
      }
    } catch (err) {
      setError(`Camera error: ${err.message}. Make sure you grant camera permissions.`)
      setIsCameraActive(false)
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

  // Capture image and process with OCR
  const captureAndRead = async () => {
    if (!videoRef.current || !workerRef.current) {
      setError('Camera or OCR not ready.')
      return
    }

    try {
      setIsProcessing(true)
      setError('')
      
      // Capture frame from video
      const canvas = canvasRef.current || document.createElement('canvas')
      const video = videoRef.current
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      
      // Convert to image data URL for preview
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8)
      setCapturedImage(imageDataUrl)

      // Process with OCR
      const { data: { text } } = await workerRef.current.recognize(canvas)
      
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
        setError('Could not find SIM number in the image. Try again with better lighting or positioning.')
        setTimeout(() => setError(''), 4000)
      }
    } catch (err) {
      setError(`OCR processing error: ${err.message}`)
      setTimeout(() => setError(''), 4000)
    } finally {
      setIsProcessing(false)
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
              
              {isCameraActive && (
                <div className="camera-container">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="camera-preview"
                  />
                  {capturedImage && (
                    <div className="captured-image-container">
                      <p className="captured-label">Last Captured Image:</p>
                      <img src={capturedImage} alt="Captured SIM card" className="captured-image" />
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

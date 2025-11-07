import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { useSimRegistry } from './hooks/useSimRegistry'
import { useTesseractWorker } from './hooks/useTesseractWorker'
import { useSerialConnection } from './hooks/useSerialConnection'
import heic2any from 'heic2any'
import { createCanvasFromSource, preprocessCanvas } from './utils/imageProcessing'
import { describeDetection, extractSimNumber } from './utils/extractSimNumber'

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

function App() {
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const errorTimeoutRef = useRef(null)
  const successTimeoutRef = useRef(null)

  const [manualInput, setManualInput] = useState('')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [lastCapture, setLastCapture] = useState(null)
  const [ocrDebug, setOcrDebug] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { entries, addEntry, removeEntry, clearEntries, summary } = useSimRegistry()
  const { isReady: ocrReady, status: ocrStatus, progress: ocrProgress, recognize } = useTesseractWorker()

  const showError = useCallback((message) => {
    if (!message) return
    setError(message)
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
    }
    errorTimeoutRef.current = setTimeout(() => setError(''), 6000)
  }, [])

  const showSuccess = useCallback((message) => {
    if (!message) return
    setSuccess(message)
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current)
    }
    successTimeoutRef.current = setTimeout(() => setSuccess(''), 4000)
  }, [])

  const cleanupMessages = useCallback(() => {
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current)
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current)
  }, [])

  useEffect(() => cleanupMessages, [cleanupMessages])

  const handleSerialMessage = useCallback((value) => {
    const text = value.trim()
    if (!text) return
    const extracted = extractSimNumber(text)
    if (!extracted) return

    const result = addEntry(extracted, { source: 'serial' })
    if (result.added) {
      showSuccess(`SIM number received: ${extracted}`)
    } else if (result.reason === 'duplicate') {
      showError('Serial reader provided a duplicate SIM number.')
    }
  }, [addEntry, showError, showSuccess])

  const {
    isSupported: serialSupported,
    isConnected: serialConnected,
    isConnecting: serialConnecting,
    error: serialError,
    connect: connectSerial,
    disconnect: disconnectSerial,
    portInfo,
  } = useSerialConnection({ onMessage: handleSerialMessage })

  useEffect(() => {
    if (serialError) {
      showError(serialError)
    }
  }, [serialError, showError])

  const stopCamera = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop())
      cameraStreamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsCameraActive(false)
  }, [])

  const startCamera = useCallback(async () => {
    try {
      stopCamera()
      setProcessingStatus('Requesting camera…')
      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      cameraStreamRef.current = stream
      if (!videoRef.current) throw new Error('Camera element missing')
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setIsCameraActive(true)
      setProcessingStatus('')
      showSuccess('Camera ready — align the SIM number within the frame and capture.')
    } catch (err) {
      stopCamera()
      setProcessingStatus('')
      showError(`Camera error: ${err.message || err}`)
    }
  }, [stopCamera, showSuccess, showError])

  const processSource = useCallback(async (source, meta = {}) => {
    if (!ocrReady) {
      showError('OCR engine is still loading. Please wait a moment and try again.')
      return
    }

    try {
      setProcessingStatus('Preparing image…')
      const originalCanvas = await createCanvasFromSource(source)
      const originalPreview = originalCanvas.toDataURL('image/jpeg', 0.9)

      const processedCanvas = preprocessCanvas(originalCanvas)
      const processedPreview = processedCanvas.toDataURL('image/png')
      setLastCapture({ original: originalPreview, processed: processedPreview })

      setProcessingStatus('Running OCR…')
      const result = await recognize(processedCanvas)
      const simNumber = extractSimNumber(result.text)

      setOcrDebug(`${describeDetection(result.text, simNumber)} • Confidence ${Math.round(result.confidence)}%`)

      if (!simNumber) {
        showError('Could not find a valid SIM number. Try a closer capture with even lighting.')
        return
      }

      const outcome = addEntry(simNumber, {
        source: meta.source || 'ocr',
        confidence: result.confidence,
        attempts: meta.attempts || 1,
      })

      if (outcome.added) {
        showSuccess(`SIM number captured: ${simNumber}`)
      } else if (outcome.reason === 'duplicate') {
        showError('This SIM number is already in your list.')
      } else {
        showError('Unable to add SIM number. Please try again.')
      }
    } catch (err) {
      console.error('[sim-card-scanner] OCR failure', err)
      showError(`OCR error: ${err.message || err}`)
    } finally {
      setProcessingStatus('')
      if (typeof meta.cleanup === 'function') {
        try {
          meta.cleanup()
        } catch (cleanupError) {
          console.warn('[sim-card-scanner] cleanup failed', cleanupError)
        }
      }
    }
  }, [ocrReady, recognize, addEntry, showError, showSuccess])

  const captureFromCamera = useCallback(async () => {
    if (!videoRef.current) {
      showError('Camera is not ready yet.')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
    await processSource(canvas, { source: 'camera' })
  }, [processSource, showError])

  const handleFileUpload = useCallback(async (event) => {
    const input = event.target
    const fileList = input.files
    const file = fileList && fileList[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showError('Please choose a valid image file.')
      input.value = ''
      return
    }

    let workingBlob = file
    if (HEIC_TYPES.has(file.type)) {
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 })
        const convertedBlob = Array.isArray(converted) ? converted[0] : converted
        workingBlob = convertedBlob instanceof Blob ? convertedBlob : new Blob([convertedBlob], { type: 'image/jpeg' })
      } catch (conversionError) {
        console.error('[sim-card-scanner] HEIC conversion failed', conversionError)
        showError('Could not convert the HEIC image. Please try again or use a JPG/PNG photo.')
        input.value = ''
        return
      }
    }

    const objectUrl = URL.createObjectURL(workingBlob)
    try {
      await processSource(objectUrl, {
        source: 'upload',
        cleanup: () => URL.revokeObjectURL(objectUrl),
      })
    } finally {
      input.value = ''
    }
  }, [processSource, showError])

  const handleManualSubmit = useCallback(() => {
    const sanitized = manualInput.replace(/\s+/g, '')
    if (!sanitized) return
    if (sanitized.length < 10) {
      showError('SIM number must contain at least 10 digits.')
      return
    }
    const result = addEntry(sanitized, { source: 'manual' })
    if (result.added) {
      showSuccess('SIM number added manually.')
      setManualInput('')
    } else if (result.reason === 'duplicate') {
      showError('That SIM number is already recorded.')
    }
  }, [manualInput, addEntry, showError, showSuccess])

  const exportToCsv = useCallback(() => {
    if (entries.length === 0) {
      showError('No SIM numbers to export yet.')
      return
    }

    const rows = entries.map((entry, index) => ([
      index + 1,
      entry.number,
      new Date(entry.timestamp).toLocaleString(),
      entry.source,
      entry.confidence != null ? Math.round(entry.confidence) : '',
    ]))

    const header = ['#', 'SIM Number', 'Timestamp', 'Source', 'Confidence']
    const csv = [header, ...rows]
      .map(row => row.map(cell => `"${String(cell)}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `sim_numbers_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showSuccess('CSV exported successfully.')
  }, [entries, showError, showSuccess])

  const handleClearAll = useCallback(() => {
    if (entries.length === 0) return
    if (window.confirm('Clear all recorded SIM numbers?')) {
      clearEntries()
      showSuccess('All SIM numbers removed.')
    }
  }, [entries.length, clearEntries, showSuccess])

  const ocrProgressPercent = useMemo(() => Math.round(ocrProgress * 100), [ocrProgress])

  useEffect(() => () => {
    cleanupMessages()
    stopCamera()
    disconnectSerial()
  }, [cleanupMessages, stopCamera, disconnectSerial])

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>📱 SIM Card Scanner</h1>
          <p>High-accuracy OCR scanning and USB reader capture with deduplication.</p>
        </header>

        <section className="status-bar">
          <div className="status-item">
            <strong>OCR</strong>
            <span>{ocrReady ? 'Ready' : 'Loading…'}</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${ocrProgressPercent}%` }} />
            </div>
            <small>{ocrStatus}</small>
          </div>
          <div className="status-item">
            <strong>USB Reader</strong>
            <span>{serialConnected ? 'Connected' : serialSupported ? 'Disconnected' : 'Unsupported'}</span>
            {serialConnected && portInfo && (
              <small>{[portInfo.usbManufacturerName, portInfo.usbProductName].filter(Boolean).join(' • ')}</small>
            )}
          </div>
          <div className="status-item">
            <strong>Captured</strong>
            <span>{entries.length}</span>
            <small>{summary.duplicates > 0 ? `${summary.duplicates} duplicates skipped` : 'No duplicates'}</small>
          </div>
        </section>

        <div className="controls">
          <div className="mode-grid">
            <div className="mode-card">
              <h3>📷 Camera OCR</h3>
              <p className="mode-subtitle">Use your device camera. Ensure even lighting and steady focus.</p>
              <div className="button-row">
                {!isCameraActive ? (
                  <button className="btn btn-primary" onClick={startCamera} disabled={!ocrReady}>
                    📷 Start Camera
                  </button>
                ) : (
                  <>
                    <button className="btn btn-success" onClick={captureFromCamera}>
                      📸 Capture &amp; Scan
                    </button>
                    <button className="btn btn-danger" onClick={stopCamera}>
                      🛑 Stop Camera
                    </button>
                  </>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Upload Image
                </button>
                <input
                  ref={fileInputRef}
                  className="hidden-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                />
              </div>
              {processingStatus && <p className="info-text">{processingStatus}</p>}
              <div className="camera-wrapper">
                <video ref={videoRef} className={`camera-preview ${isCameraActive ? 'active' : ''}`} autoPlay playsInline muted />
              </div>
              {lastCapture && (
                <div className="preview-grid">
                  <figure>
                    <figcaption>Original Frame</figcaption>
                    <img src={lastCapture.original} alt="Original capture" />
                  </figure>
                  <figure>
                    <figcaption>Processed for OCR</figcaption>
                    <img src={lastCapture.processed} alt="Processed capture" />
                  </figure>
                </div>
              )}
              {ocrDebug && <p className="debug-chip">{ocrDebug}</p>}
            </div>

            <div className="mode-card">
              <h3>🔌 USB Reader</h3>
              <p className="mode-subtitle">Connect compatible ICCID readers via Web Serial API.</p>
              <div className="button-row">
                {!serialSupported && (
                  <span className="badge badge-warning">Not supported in this browser</span>
                )}
                {serialSupported && !serialConnected && (
                  <button className="btn btn-secondary" onClick={() => connectSerial()} disabled={serialConnecting}>
                    {serialConnecting ? 'Connecting…' : '🔌 Connect Reader'}
                  </button>
                )}
                {serialConnected && (
                  <button className="btn btn-danger" onClick={disconnectSerial}>
                    🔌 Disconnect
                  </button>
                )}
              </div>
              <ul className="tips-list">
                <li>Use Chrome, Edge, or Opera for Web Serial support.</li>
                <li>Most readers output a 19–20 digit ICCID automatically.</li>
                <li>Duplicates are ignored to protect your dataset.</li>
              </ul>
            </div>
          </div>

          <div className="manual-card">
            <h3>✍️ Manual Entry</h3>
            <div className="manual-form">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Enter SIM number"
                onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              />
              <button className="btn btn-secondary" onClick={handleManualSubmit}>
                ➕ Add
              </button>
            </div>
            <p className="info-text">Tip: Paste ICCID values directly; non-digit characters are stripped automatically.</p>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <section className="actions">
          <button className="btn btn-success" onClick={exportToCsv} disabled={entries.length === 0}>
            📥 Export to CSV
          </button>
          <button className="btn btn-warning" onClick={handleClearAll} disabled={entries.length === 0}>
            🗑️ Clear All
          </button>
        </section>

        <section className="sim-list">
          <h2>Captured SIM Numbers</h2>
          {entries.length === 0 ? (
            <div className="empty-state">
              <p>No SIM numbers captured yet.</p>
              <p>Use the camera or USB reader to start building your list.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="sim-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>SIM Number</th>
                    <th>Source</th>
                    <th>Confidence</th>
                    <th>Timestamp</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, index) => (
                    <tr key={entry.id}>
                      <td>{index + 1}</td>
                      <td className="sim-number">{entry.number}</td>
                      <td>{entry.source}</td>
                      <td>{entry.confidence != null ? `${Math.round(entry.confidence)}%` : '—'}</td>
                      <td>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td>
                        <button className="btn-remove" onClick={() => removeEntry(entry.id)}>
                          ❌
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!serialSupported && (
          <section className="info-box">
            <h3>⚠️ Web Serial Not Available</h3>
            <p>Use Chrome, Edge, or Opera to enable USB reader support. Camera scanning works in all modern browsers over HTTPS or localhost.</p>
          </section>
        )}
      </div>
    </div>
  )
}

export default App

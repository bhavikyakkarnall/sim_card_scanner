import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_BAUD_RATE = 9600

export function useSerialConnection({ onMessage } = {}) {
  const [isSupported] = useState(() => 'serial' in navigator)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [portInfo, setPortInfo] = useState(null)
  const readerRef = useRef(null)
  const portRef = useRef(null)
  const abortRef = useRef(new AbortController())

  const cleanup = useCallback(async () => {
    abortRef.current.abort()
    abortRef.current = new AbortController()

    if (readerRef.current) {
      try {
        await readerRef.current.cancel()
      } catch (err) {
        console.warn('[sim-card-scanner] Failed to cancel reader', err)
      }
      readerRef.current = null
    }

    if (portRef.current) {
      try {
        await portRef.current.close()
      } catch (err) {
        console.warn('[sim-card-scanner] Failed to close port', err)
      }
      portRef.current = null
    }

    setIsConnected(false)
    setPortInfo(null)
  }, [])

  const readLoop = useCallback(async (reader) => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        if (value && typeof onMessage === 'function') {
          onMessage(value)
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[sim-card-scanner] Serial read error', err)
        setError(err.message || 'Serial read error')
      }
    }
  }, [onMessage])

  const connect = useCallback(async (config = {}) => {
    if (!isSupported) {
      setError('Web Serial API is not supported in this browser.')
      return
    }

    setError('')
    setIsConnecting(true)

    try {
      const selectedPort = await navigator.serial.requestPort()
      await selectedPort.open({ baudRate: config.baudRate || DEFAULT_BAUD_RATE })

      const info = selectedPort.getInfo ? selectedPort.getInfo() : {}
      setPortInfo(info)

      const textDecoder = new TextDecoderStream()
      const readableClosed = selectedPort.readable?.pipeTo?.(textDecoder.writable)

      readerRef.current = textDecoder.readable.getReader()
      portRef.current = selectedPort

      setIsConnected(true)
      readLoop(readerRef.current)
      if (readableClosed) {
        readableClosed.catch(err => {
          if (err && err.name !== 'AbortError') {
            console.warn('[sim-card-scanner] readable stream closed with error', err)
          }
        })
      }
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        console.error('[sim-card-scanner] Serial connection failed', err)
        setError(err.message || 'Failed to connect to serial device')
      }
      await cleanup()
    } finally {
      setIsConnecting(false)
    }
  }, [cleanup, isSupported, readLoop])

  const disconnect = useCallback(async () => {
    await cleanup()
  }, [cleanup])

  useEffect(() => () => {
    cleanup()
  }, [cleanup])

  return {
    isSupported,
    isConnected,
    isConnecting,
    error,
    portInfo,
    connect,
    disconnect,
  }
}



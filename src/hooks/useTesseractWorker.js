import { useCallback, useEffect, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'

const DEFAULT_LANG = 'eng'

export function useTesseractWorker(options = {}) {
  const [isReady, setIsReady] = useState(false)
  const [status, setStatus] = useState('Initializing OCR engine…')
  const [progress, setProgress] = useState(0)
  const workerRef = useRef(null)
  const queueRef = useRef(Promise.resolve())

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        setStatus('Loading OCR worker…')
        const worker = await createWorker(DEFAULT_LANG, 1, {
          cacheMethod: options.cacheMethod || 'readAsBlobURL',
          logger: (message) => {
            if (message.status) {
              setStatus(message.status)
            }
            if (typeof message.progress === 'number') {
              setProgress(message.progress)
            }
          },
        })

        if (cancelled) {
          await worker.terminate()
          return
        }

        await worker.setParameters({
          tessedit_ocr_engine_mode: options.engineMode || '1',
          tessedit_pageseg_mode: options.pageSegMode || '6',
          tessedit_char_whitelist: options.whitelist
            || '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
        })

        workerRef.current = worker
        setIsReady(true)
        setStatus('OCR ready')
        setProgress(1)
      } catch (error) {
        console.error('[sim-card-scanner] Failed to init Tesseract worker', error)
        setStatus(error.message || 'Failed to initialize OCR')
      }
    }

    bootstrap()

    return () => {
      cancelled = true
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
    }
  }, [options.cacheMethod, options.engineMode, options.pageSegMode, options.whitelist])

  const recognize = useCallback(async (canvas) => {
    if (!workerRef.current) {
      throw new Error('OCR worker not ready')
    }

    queueRef.current = queueRef.current.then(async () => {
      // Reset progress for each job
      setProgress(0)
      setStatus('Preprocessing image…')

      const strategies = options.strategies || [
        { psm: '7', whitelist: '0123456789' },
        { psm: '6', whitelist: '0123456789' },
        { psm: '8', whitelist: '0123456789' },
        { psm: '6', whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
      ]

      let best = { text: '', confidence: 0, strategy: null }

      for (const strategy of strategies) {
        await workerRef.current.setParameters({
          tessedit_pageseg_mode: strategy.psm,
          tessedit_char_whitelist: strategy.whitelist,
        })

        setStatus(`Recognizing text (PSM ${strategy.psm})…`)
        const result = await workerRef.current.recognize(canvas)

        const text = (result.data?.text || '').trim()
        const confidence = result.data?.confidence || 0

        if (text.length > 0 && confidence > best.confidence) {
          best = { text, confidence, strategy }
        }

        if (confidence >= 80) {
          break
        }
      }

      return best
    })

    return queueRef.current
  }, [options.strategies])

  return {
    isReady,
    status,
    progress,
    recognize,
  }
}



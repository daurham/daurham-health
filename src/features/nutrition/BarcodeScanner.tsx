import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { cn } from '@/lib'

const FORMATS = [BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.EAN_8, BarcodeFormat.EAN_13]

type BarcodeScannerProps = {
  onDetect: (barcode: string) => void
  onClose: () => void
  disabled?: boolean
}

function createRetailBarcodeReader() {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints)
}

export function BarcodeScanner({ onDetect, onClose, disabled = false }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const lastRef = useRef<string | null>(null)
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied' | 'missing'>('pending')
  const [session, setSession] = useState(0)
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (disabled) {
      return
    }
    const video = videoRef.current
    if (!video) {
      return
    }
    let cancelled = false
    const reader = createRetailBarcodeReader()

    function halt() {
      controlsRef.current?.stop()
      controlsRef.current = null
      stopTracks(video)
    }

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result) => {
          if (cancelled || disabled) {
            return
          }
          const text = result?.getText()?.trim()
          if (!text || lastRef.current === text) {
            return
          }
          lastRef.current = text
          setStatus('Scanned')
          halt()
          onDetectRef.current(text)
        },
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop()
          stopTracks(video)
          return
        }
        controlsRef.current = controls
        setPermission('granted')
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }
        const name = error instanceof Error ? error.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setPermission('denied')
          return
        }
        if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setPermission('missing')
          return
        }
        setPermission('denied')
      })

    return () => {
      cancelled = true
      halt()
    }
  }, [disabled, session])

  function stopScanner() {
    controlsRef.current?.stop()
    controlsRef.current = null
    stopTracks(videoRef.current)
  }

  function submitManual() {
    const value = manual.trim()
    if (value.length === 0) {
      setManualError('Enter a valid barcode.')
      return
    }
    setManualError(null)
    lastRef.current = value
    stopScanner()
    onDetect(value)
  }

  async function onPhoto(file: File | undefined) {
    if (!file) {
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const reader = createRetailBarcodeReader()
      const result = await reader.decodeFromImageUrl(url)
      const text = result.getText().trim()
      if (text.length === 0) {
        setManualError('Could not read a barcode from that image.')
        return
      }
      lastRef.current = text
      stopScanner()
      onDetect(text)
    } catch {
      setManualError('Could not read a barcode from that image.')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="space-y-4">
      <div className="media-chrome relative overflow-hidden rounded-xl">
        <video
          ref={videoRef}
          className="h-64 w-full object-cover"
          autoPlay
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="media-frame h-24 w-56 rounded-md border-2" />
        </div>
        {status ? (
          <p className="absolute bottom-2 left-0 right-0 text-center text-sm font-medium">{status}</p>
        ) : null}
      </div>
      <p className="text-sm text-zinc-600">Hold barcode inside frame</p>

      {permission === 'denied' ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Camera permission was denied. Enter the barcode manually, or allow the camera and retry.
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setPermission('pending')
              setSession((current) => current + 1)
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {permission === 'missing' ? (
        <p className="text-sm text-zinc-600">No camera was found. Enter the barcode manually.</p>
      ) : null}

      <label className="block text-sm font-medium text-zinc-700" htmlFor="manual-barcode">
        Enter barcode manually
      </label>
      <input
        id="manual-barcode"
        inputMode="numeric"
        autoComplete="off"
        value={manual}
        onChange={(event) => {
          setManual(event.target.value)
          setManualError(null)
        }}
        className={cn(
          'min-h-11 w-full rounded-md border bg-white px-3 text-base outline-none md:text-sm',
          manualError ? 'border-red-500' : 'border-zinc-300',
        )}
      />
      {manualError ? <p className="text-sm text-red-700">{manualError}</p> : null}
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium"
        onClick={submitManual}
      >
        Look up barcode
      </button>
      <label className="block text-sm text-zinc-600">
        Use a barcode photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 block w-full text-sm"
          onChange={(event) => void onPhoto(event.target.files?.[0])}
        />
      </label>
      <button type="button" className="text-sm text-zinc-600 underline" onClick={onClose}>
        Back
      </button>
    </div>
  )
}

function stopTracks(video: HTMLVideoElement | null) {
  const stream = video?.srcObject
  if (stream instanceof MediaStream) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
  }
  if (video) {
    video.srcObject = null
  }
}

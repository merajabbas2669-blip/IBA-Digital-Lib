import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  ImagePlus,
  Keyboard,
  LampDesk,
  Monitor,
  Plug,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { QrValidationResult, useILS } from '../../context/ILSContext';
import { SeatStatusLabel } from '../shared/DesignSystem';
import { useToast } from '../shared/UxPrimitives';

type ScannerPhase =
  | 'idle'
  | 'requesting_permission'
  | 'scanning'
  | 'camera_error'
  | 'validating'
  | 'confirming'
  | 'rejected'
  | 'success';

interface StudentQRScannerProps {
  initialQrPayload?: string | null;
  initialManualSeatId?: string | null;
  autoStartCamera?: boolean;
  fullScreen?: boolean;
  onGoToMyReservation: () => void;
  onGoToDashboard?: () => void;
  onClose?: () => void;
  compactHeader?: boolean;
}

interface BarcodeDetectorLike {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 4000): Promise<void> {
  if (video.readyState >= 1 && video.videoWidth > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('canplay', done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    video.addEventListener('loadedmetadata', done, { once: true });
    video.addEventListener('canplay', done, { once: true });
  });
}

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name ?? '';
  const msg = ((err as { message?: string }).message ?? '').toLowerCase();
  return (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    msg.includes('permission denied') ||
    msg.includes('not allowed')
  );
}

export const StudentQRScanner: React.FC<StudentQRScannerProps> = ({
  initialQrPayload,
  initialManualSeatId,
  autoStartCamera = false,
  fullScreen = false,
  onGoToMyReservation,
  onGoToDashboard,
  onClose,
  compactHeader = false,
}) => {
  const {
    currentStudent,
    seats,
    activeStudentReservation,
    penaltyConfig,
    validateScannedQr,
    confirmQrSeatReservation,
  } = useILS();

  const { pushToast } = useToast();
  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [scanDetectedFlash, setScanDetectedFlash] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<{
    title: string;
    detail: string;
    isIframeBlocked?: boolean;
  } | null>(null);
  const [validationResult, setValidationResult] = useState<QrValidationResult | null>(null);
  const [scannedPayload, setScannedPayload] = useState<string>('');
  const [durationHours, setDurationHours] = useState<number>(2);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraCount, setCameraCount] = useState<number>(0);
  const [photoDecodeError, setPhotoDecodeError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<boolean>(false);

  // Manual Seat ID fallback state
  const [manualOpen, setManualOpen] = useState<boolean>(Boolean(initialManualSeatId));
  const [manualInput, setManualInput] = useState<string>(initialManualSeatId ?? '');
  const [manualError, setManualError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingScanRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const cameraRequestIdRef = useRef<number>(0);
  const activeDeviceIdRef = useRef<string | null>(null);
  const barcodeDetectorRef = useRef<BarcodeDetectorLike | null>(null);
  const detectingFrameRef = useRef<boolean>(false);

  const availableSeatsQuick = useMemo(
    () => seats.filter((s) => s.status === 'available').slice(0, 8),
    [seats]
  );

  // Initialize native BarcodeDetector if available (faster hardware-accelerated QR detection)
  useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.BarcodeDetector === 'function') {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    detectingFrameRef.current = false;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignore pause errors
      }
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleDecodedPayload = useCallback(
    async (rawPayload: string) => {
      if (processingScanRef.current) return;
      processingScanRef.current = true;
      setScanDetectedFlash(true);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(45);
        } catch {
          // Ignore vibration restrictions
        }
      }
      stopCamera();
      setManualOpen(false);
      setPhotoDecodeError(null);
      setScannedPayload(rawPayload);
      setBookingError(null);
      setPhase('validating');

      const result = await validateScannedQr(rawPayload);
      if (!mountedRef.current) return;
      setScanDetectedFlash(false);
      setValidationResult(result);

      if (!result.valid) {
        setPhase('rejected');
        pushToast({
          tone: 'error',
          title: result.seat ? `${result.seat.id} unavailable` : 'QR validation failed',
          description: result.error ?? 'This desk cannot be reserved right now.',
        });
        processingScanRef.current = false;
        return;
      }

      const defaultHrs = Math.min(2, result.maxDailyHours ?? penaltyConfig.maxDailyHours);
      setDurationHours(defaultHrs);
      setPhase('confirming');
      processingScanRef.current = false;
    },
    [penaltyConfig.maxDailyHours, pushToast, stopCamera, validateScannedQr]
  );

  const resolveManualSeatPayload = useCallback(
    (raw: string): { ok: true; payload: string } | { ok: false; message: string } => {
      const cleaned = raw.trim();
      if (!cleaned) {
        return { ok: false, message: 'Enter a seat number (e.g., ILS-12) or desk QR token.' };
      }

      // Direct QR token or full URL paste
      if (cleaned.includes('scan_qr=') || cleaned.toUpperCase().startsWith('IBA-ILS-')) {
        return { ok: true, payload: cleaned };
      }

      // Parse "12", "ILS12", "ILS-12", "ils 05"
      const match = cleaned.toUpperCase().match(/^(?:ILS[\s-]?)?0?(\d{1,2})$/);
      if (match) {
        const seatNum = Number(match[1]);
        if (seatNum >= 1 && seatNum <= 30) {
          const targetId = `ILS-${String(seatNum).padStart(2, '0')}`;
          const found = seats.find((s) => s.id === targetId);
          if (found?.qrCodeToken) {
            return { ok: true, payload: found.qrCodeToken };
          }
          return { ok: false, message: `Seat ${targetId} could not be resolved right now.` };
        }
      }

      return {
        ok: false,
        message: 'Enter a valid ILS seat ID between ILS-01 and ILS-30 (for example: ILS-12).',
      };
    },
    [seats]
  );

  const handleManualSubmit = async (e?: React.FormEvent, directSeatId?: string) => {
    if (e) e.preventDefault();
    const candidate = directSeatId ?? manualInput;
    setManualError(null);
    const resolved = resolveManualSeatPayload(candidate);
    if (!resolved.ok) {
      setManualError(resolved.message);
      return;
    }
    await handleDecodedPayload(resolved.payload);
  };

  // Decode a QR code from a captured photo or uploaded image (universal fallback when live stream is blocked)
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPhotoDecodeError(null);
    setPhotoBusy(true);

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read image file.'));
        el.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);

      const canvas = canvasRef.current ?? document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');

      // Try full-resolution (clamped to 1600px) first, then downscaled pass for noisy phone photos
      const maxDims = [1600, 960, 640];
      let decodedText: string | null = null;

      for (const maxDim of maxDims) {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        if (barcodeDetectorRef.current) {
          try {
            const found = await barcodeDetectorRef.current.detect(canvas);
            const raw = found.find((f) => f.rawValue?.trim())?.rawValue?.trim();
            if (raw) {
              decodedText = raw;
              break;
            }
          } catch {
            // Fall through to jsQR
          }
        }

        const imageData = ctx.getImageData(0, 0, w, h);
        const result = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (result?.data?.trim()) {
          decodedText = result.data.trim();
          break;
        }
      }

      setPhotoBusy(false);

      if (decodedText) {
        await handleDecodedPayload(decodedText);
      } else {
        setPhotoDecodeError(
          'No QR code could be detected in that photo. Retake a clear, well-lit close-up of the desk QR plaque or enter the Seat ID manually.'
        );
      }
    } catch {
      setPhotoBusy(false);
      setPhotoDecodeError(
        'Unable to read that image. Try capturing another photo or enter the Seat ID manually.'
      );
    }
  };

  const scanFrameLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!mountedRef.current || !video || !canvas || !streamRef.current || processingScanRef.current) {
      return;
    }

    if (
      video.readyState >= video.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      // Limit decode canvas size to max 960px wide for smooth 60fps mobile performance
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      const targetW = Math.max(1, Math.round(video.videoWidth * scale));
      const targetH = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);

        // Fast native BarcodeDetector if available, otherwise jsQR
        if (barcodeDetectorRef.current && !detectingFrameRef.current) {
          detectingFrameRef.current = true;
          barcodeDetectorRef.current
            .detect(canvas)
            .then((codes) => {
              detectingFrameRef.current = false;
              const raw = codes.find((c) => c.rawValue?.trim())?.rawValue?.trim();
              if (raw && !processingScanRef.current && mountedRef.current) {
                void handleDecodedPayload(raw);
              }
            })
            .catch(() => {
              detectingFrameRef.current = false;
              barcodeDetectorRef.current = null;
            });
        } else {
          const imageData = ctx.getImageData(0, 0, targetW, targetH);
          const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (decoded && decoded.data && decoded.data.trim()) {
            void handleDecodedPayload(decoded.data.trim());
            return;
          }
        }
      }
    }

    rafRef.current = window.requestAnimationFrame(scanFrameLoop);
  }, [handleDecodedPayload]);

  const acquireCameraStream = useCallback(
    async (preferredFacing: 'environment' | 'user', specificDeviceId?: string): Promise<MediaStream> => {
      const mediaDevices = navigator.mediaDevices;

      if (specificDeviceId) {
        return mediaDevices.getUserMedia({
          video: { deviceId: { exact: specificDeviceId } },
          audio: false,
        });
      }

      // Tier 1: Ideal resolution + preferred facing mode
      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: preferredFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        // Tier 2: Simple facing mode (helps older mobile browsers / WebViews)
        {
          video: { facingMode: preferredFacing },
          audio: false,
        },
        // Tier 3: Generic video: true (works on laptops/desktops with a single webcam)
        {
          video: true,
          audio: false,
        },
      ];

      let lastErr: unknown = null;
      for (const constraints of attempts) {
        try {
          return await mediaDevices.getUserMedia(constraints);
        } catch (err) {
          lastErr = err;
          if (isPermissionDeniedError(err)) {
            throw err;
          }
        }
      }

      // Tier 4: Enumerate available videoinput devices directly
      if (typeof mediaDevices.enumerateDevices === 'function') {
        try {
          const devices = await mediaDevices.enumerateDevices();
          const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
          if (cameras.length > 0) {
            const preferred =
              preferredFacing === 'environment'
                ? cameras.find((d) => /back|rear|environment/i.test(d.label)) ?? cameras[0]
                : cameras.find((d) => /front|user|face/i.test(d.label)) ?? cameras[0];
            return await mediaDevices.getUserMedia({
              video: { deviceId: { exact: preferred.deviceId } },
              audio: false,
            });
          }
        } catch (enumErr) {
          lastErr = enumErr;
        }
      }

      throw lastErr ?? new Error('Unable to acquire camera stream.');
    },
    []
  );

  const startCamera = useCallback(
    async (
      preferredFacing: 'environment' | 'user' = facingMode,
      options?: { triggeredAutomatically?: boolean; specificDeviceId?: string }
    ) => {
      stopCamera();
      const requestId = ++cameraRequestIdRef.current;
      processingScanRef.current = false;
      setCameraError(null);
      setPhotoDecodeError(null);
      setBookingError(null);
      setValidationResult(null);
      setManualOpen(false);

      const isEmbedded =
        typeof window !== 'undefined' &&
        (() => {
          try {
            return window.self !== window.top;
          } catch {
            return true;
          }
        })();

      if (typeof window !== 'undefined' && window.isSecureContext === false) {
        setCameraError({
          title: 'HTTPS Required for Live Camera',
          detail:
            'Browsers require a secure HTTPS connection to stream live camera video. Use "Scan QR Photo" or "Enter Seat ID Manually" below.',
        });
        setPhase('camera_error');
        return;
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setCameraError({
          title: 'Live Camera Unavailable',
          detail:
            'This browser environment does not expose live camera streaming. Use "Scan QR Photo" (uses your device camera) or "Enter Seat ID Manually" below.',
          isIframeBlocked: isEmbedded,
        });
        setPhase('camera_error');
        return;
      }

      setPhase('requesting_permission');

      try {
        const stream = await acquireCameraStream(preferredFacing, options?.specificDeviceId);

        // Guard against unmount or a newer startCamera() call (fixes React StrictMode race)
        if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        const activeTrack = stream.getVideoTracks()[0];
        activeDeviceIdRef.current = activeTrack?.getSettings?.().deviceId ?? null;

        // Discover total cameras for the Switch Camera toggle
        if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
          navigator.mediaDevices
            .enumerateDevices()
            .then((list) => {
              if (!mountedRef.current) return;
              setCameraCount(list.filter((d) => d.kind === 'videoinput').length);
            })
            .catch(() => {
              // Ignore enumeration errors
            });
        }

        setPhase('scanning');

        // Wait one frame for React layout, then attach stream cleanly to the always-mounted <video>
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

        if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
          return;
        }

        const video = videoRef.current;
        if (!video) {
          throw new Error('Camera preview element is not mounted.');
        }

        video.setAttribute('playsinline', 'true');
        video.setAttribute('muted', 'true');
        video.muted = true;
        video.srcObject = stream;

        await waitForVideoReady(video);

        if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
          return;
        }

        await video.play();

        if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
          return;
        }

        rafRef.current = window.requestAnimationFrame(scanFrameLoop);
      } catch (err) {
        if (!mountedRef.current || cameraRequestIdRef.current !== requestId) {
          return;
        }
        stopCamera();

        const errName = err instanceof DOMException ? err.name : (err as { name?: string })?.name ?? '';

        // If auto-start failed without a direct tap on strict mobile browsers, drop back to crisp idle prompt instead of a harsh error
        if (options?.triggeredAutomatically && isPermissionDeniedError(err)) {
          let permState: string | null = null;
          try {
            const permStatus = await navigator.permissions?.query({
              name: 'camera' as PermissionName,
            });
            permState = permStatus?.state ?? null;
          } catch {
            permState = null;
          }

          if (permState === 'prompt') {
            setPhase('idle');
            return;
          }
        }

        if (isPermissionDeniedError(err)) {
          setCameraError({
            title: isEmbedded ? 'Camera Blocked in Preview Frame' : 'Camera Permission Denied',
            detail: isEmbedded
              ? 'Your browser or embedded preview is blocking live camera access. Allow camera permission in browser settings, open the app in its own tab, or use "Scan QR Photo" / "Enter Seat ID" below.'
              : 'Camera access was blocked. Tap the lock/camera icon in your browser address bar to allow camera access and tap Retry Camera — or use "Scan QR Photo" / "Enter Seat ID" below.',
            isIframeBlocked: isEmbedded,
          });
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setCameraError({
            title: 'No Camera Detected',
            detail:
              'No working camera was found on this device. You can still upload a QR photo or enter your ILS Seat ID manually below.',
          });
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
          setCameraError({
            title: 'Camera Currently In Use',
            detail:
              'Another app or browser tab is currently using your camera. Close it and tap Retry Camera, or use "Scan QR Photo" / "Enter Seat ID" below.',
          });
        } else {
          setCameraError({
            title: 'Camera Access Failed',
            detail:
              'Could not start the live camera stream on this device. Tap Retry Camera, capture a QR photo with your phone camera, or enter the Seat ID manually below.',
            isIframeBlocked: isEmbedded,
          });
        }
        setPhase('camera_error');
      }
    },
    [acquireCameraStream, facingMode, scanFrameLoop, stopCamera]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (initialQrPayload && initialQrPayload.trim()) {
      void handleDecodedPayload(initialQrPayload.trim());
    } else if (initialManualSeatId) {
      setManualOpen(true);
      setManualInput(initialManualSeatId);
    } else if (autoStartCamera) {
      void startCamera('environment', { triggeredAutomatically: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQrPayload, initialManualSeatId]);

  const handleConfirmReservation = async () => {
    if (!scannedPayload) return;
    setConfirmBusy(true);
    setBookingError(null);

    const res = await confirmQrSeatReservation(scannedPayload, durationHours);
    setConfirmBusy(false);

    if (!res.ok) {
      setBookingError(res.message);
      pushToast({
        tone: 'error',
        title: 'Reservation failed',
        description: res.message,
      });
      return;
    }

    setSuccessMessage(res.message);
    setPhase('success');
    pushToast({
      tone: 'success',
      title: validationResult?.seat
        ? `${validationResult.seat.id} Reserved`
        : 'Reservation Confirmed',
      description: res.message,
    });
  };

  const handleSwitchCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);

    // If multiple cameras are enumerated, cycle explicitly by deviceId for reliable switching on laptops & phones
    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
        if (cameras.length > 1) {
          const currentIdx = cameras.findIndex((c) => c.deviceId === activeDeviceIdRef.current);
          const nextCamera = cameras[(currentIdx + 1) % cameras.length];
          if (nextCamera) {
            await startCamera(nextFacing, { specificDeviceId: nextCamera.deviceId });
            return;
          }
        }
      } catch {
        // Fall back to facingMode switch
      }
    }

    await startCamera(nextFacing);
  };

  const allowedDurations = Array.from(
    {
      length: Math.max(
        1,
        Math.min(4, validationResult?.maxDailyHours ?? penaltyConfig.maxDailyHours)
      ),
    },
    (_, i) => i + 1
  );

  const triggerQrPhotoCapture = () => {
    setPhotoDecodeError(null);
    fileInputRef.current?.click();
  };

  const renderManualEntryPanel = (darkVariant: boolean) => (
    <form
      onSubmit={(e) => void handleManualSubmit(e)}
      className={`rounded-2xl p-4 sm:p-5 space-y-4 ${
        darkVariant
          ? 'bg-white text-[#172033] shadow-2xl'
          : 'bg-[#F5F7FC] border border-slate-200 text-[#172033]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold text-[#101C3A]">
            Enter ILS Seat ID Manually
          </h3>
          <p className="text-xs text-[#68748A] mt-0.5">
            Fallback when camera scanning is unavailable (ILS-01 to ILS-30).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setManualOpen(false);
            setManualError(null);
          }}
          aria-label="Close manual seat entry"
          className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[#68748A] hover:bg-slate-100 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="text"
          value={manualInput}
          onChange={(e) => {
            setManualInput(e.target.value);
            setManualError(null);
          }}
          placeholder="e.g., ILS-12 or 12"
          aria-label="Manual ILS Seat ID"
          className="flex-1 min-h-[46px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-sm font-semibold text-[#101C3A] placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:border-[#315EF2]"
        />
        <button
          type="submit"
          className="min-h-[46px] px-5 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm cursor-pointer whitespace-nowrap"
        >
          Verify Seat
        </button>
      </div>

      {manualError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800 font-medium">
          {manualError}
        </div>
      )}

      {availableSeatsQuick.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-[#68748A]">
            Quick Pick Available Seats
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableSeatsQuick.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setManualInput(s.id);
                  void handleManualSubmit(undefined, s.id);
                }}
                className="px-2.5 py-1.5 min-h-[36px] rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-mono text-xs font-bold tabular-nums transition-colors cursor-pointer"
              >
                {s.id}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );

  const renderConfirmingSheet = () =>
    validationResult?.seat ? (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[#EAF0FF]/75 border border-[#DCE6FF] p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#315EF2]">
              Desk Verified · Ready to Reserve
            </span>
            <SeatStatusLabel status={validationResult.seat.status} compact />
          </div>
          <h3 className="font-display text-lg font-bold text-[#101C3A]">
            Reserve {validationResult.seat.id}?
          </h3>
          <p className="text-xs text-[#68748A] leading-relaxed">
            {validationResult.seat.zone} · {validationResult.seat.floor} · Assigned to{' '}
            <span className="font-semibold text-[#101C3A]">{currentStudent.name}</span> (ERP{' '}
            <span className="font-mono tabular-nums">{currentStudent.erpId}</span>)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#172033] px-1">
          {validationResult.seat.hasPowerOutlet && (
            <span className="inline-flex items-center gap-1.5">
              <Plug className="h-3.5 w-3.5 text-[#19B6A4]" />
              <span>AC Power</span>
            </span>
          )}
          {validationResult.seat.hasTaskLamp && (
            <span className="inline-flex items-center gap-1.5">
              <LampDesk className="h-3.5 w-3.5 text-[#19B6A4]" />
              <span>Task Lamp</span>
            </span>
          )}
          {validationResult.seat.hasMonitorDock && (
            <span className="inline-flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5 text-[#19B6A4]" />
              <span>USB-C Dock</span>
            </span>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#101C3A] mb-2">
            Study Session Duration (Max{' '}
            {validationResult.maxDailyHours ?? penaltyConfig.maxDailyHours} hours)
          </label>
          <div className="grid grid-cols-4 gap-2">
            {allowedDurations.map((hrs) => (
              <button
                key={hrs}
                type="button"
                onClick={() => setDurationHours(hrs)}
                className={`min-h-[44px] rounded-xl border text-xs font-bold font-mono tabular-nums transition-colors cursor-pointer ${
                  durationHours === hrs
                    ? 'bg-[#101C3A] text-white border-[#101C3A]'
                    : 'bg-white text-[#172033] border-slate-200 hover:bg-slate-50'
                }`}
              >
                {hrs} {hrs === 1 ? 'hr' : 'hrs'}
              </button>
            ))}
          </div>
        </div>

        {bookingError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-800">
            {bookingError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            disabled={confirmBusy}
            onClick={() => void handleConfirmReservation()}
            className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-sm font-semibold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            <CheckCircle2 className="h-4.5 w-4.5" />
            <span>
              {confirmBusy
                ? 'Confirming...'
                : `Confirm ${validationResult.seat.id} (${durationHours}h)`}
            </span>
          </button>
          <button
            type="button"
            disabled={confirmBusy}
            onClick={() => void startCamera(facingMode)}
            className="min-h-[44px] py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#68748A] cursor-pointer whitespace-nowrap"
          >
            Scan Again
          </button>
        </div>
      </div>
    ) : null;

  /* ==================== FULL-SCREEN MOBILE-FIRST SCANNER MODE ==================== */
  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 bg-[#0B1222] text-white flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Scan ILS Desk QR Code"
      >
        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleQrImageUpload(e)}
          className="hidden"
          aria-hidden="true"
        />

        {/* Always-mounted video element to eliminate React mount/play race conditions */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`fixed inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
            phase === 'scanning' ? 'opacity-90' : 'opacity-0'
          }`}
        />

        {/* Subtle dark vignette over camera feed for legible HUD */}
        {phase === 'scanning' && (
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-gradient-to-b from-[#0B1222]/65 via-transparent to-[#0B1222]/80 pointer-events-none"
          />
        )}

        {/* Top Translucent App Bar */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-safe h-16 bg-gradient-to-b from-[#0B1222]/90 to-transparent shrink-0">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose?.();
            }}
            aria-label="Close scanner"
            className="min-h-[44px] min-w-[44px] -ml-1 flex items-center justify-center rounded-xl text-white hover:bg-white/10 active:bg-white/15 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h2 className="font-display text-base font-bold tracking-tight text-white">Scan QR</h2>

          {phase === 'scanning' && cameraCount !== 1 ? (
            <button
              type="button"
              onClick={() => void handleSwitchCamera()}
              aria-label="Switch camera"
              title="Switch camera"
              className="min-h-[44px] min-w-[44px] -mr-1 flex items-center justify-center rounded-xl text-white hover:bg-white/10 cursor-pointer"
            >
              <RefreshCw className="h-4.5 w-4.5" />
            </button>
          ) : (
            <div className="w-[44px]" />
          )}
        </div>

        {/* Center Camera / Scanner Stage */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-5 pb-4 overflow-y-auto">
          {/* Active reservation warning banner */}
          {activeStudentReservation && phase !== 'success' && (
            <div className="relative z-20 w-full max-w-md mb-4 rounded-2xl bg-amber-500/20 border border-amber-400/40 backdrop-blur-md p-3.5 text-xs text-amber-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-bold text-white">Active Seat:</span> You currently hold{' '}
                <span className="font-mono font-bold text-amber-200">
                  {activeStudentReservation.seatId}
                </span>
                .
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onGoToMyReservation();
                }}
                className="px-3 py-1.5 rounded-lg bg-white text-[#101C3A] font-semibold text-[11px] shrink-0 cursor-pointer"
              >
                View
              </button>
            </div>
          )}

          {/* Photo decode feedback if user uploaded a blurry photo */}
          {photoDecodeError && (
            <div className="relative z-20 w-full max-w-md mb-4 rounded-2xl bg-rose-500/20 border border-rose-300/40 backdrop-blur-md p-3.5 text-xs text-rose-100 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-300 shrink-0 mt-0.5" />
              <span>{photoDecodeError}</span>
            </div>
          )}

          {/* SCANNING / IDLE / REQUESTING VIEWFINDER */}
          {(phase === 'scanning' || phase === 'idle' || phase === 'requesting_permission') && (
            <div className="relative z-10 w-full max-w-sm flex flex-col items-center text-center">
              {/* Reticle Frame */}
              <div className="relative w-60 h-60 sm:w-64 sm:h-64 flex items-center justify-center">
                <div className="absolute inset-0 rounded-3xl bg-white/[0.04] border border-white/10 backdrop-blur-[1px]" />
                <span className="absolute top-0 left-0 h-10 w-10 border-t-[4px] border-l-[4px] border-white rounded-tl-2xl" />
                <span className="absolute top-0 right-0 h-10 w-10 border-t-[4px] border-r-[4px] border-white rounded-tr-2xl" />
                <span className="absolute bottom-0 left-0 h-10 w-10 border-b-[4px] border-l-[4px] border-white rounded-bl-2xl" />
                <span className="absolute bottom-0 right-0 h-10 w-10 border-b-[4px] border-r-[4px] border-white rounded-br-2xl" />

                {/* Animated scan beam */}
                {phase === 'scanning' && (
                  <div className="absolute inset-x-4 top-6 bottom-6 overflow-hidden pointer-events-none">
                    <div className="h-[3px] w-full rounded-full bg-gradient-to-r from-transparent via-[#315EF2] to-transparent shadow-[0_0_16px_3px_rgba(49,94,242,0.85)] animate-qr-beam" />
                  </div>
                )}

                {phase === 'idle' && (
                  <button
                    type="button"
                    onClick={() => void startCamera('environment')}
                    className="relative z-10 inline-flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl bg-[#315EF2] hover:bg-[#244AD4] text-white shadow-xl cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    <Camera className="h-7 w-7" />
                    <span className="text-xs font-bold">Tap to Enable Camera</span>
                  </button>
                )}

                {phase === 'requesting_permission' && (
                  <div className="relative z-10 flex flex-col items-center gap-2 px-4">
                    <Camera className="h-7 w-7 text-[#2DD4BF] animate-pulse" />
                    <span className="text-xs font-semibold text-white">
                      Starting camera...
                    </span>
                  </div>
                )}
              </div>

              <p className="mt-6 text-sm font-medium text-white/95 max-w-[260px] leading-snug">
                Scan the QR code at the ILS seat
              </p>
              <p className="mt-1 text-xs text-slate-300/80 max-w-[280px]">
                {phase === 'idle' || phase === 'requesting_permission'
                  ? 'When prompted, tap "Allow" to grant camera access for automatic desk QR detection.'
                  : 'Hold steady over the permanent desk plaque (ILS-01 – ILS-30)'}
              </p>
            </div>
          )}

          {/* CAMERA ERROR */}
          {phase === 'camera_error' && cameraError && (
            <div className="relative z-20 w-full max-w-md rounded-2xl bg-white text-[#172033] p-5 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <CameraOff className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#101C3A]">
                    {cameraError.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#68748A] leading-relaxed">
                    {cameraError.detail}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => void startCamera('environment')}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Live Camera</span>
                </button>
                <button
                  type="button"
                  disabled={photoBusy}
                  onClick={triggerQrPhotoCapture}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  <span>{photoBusy ? 'Scanning Photo...' : 'Scan QR Photo'}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-[#F5F7FC] hover:bg-slate-100 text-[#101C3A] text-xs font-semibold cursor-pointer"
              >
                <Keyboard className="h-3.5 w-3.5 text-[#315EF2]" />
                <span>Enter Seat ID Manually</span>
              </button>
            </div>
          )}

          {/* VALIDATING (with immediate QR Detected success confirmation feedback) */}
          {phase === 'validating' && (
            <div className="relative z-20 animate-sheet-up w-full max-w-sm rounded-2xl bg-white text-[#172033] p-6 text-center space-y-2.5 shadow-2xl">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                {scanDetectedFlash ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <ShieldCheck className="h-6 w-6 text-[#315EF2]" />
                )}
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                QR Code Detected
              </div>
              <div className="font-display text-sm font-bold text-[#101C3A]">
                Verifying ILS Desk &amp; Availability...
              </div>
              <p className="text-xs text-[#68748A]">
                Checking live status and reservation eligibility.
              </p>
            </div>
          )}

          {/* REJECTED */}
          {phase === 'rejected' && validationResult && (
            <div className="relative z-20 w-full max-w-md rounded-2xl bg-white text-[#172033] p-5 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-sm font-bold text-[#101C3A]">
                      {validationResult.seat
                        ? `Cannot Reserve ${validationResult.seat.id}`
                        : 'Invalid Desk QR'}
                    </h3>
                    {validationResult.seat && (
                      <SeatStatusLabel status={validationResult.seat.status} compact />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#68748A] leading-relaxed">
                    {validationResult.error ?? 'This desk cannot be booked right now.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => void startCamera(facingMode)}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[#101C3A] text-white text-xs font-semibold cursor-pointer"
                >
                  Scan Another Desk
                </button>
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-[#101C3A] text-xs font-semibold cursor-pointer"
                >
                  Enter Seat ID
                </button>
              </div>
            </div>
          )}

          {/* CONFIRMING */}
          {phase === 'confirming' && (
            <div className="relative z-20 w-full max-w-md rounded-2xl bg-white text-[#172033] p-5 shadow-2xl">
              {renderConfirmingSheet()}
            </div>
          )}

          {/* SUCCESS */}
          {phase === 'success' && (
            <div className="relative z-20 w-full max-w-md rounded-2xl bg-white text-[#172033] p-6 text-center space-y-4 shadow-2xl">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg font-bold text-[#101C3A]">
                  Reservation Confirmed
                </h3>
                <p className="text-xs text-[#68748A] leading-relaxed">
                  {successMessage || 'Your ILS seat has been reserved and marked OCCUPIED.'}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onGoToMyReservation();
                  }}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#315EF2] text-white text-sm font-semibold cursor-pointer"
                >
                  View My Reservation
                </button>
                {onGoToDashboard && (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      onGoToDashboard();
                    }}
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-[#101C3A] text-xs font-semibold cursor-pointer"
                  >
                    Home
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom QR Photo + Manual Seat ID Fallback Area */}
        {phase !== 'confirming' && phase !== 'success' && (
          <div className="relative z-20 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-2 bg-gradient-to-t from-[#0B1222] via-[#0B1222]/90 to-transparent shrink-0">
            <div className="max-w-md mx-auto">
              {manualOpen ? (
                renderManualEntryPanel(true)
              ) : (
                <div className="space-y-2.5 text-center">
                  <div className="flex items-center gap-3 text-xs text-slate-300/75">
                    <span className="h-px flex-1 bg-white/15" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-white/15" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={photoBusy}
                      onClick={triggerQrPhotoCapture}
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl border border-white/20 bg-white/10 hover:bg-white/16 backdrop-blur-md text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                    >
                      <ImagePlus className="h-4 w-4 text-[#2DD4BF] shrink-0" />
                      <span className="truncate">{photoBusy ? 'Reading...' : 'Scan QR Photo'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setManualOpen(true);
                      }}
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl border border-white/20 bg-white/10 hover:bg-white/16 backdrop-blur-md text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                    >
                      <Keyboard className="h-4 w-4 text-[#2DD4BF] shrink-0" />
                      <span className="truncate">Enter Seat ID</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ==================== INLINE CARD SCANNER MODE ==================== */
  return (
    <div className="surface-card overflow-hidden">
      {/* Scanner Header */}
      <div className="px-5 py-4 bg-[#101C3A] text-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-[#315EF2]/25 border border-[#315EF2]/50 flex items-center justify-center shrink-0">
            <QrCode className="h-4.5 w-4.5 text-[#2DD4BF]" />
          </div>
          <div className="min-w-0">
            <h2 className={`${compactHeader ? 'text-sm' : 'text-base'} font-bold truncate`}>
              Physical Desk QR Scanner
            </h2>
            <p className="text-[11px] text-blue-200/85 truncate">
              {currentStudent.name} · ERP {currentStudent.erpId}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            aria-label="Close QR Scanner"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void handleQrImageUpload(e)}
        className="hidden"
        aria-hidden="true"
      />

      <div className="p-5 sm:p-6 space-y-5">
        {activeStudentReservation && phase !== 'success' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-xs text-amber-950">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Active Reservation Exists:</span> You currently hold{' '}
                <span className="font-mono font-bold">{activeStudentReservation.seatId}</span> until{' '}
                <span className="font-mono tabular-nums">{activeStudentReservation.endTime}</span>.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onGoToMyReservation();
              }}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              My Reservation
            </button>
          </div>
        )}

        {photoDecodeError && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-900 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{photoDecodeError}</span>
          </div>
        )}

        {/* Always-mounted inline video container (shown only during scanning) */}
        <div className={phase === 'scanning' ? 'space-y-4' : 'hidden'}>
          <div className="relative rounded-2xl overflow-hidden bg-[#0A1329] aspect-[4/3] sm:aspect-[16/10] max-h-[380px] mx-auto border border-slate-200">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="relative w-52 h-52 sm:w-60 sm:h-60">
                <span className="absolute top-0 left-0 h-7 w-7 border-t-[3px] border-l-[3px] border-[#19B6A4] rounded-tl-lg" />
                <span className="absolute top-0 right-0 h-7 w-7 border-t-[3px] border-r-[3px] border-[#19B6A4] rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 h-7 w-7 border-b-[3px] border-l-[3px] border-[#19B6A4] rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 h-7 w-7 border-b-[3px] border-r-[3px] border-[#19B6A4] rounded-br-lg" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0A1329]/90 via-[#0A1329]/50 to-transparent px-4 py-3 text-center">
              <p className="text-xs font-medium text-white">
                Align the desk QR code inside the frame — detection is automatic
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {cameraCount !== 1 && (
              <button
                type="button"
                onClick={() => void handleSwitchCamera()}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#101C3A] cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#315EF2]" />
                <span>Switch Camera</span>
              </button>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                disabled={photoBusy}
                onClick={triggerQrPhotoCapture}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#101C3A] cursor-pointer whitespace-nowrap"
              >
                <ImagePlus className="h-3.5 w-3.5 text-[#19B6A4]" />
                <span>Scan Photo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setPhase('idle');
                  setManualOpen(true);
                }}
                className="min-h-[42px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#315EF2] cursor-pointer whitespace-nowrap"
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>Enter Seat ID</span>
              </button>
            </div>
          </div>
        </div>

        {phase === 'idle' && (
          <div className="py-8 px-4 text-center space-y-4 border border-dashed border-slate-300 rounded-2xl bg-[#F5F7FC]">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-[#101C3A] text-white flex items-center justify-center shadow-sm">
              <Camera className="h-6 w-6 text-[#2DD4BF]" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-bold text-[#101C3A]">
                Scan the QR Code Attached to Your ILS Desk
              </h3>
              <p className="text-xs text-[#68748A] leading-relaxed">
                Point your camera at the permanent desk QR label (ILS-01 through ILS-30), snap a QR
                photo, or enter the seat ID manually below.
              </p>
            </div>
            <div className="pt-1 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => void startCamera('environment')}
                className="min-h-[46px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] text-white text-xs font-semibold shadow-sm transition-all cursor-pointer whitespace-nowrap"
              >
                <Camera className="h-4 w-4" />
                <span>Enable Camera &amp; Scan QR</span>
              </button>
              <button
                type="button"
                disabled={photoBusy}
                onClick={triggerQrPhotoCapture}
                className="min-h-[46px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
              >
                <ImagePlus className="h-4 w-4 text-[#19B6A4]" />
                <span>{photoBusy ? 'Scanning...' : 'Scan QR Photo'}</span>
              </button>
              <button
                type="button"
                onClick={() => setManualOpen((prev) => !prev)}
                className="min-h-[46px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold transition-all cursor-pointer whitespace-nowrap"
              >
                <Keyboard className="h-4 w-4 text-[#315EF2]" />
                <span>Enter Seat ID</span>
              </button>
            </div>
          </div>
        )}

        {manualOpen && phase !== 'confirming' && phase !== 'success' && renderManualEntryPanel(false)}

        {phase === 'requesting_permission' && (
          <div className="py-10 px-4 text-center space-y-3 border border-slate-200 rounded-2xl bg-[#F5F7FC]">
            <Camera className="h-8 w-8 text-[#315EF2] mx-auto animate-pulse" />
            <div className="text-sm font-bold text-[#101C3A]">Requesting Camera Permission...</div>
            <p className="text-xs text-[#68748A] max-w-sm mx-auto">
              Approve the browser camera permission prompt to activate the live QR scanner.
            </p>
          </div>
        )}

        {phase === 'camera_error' && cameraError && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <CameraOff className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-rose-950">{cameraError.title}</h3>
                <p className="text-xs text-rose-900/90 leading-relaxed">{cameraError.detail}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void startCamera('environment')}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry Live Camera</span>
              </button>
              <button
                type="button"
                disabled={photoBusy}
                onClick={triggerQrPhotoCapture}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#315EF2] hover:bg-[#244AD4] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>{photoBusy ? 'Scanning...' : 'Scan QR Photo'}</span>
              </button>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#101C3A] text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Keyboard className="h-3.5 w-3.5 text-[#315EF2]" />
                <span>Enter Seat ID Manually</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'validating' && (
          <div className="py-10 text-center space-y-2 border border-slate-200 rounded-2xl bg-[#F5F7FC]">
            <ShieldCheck className="h-7 w-7 text-[#315EF2] mx-auto" />
            <div className="text-sm font-bold text-[#101C3A]">
              Verifying Desk QR Code &amp; Seat Availability...
            </div>
            <p className="text-xs text-[#68748A]">
              Checking seat status, QR authenticity, and active reservation eligibility.
            </p>
          </div>
        )}

        {phase === 'rejected' && validationResult && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-rose-950">
                    {validationResult.seat
                      ? `Cannot Reserve ${validationResult.seat.id}`
                      : 'Invalid QR Code'}
                  </h3>
                  {validationResult.seat && (
                    <SeatStatusLabel status={validationResult.seat.status} />
                  )}
                </div>
                <p className="text-xs text-rose-900/90 leading-relaxed">
                  {validationResult.error ?? 'This QR code cannot be used to book an ILS seat.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void startCamera(facingMode)}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Scan Another Desk QR</span>
              </button>
              <button
                type="button"
                onClick={() => setManualOpen(true)}
                className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#101C3A] cursor-pointer whitespace-nowrap"
              >
                <Keyboard className="h-3.5 w-3.5 text-[#315EF2]" />
                <span>Try Manual Seat ID</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'confirming' && renderConfirmingSheet()}

        {phase === 'success' && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-emerald-950">Reservation Confirmed</h3>
              <p className="text-xs text-emerald-900 max-w-md mx-auto leading-relaxed">
                {successMessage ||
                  'Your Individual Learning Space has been reserved and marked OCCUPIED.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onGoToMyReservation();
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#101C3A] hover:bg-[#172554] text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                View My Reservation
              </button>
              {onGoToDashboard && (
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onGoToDashboard();
                  }}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-100/50 text-emerald-900 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Back to Home
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

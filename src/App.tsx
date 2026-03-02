import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { getAllStamps, putStamp, type StampRecord } from './db';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CROP_VIEWPORT_HEIGHT = 520;
const PRESS_THRESHOLD = 3;
const EXPORT_SIZE = 512;

// Hole ratios inside stamper2.png (tweak later)
const HOLE_LEFT_RATIO = 0.33;
const HOLE_TOP_RATIO = 0.265;
const HOLE_SIZE_RATIO = 0.36;

type StampPreview = {
  blob: Blob;
  url: string;
  updatedAt: number;
};

type DragState = {
  startPointerX: number;
  startPointerY: number;
  startCx: number;
  startCy: number;
  moved: boolean;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function monthLabel(year: number, month: number) {
  const date = new Date(year, month, 1);
  const monthText = date.toLocaleString('en-US', { month: 'short' });
  return `${year} ${monthText}`;
}

function buildStampMap(records: StampRecord[]) {
  const map: Record<string, StampPreview> = {};
  records.forEach((record) => {
    map[record.dateKey] = {
      blob: record.blob,
      url: URL.createObjectURL(record.blob),
      updatedAt: record.updatedAt,
    };
  });
  return map;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

async function loadMaskImage(): Promise<HTMLImageElement> {
  try {
    return await loadImage('/stamp_mask_fill.png');
  } catch {
    return await loadImage('/stamp_mask.png');
  }
}

async function exportStampPng(
  imageUrl: string,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  exportSize = EXPORT_SIZE
): Promise<Blob> {
  const img = await loadImage(imageUrl);
  const maskImg = await loadMaskImage();

  const canvas = document.createElement('canvas');
  canvas.width = exportSize;
  canvas.height = exportSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.clearRect(0, 0, exportSize, exportSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, exportSize, exportSize);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = exportSize;
  maskCanvas.height = exportSize;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) {
    throw new Error('Failed to get mask context');
  }
  mctx.clearRect(0, 0, exportSize, exportSize);
  mctx.drawImage(maskImg, 0, 0, exportSize, exportSize);
  const maskData = mctx.getImageData(0, 0, exportSize, exportSize);
  const data = maskData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = lum;
  }
  mctx.putImageData(maskData, 0, 0);

  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  const centerAlpha = ctx.getImageData(Math.floor(exportSize / 2), Math.floor(exportSize / 2), 1, 1).data[3];
  if (centerAlpha === 0) {
    throw new Error('Mask produced empty stamp (center alpha 0)');
  }

  const cornerAlpha = ctx.getImageData(0, 0, 1, 1).data[3];
  console.log('corner alpha should be 0:', cornerAlpha);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to export PNG'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [stampsByDate, setStampsByDate] = useState<Record<string, StampPreview>>({});
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [stamperCx, setStamperCx] = useState(0);
  const [stamperCy, setStamperCy] = useState(0);
  const [didInitStamper, setDidInitStamper] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [photoNatural, setPhotoNatural] = useState<{ width: number; height: number } | null>(null);
  const [brokenStampKeys, setBrokenStampKeys] = useState<Record<string, boolean>>({});
  const [borderAvailable, setBorderAvailable] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stamperRef = useRef<HTMLImageElement | null>(null);
  const photoRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAllStamps()
      .then((records) => {
        if (!isMounted) return;
        setStampsByDate((prev) => {
          const next: Record<string, StampPreview> = {};
          const incoming = new Set(records.map((record) => record.dateKey));
          Object.entries(prev).forEach(([key, entry]) => {
            if (!incoming.has(key)) {
              URL.revokeObjectURL(entry.url);
            }
          });
          records.forEach((record) => {
            if (
              !(record.blob instanceof Blob) ||
              record.blob.size < 500 ||
              record.blob.type !== 'image/png'
            ) {
              return;
            }
            const existing = prev[record.dateKey];
            if (existing && existing.blob === record.blob) {
              next[record.dateKey] = existing;
            } else {
              if (existing) {
                URL.revokeObjectURL(existing.url);
              }
              next[record.dateKey] = {
                blob: record.blob,
                url: URL.createObjectURL(record.blob),
                updatedAt: record.updatedAt,
              };
            }
          });
          return next;
        });
      })
      .catch(() => {
        if (!isMounted) return;
        setStampsByDate((prev) => {
          Object.values(prev).forEach((entry) => URL.revokeObjectURL(entry.url));
          return {};
        });
      });

    return () => {
      isMounted = false;
      setStampsByDate((prev) => {
        Object.values(prev).forEach((entry) => URL.revokeObjectURL(entry.url));
        return {};
      });
    };
  }, []);

  useEffect(() => {
    if (pendingImageUrl) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    document.body.style.overflow = '';
  }, [pendingImageUrl]);

  useEffect(() => {
    if (!pendingImageUrl) {
      setPhotoNatural(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setPhotoNatural({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = pendingImageUrl;
  }, [pendingImageUrl]);

  useEffect(() => {
    if (!pendingImageUrl) return;
    if (!viewportRef.current || didInitStamper) return;
    const rect = viewportRef.current.getBoundingClientRect();
    setStamperCx(rect.width / 2);
    setStamperCy(rect.height / 2);
    setDidInitStamper(true);
  }, [pendingImageUrl, didInitStamper]);

  const { totalCells, firstDay, daysInMonth } = useMemo(() => {
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Math.ceil((first + days) / 7) * 7;
    return { totalCells: cells, firstDay: first, daysInMonth: days };
  }, [year, month]);

  const handlePrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((prev) => prev - 1);
    } else {
      setMonth((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((prev) => prev + 1);
    } else {
      setMonth((prev) => prev + 1);
    }
  };

  const openPickerForDate = (dateKey: string) => {
    setPendingDateKey(dateKey);
    fileInputRef.current?.click();
  };

  const closeCropper = () => {
    setPendingImageUrl(null);
    setPendingDateKey(null);
    setDidInitStamper(false);
    setIsSaving(false);
    setIsPressing(false);
  };

  const handleFileSelected = (file: File | null) => {
    if (!file) {
      setPendingDateKey(null);
      return;
    }
    console.log('file chosen', { name: file.name, size: file.size, type: file.type });
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        console.log('FileReader onload', { length: reader.result.length });
        setPendingImageUrl(reader.result);
        console.log('CropperModal open', pendingDateKey ?? '');
      }
    };
    reader.onerror = () => {
      console.error('FileReader error');
    };
    reader.readAsDataURL(file);
  };

  const handleStamperPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (isSaving) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startCx: stamperCx,
      startCy: stamperCy,
      moved: false,
    };
  };

  const handleStamperPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragRef.current) return;
    const dx = event.clientX - dragRef.current.startPointerX;
    const dy = event.clientY - dragRef.current.startPointerY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) > PRESS_THRESHOLD) {
      dragRef.current.moved = true;
    }
    if (!dragRef.current.moved) return;
    setStamperCx(dragRef.current.startCx + dx);
    setStamperCy(dragRef.current.startCy + dy);
  };

  const performPress = async () => {
    console.log('[SAVE] pressed', { dateKey: pendingDateKey, hasImage: !!pendingImageUrl });
    if (!pendingImageUrl || !pendingDateKey || !viewportRef.current || !photoRef.current || !stamperRef.current) {
      return;
    }

    setIsPressing(true);
    setFlashOn(true);
    window.setTimeout(() => setFlashOn(false), 60);
    window.setTimeout(() => setIsPressing(false), 140);

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const photoRect = photoRef.current.getBoundingClientRect();
    const stamperRect = stamperRef.current.getBoundingClientRect();
    const holeW = stamperRect.width * HOLE_SIZE_RATIO;
    const holeH = holeW;
    const holeX = stamperCx - stamperRect.width / 2 + stamperRect.width * HOLE_LEFT_RATIO;
    const holeY = stamperCy - stamperRect.height / 2 + stamperRect.height * HOLE_TOP_RATIO;

    const relX = holeX - (photoRect.left - viewportRect.left);
    const relY = holeY - (photoRect.top - viewportRect.top);

    const naturalW = photoRef.current.naturalWidth;
    const naturalH = photoRef.current.naturalHeight;
    if (!naturalW || !naturalH) {
      console.error('Photo natural size missing');
      return;
    }

    const relClampedX = Math.min(Math.max(relX, 0), photoRect.width);
    const relClampedY = Math.min(Math.max(relY, 0), photoRect.height);
    const srcX = (relClampedX / photoRect.width) * naturalW;
    const srcY = (relClampedY / photoRect.height) * naturalH;
    const srcW = (holeW / photoRect.width) * naturalW;
    const srcH = (holeH / photoRect.height) * naturalH;

    const boundedSrcX = Math.min(Math.max(srcX, 0), Math.max(naturalW - srcW, 0));
    const boundedSrcY = Math.min(Math.max(srcY, 0), Math.max(naturalH - srcH, 0));

    try {
      setIsSaving(true);
      const blob = await exportStampPng(pendingImageUrl, boundedSrcX, boundedSrcY, srcW, srcH, 512);
      console.log('[SAVE] export blob', { type: blob?.type, size: blob?.size });
      if (!blob || blob.size < 500 || blob.type !== 'image/png') {
        console.error('[SAVE] invalid blob', { size: blob?.size, type: blob?.type });
        setIsSaving(false);
        return;
      }
      console.log('[SAVE] db put start', pendingDateKey);
      await putStamp(pendingDateKey, blob);
      console.log('[SAVE] db put ok', pendingDateKey);
      setStampsByDate((prev) => {
        if (prev[pendingDateKey]) {
          URL.revokeObjectURL(prev[pendingDateKey].url);
        }
        return {
          ...prev,
          [pendingDateKey]: {
            blob,
            url: URL.createObjectURL(blob),
            updatedAt: Date.now(),
          },
        };
      });
      console.log('[SAVE] ui updated', pendingDateKey);
      setBrokenStampKeys((prev) => ({ ...prev, [pendingDateKey]: false }));
      closeCropper();
      setSelectedDateKey(null);
    } catch (error) {
      console.error('Failed to save stamp', error);
      setIsSaving(false);
    }
  };

  const handleStamperPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!dragRef.current) return;
    const moved = dragRef.current.moved;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) {
      void performPress();
    }
  };

  return (
    <div className="calendar">
      <header className="calendar__header">
        <button className="calendar__nav" onClick={handlePrev}>
          Prev
        </button>
        <div className="calendar__title">{monthLabel(year, month)}</div>
        <button className="calendar__nav" onClick={handleNext}>
          Next
        </button>
      </header>

      <div className="calendar__grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="calendar__weekday">
            {day}
          </div>
        ))}

        {Array.from({ length: totalCells }, (_, index) => {
          const dayNumber = index - firstDay + 1;
          const isValid = dayNumber > 0 && dayNumber <= daysInMonth;

          if (!isValid) {
            return <div key={`empty-${index}`} className="calendar__cell calendar__cell--empty" />;
          }

          const dateKey = formatDateKey(year, month, dayNumber);
          const isSelected = selectedDateKey === dateKey;
          const stamp = stampsByDate[dateKey];
          const stampExists = Boolean(stamp);
          const isBlob = stamp?.blob instanceof Blob;
          const blobSize = stamp?.blob?.size ?? 0;
          const blobType = stamp?.blob?.type ?? '';
          console.log('stamp render', dateKey, { exists: stampExists, isBlob, blobSize, blobType });
          const stampUrl = stamp?.url ?? '';
          const canRenderStamp =
            Boolean(stampUrl) &&
            isBlob &&
            blobSize > 0 &&
            blobType === 'image/png' &&
            !brokenStampKeys[dateKey];

          return (
            <button
              key={dateKey}
              type="button"
              className={`calendar__cell${isSelected ? ' calendar__cell--selected' : ''}`}
              onClick={() => {
                setSelectedDateKey(dateKey);
                console.log(dateKey);
                openPickerForDate(dateKey);
              }}>
              <div className="calendar__day-number">{dayNumber}</div>
              <div className="calendar__thumb-wrap">
                {canRenderStamp ? (
                  <>
                    <img
                      className="calendar__thumb-photo"
                      src={stampUrl}
                      alt=""
                      draggable={false}
                      onError={() => {
                        console.error(dateKey, 'failed to load stamp url', stampUrl);
                        setBrokenStampKeys((prev) => ({ ...prev, [dateKey]: true }));
                      }}
                    />
                    {borderAvailable ? (
                      <img
                        className="calendar__thumb-border"
                        src="/stamp_border.png"
                        alt=""
                        onError={() => setBorderAvailable(false)}
                      />
                    ) : null}
                  </>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <input
        ref={fileInputRef}
        className="calendar__file-input"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          handleFileSelected(file);
          if (event.target) {
            event.target.value = '';
          }
        }}
      />

      {pendingImageUrl ? (
        <div className="modal">
          <div className="modal__panel modal__panel--cropper">
            <div className="cropper__viewport" ref={viewportRef} style={{ height: CROP_VIEWPORT_HEIGHT }}>
              <img ref={photoRef} className="cropper__photo-img" src={pendingImageUrl} alt="Selected" />
              {flashOn ? <div className="cropper__flash" /> : null}
              <img
                ref={stamperRef}
                className={`cropper__stamper${isPressing ? ' cropper__stamper--press' : ''}`}
                src="/stampper2.png"
                alt="Stamper"
                style={{ left: `${stamperCx}px`, top: `${stamperCy}px`, transform: 'translate(-50%, -50%)' }}
                onPointerDown={handleStamperPointerDown}
                onPointerMove={handleStamperPointerMove}
                onPointerUp={handleStamperPointerUp}
                onPointerCancel={handleStamperPointerUp}
                onDragStart={(event) => event.preventDefault()}
                draggable={false}
              />
            </div>
            <div className="modal__actions">
              <button className="modal__button modal__button--ghost" onClick={closeCropper} disabled={isSaving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { getAllStamps, type StampRecord } from './db';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CROP_VIEWPORT_HEIGHT = 520;

type StampPreview = {
  blob: Blob;
  url: string;
  updatedAt: number;
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

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [stampsByDate, setStampsByDate] = useState<Record<string, StampPreview>>({});
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stamperRef = useRef<HTMLImageElement | null>(null);
  const [stamperCx, setStamperCx] = useState(0);
  const [stamperCy, setStamperCy] = useState(0);
  const [didInitStamper, setDidInitStamper] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startPointerX: number;
    startPointerY: number;
    startCx: number;
    startCy: number;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAllStamps()
      .then((records) => {
        if (!isMounted) return;
        setStampsByDate((prev) => {
          Object.values(prev).forEach((entry) => URL.revokeObjectURL(entry.url));
          return buildStampMap(records);
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
    setIsDragging(false);
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
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    dragRef.current = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startCx: stamperCx,
      startCy: stamperCy,
    };
  };

  const handleStamperPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!isDragging || !dragRef.current || !viewportRef.current || !stamperRef.current) return;
    const dx = event.clientX - dragRef.current.startPointerX;
    const dy = event.clientY - dragRef.current.startPointerY;
    setStamperCx(dragRef.current.startCx + dx);
    setStamperCy(dragRef.current.startCy + dy);
  };

  const handleStamperPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    setIsDragging(false);
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
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
              <span className="calendar__day">{dayNumber}</span>
              {stamp ? (
                <img className="calendar__thumb" src={stamp.url} alt="" draggable={false} />
              ) : null}
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
              <img className="cropper__photo-img" src={pendingImageUrl} alt="Selected" />
              <img
                ref={stamperRef}
                className="cropper__stamper"
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
              <button className="modal__button modal__button--ghost" onClick={closeCropper}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { getAllStamps, type StampRecord } from './db';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [pendingDateKey, setPendingDateKey] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);

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
    setIsPickerOpen(true);
  };

  const closePicker = () => {
    setIsPickerOpen(false);
  };

  const closeCropper = () => {
    setIsCropperOpen(false);
    if (pendingImageUrl) {
      URL.revokeObjectURL(pendingImageUrl);
    }
    setPendingImageUrl(null);
    setPendingDateKey(null);
  };

  const handleFileSelected = (file: File | null) => {
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    if (pendingImageUrl) {
      URL.revokeObjectURL(pendingImageUrl);
    }
    setPendingImageUrl(nextUrl);
    setIsPickerOpen(false);
    setIsCropperOpen(true);
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

      {isPickerOpen ? (
        <div className="modal">
          <div className="modal__panel">
            <div className="modal__title">Select a photo</div>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                handleFileSelected(file);
              }}
            />
            <button className="modal__button" onClick={closePicker}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {isCropperOpen ? (
        <div className="modal">
          <div className="modal__panel">
            <div className="modal__title">Cropper (placeholder)</div>
            {pendingImageUrl ? (
              <img className="modal__image" src={pendingImageUrl} alt="Selected" />
            ) : null}
            <button className="modal__button" onClick={closeCropper}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

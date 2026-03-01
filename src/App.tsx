import { useMemo, useState } from 'react';
import './App.css';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

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

          return (
            <button
              key={dateKey}
              type="button"
              className={`calendar__cell${isSelected ? ' calendar__cell--selected' : ''}`}
              onClick={() => {
                setSelectedDateKey(dateKey);
                console.log(dateKey);
              }}>
              {dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}

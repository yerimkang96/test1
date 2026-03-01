const appEl = document.getElementById('app');

if (!appEl) {
  throw new Error('App container not found');
}
const app = appEl;

type CalendarState = {
  year: number;
  month: number; // 0-based
  selectedDateKey: string | null;
};

const state: CalendarState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selectedDateKey: null,
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function monthLabel(year: number, month: number) {
  const date = new Date(year, month, 1);
  const formatter = new Intl.DateTimeFormat('en', { month: 'short' });
  return `${year} ${formatter.format(date)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function render() {
  app.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'calendar';

  const header = document.createElement('div');
  header.className = 'calendar__header';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'calendar__nav';
  prevBtn.textContent = 'Prev';
  prevBtn.addEventListener('click', () => {
    if (state.month === 0) {
      state.month = 11;
      state.year -= 1;
    } else {
      state.month -= 1;
    }
    render();
  });

  const nextBtn = document.createElement('button');
  nextBtn.className = 'calendar__nav';
  nextBtn.textContent = 'Next';
  nextBtn.addEventListener('click', () => {
    if (state.month === 11) {
      state.month = 0;
      state.year += 1;
    } else {
      state.month += 1;
    }
    render();
  });

  const title = document.createElement('div');
  title.className = 'calendar__title';
  title.textContent = monthLabel(state.year, state.month);

  header.appendChild(prevBtn);
  header.appendChild(title);
  header.appendChild(nextBtn);

  const grid = document.createElement('div');
  grid.className = 'calendar__grid';

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  weekdayLabels.forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'calendar__weekday';
    cell.textContent = label;
    grid.appendChild(cell);
  });

  const startOffset = firstWeekday(state.year, state.month);
  const totalDays = daysInMonth(state.year, state.month);
  const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    const cell = document.createElement('button');
    cell.className = 'calendar__cell';

    const day = i - startOffset + 1;
    if (day > 0 && day <= totalDays) {
      const dateKey = formatDateKey(state.year, state.month, day);
      cell.textContent = String(day);
      cell.dataset.dateKey = dateKey;

      if (state.selectedDateKey === dateKey) {
        cell.classList.add('calendar__cell--selected');
      }

      cell.addEventListener('click', () => {
        state.selectedDateKey = dateKey;
        console.log(state.selectedDateKey);
        render();
      });
    } else {
      cell.classList.add('calendar__cell--empty');
      cell.disabled = true;
    }

    grid.appendChild(cell);
  }

  container.appendChild(header);
  container.appendChild(grid);
  app.appendChild(container);
}

render();

import { planData, saveState } from './state.js';
import { renderPreview } from './ui.js';

let calendar;
const calendarEl = document.getElementById('calendar');
const eventModal = document.getElementById('event-modal');
const eventForm = document.getElementById('event-form');
const modalTitle = document.getElementById('modal-title');
const eventIdInput = document.getElementById('event-id');
const eventTitleInput = document.getElementById('event-title');
const eventStartInput = document.getElementById('event-start');
const eventEndInput = document.getElementById('event-end');
const eventDetailsInput = document.getElementById('event-details');
const eventCastInput = document.getElementById('event-cast');
const eventMaterialsInput = document.getElementById('event-materials');
const eventNotesInput = document.getElementById('event-notes');
const deleteEventButton = document.getElementById('delete-event-button');

export function updateCalendarSettings() {
    if (!calendar) return;
    const startDateStr = planData.basicInfo['plan-date'];
    const duration = parseInt(planData.basicInfo['plan-duration'], 10) || 1;
    if (startDateStr) {
        const startDate = new Date(startDateStr);
        if (!isNaN(startDate.getTime())) {
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + duration);
            calendar.setOption('validRange', { start: startDate, end: endDate });
            calendar.gotoDate(startDate);
        }
    } else {
        calendar.setOption('validRange', null);
    }
}

export function initializeCalendar() {
    calendar = new FullCalendar.Calendar(calendarEl, {
        locale: 'ja',
        initialView: 'timeGridWeek',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        editable: true,
        selectable: true,
        events: planData.schedule || [],
        select: (info) => {
            openEventModal({
                start: info.startStr,
                end: info.endStr
            });
        },
        eventClick: (info) => {
            openEventModal(info.event);
        },
        eventChange: (info) => {
            updateEvent(info.event);
            renderPreview();
            saveState();
        }
    });
    updateCalendarSettings();
    calendar.render();
    setupModalEventListeners();
}

/**
 * カレンダーを再描画する（画面表示時に呼び出す）
 * 【修正点】 export を追加
 */
export function rerenderCalendar() {
    if (calendar) {
        updateCalendarSettings();
        calendar.render();
    }
}

function setupModalEventListeners() {
    eventForm.addEventListener('submit', handleFormSubmit);
    deleteEventButton.addEventListener('click', handleDeleteEvent);
    document.getElementById('cancel-event-button').addEventListener('click', () => {
        eventModal.style.display = 'none';
    });
}

function openEventModal(eventData) {
    if (eventData.id) {
        modalTitle.textContent = 'スケジュールの編集';
        deleteEventButton.style.display = 'inline-block';
        eventIdInput.value = eventData.id;
        eventTitleInput.value = eventData.title;
        eventStartInput.value = formatDateTime(eventData.start);
        eventEndInput.value = formatDateTime(eventData.end);
        const props = eventData.extendedProps || {};
        eventDetailsInput.value = props.details || '';
        eventCastInput.value = props.cast || '';
        eventMaterialsInput.value = props.materials || '';
        eventNotesInput.value = props.notes || '';
    } else {
        modalTitle.textContent = 'スケジュールの追加';
        deleteEventButton.style.display = 'none';
        eventForm.reset();
        eventIdInput.value = '';
        eventStartInput.value = formatDateTime(new Date(eventData.start));
        eventEndInput.value = formatDateTime(new Date(eventData.end));
    }
    eventModal.style.display = 'flex';
}

function handleFormSubmit(e) {
    e.preventDefault();
    const eventData = {
        id: eventIdInput.value || 'event-' + Date.now(),
        title: eventTitleInput.value,
        start: eventStartInput.value,
        end: eventEndInput.value,
        extendedProps: {
            details: eventDetailsInput.value,
            cast: eventCastInput.value,
            materials: eventMaterialsInput.value,
            notes: eventNotesInput.value
        }
    };
    updateEvent(eventData);
    renderPreview();
    saveState();
    eventModal.style.display = 'none';
}

function handleDeleteEvent() {
    const eventId = eventIdInput.value;
    if (confirm('このスケジュールを削除してもよろしいですか？')) {
        planData.schedule = planData.schedule.filter(e => e.id !== eventId);
        const eventInCalendar = calendar.getEventById(eventId);
        if (eventInCalendar) eventInCalendar.remove();
        renderPreview();
        saveState();
        eventModal.style.display = 'none';
    }
}

function updateEvent(event) {
    const index = planData.schedule.findIndex(e => e.id === event.id);
    let props = {};
    if (index > -1) props = planData.schedule[index].extendedProps || {};
    if (event.extendedProps) props = {...props, ...event.extendedProps};
    
    const newEventData = {
        id: event.id,
        title: event.title,
        start: event.start ? new Date(event.start).toISOString() : null,
        end: event.end ? new Date(event.end).toISOString() : null,
        extendedProps: props
    };

    if (index > -1) {
        planData.schedule[index] = newEventData;
    } else {
        planData.schedule.push(newEventData);
    }
    const eventInCalendar = calendar.getEventById(event.id);
    if (eventInCalendar) eventInCalendar.remove();
    calendar.addEvent(newEventData);
}

function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

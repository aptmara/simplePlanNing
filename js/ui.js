/**
 * ui.js
 * UIの描画やDOM操作関連
 */
import * as utils from './utils.js';
import * as state from './state.js';
import * as handlers from './handlers.js';

import {
    planOutput, planOutputTitle, summaryArea, summaryListContainer, summaryTotalTimeContainer,
    editModal, modalActivityName, modalStartDate, modalStartTime, modalEndDate, modalEndTime,
    modalActivityCategory, modalActivityNotes, modalAllowOverlap, modalDateTimeError,
    categoryModal, categoryListContainer, newCategoryName, newCategoryColor
} from './main.js';

// --- Notification & Status ---
export function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification-message ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    requestAnimationFrame(() => notif.classList.add('show'));
    setTimeout(() => {
        notif.classList.remove('show');
        notif.addEventListener('transitionend', () => notif.remove(), { once: true });
    }, duration);
}

export function updateSaveStatus(status) {
    const statusEl = document.getElementById('save-status');
    if (!statusEl) return;
    clearTimeout(state.saveStatusTimeout);
    switch (status) {
        case 'saving':
            statusEl.textContent = '保存中...';
            statusEl.style.opacity = '1';
            break;
        case 'saved':
            statusEl.textContent = '✓ 保存済み';
            statusEl.style.opacity = '1';
            const timeout = setTimeout(() => { statusEl.style.opacity = '0'; }, 2000);
            state.setSaveStatusTimeout(timeout);
            break;
        default:
            statusEl.textContent = '';
            statusEl.style.opacity = '0';
            break;
    }
}

// --- Plan Rendering ---
export function renderPlan(planName, planDaysData) {
    planOutput.innerHTML = '';
    planOutputTitle.textContent = `計画: ${planName}`;
    if (!planDaysData || planDaysData.length === 0) {
        planOutput.innerHTML = '<p class="placeholder">表示する計画がありません。</p>';
        return;
    }
    const timelineMap = new Map();
    planDaysData.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.classList.add('day-plan');
        dayDiv.dataset.date = day.date;

        let isoDate;
        if (day.isoDate) {
            isoDate = day.isoDate;
        } else {
            const parsableStr = day.date.split('(')[0].replace('年', '-').replace('月', '-').replace('日', '');
            // Day.jsを使って日付をパース
            isoDate = dayjs(parsableStr, 'YYYY-M-D').format('YYYY-MM-DD');
        }
        dayDiv.dataset.isoDate = isoDate;

        const dateHeader = document.createElement('h3');
        dateHeader.classList.add('day-header');
        dateHeader.textContent = day.date;
        dayDiv.appendChild(dateHeader);
        const dayContent = document.createElement('div');
        dayContent.classList.add('day-content');
        const timeAxis = document.createElement('div');
        timeAxis.classList.add('time-axis');
        for (let hour = 0; hour < 24; hour++) {
            const marker = document.createElement('div');
            marker.classList.add('time-marker');
            const label = document.createElement('span');
            label.classList.add('time-marker-label');
            label.textContent = `${hour}:00`;
            marker.appendChild(label);
            timeAxis.appendChild(marker);
        }
        dayContent.appendChild(timeAxis);
        const timeline = document.createElement('div');
        timeline.classList.add('timeline');
        timeline.addEventListener('dragover', handlers.handleDragOverTimeline);
        timeline.addEventListener('drop', handlers.handleDropOnTimeline);
        timeline.addEventListener('mousedown', handlers.handleTimelineMouseDown);
        timeline.addEventListener('dragenter', (e) => { e.preventDefault(); if (state.draggingItem) e.currentTarget.classList.add('is-active-drop-target'); });
        timeline.addEventListener('dragleave', (e) => { e.preventDefault(); if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return; e.currentTarget.classList.remove('is-active-drop-target'); });
        dayContent.appendChild(timeline);
        dayDiv.appendChild(dayContent);
        const addButton = document.createElement('button');
        addButton.classList.add('add-item-btn');
        addButton.textContent = '＋ この日にアクティビティを追加';
        addButton.addEventListener('click', () => addPlanItem(isoDate));
        dayDiv.appendChild(addButton);
        planOutput.appendChild(dayDiv);
        timelineMap.set(isoDate, timeline);
    });

    const allActivities = planDaysData.flatMap(day => day.activities || []);
    const processedActivityIds = new Set();
    allActivities.forEach(activity => {
        if (!activity.id || processedActivityIds.has(activity.id)) return;
        const activityElements = createActivityElements(activity);
        activityElements.forEach(item => {
            const targetTimeline = timelineMap.get(item.isoDate);
            if (targetTimeline) {
                targetTimeline.appendChild(item.element);
            }
        });
        processedActivityIds.add(activity.id);
    });
    handlers.savePlanToLocalStorage();
}

export function createActivityElements(activity) {
    const elements = [];
    const activityId = activity.id || `act-${Date.now()}`;
    
    const timezone = dayjs.tz.guess();
    const actStart = dayjs.tz(`${activity.startDate} ${activity.startTime || '00:00'}`, 'YYYY-MM-DD HH:mm', timezone);
    const actEnd = dayjs.tz(`${activity.endDate} ${activity.endTime || '00:00'}`, 'YYYY-MM-DD HH:mm', timezone);

    let currentDay = actStart.startOf('day');

    while (currentDay.isBefore(actEnd, 'day') || currentDay.isSame(actEnd, 'day')) {
        // その日のアクティビティ区間（セグメント）を計算
        const segmentStart = actStart.isAfter(currentDay) ? actStart : currentDay;
        const nextDayStart = currentDay.add(1, 'day');
        const segmentEnd = actEnd.isBefore(nextDayStart) ? actEnd : nextDayStart;

        // セグメントの長さが0以下の場合はスキップ
        if (segmentStart.isSame(segmentEnd) || segmentStart.isAfter(segmentEnd)) {
            currentDay = currentDay.add(1, 'day');
            continue;
        }

        const isFirstDay = segmentStart.isSame(actStart);
        const isLastDay = segmentEnd.isSame(actEnd);

        // 終了時刻が00:00の場合、タイムライン上では前日の24:00として扱う
        let endTimeString = segmentEnd.format('HH:mm');
        if (endTimeString === '00:00' && segmentEnd.isAfter(segmentStart)) {
            endTimeString = '24:00';
        }

        const segmentData = {
            ...activity,
            id: activityId,
            startTime: segmentStart.format('HH:mm'),
            endTime: endTimeString,
        };

        const listItem = createPlanItemElement(segmentData, { isFirstDay, isLastDay });
        const isoDateString = currentDay.format('YYYY-MM-DD');
        elements.push({ element: listItem, isoDate: isoDateString });

        currentDay = currentDay.add(1, 'day');
    }
    return elements;
}

export function createPlanItemElement(activity, options = { isFirstDay: true, isLastDay: true }) {
    const listItem = document.createElement('div');
    listItem.classList.add('plan-item');
    listItem.setAttribute('draggable', 'true');
    listItem.addEventListener('dragstart', handlers.handleDragStart);
    listItem.addEventListener('dragend', handlers.handleDragEnd);

    const startMinutes = utils.timeToMinutes(activity.startTime);
    let endMinutesVal = utils.timeToMinutes(activity.endTime);
    if (activity.endTime === '24:00') endMinutesVal = 24 * 60;
    const durationMinutes = Math.max(0, endMinutesVal - startMinutes);
    const totalMinutesInDay = 24 * 60;

    listItem.style.top = `${(startMinutes / totalMinutesInDay) * 100}%`;
    listItem.style.height = `${(durationMinutes / totalMinutesInDay) * 100}%`;

    listItem.dataset.activityId = activity.id;
    listItem.dataset.name = activity.name;
    listItem.dataset.startDate = activity.startDate;
    listItem.dataset.startTime = activity.startTime;
    listItem.dataset.endDate = activity.endDate;
    listItem.dataset.endTime = activity.endTime;
    listItem.dataset.category = activity.category || '';
    listItem.dataset.notes = activity.notes || '';
    listItem.dataset.allowOverlap = activity.allowOverlap || false;

    applyCategoryStylesToItem(listItem);

    if (!options.isFirstDay || !options.isLastDay) {
        if (options.isFirstDay) listItem.classList.add('is-continuation-start');
        else if (options.isLastDay) listItem.classList.add('is-continuation-end');
        else listItem.classList.add('is-continuation-middle');
    }

    listItem.innerHTML = `
        <div class="plan-item-name">${activity.name}</div>
        <div class="plan-item-time-range">${activity.startTime} - ${activity.endTime === '24:00' ? '翌00:00' : activity.endTime}</div>
        ${activity.notes ? `<div class="plan-item-notes">${activity.notes}</div>` : ''}
        <div class="resize-handle resize-handle-top"></div>
        <div class="resize-handle resize-handle-bottom"></div>
        <button class="duplicate-item-btn" title="複製">📄</button>
        <button class="delete-item-btn" title="削除">&times;</button>
    `;

    const topHandle = listItem.querySelector('.resize-handle-top');
    const bottomHandle = listItem.querySelector('.resize-handle-bottom');
    if (!options.isFirstDay) topHandle.classList.add('disabled');
    if (!options.isLastDay) bottomHandle.classList.add('disabled');
    topHandle.addEventListener('mousedown', handlers.startResize);
    bottomHandle.addEventListener('mousedown', handlers.startResize);

    listItem.querySelector('.duplicate-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.handleDuplicateItem(listItem, true);
    });

    listItem.querySelector('.delete-item-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`「${activity.name}」を削除しますか？`)) {
            document.querySelectorAll(`[data-activity-id="${activity.id}"]`).forEach(part => part.remove());
            handlers.savePlanToLocalStorage();
        }
    });

    listItem.addEventListener('click', (e) => {
        if (e.target.classList.contains('resize-handle') || e.target.closest('.delete-item-btn, .duplicate-item-btn') || state.isResizing) return;
        if (state.draggingItem) return;
        handlers.handleItemClick(e, listItem);
    });

    listItem.addEventListener('dblclick', (e) => {
        if (e.target.classList.contains('resize-handle') || e.target.closest('.delete-item-btn, .duplicate-item-btn') || state.isResizing) return;
        if (state.draggingItem) return;
        openModal(listItem);
    });
    return listItem;
}

export function updateTimelineLayout() {
    document.querySelectorAll('.day-plan .timeline').forEach(timeline => {
        const items = Array.from(timeline.querySelectorAll('.plan-item'));
        items.forEach(item => {
            item.style.width = '';
            item.style.left = '';
            item.classList.remove('is-colliding');
        });
        if (items.length === 0) return;

        const itemData = items.map(el => ({
            el,
            start: utils.timeToMinutes(el.style.top) * (24 * 60) / 100,
            end: (utils.timeToMinutes(el.style.top) * (24 * 60) / 100) + (utils.timeToMinutes(el.style.height) * (24 * 60) / 100),
            allowOverlap: el.dataset.allowOverlap === 'true'
        })).sort((a, b) => a.start - b.start);

        const processedItems = new Set();
        for (const item of itemData) {
            if (processedItems.has(item)) continue;
            const group = [];
            const queue = [item];
            processedItems.add(item);
            let head = 0;
            while (head < queue.length) {
                const current = queue[head++];
                group.push(current);
                for (const other of itemData) {
                    if (processedItems.has(other)) continue;
                    if (current.start < other.end && current.end > other.start) {
                        queue.push(other);
                        processedItems.add(other);
                    }
                }
            }
            group.sort((a, b) => a.start - b.start);
            const columns = [];
            for (const member of group) {
                let placed = false;
                for (let i = 0; i < columns.length; i++) {
                    const col = columns[i];
                    if (col[col.length - 1].end <= member.start) {
                        col.push(member);
                        member.colIndex = i;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    member.colIndex = columns.length;
                    columns.push([member]);
                }
            }
            const totalColumns = columns.length;
            if (totalColumns > 1) {
                const itemWidth = 100 / totalColumns;
                for (const member of group) {
                    member.el.style.width = `calc(${itemWidth}% - 5px)`;
                    member.el.style.left = `${member.colIndex * itemWidth}%`;
                }
            }
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const itemA = group[i];
                    const itemB = group[j];
                    if (itemA.start < itemB.end && itemA.end > itemB.start) {
                        if (!itemA.allowOverlap && !itemB.allowOverlap) {
                            itemA.el.classList.add('is-colliding');
                        }
                    }
                }
            }
        }
    });
}

// --- Modals ---
export function openModal(listItem) {
    state.setCurrentEditingItem(listItem);
    modalActivityName.value = listItem.dataset.name;
    modalStartDate.value = listItem.dataset.startDate;
    modalStartTime.value = listItem.dataset.startTime;
    modalEndDate.value = listItem.dataset.endDate;
    modalEndTime.value = listItem.dataset.endTime;
    modalActivityCategory.value = listItem.dataset.category;
    modalActivityNotes.value = listItem.dataset.notes;
    modalAllowOverlap.checked = listItem.dataset.allowOverlap === 'true';
    modalDateTimeError.textContent = '';
    editModal.style.display = 'flex';
    modalActivityName.focus();
}

export function closeModal() {
    state.setCurrentEditingItem(null);
    editModal.style.display = 'none';
}

export function openCategoryModal() {
    state.setTempCategories(JSON.parse(JSON.stringify(state.categories)));
    renderCategoryList();
    categoryModal.style.display = 'flex';
}

export function closeCategoryModal() {
    state.setTempCategories([]);
    categoryModal.style.display = 'none';
}

export function addPlanItem(isoDate, initialData = {}) {
    state.setCurrentEditingItem(null);
    modalActivityName.value = initialData.name || '';
    modalStartDate.value = isoDate;
    modalEndDate.value = isoDate;
    modalStartTime.value = initialData.startTime || '09:00';
    modalEndTime.value = initialData.endTime || '10:00';
    modalActivityCategory.value = initialData.category || '';
    modalActivityNotes.value = initialData.notes || '';
    modalAllowOverlap.checked = initialData.allowOverlap || false;
    modalDateTimeError.textContent = '';
    editModal.style.display = 'flex';
    modalActivityName.focus();
}

// --- Categories UI ---
export function renderCategoryList() {
    categoryListContainer.innerHTML = '';
    if (state.tempCategories.length === 0) {
        categoryListContainer.innerHTML = '<p>カテゴリがありません。下から追加してください。</p>';
        return;
    }
    state.tempCategories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-list-item';
        item.innerHTML = `
            <div class="category-color-preview" style="background-color: ${cat.color};"></div>
            <span class="category-name">${cat.name}</span>
            <div class="category-item-actions">
                <button class="edit-cat-btn" data-id="${cat.id}" title="編集">✏️</button>
                <button class="delete-cat-btn" data-id="${cat.id}" title="削除">❌</button>
            </div>
        `;
        categoryListContainer.appendChild(item);
    });
    document.querySelectorAll('.delete-cat-btn').forEach(btn => btn.addEventListener('click', () => handlers.handleDeleteCategory(btn.dataset.id)));
    document.querySelectorAll('.edit-cat-btn').forEach(btn => btn.addEventListener('click', () => handlers.handleEditCategory(btn.dataset.id)));
}

export function updateActivityCategoryDropdown() {
    modalActivityCategory.innerHTML = '<option value="">カテゴリなし</option>';
    state.categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.id;
        option.textContent = cat.name;
        modalActivityCategory.appendChild(option);
    });
}

export function applyCategoryStylesToItem(itemEl) {
    const categoryId = itemEl.dataset.category;
    const category = state.categories.find(c => c.id === categoryId);
    if (category) {
        const isDark = document.body.classList.contains('dark-mode');
        const baseColor = category.color;
        const itemBgColor = isDark ? utils.lightenColor(baseColor, 20) : baseColor;
        const itemBorderColor = isDark ? utils.lightenColor(baseColor, 35) : utils.darkenColor(baseColor, 15);
        itemEl.style.backgroundColor = itemBgColor;
        itemEl.style.borderLeftColor = itemBorderColor;
    } else {
        itemEl.style.backgroundColor = '';
        itemEl.style.borderLeftColor = '';
    }
}

export function applyCategoryStylesToAllItems() {
    document.querySelectorAll('.plan-item').forEach(applyCategoryStylesToItem);
}

// --- Summary Area ---
export function updateSummary() {
    summaryArea.style.display = 'none';
    summaryListContainer.innerHTML = '';
    summaryTotalTimeContainer.innerHTML = '';
    if (state.categoryChart) {
        state.categoryChart.destroy();
        state.setCategoryChart(null);
    }
    const planObject = state.getCurrentPlanObject();
    if (!planObject || planObject.planData.length === 0) return;

    let totalPlanMinutes = 0;
    const categoryTotals = {};
    const allActivities = planObject.planData.flatMap(day => day.activities);
    const uniqueActivities = Object.values(allActivities.reduce((acc, cur) => {
        if (!acc[cur.id]) acc[cur.id] = cur;
        return acc;
    }, {}));

    uniqueActivities.forEach(activity => {
        const timezone = dayjs.tz.guess();
        const start = dayjs.tz(`${activity.startDate} ${activity.startTime}`, 'YYYY-MM-DD HH:mm', timezone);
        const end = dayjs.tz(`${activity.endDate} ${activity.endTime}`, 'YYYY-MM-DD HH:mm', timezone);
        const duration = end.diff(start, 'minute');

        if (duration > 0) {
            totalPlanMinutes += duration;
            const catId = activity.category || 'none';
            if (!categoryTotals[catId]) categoryTotals[catId] = 0;
            categoryTotals[catId] += duration;
        }
    });

    if (totalPlanMinutes === 0) return;
    summaryArea.style.display = 'block';
    const list = document.createElement('ul');
    list.className = 'summary-list';
    const sortedCategoryTotals = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a);
    const chartLabels = [];
    const chartData = [];
    const chartColors = [];

    for (const [categoryId, minutes] of sortedCategoryTotals) {
        const category = state.categories.find(c => c.id === categoryId);
        const categoryName = category ? category.name : 'カテゴリなし';
        const categoryColor = category ? category.color : '#cccccc';
        const item = document.createElement('li');
        item.className = 'summary-item';
        item.innerHTML = `
            <div class="summary-item-label">
                <div class="category-color-preview" style="background-color: ${categoryColor};"></div>
                <span>${categoryName}</span>
            </div>
            <div class="summary-item-time">${utils.formatMinutes(minutes)}</div>
        `;
        list.appendChild(item);
        chartLabels.push(categoryName);
        chartData.push(minutes);
        chartColors.push(categoryColor);
    }
    summaryListContainer.appendChild(list);
    summaryTotalTimeContainer.innerHTML = `<strong>合計計画時間:</strong> ${utils.formatMinutes(totalPlanMinutes)}`;

    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#e0e0e0' : '#212529';
    const legendColor = isDarkMode ? '#a0a0a0' : '#6c757d';
    const ctx = document.getElementById('categoryPieChart').getContext('2d');
    const newChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: chartLabels, datasets: [{ label: '時間', data: chartData, backgroundColor: chartColors, borderColor: isDarkMode ? '#1e1e1e' : '#fff', borderWidth: 2, hoverOffset: 4 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    titleColor: textColor, bodyColor: textColor,
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = totalPlanMinutes > 0 ? ((value / totalPlanMinutes) * 100).toFixed(1) : 0;
                            return `${label}: ${utils.formatMinutes(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    state.setCategoryChart(newChart);
}

export function updateSelectionUI() {
    document.querySelectorAll('.plan-item.is-selected').forEach(el => el.classList.remove('is-selected'));
    state.selectedItems.forEach(item => {
        const activityId = item.dataset.activityId;
        if (activityId) {
            document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.add('is-selected'));
        }
    });
}
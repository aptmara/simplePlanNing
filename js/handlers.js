/**
 * handlers.js
 * 全てのイベントハンドラー
 */
import * as utils from './utils.js';
import * as state from './state.js';
import * as ui from './ui.js';
import {
    planNameInput, startDateInput, numberOfDaysInput, dropZoneOverlay,
    newCategoryName, newCategoryColor, modalActivityName, modalStartDate,
    modalStartTime, modalEndDate, modalEndTime, modalActivityCategory,
    modalActivityNotes, modalAllowOverlap, modalDateTimeError
} from './main.js';

const { jsPDF } = window.jspdf;

// --- Main Form and Plan Handlers ---
export function handleFormSubmit(event) {
    event.preventDefault();
    if (!validateInputs()) return;
    const planName = planNameInput.value.trim();
    const startDate = startDateInput.value;
    const numberOfDays = parseInt(numberOfDaysInput.value, 10);

    const existingPlan = state.getCurrentPlanObject();
    const planData = state.createEmptyPlan(startDate, numberOfDays);

    if (existingPlan && existingPlan.planData.length > 0) {
        planData.forEach(newDay => {
            const existingDay = existingPlan.planData.find(d => d.isoDate === newDay.isoDate);
            if (existingDay) {
                newDay.activities = existingDay.activities;
            }
        });
    }

    ui.renderPlan(planName, planData);
    state.pushHistory(state.getCurrentPlanObject());
}

export function clearPlan() {
    if (confirm('現在の計画をすべてクリアして、新規作成しますか？この操作は元に戻せません。')) {
        localStorage.removeItem('savedPlan');
        document.getElementById('planForm').reset();
        document.querySelectorAll('.error-message, .is-invalid').forEach(el => {
            el.textContent = '';
            el.classList.remove('is-invalid');
        });
        document.getElementById('planOutputTitle').textContent = '作成された計画';
        document.getElementById('planOutput').innerHTML = '<p class="placeholder">ここに入力内容から作成された計画が表示されます。</p>';
        ui.updateSummary();
        state.pushHistory(null);
        ui.showNotification('計画をクリアしました', 'info');
    }
}

function validateInputs() {
    let isValid = true;
    isValid &= utils.validateField(planNameInput, '計画名は必須です。');
    isValid &= utils.validateField(startDateInput, '開始日は必須です。');
    isValid &= utils.validateField(numberOfDaysInput, '日数は必須です。');
    return isValid;
}

// --- Local Storage and Data Persistence ---
export function savePlanToLocalStorage() {
    if (state.isRestoringFromHistory) return;
    ui.updateSaveStatus('saving');
    const planObject = state.getCurrentPlanObject();
    state.pushHistory(planObject);
    if (planObject) {
        localStorage.setItem('savedPlan', JSON.stringify(planObject));
    } else {
        localStorage.removeItem('savedPlan');
    }
    ui.updateTimelineLayout();
    ui.updateSummary();
    setTimeout(() => ui.updateSaveStatus('saved'), 300);
}

export function loadPlanFromLocalStorage() {
    const savedJson = localStorage.getItem('savedPlan');
    if (savedJson) {
        try {
            const savedObject = JSON.parse(savedJson);
            loadPlan(savedObject);
        } catch (e) {
            console.error("ローカルストレージのデータの読み込みに失敗しました:", e);
            localStorage.removeItem('savedPlan');
        }
    }
}

export function loadPlan(planObject) {
    if (!planObject) return;
    planNameInput.value = planObject.name || '';
    startDateInput.value = planObject.startDate || '';
    numberOfDaysInput.value = planObject.numberOfDays || 1;
    ui.renderPlan(planObject.name, planObject.planData);
}

// --- Item Interaction Handlers ---
export function handleItemClick(e, item) {
    e.stopPropagation();
    const activityId = item.dataset.activityId;
    const allParts = document.querySelectorAll(`[data-activity-id="${activityId}"]`);

    if (e.shiftKey && state.lastSelectedItem) {
        if (!e.ctrlKey && !e.metaKey) {
            state.selectedItems.clear();
        }
        const allVisibleItems = Array.from(document.querySelectorAll('.plan-item:not(.dragging)'));
        const startIdx = allVisibleItems.indexOf(state.lastSelectedItem);
        const endIdx = allVisibleItems.indexOf(item);
        if (startIdx !== -1 && endIdx !== -1) {
            const [minIdx, maxIdx] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
            for (let i = minIdx; i <= maxIdx; i++) {
                const itemInRange = allVisibleItems[i];
                const aid = itemInRange.dataset.activityId;
                document.querySelectorAll(`[data-activity-id="${aid}"]`).forEach(part => state.selectedItems.add(part));
            }
        } else {
            allParts.forEach(part => state.selectedItems.add(part));
        }
    } else if (e.ctrlKey || e.metaKey) {
        const isSelected = Array.from(allParts).every(part => state.selectedItems.has(part));
        if (isSelected) {
            allParts.forEach(part => state.selectedItems.delete(part));
        } else {
            allParts.forEach(part => state.selectedItems.add(part));
            state.setLastSelectedItem(item);
        }
    } else {
        state.selectedItems.clear();
        allParts.forEach(part => state.selectedItems.add(part));
        state.setLastSelectedItem(item);
    }
    ui.updateSelectionUI();
}

// --- Drag and Drop Handlers ---
export function handleDragStart(e) {
    state.setDraggingItem(e.target);
    handleItemClick(e, state.draggingItem);

    const activityId = state.draggingItem.dataset.activityId;
    const startDayPlan = state.draggingItem.closest('.day-plan');
    if (startDayPlan) {
        state.draggingItem.dataset.originalIsoDate = startDayPlan.dataset.isoDate;
    }

    const movePreview = document.createElement('div');
    movePreview.className = 'timeline-move-preview';
    movePreview.style.height = `${state.draggingItem.offsetHeight}px`;
    movePreview.style.width = `${state.draggingItem.offsetWidth}px`;
    movePreview.textContent = state.draggingItem.dataset.name;
    state.setMovePreviewItem(movePreview);

    const timeline = state.draggingItem.closest('.timeline');
    if (timeline) {
        timeline.appendChild(state.movePreviewItem);
    }

    setTimeout(() => {
        document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.add('dragging'));
    }, 0);

    e.dataTransfer.setData('text/plain', activityId);
    e.dataTransfer.effectAllowed = 'move';
    const dragGhost = document.createElement('div');
    dragGhost.style.position = "absolute";
    dragGhost.style.top = "-1000px";
    document.body.appendChild(dragGhost);
    e.dataTransfer.setDragImage(dragGhost, 0, 0);
    setTimeout(() => document.body.removeChild(dragGhost), 0);
    document.querySelectorAll('.timeline').forEach(tl => tl.classList.add('is-active-drop-target'));
}

export function handleDragEnd(e) {
    if (state.draggingItem) {
        const activityId = state.draggingItem.dataset.activityId;
        document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.remove('dragging'));
        delete state.draggingItem.dataset.originalIsoDate;
    }
    state.setDraggingItem(null);
    if (state.movePreviewItem) {
        state.movePreviewItem.remove();
        state.setMovePreviewItem(null);
    }
    document.querySelectorAll('.timeline').forEach(timeline => timeline.classList.remove('is-drop-target', 'is-active-drop-target'));
}

export function handleDragOverTimeline(e) {
    e.preventDefault();
    if (!state.draggingItem || !state.movePreviewItem) return;
    e.dataTransfer.dropEffect = 'move';
    const dropTimeline = e.currentTarget;
    if (state.movePreviewItem.parentElement !== dropTimeline) {
        dropTimeline.appendChild(state.movePreviewItem);
    }
    const timelineRect = dropTimeline.getBoundingClientRect();
    let relativeY = e.clientY - timelineRect.top;
    relativeY = Math.max(0, relativeY);
    relativeY = Math.min(timelineRect.height - state.movePreviewItem.offsetHeight, relativeY);
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    const minutes = (relativeY / timelineRect.height) * totalMinutesInDay;
    const snappedMinutes = Math.round(minutes / snapMinutes) * snapMinutes;
    const snappedY = (snappedMinutes / totalMinutesInDay) * timelineRect.height;
    state.movePreviewItem.style.top = `${snappedY}px`;

    const originalIsoDate = state.draggingItem.dataset.originalIsoDate;
    const dropIsoDate = dropTimeline.closest('.day-plan').dataset.isoDate;
    let dateOffsetStr = '';
    if (originalIsoDate && dropIsoDate && originalIsoDate !== dropIsoDate) {
        const d1 = dayjs(originalIsoDate);
        const d2 = dayjs(dropIsoDate);
        const dateOffset = d2.diff(d1, 'day');
        if (dateOffset !== 0) {
            dateOffsetStr = ` <span style="font-weight: normal; opacity: 0.8;">(${dateOffset > 0 ? '+' : ''}${dateOffset}日)</span>`;
        }
    }
    state.movePreviewItem.innerHTML = state.draggingItem.dataset.name + dateOffsetStr;
}

export function handleDropOnTimeline(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!state.draggingItem) return;
    if (state.movePreviewItem) {
        state.movePreviewItem.remove();
        state.setMovePreviewItem(null);
    }
    const activityId = state.draggingItem.dataset.activityId;
    const dropTimeline = e.currentTarget;
    const dropIsoDate = dropTimeline.closest('.day-plan').dataset.isoDate;
    const timelineRect = dropTimeline.getBoundingClientRect();
    const relativeY = e.clientY - timelineRect.top;
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    let newStartMinutesOnDropDay = (relativeY / timelineRect.height) * totalMinutesInDay;
    newStartMinutesOnDropDay = Math.round(newStartMinutesOnDropDay / snapMinutes) * snapMinutes;

    const timezone = dayjs.tz.guess();
    const originalStartDateTime = dayjs.tz(`${state.draggingItem.dataset.startDate} ${state.draggingItem.dataset.startTime}`, 'YYYY-MM-DD HH:mm', timezone);
    const originalEndDateTime = dayjs.tz(`${state.draggingItem.dataset.endDate} ${state.draggingItem.dataset.endTime}`, 'YYYY-MM-DD HH:mm', timezone);
    const durationMs = originalEndDateTime.diff(originalStartDateTime);

    const newStartDateTime = dayjs(dropIsoDate).add(newStartMinutesOnDropDay, 'minute');
    const newEndDateTime = newStartDateTime.add(durationMs, 'ms');

    const updatedActivity = {
        id: activityId,
        name: state.draggingItem.dataset.name,
        startDate: newStartDateTime.format('YYYY-MM-DD'),
        startTime: newStartDateTime.format('HH:mm'),
        endDate: newEndDateTime.format('YYYY-MM-DD'),
        endTime: newEndDateTime.format('HH:mm'),
        category: state.draggingItem.dataset.category,
        notes: state.draggingItem.dataset.notes,
        allowOverlap: state.draggingItem.dataset.allowOverlap === 'true'
    };

    document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.remove());
    const newElements = ui.createActivityElements(updatedActivity);
    const timelineMap = new Map();
    document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
    newElements.forEach(item => {
        const targetTimeline = timelineMap.get(item.isoDate);
        if (targetTimeline) targetTimeline.appendChild(item.element);
    });
    savePlanToLocalStorage();
}


// --- Resize Handlers ---
export function startResize(e) {
    if (e.target.classList.contains('disabled')) return;
    e.preventDefault();
    e.stopPropagation();
    state.setIsResizing(true);
    state.setResizingItem(e.target.closest('.plan-item'));
    state.setResizingDirection(e.target.classList.contains('resize-handle-top') ? 'top' : 'bottom');
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
}

function resize(e) {
    if (!state.isResizing) return;
    const timeline = state.resizingItem.parentElement;
    const timelineRect = timeline.getBoundingClientRect();
    if (state.resizingDirection === 'bottom') {
        const itemTop = state.resizingItem.offsetTop;
        const newHeight = e.clientY - timelineRect.top - itemTop;
        state.resizingItem.style.height = `${Math.max(20, newHeight)}px`;
    } else {
        const itemBottom = state.resizingItem.offsetTop + state.resizingItem.offsetHeight;
        const newTop = e.clientY - timelineRect.top;
        const newHeight = itemBottom - newTop;
        if (newHeight >= 20) {
            state.resizingItem.style.top = `${newTop}px`;
            state.resizingItem.style.height = `${newHeight}px`;
        }
    }
}

function stopResize(e) {
    if (!state.isResizing) return;
    state.setIsResizing(false);
    document.body.style.cursor = 'default';
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);

    const activityId = state.resizingItem.dataset.activityId;
    const timeline = state.resizingItem.parentElement;
    const timelineHeight = timeline.offsetHeight;
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    
    const timezone = dayjs.tz.guess();
    const currentDayIso = state.resizingItem.closest('.day-plan').dataset.isoDate;
    let startDateTime = dayjs.tz(`${state.resizingItem.dataset.startDate} ${state.resizingItem.dataset.startTime}`, 'YYYY-MM-DD HH:mm', timezone);
    let endDateTime = dayjs.tz(`${state.resizingItem.dataset.endDate} ${state.resizingItem.dataset.endTime}`, 'YYYY-MM-DD HH:mm', timezone);

    if (state.resizingDirection === 'bottom') {
        const itemBottomPosition = state.resizingItem.offsetTop + state.resizingItem.offsetHeight;
        let endMinutes = Math.round(((itemBottomPosition / timelineHeight) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        endDateTime = dayjs(currentDayIso).add(endMinutes, 'minute');
    } else { // Top resize
        const itemTopPosition = state.resizingItem.offsetTop;
        let startMinutes = Math.round(((itemTopPosition / timelineHeight) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        startDateTime = dayjs(currentDayIso).add(startMinutes, 'minute');
    }
    
    if (startDateTime.isSame(endDateTime) || startDateTime.isAfter(endDateTime)) {
        loadPlan(state.getCurrentPlanObject());
        return;
    }

    const updatedActivity = {
        id: activityId,
        name: state.resizingItem.dataset.name,
        startDate: startDateTime.format('YYYY-MM-DD'),
        startTime: startDateTime.format('HH:mm'),
        endDate: endDateTime.format('YYYY-MM-DD'),
        endTime: endDateTime.format('HH:mm'),
        category: state.resizingItem.dataset.category,
        notes: state.resizingItem.dataset.notes,
        allowOverlap: state.resizingItem.dataset.allowOverlap === 'true'
    };

    document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(el => el.remove());
    const newElements = ui.createActivityElements(updatedActivity);
    const timelineMap = new Map();
    document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
    newElements.forEach(item => {
        const targetTimeline = timelineMap.get(item.isoDate);
        if (targetTimeline) targetTimeline.appendChild(item.element);
    });

    savePlanToLocalStorage();
    state.setResizingItem(null);
    state.setResizingDirection(null);
}


// --- Drag-to-Create Handlers ---
export function handleTimelineMouseDown(e) {
    if (e.target !== e.currentTarget) return;
    if (state.draggingItem) return;
    e.preventDefault();
    state.setIsCreatingWithDrag(true);
    state.setDragCreateTimeline(e.currentTarget);
    const timelineRect = state.dragCreateTimeline.getBoundingClientRect();
    state.setDragCreateStartY(e.clientY - timelineRect.top);
    const previewItem = document.createElement('div');
    previewItem.className = 'timeline-drag-preview';
    previewItem.style.top = `${state.dragCreateStartY}px`;
    previewItem.style.height = '1px';
    state.setDragCreatePreviewItem(previewItem);
    state.dragCreateTimeline.appendChild(state.dragCreatePreviewItem);
    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
}

function handleDocumentMouseMove(e) {
    if (!state.isCreatingWithDrag) return;
    e.preventDefault();
    const timelineRect = state.dragCreateTimeline.getBoundingClientRect();
    const currentY = e.clientY - timelineRect.top;
    const top = Math.min(state.dragCreateStartY, currentY);
    const height = Math.abs(currentY - state.dragCreateStartY);
    const displayHeight = Math.max(1, height);
    state.dragCreatePreviewItem.style.top = `${top}px`;
    state.dragCreatePreviewItem.style.height = `${displayHeight}px`;
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    const startMinutes = Math.floor(((top / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    const endMinutes = Math.ceil((((top + height) / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    const durationMinutes = endMinutes - startMinutes;
    const timeRangeText = `${utils.minutesToTime(startMinutes)} - ${utils.minutesToTime(endMinutes)}`;
    if (durationMinutes > 0) {
        state.dragCreatePreviewItem.innerHTML = `${timeRangeText}<br>(${utils.formatMinutes(durationMinutes)})`;
    } else {
        state.dragCreatePreviewItem.innerHTML = timeRangeText;
    }
}

function handleDocumentMouseUp(e) {
    if (!state.isCreatingWithDrag) return;
    e.preventDefault();
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    const timelineRect = state.dragCreateTimeline.getBoundingClientRect();
    const finalHeight = state.dragCreatePreviewItem.offsetHeight;
    const top = parseFloat(state.dragCreatePreviewItem.style.top);
    state.dragCreatePreviewItem.remove();
    state.setDragCreatePreviewItem(null);
    if (finalHeight < 5) {
        state.setIsCreatingWithDrag(false);
        return;
    }
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    const startMinutes = Math.floor(((top / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    const endMinutes = Math.ceil((((top + finalHeight) / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    const dayElement = state.dragCreateTimeline.closest('.day-plan');
    const isoDate = dayElement.dataset.isoDate;
    if (isoDate) {
        ui.addPlanItem(isoDate, {
            startTime: utils.minutesToTime(startMinutes),
            endTime: utils.minutesToTime(endMinutes)
        });
    }
    state.setIsCreatingWithDrag(false);
}


// --- Modal and Category Handlers ---
export function saveModalChanges() {
    modalDateTimeError.textContent = '';
    
    const timezone = dayjs.tz.guess();
    const startDateTime = dayjs.tz(`${modalStartDate.value} ${modalStartTime.value}`, 'YYYY-MM-DD HH:mm', timezone);
    const endDateTime = dayjs.tz(`${modalEndDate.value} ${modalEndTime.value}`, 'YYYY-MM-DD HH:mm', timezone);

    if (!startDateTime.isValid() || !endDateTime.isValid()) {
        modalDateTimeError.textContent = '有効な日時を入力してください。';
        return;
    }
    if (startDateTime.isSame(endDateTime) || startDateTime.isAfter(endDateTime)) {
        modalDateTimeError.textContent = '終了日時は開始日時より後に設定してください。';
        return;
    }
    
    const activityId = state.currentEditingItem ? state.currentEditingItem.dataset.activityId : `act-${Date.now()}`;
    document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(el => el.remove());
    const activityData = {
        id: activityId,
        name: modalActivityName.value.trim() || '無題のアクティビティ',
        startDate: modalStartDate.value,
        startTime: modalStartTime.value,
        endDate: modalEndDate.value,
        endTime: modalEndTime.value,
        category: modalActivityCategory.value,
        notes: modalActivityNotes.value.trim(),
        allowOverlap: modalAllowOverlap.checked
    };
    const activityElements = ui.createActivityElements(activityData);
    const timelineMap = new Map();
    document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
    activityElements.forEach(item => {
        const targetTimeline = timelineMap.get(item.isoDate);
        if (targetTimeline) {
            targetTimeline.appendChild(item.element);
        }
    });
    savePlanToLocalStorage();
    ui.closeModal();
}

export function handleAddNewCategory() {
    const name = newCategoryName.value.trim();
    const color = newCategoryColor.value;
    if (!name) {
        ui.showNotification('カテゴリ名を入力してください。', 'error');
        return;
    }
    state.tempCategories.push({ id: `cat-${Date.now()}`, name, color });
    ui.renderCategoryList();
    newCategoryName.value = '';
}

export function handleDeleteCategory(categoryId) {
    if (confirm('このカテゴリを削除しますか？このカテゴリを使用しているアクティビティは「カテゴリなし」にリセットされます。')) {
        state.setTempCategories(state.tempCategories.filter(c => c.id !== categoryId));
        ui.renderCategoryList();
    }
}

export function handleEditCategory(categoryId) {
    const categoryToEdit = state.tempCategories.find(c => c.id === categoryId);
    if (categoryToEdit) {
        newCategoryName.value = categoryToEdit.name;
        newCategoryColor.value = categoryToEdit.color;
        state.setTempCategories(state.tempCategories.filter(c => c.id !== categoryId));
        ui.renderCategoryList();
    }
}

export function handleSaveCategories() {
    const deletedCategoryIds = state.categories
        .filter(c => !state.tempCategories.find(tc => tc.id === c.id))
        .map(c => c.id);

    if (deletedCategoryIds.length > 0) {
        document.querySelectorAll('.plan-item').forEach(itemEl => {
            if (deletedCategoryIds.includes(itemEl.dataset.category)) {
                itemEl.dataset.category = '';
            }
        });
    }
    state.setCategories(state.tempCategories);
    localStorage.setItem('planGeneratorCategories', JSON.stringify(state.categories));
    ui.updateActivityCategoryDropdown();
    ui.applyCategoryStylesToAllItems();
    ui.closeCategoryModal();
    savePlanToLocalStorage();
}

export function handleDuplicateItem(itemToDuplicate) {
    const timezone = dayjs.tz.guess();
    const start = dayjs.tz(`${itemToDuplicate.dataset.startDate} ${itemToDuplicate.dataset.startTime}`, 'YYYY-MM-DD HH:mm', timezone);
    const end = dayjs.tz(`${itemToDuplicate.dataset.endDate} ${itemToDuplicate.dataset.endTime}`, 'YYYY-MM-DD HH:mm', timezone);
    const duration = end.diff(start);

    const newStart = end;
    const newEnd = newStart.add(duration, 'ms');

    const duplicatedActivity = {
        name: `${itemToDuplicate.dataset.name} (コピー)`,
        startDate: newStart.format('YYYY-MM-DD'),
        startTime: newStart.format('HH:mm'),
        endDate: newEnd.format('YYYY-MM-DD'),
        endTime: newEnd.format('HH:mm'),
        category: itemToDuplicate.dataset.category,
        notes: itemToDuplicate.dataset.notes,
        allowOverlap: itemToDuplicate.dataset.allowOverlap
    };
    ui.addPlanItem(duplicatedActivity.startDate, duplicatedActivity);
}

export function deleteSelectedItems() {
    if (state.selectedItems.size === 0) return;

    // ユニークなアクティビティIDと名前を取得
    const uniqueActivityIds = new Set();
    const activityNames = [];
    state.selectedItems.forEach(item => {
        const id = item.dataset.activityId;
        if (!uniqueActivityIds.has(id)) {
            uniqueActivityIds.add(id);
            activityNames.push(item.dataset.name);
        }
    });

    if (confirm(`${uniqueActivityIds.size}個のアクティビティ（${activityNames.slice(0, 3).join(', ')}${uniqueActivityIds.size > 3 ? '...' : ''}）を削除しますか？`)) {
        uniqueActivityIds.forEach(activityId => {
            document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.remove());
        });
        state.selectedItems.clear();
        ui.updateSelectionUI();
        savePlanToLocalStorage();
        ui.showNotification(`${uniqueActivityIds.size}個のアイテムを削除しました`, 'info');
    }
}


// --- Export and File Drop Handlers ---
export function copyPlanAsText() {
    const planObject = state.getCurrentPlanObject();
    if (!planObject || planObject.planData.length === 0) {
        ui.showNotification('コピーする計画がありません。', 'error');
        return;
    }
    let text = `${planObject.name}\n${"=".repeat(planObject.name.length)}\n\n`;
    const allActivities = planObject.planData.flatMap(d => d.activities).sort((a, b) => dayjs(`${a.startDate} ${a.startTime}`).diff(dayjs(`${b.startDate} ${b.startTime}`)));
    const uniqueActivities = Object.values(allActivities.reduce((acc, cur) => { if (!acc[cur.id]) acc[cur.id] = cur; return acc; }, {}));

    let currentDateStr = '';
    uniqueActivities.forEach(activity => {
        const activityStartDate = dayjs(activity.startDate);
        const formattedDate = activityStartDate.format('YYYY年M月D日 (ddd)');

        if (currentDateStr !== formattedDate) {
            currentDateStr = formattedDate;
            text += `\n■ ${currentDateStr}\n`;
        }
        const category = state.categories.find(c => c.id === activity.category);
        const categoryText = category ? ` (${category.name})` : '';
        text += `- [${activity.startTime}] ${activity.name}${categoryText}`;
        if (activity.startDate !== activity.endDate) {
            text += ` (〜 ${activity.endDate} ${activity.endTime})`;
        } else if (activity.startTime !== activity.endTime) {
            text += ` - ${activity.endTime}`;
        }
        text += `\n`;
        if (activity.notes) {
            text += `  (メモ: ${activity.notes.replace(/\n/g, '\n  ')})\n`;
        }
    });

    navigator.clipboard.writeText(text).then(() => {
        ui.showNotification('計画をテキストとしてコピーしました', 'success');
    }, err => {
        console.error('クリップボードへのコピーに失敗しました: ', err);
        ui.showNotification('コピーに失敗しました。', 'error');
    });
}

export function exportPlanAsJson() {
    const planObject = state.getCurrentPlanObject();
    if (!planObject) {
        ui.showNotification('エクスポートする計画がありません。', 'error');
        return;
    }
    const jsonString = JSON.stringify(planObject, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${planObject.name.replace(/\s/g, '_') || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.showNotification('JSONファイルとしてエクスポートしました', 'success');
}

export function exportPlanAsCsv() {
    const planObject = state.getCurrentPlanObject();
    if (!planObject || planObject.planData.length === 0) {
        ui.showNotification('エクスポートする計画がありません。', 'error');
        return;
    }

    const allActivities = planObject.planData.flatMap(d => d.activities).sort((a, b) => dayjs(`${a.startDate} ${a.startTime}`).diff(dayjs(`${b.startDate} ${b.startTime}`)));
    const uniqueActivities = Object.values(allActivities.reduce((acc, cur) => { if (!acc[cur.id]) acc[cur.id] = cur; return acc; }, {}));

    if (uniqueActivities.length === 0) {
        ui.showNotification('エクスポートするアクティビティがありません。', 'error');
        return;
    }

    // CSVエスケープ用のヘルパー関数
    const escapeCsvCell = (cell) => {
        if (cell === null || cell === undefined) {
            return '';
        }
        const cellStr = String(cell);
        // セル内にカンマ、ダブルクォーテーション、改行が含まれる場合はダブルクォーテーションで囲む
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            // ダブルクォーテーション自体は二重にする
            return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
    };

    const header = ['アクティビティ名', '開始日', '開始時刻', '終了日', '終了時刻', 'カテゴリ', 'メモ'];
    const csvRows = [header.join(',')];

    uniqueActivities.forEach(activity => {
        const category = state.categories.find(c => c.id === activity.category);
        const categoryName = category ? category.name : 'カテゴリなし';

        const row = [
            activity.name,
            activity.startDate,
            activity.startTime,
            activity.endDate,
            activity.endTime,
            categoryName,
            activity.notes
        ].map(escapeCsvCell);
        csvRows.push(row.join(','));
    });

    const csvString = csvRows.join('\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM
    const blob = new Blob([bom, csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${planObject.name.replace(/\s/g, '_') || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.showNotification('CSVファイルとしてエクスポートしました', 'success');
}

export function exportPdfButtonClickHandler() {
    const planElement = document.getElementById('planOutput');
    const planName = document.getElementById('planOutputTitle').textContent;
    if (planElement.querySelectorAll('.day-plan').length === 0) {
        ui.showNotification('PDFとして保存する計画がありません。', 'error');
        return;
    }
    ui.showNotification('PDFを生成中です...', 'info', 5000);
    document.body.classList.add('is-exporting-pdf');
    html2canvas(planElement, { scale: 2, windowWidth: 1200, useCORS: true }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${planName.replace('計画: ', '')}.pdf`);
        document.body.classList.remove('is-exporting-pdf');
    }).catch(err => {
        console.error("PDF generation failed:", err);
        ui.showNotification("PDFの生成に失敗しました。", 'error');
        document.body.classList.remove('is-exporting-pdf');
    });
}

export function handleDragOverFile(event) {
    if (state.draggingItem) return;
    event.preventDefault();
    dropZoneOverlay.style.display = 'flex';
}

export function handleDragLeaveFile(event) {
    if (event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget)) {
        dropZoneOverlay.style.display = 'none';
    }
}

export function handleDropFile(event) {
    event.preventDefault();
    dropZoneOverlay.style.display = 'none';
    if (event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0];
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const planObject = JSON.parse(e.target.result);
                    if (planObject && planObject.name && planObject.planData) {
                        if (confirm(`計画「${planObject.name}」を読み込みますか？現在の計画は上書きされます。`)) {
                            loadPlan(planObject);
                            state.pushHistory(state.getCurrentPlanObject());
                            ui.showNotification(`計画「${planObject.name}」を読み込みました。`, 'success');
                        }
                    } else {
                        throw new Error('無効なファイル形式です。');
                    }
                } catch (error) {
                    ui.showNotification('ファイルの読み込みに失敗しました。\n' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        } else {
            ui.showNotification('無効なファイル形式です。.jsonファイルをドロップしてください。', 'error');
        }
    }
}
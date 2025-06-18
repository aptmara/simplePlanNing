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

let isResizing = false;
let resizingItem = null;
let resizingDirection = null;
let isCreatingWithDrag = false;
let dragCreateTimeline = null;
let dragCreateStartY = 0;
let dragCreatePreviewItem = null;
let draggingItem = null;
let movePreviewItem = null;

// --- Main Form and Plan Handlers ---
export function handleFormSubmit(event) {
    event.preventDefault();
    if (!validateInputs()) return;
    const planName = planNameInput.value.trim();
    const startDate = startDateInput.value;
    const numberOfDays = parseInt(numberOfDaysInput.value, 10);

    state.setPlanInfo(planName, startDate, numberOfDays);
    ui.render(state.getAppState());
}

export function clearPlan() {
    if (confirm('現在の計画をすべてクリアして、新規作成しますか？この操作は元に戻せません。')) {
        state.clearPlan();
        document.getElementById('planForm').reset();
        ui.render(state.getAppState());
    }
}

function validateInputs() {
    let isValid = true;
    isValid &= utils.validateField(planNameInput, '計画名は必須です。');
    isValid &= utils.validateField(startDateInput, '開始日は必須です。');
    isValid &= utils.validateField(numberOfDaysInput, '日数は必須です。');
    return isValid;
}


// --- Item Interaction Handlers ---
export function handleItemClick(e, item) {
    e.stopPropagation();
    const activityId = item.dataset.activityId;
    state.selectActivity(activityId, { ctrlKey: e.ctrlKey || e.metaKey, shiftKey: e.shiftKey });
    ui.updateSelectionUI(state.getAppState().ui.selectedActivityIds);
}

// --- Drag and Drop Handlers ---
export function handleDragStart(e) {
    draggingItem = e.target;
    handleItemClick(e, draggingItem);

    const activityId = draggingItem.dataset.activityId;
    
    movePreviewItem = document.createElement('div');
    movePreviewItem.className = 'timeline-move-preview';
    movePreviewItem.style.height = `${draggingItem.offsetHeight}px`;
    movePreviewItem.style.width = `${draggingItem.offsetWidth}px`;
    movePreviewItem.textContent = draggingItem.dataset.name;
    draggingItem.closest('.timeline')?.appendChild(movePreviewItem);

    setTimeout(() => {
        document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.add('dragging'));
    }, 0);

    e.dataTransfer.setData('text/plain', activityId);
    e.dataTransfer.effectAllowed = 'move';
}

export function handleDragEnd() {
    if (draggingItem) {
        const activityId = draggingItem.dataset.activityId;
        document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.remove('dragging'));
    }
    draggingItem = null;
    if (movePreviewItem) {
        movePreviewItem.remove();
        movePreviewItem = null;
    }
    document.querySelectorAll('.timeline.is-active-drop-target').forEach(timeline => timeline.classList.remove('is-active-drop-target'));
}

export function handleDragOverTimeline(e) {
    e.preventDefault();
    if (!draggingItem || !movePreviewItem) return;
    e.dataTransfer.dropEffect = 'move';
    const dropTimeline = e.currentTarget;

    if (movePreviewItem.parentElement !== dropTimeline) {
        dropTimeline.appendChild(movePreviewItem);
    }
    
    const timelineRect = dropTimeline.getBoundingClientRect();
    let relativeY = e.clientY - timelineRect.top;
    relativeY = Math.max(0, Math.min(timelineRect.height - movePreviewItem.offsetHeight, relativeY));
    
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    const minutes = (relativeY / timelineRect.height) * totalMinutesInDay;
    const snappedMinutes = Math.round(minutes / snapMinutes) * snapMinutes;
    const snappedY = (snappedMinutes / totalMinutesInDay) * timelineRect.height;
    
    movePreviewItem.style.top = `${snappedY}px`;
}

export function handleDropOnTimeline(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggingItem) return;

    const activityId = draggingItem.dataset.activityId;
    const dropTimeline = e.currentTarget;
    const dropIsoDate = dropTimeline.closest('.day-plan').dataset.isoDate;
    const timelineRect = dropTimeline.getBoundingClientRect();
    const relativeY = e.clientY - timelineRect.top;
    
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = e.shiftKey ? 1 : 15;
    let newStartMinutesOnDropDay = (relativeY / timelineRect.height) * totalMinutesInDay;
    newStartMinutesOnDropDay = Math.round(newStartMinutesOnDropDay / snapMinutes) * snapMinutes;

    const timezone = dayjs.tz.guess();
    const originalStartDateTime = dayjs.tz(`${draggingItem.dataset.startDate} ${draggingItem.dataset.startTime}`, 'YYYY-MM-DD HH:mm', timezone);
    const originalEndDateTime = dayjs.tz(`${draggingItem.dataset.endDate} ${draggingItem.dataset.endTime}`, 'YYYY-MM-DD HH:mm', timezone);
    const durationMs = originalEndDateTime.diff(originalStartDateTime);

    const newStartDateTime = dayjs(dropIsoDate).add(newStartMinutesOnDropDay, 'minute');
    const newEndDateTime = newStartDateTime.add(durationMs, 'ms');

    const originalActivity = state.getAppState().plan.activities[activityId];
    const updatedActivity = {
        ...originalActivity,
        startDate: newStartDateTime.format('YYYY-MM-DD'),
        startTime: newStartDateTime.format('HH:mm'),
        endDate: newEndDateTime.format('YYYY-MM-DD'),
        endTime: newEndDateTime.format('HH:mm'),
    };

    state.addOrUpdateActivity(updatedActivity);
    ui.render(state.getAppState());
    handleDragEnd();
}


// --- Resize Handlers ---
export function startResize(e) {
    if (e.target.classList.contains('disabled')) return;
    e.preventDefault();
    e.stopPropagation();
    
    isResizing = true;
    resizingItem = e.target.closest('.plan-item');
    resizingDirection = e.target.classList.contains('resize-handle-top') ? 'top' : 'bottom';
    
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
}

function resize(e) {
    if (!isResizing || !resizingItem) return;
    const timeline = resizingItem.parentElement;
    const timelineRect = timeline.getBoundingClientRect();
    
    let top = resizingItem.offsetTop;
    let height = resizingItem.offsetHeight;

    if (resizingDirection === 'bottom') {
        height = e.clientY - timelineRect.top - top;
    } else {
        const newTop = e.clientY - timelineRect.top;
        height = top + height - newTop;
        top = newTop;
    }
    
    if (height >= 10) {
       resizingItem.style.top = `${top}px`;
       resizingItem.style.height = `${height}px`;
    }
}

function stopResize() {
    if (!isResizing || !resizingItem) return;
    
    document.body.style.cursor = 'default';
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);

    const activityId = resizingItem.dataset.activityId;
    const timeline = resizingItem.parentElement;
    const timelineHeight = timeline.offsetHeight;
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = 15;
    
    const timezone = dayjs.tz.guess();
    const currentDayIso = resizingItem.closest('.day-plan').dataset.isoDate;
    
    let startDateTime = dayjs.tz(`${resizingItem.dataset.startDate} ${resizingItem.dataset.startTime}`, 'YYYY-MM-DD HH:mm', timezone);
    let endDateTime = dayjs.tz(`${resizingItem.dataset.endDate} ${resizingItem.dataset.endTime}`, 'YYYY-MM-DD HH:mm', timezone);

    const topPosition = resizingItem.offsetTop;
    const bottomPosition = topPosition + resizingItem.offsetHeight;

    if (resizingDirection === 'bottom') {
        let endMinutes = Math.round(((bottomPosition / timelineHeight) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        endDateTime = dayjs(currentDayIso).add(endMinutes, 'minute');
    } else { 
        let startMinutes = Math.round(((topPosition / timelineHeight) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        startDateTime = dayjs(currentDayIso).add(startMinutes, 'minute');
    }
    
    if (startDateTime.isSame(endDateTime) || startDateTime.isAfter(endDateTime)) {
        ui.render(state.getAppState());
        isResizing = false;
        resizingItem = null;
        return;
    }

    const originalActivity = state.getAppState().plan.activities[activityId];
    const updatedActivity = {
        ...originalActivity,
        startDate: startDateTime.format('YYYY-MM-DD'),
        startTime: startDateTime.format('HH:mm'),
        endDate: endDateTime.format('YYYY-MM-DD'),
        endTime: endDateTime.format('HH:mm'),
    };
    
    state.addOrUpdateActivity(updatedActivity);
    ui.render(state.getAppState());

    isResizing = false;
    resizingItem = null;
}

// --- Drag-to-Create Handlers ---
export function handleTimelineMouseDown(e) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    isCreatingWithDrag = true;
    dragCreateTimeline = e.currentTarget;
    const timelineRect = dragCreateTimeline.getBoundingClientRect();
    dragCreateStartY = e.clientY - timelineRect.top;
    
    dragCreatePreviewItem = document.createElement('div');
    dragCreatePreviewItem.className = 'timeline-drag-preview';
    dragCreatePreviewItem.style.top = `${dragCreateStartY}px`;
    dragCreatePreviewItem.style.height = '1px';
    dragCreateTimeline.appendChild(dragCreatePreviewItem);

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);
}

function handleDocumentMouseMove(e) {
    if (!isCreatingWithDrag) return;
    e.preventDefault();
    const timelineRect = dragCreateTimeline.getBoundingClientRect();
    const currentY = e.clientY - timelineRect.top;
    
    const top = Math.min(dragCreateStartY, currentY);
    const height = Math.abs(currentY - dragCreateStartY);
    dragCreatePreviewItem.style.top = `${top}px`;
    dragCreatePreviewItem.style.height = `${Math.max(1, height)}px`;
    
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = 15;
    const startMinutes = Math.floor(((top / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    const endMinutes = Math.ceil((((top + height) / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    
    dragCreatePreviewItem.innerHTML = `${utils.minutesToTime(startMinutes)} - ${utils.minutesToTime(endMinutes)}`;
}

function handleDocumentMouseUp(e) {
    if (!isCreatingWithDrag) return;
    e.preventDefault();
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    
    const finalHeight = dragCreatePreviewItem.offsetHeight;
    const top = parseFloat(dragCreatePreviewItem.style.top);
    
    dragCreatePreviewItem.remove();
    dragCreatePreviewItem = null;

    if (finalHeight < 5) {
        isCreatingWithDrag = false;
        return;
    }
    
    const timelineRect = dragCreateTimeline.getBoundingClientRect();
    const totalMinutesInDay = 24 * 60;
    const snapMinutes = 15;
    const startMinutes = Math.floor(((top / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    const endMinutes = Math.ceil((((top + finalHeight) / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
    
    const dayElement = dragCreateTimeline.closest('.day-plan');
    const isoDate = dayElement.dataset.isoDate;
    if (isoDate && endMinutes > startMinutes) {
        ui.addPlanItem(isoDate, {
            startTime: utils.minutesToTime(startMinutes),
            endTime: utils.minutesToTime(endMinutes)
        });
    }

    isCreatingWithDrag = false;
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
    
    const activityId = state.getAppState().ui.currentEditingItemId;
    const originalActivity = state.getAppState().plan.activities[activityId] || {};
    
    const activityData = {
        ...originalActivity,
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
    
    state.addOrUpdateActivity(activityData);
    ui.render(state.getAppState());
    ui.closeModal();
}

export function handleAddNewCategory() {
    const name = newCategoryName.value.trim();
    const color = newCategoryColor.value;
    if (!name) {
        ui.showNotification('カテゴリ名を入力してください。', 'error');
        return;
    }
    const tempCategories = state.getAppState().tempCategories || [];
    state.getAppState().tempCategories = [...tempCategories, { id: `cat-${Date.now()}`, name, color }];
    ui.renderCategoryList(state.getAppState().tempCategories);
    newCategoryName.value = '';
}

export function handleDeleteCategory(categoryId) {
    if (confirm('このカテゴリを削除しますか？このカテゴリを使用しているアクティビティは「カテゴリなし」にリセットされます。')) {
        const tempCategories = state.getAppState().tempCategories.filter(c => c.id !== categoryId);
        state.getAppState().tempCategories = tempCategories;
        ui.renderCategoryList(tempCategories);
    }
}

export function handleEditCategory(categoryId) {
    const tempCategories = state.getAppState().tempCategories;
    const categoryToEdit = tempCategories.find(c => c.id === categoryId);
    if (categoryToEdit) {
        newCategoryName.value = categoryToEdit.name;
        newCategoryColor.value = categoryToEdit.color;
        state.getAppState().tempCategories = tempCategories.filter(c => c.id !== categoryId);
        ui.renderCategoryList(state.getAppState().tempCategories);
    }
}

export function handleSaveCategories() {
    const { categories, tempCategories } = state.getAppState();
    const deletedCategoryIds = categories
        .filter(c => !tempCategories.find(tc => tc.id === c.id))
        .map(c => c.id);

    if (deletedCategoryIds.length > 0) {
        const updatedActivities = Object.values(state.getAppState().plan.activities).map(act => {
            if (deletedCategoryIds.includes(act.category)) {
                return { ...act, category: '' };
            }
            return act;
        });
        state.updateMultipleActivities(updatedActivities);
    }
    state.setCategories(tempCategories);
    ui.render(state.getAppState());
    ui.closeCategoryModal();
}

export function deleteSelectedItems() {
    const selectedIds = Array.from(state.getAppState().ui.selectedActivityIds);
    if (selectedIds.length === 0) return;

    if (confirm(`${selectedIds.length}個のアクティビティを削除しますか？`)) {
        state.deleteActivities(selectedIds);
        ui.render(state.getAppState());
        ui.showNotification(`${selectedIds.length}個のアイテムを削除しました`, 'info');
    }
}

export function handleDeleteFromModal() {
    const itemId = state.getAppState().ui.currentEditingItemId;
    if (itemId) {
        const activityName = state.getAppState().plan.activities[itemId]?.name || 'このアクティビティ';
        if (confirm(`「${activityName}」を削除しますか？`)) {
            state.deleteActivities([itemId]);
            ui.render(state.getAppState());
            ui.closeModal();
        }
    }
}

// --- Undo/Redo ---
export function handleUndo() {
    if(state.undo()) {
        ui.render(state.getAppState());
    }
}

export function handleRedo() {
    if(state.redo()) {
        ui.render(state.getAppState());
    }
}

// --- Export and File Drop Handlers ---
export function copyPlanAsText() {
    const { plan, categories } = state.getAppState();
    if (!plan || !plan.days || plan.days.length === 0) {
        ui.showNotification('コピーする計画がありません。', 'error');
        return;
    }

    let text = `${plan.name}\n${"=".repeat(plan.name.length)}\n\n`;
    
    const allActivities = Object.values(plan.activities).sort((a, b) => 
        dayjs(`${a.startDate} ${a.startTime}`).diff(dayjs(`${b.startDate} ${b.startTime}`))
    );

    let currentDateStr = '';
    allActivities.forEach(activity => {
        const activityStartDate = dayjs(activity.startDate);
        const formattedDate = activityStartDate.format('YYYY年M月D日 (ddd)');

        if (currentDateStr !== formattedDate) {
            currentDateStr = formattedDate;
            text += `\n■ ${currentDateStr}\n`;
        }
        const category = categories.find(c => c.id === activity.category);
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
    const { plan } = state.getAppState();
    if (!plan) {
        ui.showNotification('エクスポートする計画がありません。', 'error');
        return;
    }
    const jsonString = JSON.stringify(plan, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${plan.name.replace(/\s/g, '_') || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.showNotification('JSONファイルとしてエクスポートしました', 'success');
}

export function exportPlanAsCsv() {
    const { plan, categories } = state.getAppState();
    const allActivities = Object.values(plan.activities || {});

    if (!plan || allActivities.length === 0) {
        ui.showNotification('エクスポートする計画がありません。', 'error');
        return;
    }

    allActivities.sort((a, b) => dayjs(`${a.startDate} ${a.startTime}`).diff(dayjs(`${b.startDate} ${b.startTime}`)));

    const escapeCsvCell = (cell) => {
        if (cell === null || cell === undefined) return '';
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
    };

    const header = ['アクティビティ名', '開始日', '開始時刻', '終了日', '終了時刻', 'カテゴリ', 'メモ'];
    const csvRows = [header.join(',')];

    allActivities.forEach(activity => {
        const category = categories.find(c => c.id === activity.category);
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
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-${plan.name.replace(/\s/g, '_') || 'export'}.csv`;
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
    if (draggingItem) return;
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
                    if (planObject && planObject.name && planObject.activities) {
                        if (confirm(`計画「${planObject.name}」を読み込みますか？現在の計画は上書きされます。`)) {
                            state.setPlanInfo(planObject.name, planObject.startDate, planObject.numberOfDays);
                            state.updateMultipleActivities(Object.values(planObject.activities));
                            ui.render(state.getAppState());
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
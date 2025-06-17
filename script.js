/**
 * 計画ジェネレーターアプリケーション
 * 複数日にまたがるアクティビティのサポート、システムテーマ連携、日付またぎD&D、衝突検出・自動レイアウト、リサイズ、カスタムカテゴリ、グラフ集計、Undo/Redo、通知機能を搭載。
 *
 * @version 3.4.0
 * @date 2025-06-17
 */
document.addEventListener('DOMContentLoaded', () => {

    const themeToggle = document.getElementById('theme-toggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

    /**
     * 指定されたテーマを適用し、UIを更新する
     * @param {'light' | 'dark'} theme - 適用するテーマ名
     */
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            themeToggle.checked = false;
        }
        // テーマ変更時にグラフを再描画して色を反映させる
        updateSummary();
    }

    /**
     * ページ読み込み時に適用すべきテーマを決定し、適用する
     */
    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            // 1. ユーザーによる手動設定が最優先
            applyTheme(savedTheme);
        } else {
            // 2. 手動設定がなければ、システム設定に従う
            applyTheme(prefersDarkScheme.matches ? 'dark' : 'light');
        }
    }

    // テーマ切り替えスイッチのイベントリスナー
    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        // 手動で変更した場合は、その設定をlocalStorageに保存
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    // システムのテーマ設定の変更をリッスン
    prefersDarkScheme.addEventListener('change', (e) => {
        // ユーザーが手動でテーマを設定していない場合のみ、システム設定の変更に追従する
        if (!localStorage.getItem('theme')) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });

    const { jsPDF } = window.jspdf;
    const { Chart } = window;

    // --- DOM Element References ---
    const planForm = document.getElementById('planForm');
    const planNameInput = document.getElementById('planName');
    const startDateInput = document.getElementById('startDate');
    const numberOfDaysInput = document.getElementById('numberOfDays');
    const planOutput = document.getElementById('planOutput');
    const planOutputTitle = document.getElementById('planOutputTitle');
    const clearPlanButton = document.getElementById('clearPlanButton');
    const copyPlanButton = document.getElementById('copyPlanButton');
    const printPlanButton = document.getElementById('printPlanButton');
    const exportJsonButton = document.getElementById('exportJsonButton');
    const exportPdfButton = document.getElementById('exportPdfButton');
    const undoButton = document.getElementById('undoButton');
    const redoButton = document.getElementById('redoButton');
    const dropZoneOverlay = document.getElementById('dropZoneOverlay');
    const bodyElement = document.body;
    
    // Activity Edit Modal
    const editModal = document.getElementById('editModal');
    const closeModalButton = document.getElementById('closeModalButton');
    const saveModalButton = document.getElementById('saveModalButton');
    const modalActivityName = document.getElementById('modalActivityName');
    const modalStartDate = document.getElementById('modalStartDate');
    const modalStartTime = document.getElementById('modalStartTime');
    const modalEndDate = document.getElementById('modalEndDate');
    const modalEndTime = document.getElementById('modalEndTime');
    const modalDateTimeError = document.getElementById('modalDateTimeError');
    const modalActivityCategory = document.getElementById('modalActivityCategory');
    const modalActivityNotes = document.getElementById('modalActivityNotes');
    const modalAllowOverlap = document.getElementById('modalAllowOverlap');
    
    // Category Settings Modal
    const categorySettingsButton = document.getElementById('categorySettingsButton');
    const categoryModal = document.getElementById('categoryModal');
    const closeCategoryModalButton = document.getElementById('closeCategoryModalButton');
    const saveCategoriesButton = document.getElementById('saveCategoriesButton');
    const categoryListContainer = document.getElementById('categoryListContainer');
    const newCategoryName = document.getElementById('newCategoryName');
    const newCategoryColor = document.getElementById('newCategoryColor');
    const addCategoryButton = document.getElementById('addCategoryButton');

    // Summary Area
    const summaryArea = document.getElementById('summaryArea');
    const summaryListContainer = document.getElementById('summaryListContainer');
    const summaryTotalTimeContainer = document.getElementById('summaryTotalTimeContainer');

    // --- State Variables ---
    let currentEditingItem = null;
    let draggingItem = null;
    let movePreviewItem = null;
    let isResizing = false;
    let resizingItem = null;
    let resizingDirection = null;
    let categories = [];
    let tempCategories = [];
    let categoryChart = null;
    const selectedItems = new Set();
    let isCreatingWithDrag = false;
    let dragCreateTimeline = null;
    let dragCreateStartY = 0;
    let dragCreatePreviewItem = null;
    let saveStatusTimeout;

    // --- Undo/Redo State ---
    let history = [];
    let historyIndex = -1;
    const MAX_HISTORY = 50;
    let isRestoringFromHistory = false;

    // --- Initial Load ---
    initializeTheme(); // 初期テーマを適用
    loadCategories();
    loadPlanFromLocalStorage();
    pushHistory(getCurrentPlanObject());
    
    let lastSelectedItem = null;

    function updateSelectionUI() {
        document.querySelectorAll('.plan-item.is-selected').forEach(el => el.classList.remove('is-selected'));
        selectedItems.forEach(item => {
            const activityId = item.dataset.activityId;
            if(activityId){
                document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.add('is-selected'));
            }
        });
    }

    // [改善2] Shiftキーによる範囲選択を実装
    function handleItemClick(e, item) {
        e.stopPropagation();
        const activityId = item.dataset.activityId;
        const allParts = document.querySelectorAll(`[data-activity-id="${activityId}"]`);

        if (e.shiftKey && lastSelectedItem) {
            // Shiftキーが押されている場合、範囲選択を行う
            if (!e.ctrlKey && !e.metaKey) {
                selectedItems.clear();
            }
    
            // 表示されているすべてのアイテムをDOMの順序で取得
            const allVisibleItems = Array.from(document.querySelectorAll('.plan-item:not(.dragging)'));
            const startIdx = allVisibleItems.indexOf(lastSelectedItem);
            const endIdx = allVisibleItems.indexOf(item);
    
            if (startIdx !== -1 && endIdx !== -1) {
                const [minIdx, maxIdx] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
        
                for (let i = minIdx; i <= maxIdx; i++) {
                    const itemInRange = allVisibleItems[i];
                    const aid = itemInRange.dataset.activityId;
                    document.querySelectorAll(`[data-activity-id="${aid}"]`).forEach(part => selectedItems.add(part));
                }
            } else {
                // lastSelectedItemが見つからない場合は通常選択
                allParts.forEach(part => selectedItems.add(part));
            }

        } else if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmdキーでの個別選択
            const isSelected = Array.from(allParts).every(part => selectedItems.has(part));
            if (isSelected) {
                allParts.forEach(part => selectedItems.delete(part));
            } else {
                allParts.forEach(part => selectedItems.add(part));
                lastSelectedItem = item;
            }
        } else {
            // 通常の単一選択
            selectedItems.clear();
            allParts.forEach(part => selectedItems.add(part));
            lastSelectedItem = item;
        }
        updateSelectionUI();
    }

    document.body.addEventListener('click', (e) => {
        if (!e.target.closest('.plan-item')) {
            selectedItems.clear();
            updateSelectionUI();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') e.target.blur();
            else return;
        }

        const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
        const isRedo = ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z');

        if (isUndo) { e.preventDefault(); handleUndo(); return; }
        if (isRedo) { e.preventDefault(); handleRedo(); return; }

        if (selectedItems.size === 0) return;
        
        const firstSelectedItem = Array.from(selectedItems)[0];

        if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleDuplicateItem(firstSelectedItem, true);
        }
        
        if (e.key === 'Enter') {
            e.preventDefault();
            openModal(firstSelectedItem);
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const activityId = firstSelectedItem.dataset.activityId;
            const activityName = firstSelectedItem.dataset.name;
            if (confirm(`アクティビティ「${activityName}」を削除しますか？`)) {
                document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.remove());
                selectedItems.clear();
                savePlanToLocalStorage();
            }
        }
    });

    // --- Event Listeners ---
    planForm.addEventListener('submit', handleFormSubmit);
    clearPlanButton.addEventListener('click', clearPlan);
    copyPlanButton.addEventListener('click', copyPlanAsText);
    printPlanButton.addEventListener('click', () => window.print());
    exportJsonButton.addEventListener('click', exportPlanAsJson);
    exportPdfButton.addEventListener('click', exportPdfButtonClickHandler);
    undoButton.addEventListener('click', handleUndo);
    redoButton.addEventListener('click', handleRedo);
    
    bodyElement.addEventListener('dragover', handleDragOverFile);
    bodyElement.addEventListener('dragleave', handleDragLeaveFile);
    bodyElement.addEventListener('drop', handleDropFile);

    editModal.querySelector('#deleteModalButton').addEventListener('click', () => {
        if (currentEditingItem) {
            const activityId = currentEditingItem.dataset.activityId;
            const activityName = currentEditingItem.dataset.name;
            if(confirm(`アクティビティ「${activityName}」を削除しますか？`)) {
                document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.remove());
                closeModal();
                savePlanToLocalStorage();
            }
        }
    });
    closeModalButton.addEventListener('click', closeModal);
    saveModalButton.addEventListener('click', saveModalChanges);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) closeModal();
    });

    categorySettingsButton.addEventListener('click', openCategoryModal);
    closeCategoryModalButton.addEventListener('click', closeCategoryModal);
    categoryModal.addEventListener('click', (e) => {
        if (e.target === categoryModal) closeCategoryModal();
    });
    addCategoryButton.addEventListener('click', handleAddNewCategory);
    saveCategoriesButton.addEventListener('click', handleSaveCategories);


    // --- Notification & Status Indicator ---
    function showNotification(message, type = 'info', duration = 3000) {
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

    function updateSaveStatus(status) {
        const statusEl = document.getElementById('save-status');
        if (!statusEl) return;
        clearTimeout(saveStatusTimeout);
        switch (status) {
            case 'saving':
                statusEl.textContent = '保存中...';
                statusEl.style.opacity = '1';
                break;
            case 'saved':
                statusEl.textContent = '✓ 保存済み';
                statusEl.style.opacity = '1';
                saveStatusTimeout = setTimeout(() => { statusEl.style.opacity = '0'; }, 2000);
                break;
            default:
                statusEl.textContent = '';
                statusEl.style.opacity = '0';
                break;
        }
    }


    // --- Undo/Redo Functions ---
    function updateHistoryButtons() {
        undoButton.disabled = historyIndex <= 0;
        redoButton.disabled = historyIndex >= history.length - 1;
    }

    function pushHistory(planObject) {
        if (isRestoringFromHistory || !planObject) return;
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        if (history.length > 0 && JSON.stringify(planObject) === JSON.stringify(history[historyIndex])) {
            return;
        }
        history.push(planObject);
        if (history.length > MAX_HISTORY) {
            history.shift();
        }
        historyIndex = history.length - 1;
        updateHistoryButtons();
    }

    function handleUndo() {
        if (historyIndex > 0) {
            historyIndex--;
            isRestoringFromHistory = true;
            loadPlan(history[historyIndex]);
            isRestoringFromHistory = false;
            updateHistoryButtons();
            showNotification('元に戻しました', 'info');
        }
    }

    function handleRedo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            isRestoringFromHistory = true;
            loadPlan(history[historyIndex]);
            isRestoringFromHistory = false;
            updateHistoryButtons();
            showNotification('やり直しました', 'info');
        }
    }


    // --- Category Management ---
    function loadCategories() {
        const savedCategories = localStorage.getItem('planGeneratorCategories');
        if (savedCategories) {
            categories = JSON.parse(savedCategories);
        } else {
            categories = [
                { id: 'cat-1', name: '準備', color: '#ffc107' },
                { id: 'cat-2', name: '食事', color: '#dc3545' },
                { id: 'cat-3', name: '移動', color: '#17a2b8' },
                { id: 'cat-4', name: '自由時間', color: '#28a745' },
                { id: 'cat-5', name: 'タスク', color: '#6c757d' },
            ];
            saveCategories();
        }
        updateActivityCategoryDropdown();
    }
    function saveCategories() {
        localStorage.setItem('planGeneratorCategories', JSON.stringify(categories));
    }
    function openCategoryModal() {
        tempCategories = JSON.parse(JSON.stringify(categories));
        renderCategoryList();
        categoryModal.style.display = 'flex';
    }
    function closeCategoryModal() {
        tempCategories = [];
        categoryModal.style.display = 'none';
    }
    function renderCategoryList() {
        categoryListContainer.innerHTML = '';
        if (tempCategories.length === 0) {
            categoryListContainer.innerHTML = '<p>カテゴリがありません。下から追加してください。</p>';
            return;
        }
        tempCategories.forEach(cat => {
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
        document.querySelectorAll('.delete-cat-btn').forEach(btn => btn.addEventListener('click', () => handleDeleteCategory(btn.dataset.id)));
        document.querySelectorAll('.edit-cat-btn').forEach(btn => btn.addEventListener('click', () => handleEditCategory(btn.dataset.id)));
    }
    function handleAddNewCategory() {
        const name = newCategoryName.value.trim();
        const color = newCategoryColor.value;
        if (!name) {
            showNotification('カテゴリ名を入力してください。', 'error');
            return;
        }
        tempCategories.push({ id: `cat-${Date.now()}`, name, color });
        renderCategoryList();
        newCategoryName.value = '';
    }
    function handleDeleteCategory(categoryId) {
        if (confirm('このカテゴリを削除しますか？このカテゴリを使用しているアクティビティは「カテゴリなし」にリセットされます。')) {
            tempCategories = tempCategories.filter(c => c.id !== categoryId);
            renderCategoryList();
        }
    }
    function handleEditCategory(categoryId) {
        const categoryToEdit = tempCategories.find(c => c.id === categoryId);
        if (categoryToEdit) {
            newCategoryName.value = categoryToEdit.name;
            newCategoryColor.value = categoryToEdit.color;
            tempCategories = tempCategories.filter(c => c.id !== categoryId);
            renderCategoryList();
        }
    }
    function handleSaveCategories() {
        const deletedCategoryIds = categories.filter(c => !tempCategories.find(tc => tc.id === c.id)).map(c => c.id);
        if (deletedCategoryIds.length > 0) {
            document.querySelectorAll('.plan-item').forEach(itemEl => {
                if (deletedCategoryIds.includes(itemEl.dataset.category)) {
                    itemEl.dataset.category = '';
                }
            });
        }
        categories = tempCategories;
        saveCategories();
        updateActivityCategoryDropdown();
        applyCategoryStylesToAllItems();
        closeCategoryModal();
        savePlanToLocalStorage();
    }
    function updateActivityCategoryDropdown() {
        modalActivityCategory.innerHTML = '<option value="">カテゴリなし</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            modalActivityCategory.appendChild(option);
        });
    }
    function applyCategoryStylesToAllItems() {
        document.querySelectorAll('.plan-item').forEach(itemEl => {
            const categoryId = itemEl.dataset.category;
            const category = categories.find(c => c.id === categoryId);
            if (category) {
                const isDark = document.body.classList.contains('dark-mode');
                const baseColor = category.color;
                // [改善1] カテゴリの色をテーマに合わせて調整
                const itemBgColor = isDark ? lightenColor(baseColor, 20) : baseColor;
                const itemBorderColor = isDark ? lightenColor(baseColor, 35) : darkenColor(baseColor, 15);

                itemEl.style.backgroundColor = itemBgColor;
                itemEl.style.borderLeftColor = itemBorderColor;
            } else {
                itemEl.style.backgroundColor = '';
                itemEl.style.borderLeftColor = '';
            }
        });
    }


    // --- Drag and Drop Handlers (Item Move) ---
    function handleDragStart(e) {
        draggingItem = e.target;
        handleItemClick(e, draggingItem);

        const activityId = draggingItem.dataset.activityId;
        
        // [改善3] ドラッグ開始時の日付をデータセットに保存
        const startDayPlan = draggingItem.closest('.day-plan');
        if (startDayPlan) {
            draggingItem.dataset.originalIsoDate = startDayPlan.dataset.isoDate;
        }

        movePreviewItem = document.createElement('div');
        movePreviewItem.className = 'timeline-move-preview';
        movePreviewItem.style.height = `${draggingItem.offsetHeight}px`;
        movePreviewItem.style.width = `${draggingItem.offsetWidth}px`;
        movePreviewItem.textContent = draggingItem.dataset.name;
        
        const timeline = draggingItem.closest('.timeline');
        if (timeline) {
            timeline.appendChild(movePreviewItem);
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
        document.querySelectorAll('.timeline').forEach(tl => {
            tl.classList.add('is-active-drop-target');
        });
    }
    function handleDragEnd(e) {
        if(draggingItem) {
            const activityId = draggingItem.dataset.activityId;
            document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.classList.remove('dragging'));
            // [改善3] クリーンアップ
            delete draggingItem.dataset.originalIsoDate;
        }
        draggingItem = null;
        if (movePreviewItem) {
            movePreviewItem.remove();
            movePreviewItem = null;
        }
        document.querySelectorAll('.timeline').forEach(timeline => timeline.classList.remove('is-drop-target', 'is-active-drop-target'));
    }
    function handleDragOverTimeline(e) {
        e.preventDefault();
        if (!draggingItem || !movePreviewItem) return;
        e.dataTransfer.dropEffect = 'move';
        const dropTimeline = e.currentTarget;
        if (movePreviewItem.parentElement !== dropTimeline) {
            dropTimeline.appendChild(movePreviewItem);
        }
        const timelineRect = dropTimeline.getBoundingClientRect();
        let relativeY = e.clientY - timelineRect.top;
        relativeY = Math.max(0, relativeY);
        relativeY = Math.min(timelineRect.height - movePreviewItem.offsetHeight, relativeY);
        const totalMinutesInDay = 24 * 60;
        const snapMinutes = e.shiftKey ? 1 : 15;
        const minutes = (relativeY / timelineRect.height) * totalMinutesInDay;
        const snappedMinutes = Math.round(minutes / snapMinutes) * snapMinutes;
        const snappedY = (snappedMinutes / totalMinutesInDay) * timelineRect.height;
        movePreviewItem.style.top = `${snappedY}px`;
        
        // [改善3] ドラッグ中のフィードバックを向上
        const originalIsoDate = draggingItem.dataset.originalIsoDate;
        const dropIsoDate = dropTimeline.closest('.day-plan').dataset.isoDate;
        let dateOffsetStr = '';
        if (originalIsoDate && dropIsoDate && originalIsoDate !== dropIsoDate) {
            const d1 = new Date(originalIsoDate);
            const d2 = new Date(dropIsoDate);
            const dateOffset = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
            if (dateOffset !== 0) {
                dateOffsetStr = ` <span style="font-weight: normal; opacity: 0.8;">(${dateOffset > 0 ? '+' : ''}${dateOffset}日)</span>`;
            }
        }
        movePreviewItem.innerHTML = draggingItem.dataset.name + dateOffsetStr;
    }
    function handleDropOnTimeline(e) {
        e.preventDefault();
        e.stopPropagation();
        if (!draggingItem) return;

        if (movePreviewItem) {
            movePreviewItem.remove();
            movePreviewItem = null;
        }
        
        const activityId = draggingItem.dataset.activityId;
        const allParts = document.querySelectorAll(`[data-activity-id="${activityId}"]`);
        
        // [改善1] ドロップ先のisoDateを直接使用
        const dropTimeline = e.currentTarget;
        const dropIsoDate = dropTimeline.closest('.day-plan').dataset.isoDate;
        
        const timelineRect = dropTimeline.getBoundingClientRect();
        const relativeY = e.clientY - timelineRect.top;
        const totalMinutesInDay = 24 * 60;
        const snapMinutes = e.shiftKey ? 1 : 15;
        let newStartMinutesOnDropDay = (relativeY / timelineRect.height) * totalMinutesInDay;
        newStartMinutesOnDropDay = Math.round(newStartMinutesOnDropDay / snapMinutes) * snapMinutes;
        
        const originalStartDateTime = new Date(`${draggingItem.dataset.startDate}T${draggingItem.dataset.startTime}`);
        const originalEndDateTime = new Date(`${draggingItem.dataset.endDate}T${draggingItem.dataset.endTime}`);
        const durationMs = originalEndDateTime.getTime() - originalStartDateTime.getTime();

        // 新しい開始日時を、ドロップ先の日付とY座標から計算
        const newStartDateTime = new Date(dropIsoDate);
        newStartDateTime.setUTCHours(0, 0, 0, 0); // 日付をリセット
        newStartDateTime.setMinutes(newStartMinutesOnDropDay);

        const newEndDateTime = new Date(newStartDateTime.getTime() + durationMs);

        const updatedActivity = {
            id: activityId,
            name: draggingItem.dataset.name,
            startDate: newStartDateTime.toISOString().slice(0, 10),
            startTime: newStartDateTime.toTimeString().slice(0, 5),
            endDate: newEndDateTime.toISOString().slice(0, 10),
            endTime: newEndDateTime.toTimeString().slice(0, 5),
            category: draggingItem.dataset.category,
            notes: draggingItem.dataset.notes,
            allowOverlap: draggingItem.dataset.allowOverlap === 'true'
        };
        
        allParts.forEach(part => part.remove());

        const newElements = createActivityElements(updatedActivity);
        const timelineMap = new Map();
        document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
        newElements.forEach(item => {
            const targetTimeline = timelineMap.get(item.isoDate);
            if (targetTimeline) targetTimeline.appendChild(item.element);
        });
        
        savePlanToLocalStorage();
    }


    // --- Resize Handlers (Item Duration) ---
    function startResize(e) {
        if(e.target.classList.contains('disabled')) return;
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
        if (!isResizing) return;
        const timeline = resizingItem.parentElement;
        const timelineRect = timeline.getBoundingClientRect();
        if (resizingDirection === 'bottom') {
            const itemTop = resizingItem.offsetTop;
            const newHeight = e.clientY - timelineRect.top - itemTop;
            resizingItem.style.height = `${Math.max(20, newHeight)}px`;
        } else {
            const itemBottom = resizingItem.offsetTop + resizingItem.offsetHeight;
            const newTop = e.clientY - timelineRect.top;
            const newHeight = itemBottom - newTop;
            if (newHeight >= 20) {
                resizingItem.style.top = `${newTop}px`;
                resizingItem.style.height = `${newHeight}px`;
            }
        }
    }
    function stopResize(e) {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);

        const activityId = resizingItem.dataset.activityId;
        const timeline = resizingItem.parentElement;
        const timelineHeight = timeline.offsetHeight;
        const totalMinutesInDay = 24 * 60;
        const snapMinutes = e.shiftKey ? 1 : 15;

        let startDateTime = new Date(`${resizingItem.dataset.startDate}T${resizingItem.dataset.startTime}`);
        let endDateTime = new Date(`${resizingItem.dataset.endDate}T${resizingItem.dataset.endTime}`);

        if (resizingDirection === 'bottom') {
            const itemBottomPosition = resizingItem.offsetTop + resizingItem.offsetHeight;
            let endMinutes = Math.round(((itemBottomPosition / timelineHeight) * totalMinutesInDay) / snapMinutes) * snapMinutes;
            const currentDay = new Date(resizingItem.closest('.day-plan').dataset.isoDate);
            endDateTime = new Date(currentDay);
            endDateTime.setUTCHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
        } else { // Top resize
            const itemTopPosition = resizingItem.offsetTop;
            let startMinutes = Math.round(((itemTopPosition / timelineHeight) * totalMinutesInDay) / snapMinutes) * snapMinutes;
            const currentDay = new Date(resizingItem.closest('.day-plan').dataset.isoDate);
            startDateTime = new Date(currentDay);
            startDateTime.setUTCHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
        }
        
        if(startDateTime.getTime() >= endDateTime.getTime()){
             // Invalid resize, revert
             loadPlan(getCurrentPlanObject()); // Simple revert
             return;
        }

        const updatedActivity = {
            id: activityId,
            name: resizingItem.dataset.name,
            startDate: startDateTime.toISOString().slice(0,10),
            startTime: startDateTime.toTimeString().slice(0,5),
            endDate: endDateTime.toISOString().slice(0,10),
            endTime: endDateTime.toTimeString().slice(0,5),
            category: resizingItem.dataset.category,
            notes: resizingItem.dataset.notes,
            allowOverlap: resizingItem.dataset.allowOverlap === 'true'
        };

        document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(el => el.remove());
        const newElements = createActivityElements(updatedActivity);
        const timelineMap = new Map();
        document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
        newElements.forEach(item => {
            const targetTimeline = timelineMap.get(item.isoDate);
            if (targetTimeline) targetTimeline.appendChild(item.element);
        });

        savePlanToLocalStorage();
        resizingItem = null;
        resizingDirection = null;
    }


    // --- Collision Detection and Layout Update ---
    function updateTimelineLayout() {
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
                start: timeToMinutes(el.style.top) * (24*60) / 100,
                end: (timeToMinutes(el.style.top) * (24*60) / 100) + (timeToMinutes(el.style.height) * (24*60) / 100),
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


    // --- Event Handler Functions ---
    function handleFormSubmit(event) {
        event.preventDefault();
        if (!validateInputs()) return;
        const planName = planNameInput.value.trim();
        const startDate = startDateInput.value;
        const numberOfDays = parseInt(numberOfDaysInput.value, 10);
        
        const existingPlan = getCurrentPlanObject();
        const planData = createEmptyPlan(startDate, numberOfDays);

        if(existingPlan && existingPlan.planData.length > 0){
             planData.forEach(newDay => {
                 const existingDay = existingPlan.planData.find(d => d.isoDate === newDay.isoDate);
                 if(existingDay) {
                     newDay.activities = existingDay.activities;
                 }
             });
        }
        
        renderPlan(planName, planData);
        pushHistory(getCurrentPlanObject());
    }
    function clearPlan() {
        if (confirm('現在の計画をすべてクリアして、新規作成しますか？この操作は元に戻せません。')) {
            localStorage.removeItem('savedPlan');
            planForm.reset();
            document.querySelectorAll('.error-message, .is-invalid').forEach(el => {
                el.textContent = '';
                el.classList.remove('is-invalid');
            });
            planOutputTitle.textContent = '作成された計画';
            planOutput.innerHTML = '<p class="placeholder">ここに入力内容から作成された計画が表示されます。</p>';
            updateSummary();
            pushHistory(null);
            showNotification('計画をクリアしました', 'info');
        }
    }


    // --- Core Logic: Plan Display & Manipulation ---
     // --- Core Logic: Plan Display & Manipulation ---
    function createActivityElements(activity) {
        const elements = [];
        const activityId = activity.id || `act-${Date.now()}`;
        
        const actStart = new Date(`${activity.startDate}T${activity.startTime || '00:00'}`);
        const actEnd = new Date(`${activity.endDate}T${activity.endTime || '00:00'}`);

        // [不具合修正] 日付またぎのループ処理を修正
        const loopStartDate = new Date(actStart);
        loopStartDate.setHours(0, 0, 0, 0);

        for (let d = loopStartDate; d.getTime() < actEnd.getTime(); d.setDate(d.getDate() + 1)) {
            const loopDayStart = new Date(d);
            
            const segmentStart = new Date(Math.max(actStart.getTime(), loopDayStart.getTime()));
            
            const nextDayStart = new Date(loopDayStart);
            nextDayStart.setDate(nextDayStart.getDate() + 1);
            const segmentEnd = new Date(Math.min(actEnd.getTime(), nextDayStart.getTime()));

            if(segmentStart.getTime() >= segmentEnd.getTime()) continue;

            const isFirstDay = segmentStart.getTime() === actStart.getTime();
            const isLastDay = segmentEnd.getTime() === actEnd.getTime();

            const segmentData = {
                ...activity,
                id: activityId,
                startTime: `${String(segmentStart.getHours()).padStart(2, '0')}:${String(segmentStart.getMinutes()).padStart(2, '0')}`,
                endTime: `${String(segmentEnd.getHours()).padStart(2, '0')}:${String(segmentEnd.getMinutes()).padStart(2, '0')}`,
            };
            if (segmentData.endTime === '00:00' && segmentEnd.getTime() > segmentStart.getTime()) {
                segmentData.endTime = '24:00';
            }

            const listItem = createPlanItemElement(segmentData, { isFirstDay, isLastDay });
            
            const isoDateString = loopDayStart.toISOString().slice(0, 10);
            elements.push({ element: listItem, isoDate: isoDateString });
        }
        return elements;
    }
    function createPlanItemElement(activity, options = { isFirstDay: true, isLastDay: true }) {
        const listItem = document.createElement('div');
        listItem.classList.add('plan-item');
        listItem.setAttribute('draggable', 'true');
        listItem.addEventListener('dragstart', handleDragStart);
        listItem.addEventListener('dragend', handleDragEnd);

        const startMinutes = timeToMinutes(activity.startTime);
        let endMinutesVal = timeToMinutes(activity.endTime);
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

        const category = categories.find(c => c.id === activity.category);
        if (category) {
            const isDark = document.body.classList.contains('dark-mode');
            const baseColor = category.color;
            const itemBgColor = isDark ? lightenColor(baseColor, 20) : baseColor;
            const itemBorderColor = isDark ? lightenColor(baseColor, 35) : darkenColor(baseColor, 15);
            listItem.style.backgroundColor = itemBgColor;
            listItem.style.borderLeftColor = itemBorderColor;
        }

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
        topHandle.addEventListener('mousedown', startResize);
        bottomHandle.addEventListener('mousedown', startResize);

        listItem.querySelector('.duplicate-item-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleDuplicateItem(listItem, true);
        });

        listItem.querySelector('.delete-item-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`「${activity.name}」を削除しますか？`)) {
                 document.querySelectorAll(`[data-activity-id="${activity.id}"]`).forEach(part => part.remove());
                savePlanToLocalStorage();
            }
        });
        
        listItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('resize-handle') || e.target.closest('.delete-item-btn, .duplicate-item-btn') || isResizing) return;
            if (draggingItem) return;
            handleItemClick(e, listItem);
        });

        listItem.addEventListener('dblclick', (e) => {
            if (e.target.classList.contains('resize-handle') || e.target.closest('.delete-item-btn, .duplicate-item-btn') || isResizing) return;
            if (draggingItem) return;
            openModal(listItem);
        });
        return listItem;
    }
    function renderPlan(planName, planDaysData) {
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

            // [改善1] isoDateをデータセットに設定し、なければ生成する
            let isoDate;
            if (day.isoDate) {
                isoDate = day.isoDate;
            } else {
                const parsableStr = day.date.split('(')[0].replace('年', '-').replace('月', '-').replace('日', '');
                const dateObj = new Date(parsableStr);
                isoDate = dateObj.toISOString().slice(0, 10);
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
            timeline.addEventListener('dragover', handleDragOverTimeline);
            timeline.addEventListener('drop', handleDropOnTimeline);
            timeline.addEventListener('mousedown', handleTimelineMouseDown);
            timeline.addEventListener('dragenter', (e) => { e.preventDefault(); if (draggingItem) e.currentTarget.classList.add('is-active-drop-target'); });
            timeline.addEventListener('dragleave', (e) => { e.preventDefault(); if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return; e.currentTarget.classList.remove('is-active-drop-target'); });
            dayContent.appendChild(timeline);
            dayDiv.appendChild(dayContent);
            const addButton = document.createElement('button');
            addButton.classList.add('add-item-btn');
            addButton.textContent = '＋ この日にアクティビティを追加';
            // [改善1] addPlanItemにはisoDateを渡す
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
        savePlanToLocalStorage();
    }
    // [改善1] 引数をdayオブジェクトからisoDate文字列に変更
    function addPlanItem(isoDate, initialData = {}) {
        currentEditingItem = null;
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
    function openModal(listItem) {
        currentEditingItem = listItem;
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
    function closeModal() {
        currentEditingItem = null;
        editModal.style.display = 'none';
    }
    function saveModalChanges() {
        modalDateTimeError.textContent = '';
        const startDateTime = new Date(`${modalStartDate.value}T${modalStartTime.value}`);
        const endDateTime = new Date(`${modalEndDate.value}T${modalEndTime.value}`);
        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            modalDateTimeError.textContent = '有効な日時を入力してください。';
            return;
        }
        if (startDateTime.getTime() >= endDateTime.getTime()) {
            modalDateTimeError.textContent = '終了日時は開始日時より後に設定してください。';
            return;
        }
        const activityId = currentEditingItem ? currentEditingItem.dataset.activityId : `act-${Date.now()}`;
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
        const activityElements = createActivityElements(activityData);
        const timelineMap = new Map();
        document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
        activityElements.forEach(item => {
            const targetTimeline = timelineMap.get(item.isoDate);
            if (targetTimeline) {
                targetTimeline.appendChild(item.element);
            }
        });
        savePlanToLocalStorage();
        closeModal();
    }


    // --- Utility Functions ---
    function timeToMinutes(timeString) {
        if (!timeString) return 0;
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }
    function minutesToTime(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    function darkenColor(hex, percent) {
        if (!hex || hex.length < 7) return '#666';
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);
        r = Math.floor(r * (100 - percent) / 100);
        g = Math.floor(g * (100 - percent) / 100);
        b = Math.floor(b * (100 - percent) / 100);
        r = (r < 0) ? 0 : r;
        g = (g < 0) ? 0 : g;
        b = (b < 0) ? 0 : b;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    function lightenColor(hex, percent) {
        if (!hex || hex.length < 7) return '#aaa';
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);
        r = Math.floor(r + (255 - r) * (percent / 100));
        g = Math.floor(g + (255 - g) * (percent / 100));
        b = Math.floor(b + (255 - b) * (percent / 100));
        r = (r > 255) ? 255 : r;
        g = (g > 255) ? 255 : g;
        b = (b > 255) ? 255 : b;
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    function validateInputs() {
        let isValid = true;
        isValid &= validateField(planNameInput, '計画名は必須です。');
        isValid &= validateField(startDateInput, '開始日は必須です。');
        isValid &= validateField(numberOfDaysInput, '日数は必須です。');
        return isValid;
    }
    function validateField(inputElement, errorMessage) {
        const errorElement = document.getElementById(`${inputElement.id}Error`);
        if (inputElement.value.trim() === '') {
            inputElement.classList.add('is-invalid');
            errorElement.textContent = errorMessage;
            return false;
        } else {
            inputElement.classList.remove('is-invalid');
            errorElement.textContent = '';
            return true;
        }
    }
    // [改善1] dayオブジェクトにisoDateを追加
    function createEmptyPlan(startDateString, numberOfDays) {
        const plan = [];
        if (!startDateString || numberOfDays <= 0) return [];
        const startDate = new Date(startDateString);
        for (let i = 0; i < numberOfDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            const formattedDate = currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
            const isoDate = currentDate.toISOString().slice(0, 10);
            plan.push({ date: formattedDate, isoDate: isoDate, activities: [] });
        }
        return plan;
    }


    // --- Summary / Aggregation ---
    function formatMinutes(minutes) {
        if (minutes === 0) return '0分';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        let result = '';
        if (h > 0) result += `${h}時間`;
        if (m > 0) result += `${m}分`;
        return result;
    }
    function updateSummary() {
        summaryArea.style.display = 'none';
        summaryListContainer.innerHTML = '';
        summaryTotalTimeContainer.innerHTML = '';
        if (categoryChart) {
            categoryChart.destroy();
            categoryChart = null;
        }
        const planObject = getCurrentPlanObject();
        if (!planObject || planObject.planData.length === 0) return;
        let totalPlanMinutes = 0;
        const categoryTotals = {};

        const allActivities = planObject.planData.flatMap(day => day.activities);
        const uniqueActivities = Object.values(allActivities.reduce((acc, cur) => {
            if(!acc[cur.id]) acc[cur.id] = cur;
            return acc;
        }, {}));

        uniqueActivities.forEach(activity => {
            const start = new Date(`${activity.startDate}T${activity.startTime}`);
            const end = new Date(`${activity.endDate}T${activity.endTime}`);
            const duration = (end - start) / (1000 * 60);
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
            const category = categories.find(c => c.id === categoryId);
            const categoryName = category ? category.name : 'カテゴリなし';
            const categoryColor = category ? category.color : '#cccccc';
            const item = document.createElement('li');
            item.className = 'summary-item';
            item.innerHTML = `
                <div class="summary-item-label">
                    <div class="category-color-preview" style="background-color: ${categoryColor};"></div>
                    <span>${categoryName}</span>
                </div>
                <div class="summary-item-time">${formatMinutes(minutes)}</div>
            `;
            list.appendChild(item);
            chartLabels.push(categoryName);
            chartData.push(minutes);
            chartColors.push(categoryColor);
        }
        summaryListContainer.appendChild(list);
        summaryTotalTimeContainer.innerHTML = `<strong>合計計画時間:</strong> ${formatMinutes(totalPlanMinutes)}`;
        const isDarkMode = document.body.classList.contains('dark-mode');
        const textColor = isDarkMode ? '#e0e0e0' : '#212529';
        const legendColor = isDarkMode ? '#a0a0a0' : '#6c757d';
        const ctx = document.getElementById('categoryPieChart').getContext('2d');
        categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: chartLabels, datasets: [{ label: '時間', data: chartData, backgroundColor: chartColors, borderColor: isDarkMode ? '#1e1e1e' : '#fff', borderWidth: 2, hoverOffset: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }, // 凡例はカスタムリストで表示するため非表示
                    tooltip: {
                        titleColor: textColor, bodyColor: textColor,
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const percentage = totalPlanMinutes > 0 ? ((value / totalPlanMinutes) * 100).toFixed(1) : 0;
                                return `${label}: ${formatMinutes(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }


    // --- Local Storage and Export Functions ---
    function savePlanToLocalStorage() {
        if(isRestoringFromHistory) return;
        updateSaveStatus('saving');
        const planObject = getCurrentPlanObject();
        pushHistory(planObject);
        if (planObject) {
            localStorage.setItem('savedPlan', JSON.stringify(planObject));
        } else {
            localStorage.removeItem('savedPlan');
        }
        updateTimelineLayout();
        updateSummary();
        setTimeout(() => updateSaveStatus('saved'), 300);
    }
    function loadPlanFromLocalStorage() {
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
    // [改善1] isoDateを使ってデータを管理
    function getCurrentPlanObject() {
        const planNameEl = document.getElementById('planName');
        const startDateEl = document.getElementById('startDate');
        const numberOfDaysEl = document.getElementById('numberOfDays');
        if (!planNameEl || !startDateEl || !numberOfDaysEl) return null;
        const dayElements = document.querySelectorAll('.day-plan');
        if (dayElements.length === 0 && !planNameEl.value) {
            return null;
        }

        const activitiesById = {};
        dayElements.forEach(dayEl => {
            dayEl.querySelectorAll('.plan-item').forEach(itemEl => {
                const id = itemEl.dataset.activityId;
                if (!id) return;
                if (!activitiesById[id]) {
                    activitiesById[id] = {
                        id: id,
                        name: itemEl.dataset.name,
                        startDate: itemEl.dataset.startDate,
                        startTime: itemEl.dataset.startTime,
                        endDate: itemEl.dataset.endDate,
                        endTime: itemEl.dataset.endTime,
                        category: itemEl.dataset.category,
                        notes: itemEl.dataset.notes,
                        allowOverlap: itemEl.dataset.allowOverlap === 'true'
                    };
                }
            });
        });

        const planData = Array.from(dayElements).map(dayEl => ({
            date: dayEl.dataset.date,
            isoDate: dayEl.dataset.isoDate, // isoDateも保存
            activities: []
        }));

        Object.values(activitiesById).forEach(activity => {
            if(!activity.startDate) return;
            const targetDay = planData.find(d => d.isoDate === activity.startDate);
            if (targetDay) {
                targetDay.activities.push(activity);
            }
        });

        return {
            name: planNameEl.value,
            startDate: startDateEl.value,
            numberOfDays: numberOfDaysEl.value,
            planData: planData
        };
    }
    function loadPlan(planObject) {
        if(!planObject) return;
        planNameInput.value = planObject.name || '';
        startDateInput.value = planObject.startDate || '';
        numberOfDaysInput.value = planObject.numberOfDays || 1;
        renderPlan(planObject.name, planObject.planData);
    }
    function copyPlanAsText() {
        const planObject = getCurrentPlanObject();
        if (!planObject || planObject.planData.length === 0) {
            showNotification('コピーする計画がありません。', 'error');
            return;
        }
        let text = `${planObject.name}\n${"=".repeat(planObject.name.length)}\n\n`;
        const allActivities = planObject.planData.flatMap(d => d.activities).sort((a,b) => new Date(`${a.startDate}T${a.startTime}`) - new Date(`${b.startDate}T${b.startTime}`));
        const uniqueActivities = Object.values(allActivities.reduce((acc, cur) => { if(!acc[cur.id]) acc[cur.id] = cur; return acc; }, {}));

        let currentDateStr = '';
        uniqueActivities.forEach(activity => {
            const activityStartDate = new Date(activity.startDate);
            const formattedDate = activityStartDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

            if(currentDateStr !== formattedDate){
                currentDateStr = formattedDate;
                text += `\n■ ${currentDateStr}\n`;
            }
            const category = categories.find(c => c.id === activity.category);
            const categoryText = category ? ` (${category.name})` : '';
            text += `- [${activity.startTime}] ${activity.name}${categoryText}`;
            if(activity.startDate !== activity.endDate) {
                text += ` (〜 ${activity.endDate} ${activity.endTime})`
            } else if (activity.startTime !== activity.endTime) {
                text += ` - ${activity.endTime}`;
            }
            text += `\n`;
            if (activity.notes) {
                text += `  (メモ: ${activity.notes.replace(/\n/g, '\n  ')})\n`;
            }
        });
        
        navigator.clipboard.writeText(text).then(() => {
            showNotification('計画をテキストとしてコピーしました', 'success');
        }, err => {
            console.error('クリップボードへのコピーに失敗しました: ', err);
            showNotification('コピーに失敗しました。', 'error');
        });
    }
    function exportPlanAsJson() {
        const planObject = getCurrentPlanObject();
        if (!planObject) {
            showNotification('エクスポートする計画がありません。', 'error');
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
        showNotification('JSONファイルとしてエクスポートしました', 'success');
    }
    function exportPdfButtonClickHandler() {
        const planElement = document.getElementById('planOutput');
        const planName = document.getElementById('planOutputTitle').textContent;
        if (planElement.querySelectorAll('.day-plan').length === 0) {
            showNotification('PDFとして保存する計画がありません。', 'error');
            return;
        }
        showNotification('PDFを生成中です...', 'info', 5000);
        document.body.classList.add('is-exporting-pdf');
        html2canvas(planElement, { scale: 2, windowWidth: 1200, useCORS: true }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [canvas.width, canvas.height] });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
            pdf.save(`${planName.replace('計画: ', '')}.pdf`);
            document.body.classList.remove('is-exporting-pdf');
        }).catch(err => {
            console.error("PDF generation failed:", err);
            showNotification("PDFの生成に失敗しました。", 'error');
            document.body.classList.remove('is-exporting-pdf');
        });
    }


    // --- File Drop Handlers ---
    function handleDragOverFile(event) {
        if (draggingItem) return;
        event.preventDefault();
        dropZoneOverlay.style.display = 'flex';
    }
    function handleDragLeaveFile(event) {
        if (event.relatedTarget === null || !event.currentTarget.contains(event.relatedTarget)) {
            dropZoneOverlay.style.display = 'none';
        }
    }
    function handleDropFile(event) {
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
                                pushHistory(getCurrentPlanObject());
                                showNotification(`計画「${planObject.name}」を読み込みました。`, 'success');
                            }
                        } else {
                            throw new Error('無効なファイル形式です。');
                        }
                    } catch (error) {
                        showNotification('ファイルの読み込みに失敗しました。\n' + error.message, 'error');
                    }
                };
                reader.readAsText(file);
            } else {
                showNotification('無効なファイル形式です。.jsonファイルをドロップしてください。', 'error');
            }
        }
    }


    // --- Drag-to-Create New Item Handlers ---
    function handleTimelineMouseDown(e) {
        if (e.target !== e.currentTarget) return;
        if (draggingItem) return;
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
        const displayHeight = Math.max(1, height);
        dragCreatePreviewItem.style.top = `${top}px`;
        dragCreatePreviewItem.style.height = `${displayHeight}px`;
        const totalMinutesInDay = 24 * 60;
        const snapMinutes = e.shiftKey ? 1 : 15;
        const startMinutes = Math.floor(((top / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        const endMinutes = Math.ceil((((top + height) / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        const durationMinutes = endMinutes - startMinutes;
        const timeRangeText = `${minutesToTime(startMinutes)} - ${minutesToTime(endMinutes)}`;
        if (durationMinutes > 0) {
            dragCreatePreviewItem.innerHTML = `${timeRangeText}<br>(${formatMinutes(durationMinutes)})`;
        } else {
            dragCreatePreviewItem.innerHTML = timeRangeText;
        }
    }
    function handleDocumentMouseUp(e) {
        if (!isCreatingWithDrag) return;
        e.preventDefault();
        document.removeEventListener('mousemove', handleDocumentMouseMove);
        document.removeEventListener('mouseup', handleDocumentMouseUp);
        const timelineRect = dragCreateTimeline.getBoundingClientRect();
        const finalHeight = dragCreatePreviewItem.offsetHeight;
        const top = parseFloat(dragCreatePreviewItem.style.top);
        dragCreatePreviewItem.remove();
        dragCreatePreviewItem = null;
        if (finalHeight < 5) {
            isCreatingWithDrag = false;
            return;
        }
        const totalMinutesInDay = 24 * 60;
        const snapMinutes = e.shiftKey ? 1 : 15;
        const startMinutes = Math.floor(((top / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        const endMinutes = Math.ceil((((top + finalHeight) / timelineRect.height) * totalMinutesInDay) / snapMinutes) * snapMinutes;
        
        // [改善1] data-iso-dateを使って日付を取得
        const dayElement = dragCreateTimeline.closest('.day-plan');
        const isoDate = dayElement.dataset.isoDate;
        
        if (isoDate) {
            addPlanItem(isoDate, {
                startTime: minutesToTime(startMinutes),
                endTime: minutesToTime(endMinutes)
            });
        }
        isCreatingWithDrag = false;
    }
    function handleDuplicateItem(itemToDuplicate, openModalOnCreate) {
        const start = new Date(`${itemToDuplicate.dataset.startDate}T${itemToDuplicate.dataset.startTime}`);
        const end = new Date(`${itemToDuplicate.dataset.endDate}T${itemToDuplicate.dataset.endTime}`);
        const duration = end - start;

        const newStart = new Date(end.getTime());
        const newEnd = new Date(newStart.getTime() + duration);
        
        const duplicatedActivity = {
            name: `${itemToDuplicate.dataset.name} (コピー)`,
            startDate: newStart.toISOString().slice(0, 10),
            startTime: newStart.toTimeString().slice(0, 5),
            endDate: newEnd.toISOString().slice(0, 10),
            endTime: newEnd.toTimeString().slice(0, 5),
            category: itemToDuplicate.dataset.category,
            notes: itemToDuplicate.dataset.notes,
            allowOverlap: itemToDuplicate.dataset.allowOverlap
        };

        currentEditingItem = null; // Ensure it's treated as a new item
        
        // [改善1] addPlanItemにisoDateを渡す
        if (openModalOnCreate) {
             const newStartDate = duplicatedActivity.startDate;
             addPlanItem(newStartDate, duplicatedActivity);
        } else {
             const newElements = createActivityElements(duplicatedActivity);
             const timelineMap = new Map();
             document.querySelectorAll('.day-plan').forEach(dp => timelineMap.set(dp.dataset.isoDate, dp.querySelector('.timeline')));
             newElements.forEach(item => {
                 const targetTimeline = timelineMap.get(item.isoDate);
                 if (targetTimeline) targetTimeline.appendChild(item.element);
             });
             savePlanToLocalStorage();
             return newElements.map(e => e.element);
        }
        return null;
    }
});
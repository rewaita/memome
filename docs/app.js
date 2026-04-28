// memome - Main Logic

// --- Constants & State ---
const DB_NAME = 'memome_db';
const DB_VERSION = 1;
const STORE_NAME = 'memos';

let db;
let currentMemoId = null;
let memos = [];
let typingTimer;
const SAVE_DELAY = 1000;

// Font sizes
const FONT_SIZES = ['small', 'medium', 'large', 'xlarge'];
let currentFontSizeIndex = 1; // Default: medium

// --- DOM Elements ---
const elMemoList = document.getElementById('memo-list');
const elEditorContainer = document.getElementById('editor-container');
const elEmptyState = document.getElementById('empty-state');
const elMemoTitle = document.getElementById('memo-title');
const elMemoContent = document.getElementById('memo-content');
const elBtnAdd = document.getElementById('btn-add-memo');
const elBtnBack = document.getElementById('btn-back');
const elBtnHeading = document.getElementById('btn-heading');
const elBtnFontSize = document.getElementById('btn-font-size');
const elBtnExport = document.getElementById('btn-export');
const elBtnDelete = document.getElementById('btn-delete');
const elBtnInsertImage = document.getElementById('btn-insert-image');
const elImageInput = document.getElementById('image-input');
const elBtnSync = document.getElementById('btn-sync');
const elSyncBadge = document.getElementById('sync-badge');

// Settings Modal
const elModal = document.getElementById('settings-modal');
const elBtnSettings = document.getElementById('btn-settings');
const elBtnCloseSettings = document.getElementById('btn-close-settings');
const elBtnSaveSettings = document.getElementById('btn-save-settings');
const elInputPat = document.getElementById('github-pat');
const elInputGistId = document.getElementById('github-gist-id');

// --- Initialization ---
async function init() {
    await initDB();
    await loadMemos();
    setupEventListeners();
    updateSyncBadge();
}

// --- IndexedDB Setup ---
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        
        request.onerror = (e) => {
            console.error("IndexedDB error:", e);
            reject(e);
        };
    });
}

function getAllMemosDB() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function saveMemoDB(memo) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(memo);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function deleteMemoDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// --- Memo Logic ---
async function loadMemos() {
    memos = await getAllMemosDB();
    // Sort by local_updated_at descending
    memos.sort((a, b) => b.local_updated_at - a.local_updated_at);
    renderMemoList();
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function createNewMemo() {
    const now = Date.now();
    const newMemo = {
        id: generateUUID(),
        title: '',
        content: '',
        local_updated_at: now,
        synced_updated_at: 0
    };
    
    await saveMemoDB(newMemo);
    memos.unshift(newMemo);
    renderMemoList();
    openMemo(newMemo.id);
}

function renderMemoList() {
    elMemoList.innerHTML = '';
    memos.forEach(memo => {
        const el = document.createElement('div');
        el.className = `memo-item ${memo.id === currentMemoId ? 'active' : ''}`;
        el.dataset.id = memo.id;
        
        const displayTitle = memo.title.trim() || '新規メモ';
        const date = new Date(memo.local_updated_at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
        
        // Extract plain text for preview (remove HTML tags)
        const tmp = document.createElement('div');
        tmp.innerHTML = memo.content;
        const previewText = tmp.textContent || tmp.innerText || '追加テキストなし';
        
        el.innerHTML = `
            <div class="memo-item-title">${escapeHTML(displayTitle)}</div>
            <div>
                <span class="memo-item-date">${date}</span>
                <span class="memo-item-preview">${escapeHTML(previewText.substring(0, 30))}</span>
            </div>
        `;
        
        el.addEventListener('click', () => openMemo(memo.id));
        elMemoList.appendChild(el);
    });
}

function openMemo(id) {
    currentMemoId = id;
    const memo = memos.find(m => m.id === id);
    if (!memo) return;
    
    elEmptyState.classList.add('hidden');
    elEditorContainer.classList.remove('hidden');
    
    // For mobile, show editor, hide list via CSS logic if needed (currently using absolute positioning)
    if (window.innerWidth <= 768) {
        elEditorContainer.style.display = 'flex';
    }
    
    elMemoTitle.innerText = memo.title;
    elMemoContent.innerHTML = memo.content;
    
    renderMemoList(); // Update active state
    setupCollapsibleHeadings();
}

function closeEditor() {
    currentMemoId = null;
    elEditorContainer.classList.add('hidden');
    elEmptyState.classList.remove('hidden');
    if (window.innerWidth <= 768) {
        elEditorContainer.style.display = '';
    }
    renderMemoList();
}

async function saveCurrentMemo() {
    if (!currentMemoId) return;
    
    const title = elMemoTitle.innerText;
    const content = elMemoContent.innerHTML;
    
    const memoIndex = memos.findIndex(m => m.id === currentMemoId);
    if (memoIndex === -1) return;
    
    // Only save if changed
    if (memos[memoIndex].title !== title || memos[memoIndex].content !== content) {
        memos[memoIndex].title = title;
        memos[memoIndex].content = content;
        memos[memoIndex].local_updated_at = Date.now();
        
        await saveMemoDB(memos[memoIndex]);
        
        // Re-sort and render list
        memos.sort((a, b) => b.local_updated_at - a.local_updated_at);
        renderMemoList();
        updateSyncBadge();
    }
}

async function deleteCurrentMemo() {
    if (!currentMemoId) return;
    if (confirm('このメモを削除しますか？')) {
        await deleteMemoDB(currentMemoId);
        memos = memos.filter(m => m.id !== currentMemoId);
        closeEditor();
        updateSyncBadge();
    }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    elBtnAdd.addEventListener('click', createNewMemo);
    elBtnBack.addEventListener('click', closeEditor);
    
    // Auto-save on typing
    const triggerSave = () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(saveCurrentMemo, SAVE_DELAY);
    };
    
    elMemoTitle.addEventListener('input', triggerSave);
    elMemoContent.addEventListener('input', () => {
        triggerSave();
        // Setup collapsible on new headings (naively reconnecting for simplicity)
        setTimeout(setupCollapsibleHeadings, 500); 
    });
    
    elBtnDelete.addEventListener('click', deleteCurrentMemo);
    
    elBtnHeading.addEventListener('click', toggleHeading);
    elBtnFontSize.addEventListener('click', toggleFontSize);
    
    // Image Insert
    elBtnInsertImage.addEventListener('click', () => elImageInput.click());
    elImageInput.addEventListener('change', handleImageUpload);
    
    // Export
    elBtnExport.addEventListener('click', exportCurrentMemo);
    
    // Settings Modal
    elBtnSettings.addEventListener('click', () => {
        elInputPat.value = localStorage.getItem('memome_gh_pat') || '';
        elInputGistId.value = localStorage.getItem('memome_gh_gist_id') || '';
        elModal.classList.remove('hidden');
    });
    elBtnCloseSettings.addEventListener('click', () => elModal.classList.add('hidden'));
    elBtnSaveSettings.addEventListener('click', () => {
        localStorage.setItem('memome_gh_pat', elInputPat.value.trim());
        localStorage.setItem('memome_gh_gist_id', elInputGistId.value.trim());
        elModal.classList.add('hidden');
        alert('設定を保存しました。');
    });
    
    // Sync
    elBtnSync.addEventListener('click', syncWithGist);
}

// --- Features ---
// Toggle heading for selected block
function toggleHeading() {
    elMemoContent.focus();
    const currentBlock = document.queryCommandValue('formatBlock');
    // document.queryCommandValue('formatBlock') returns 'h1' or similar in some browsers
    if (currentBlock && currentBlock.toLowerCase() === 'h1') {
        document.execCommand('formatBlock', false, 'div');
    } else {
        document.execCommand('formatBlock', false, 'h1');
    }
    saveCurrentMemo();
}

// Cycle font size for selection or next typed characters
const SIZES = [2, 3, 5, 6]; // small, medium, large, xlarge

function toggleFontSize() {
    elMemoContent.focus();
    currentFontSizeIndex = (currentFontSizeIndex + 1) % SIZES.length;
    document.execCommand('fontSize', false, SIZES[currentFontSizeIndex]);
    saveCurrentMemo();
    
    // Save preference so next time app opens we can use it? Actually execCommand('fontSize') doesn't persist globally.
    // We will just let it be per-selection.
}
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const base64String = event.target.result;
        // Insert image at cursor
        elMemoContent.focus();
        document.execCommand('insertImage', false, base64String);
        saveCurrentMemo();
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset
}

function exportCurrentMemo() {
    if (!currentMemoId) return;
    const memo = memos.find(m => m.id === currentMemoId);
    if (!memo) return;
    
    // Convert HTML content to somewhat plain text/markdown for export
    let textContent = memo.content;
    // Replace divs/brs with newlines (simple approach)
    textContent = textContent.replace(/<div>/gi, '\n').replace(/<\/div>/gi, '');
    textContent = textContent.replace(/<br>/gi, '\n');
    // Extract base64 images if needed, or leave as HTML tags.
    // For pure text, we might want to keep the HTML if it contains images, but let's just export as text with img tags intact.
    
    const fullText = `# ${memo.title || '無題'}\n\n${textContent}`;
    const blob = new Blob([fullText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${memo.title || 'memo'}.md`;
    a.click();
    
    URL.revokeObjectURL(url);
}

// Collapsible headings logic
function setupCollapsibleHeadings() {
    const headings = elMemoContent.querySelectorAll('h1, h2, h3');
    headings.forEach(h => {
        // Remove old listener to avoid duplicates
        const newH = h.cloneNode(true);
        h.parentNode.replaceChild(newH, h);
        
        newH.addEventListener('click', function(e) {
            // Prevent collapse if clicking to edit text (simple heuristic: click near left edge)
            if (e.offsetX > 20) return; 
            
            this.classList.toggle('collapsed');
            const isCollapsed = this.classList.contains('collapsed');
            
            let sibling = this.nextElementSibling;
            const myLevel = parseInt(this.tagName.substring(1));
            
            while (sibling) {
                // Stop if we hit a heading of same or higher level (smaller number)
                if (sibling.tagName.match(/^H[1-6]$/)) {
                    const siblingLevel = parseInt(sibling.tagName.substring(1));
                    if (siblingLevel <= myLevel) break;
                }
                
                sibling.style.display = isCollapsed ? 'none' : '';
                sibling = sibling.nextElementSibling;
            }
        });
    });
}

// --- GitHub Gist Sync Logic ---
function hasUnsyncedChanges() {
    return memos.some(m => m.local_updated_at > m.synced_updated_at);
}

function updateSyncBadge() {
    if (hasUnsyncedChanges()) {
        elSyncBadge.classList.remove('hidden');
    } else {
        elSyncBadge.classList.add('hidden');
    }
}

async function syncWithGist() {
    const pat = localStorage.getItem('memome_gh_pat');
    let gistId = localStorage.getItem('memome_gh_gist_id');
    
    if (!pat) {
        alert('設定から GitHub PAT を入力してください。');
        elModal.classList.remove('hidden');
        return;
    }
    
    const btnSyncOrigHTML = elBtnSync.innerHTML;
    elBtnSync.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" class="spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>';
    
    try {
        // Force save current edits before sync
        await saveCurrentMemo();
        
        const syncData = JSON.stringify(memos);
        const filename = 'memome_data.json';
        const files = {};
        files[filename] = { content: syncData };
        
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${pat}`
        };
        
        if (gistId) {
            // Get current remote state first to handle merge (simplistic: remote wins if newer, but we do full overwrite for simplicity if local is newer)
            // For a robust app, we should merge by memo ID. Let's do a simple merge:
            const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers });
            if (res.ok) {
                const gistData = await res.json();
                const remoteContent = gistData.files[filename]?.content;
                if (remoteContent) {
                    const remoteMemos = JSON.parse(remoteContent);
                    // Merge logic: use whichever is newer per memo
                    const memoMap = new Map();
                    remoteMemos.forEach(m => memoMap.set(m.id, m));
                    
                    let dataChanged = false;
                    memos.forEach(localM => {
                        const remoteM = memoMap.get(localM.id);
                        if (!remoteM || localM.local_updated_at > remoteM.local_updated_at) {
                            // Local is newer or new
                            memoMap.set(localM.id, { ...localM, synced_updated_at: Date.now() });
                            localM.synced_updated_at = Date.now();
                            dataChanged = true;
                        }
                    });
                    
                    // Save merged back to DB
                    const mergedMemos = Array.from(memoMap.values());
                    for (const m of mergedMemos) {
                        await saveMemoDB(m);
                    }
                    memos = mergedMemos;
                    memos.sort((a, b) => b.local_updated_at - a.local_updated_at);
                    
                    // Push merged data
                    const updateRes = await fetch(`https://api.github.com/gists/${gistId}`, {
                        method: 'PATCH',
                        headers,
                        body: JSON.stringify({ files: { [filename]: { content: JSON.stringify(memos) } } })
                    });
                    if (!updateRes.ok) throw new Error('Gistの更新に失敗しました');
                }
            } else {
                throw new Error('Gistの取得に失敗しました。IDが間違っている可能性があります。');
            }
        } else {
            // Create new Gist
            const body = {
                description: 'memome backup',
                public: false,
                files
            };
            const res = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            
            if (!res.ok) throw new Error('Gistの作成に失敗しました');
            const data = await res.json();
            gistId = data.id;
            localStorage.setItem('memome_gh_gist_id', gistId);
            
            // Mark all as synced
            memos.forEach(m => m.synced_updated_at = Date.now());
            for (const m of memos) await saveMemoDB(m);
        }
        
        renderMemoList();
        updateSyncBadge();
        alert('同期が完了しました！');
        
    } catch (err) {
        console.error(err);
        alert(`同期エラー: ${err.message}`);
    } finally {
        elBtnSync.innerHTML = btnSyncOrigHTML;
    }
}

// Utility
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Add simple CSS for spin animation dynamically
const style = document.createElement('style');
style.innerHTML = `
@keyframes spin { 100% { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
`;
document.head.appendChild(style);

// Start
init();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}


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
const elInputRepo = document.getElementById('github-repo');

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
        elInputRepo.value = localStorage.getItem('memome_gh_repo') || '';
        elModal.classList.remove('hidden');
    });
    elBtnCloseSettings.addEventListener('click', () => elModal.classList.add('hidden'));
    elBtnSaveSettings.addEventListener('click', () => {
        localStorage.setItem('memome_gh_pat', elInputPat.value.trim());
        localStorage.setItem('memome_gh_repo', elInputRepo.value.trim());
        elModal.classList.add('hidden');
        alert('設定を保存しました。');
    });
    
    // Sync
    elBtnSync.addEventListener('click', syncWithGitHub);
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

// --- GitHub Repo Sync Logic ---
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

// UTF-8対応のBase64エンコード/デコード
function utf8_to_b64(str) {
    return window.btoa(unescape(encodeURIComponent(str)));
}
function b64_to_utf8(str) {
    return decodeURIComponent(escape(window.atob(str)));
}

async function syncWithGitHub() {
    const pat = localStorage.getItem('memome_gh_pat');
    const repo = localStorage.getItem('memome_gh_repo');
    
    if (!pat || !repo) {
        alert('設定から GitHub PAT と リポジトリ名 を入力してください。');
        elModal.classList.remove('hidden');
        return;
    }
    
    const btnSyncOrigHTML = elBtnSync.innerHTML;
    elBtnSync.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" class="spin"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>';
    
    try {
        // 現在の編集内容を確実に保存
        await saveCurrentMemo();
        
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${pat}`
        };
        
        // 1. リモートのファイル一覧を取得 (shaを取得するため)
        let remoteFiles = [];
        const listRes = await fetch(`https://api.github.com/repos/${repo}/contents/`, { headers });
        if (listRes.ok) {
            remoteFiles = await listRes.json();
            if (!Array.isArray(remoteFiles)) {
                remoteFiles = []; 
            }
        } else if (listRes.status !== 404) { // 404は空リポジトリ等の可能性
            throw new Error(`リポジトリ情報の取得に失敗しました (${listRes.status})`);
        }

        const remoteFileMap = new Map();
        remoteFiles.forEach(f => {
            if (f.name.endsWith('.json')) {
                remoteFileMap.set(f.name, f);
            }
        });

        // 2. ダウンロード＆マージフェーズ
        let dataChanged = false;
        const memoMap = new Map();
        memos.forEach(m => memoMap.set(m.id, m));

        for (const [filename, fileInfo] of remoteFileMap.entries()) {
            const memoId = filename.replace('.json', '');
            const localM = memoMap.get(memoId);
            
            // 内容を取得して更新日時を比較
            const fileRes = await fetch(fileInfo.url, { headers });
            if (!fileRes.ok) continue;
            
            const fileData = await fileRes.json();
            if (fileData.encoding === 'base64' && fileData.content) {
                try {
                    const remoteMemo = JSON.parse(b64_to_utf8(fileData.content));
                    if (!localM || remoteMemo.local_updated_at > localM.local_updated_at) {
                        // リモートの方が新しいか、ローカルに存在しない場合
                        remoteMemo.synced_updated_at = Date.now();
                        memoMap.set(remoteMemo.id, remoteMemo);
                        await saveMemoDB(remoteMemo);
                        dataChanged = true;
                    }
                } catch (e) {
                    console.error('Failed to parse remote memo', filename, e);
                }
            }
        }

        if (dataChanged) {
            memos = Array.from(memoMap.values());
            memos.sort((a, b) => b.local_updated_at - a.local_updated_at);
        }

        // 3. アップロードフェーズ
        for (const localM of memos) {
            if (localM.local_updated_at > localM.synced_updated_at) {
                const filename = `${localM.id}.json`;
                const contentStr = JSON.stringify(localM, null, 2);
                const b64Content = utf8_to_b64(contentStr);
                
                const body = {
                    message: `Update memo ${localM.id}`,
                    content: b64Content
                };
                
                // 既存ファイルの上書きにはshaが必要
                if (remoteFileMap.has(filename)) {
                    body.sha = remoteFileMap.get(filename).sha;
                }
                
                const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filename}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(body)
                });
                
                if (putRes.ok) {
                    localM.synced_updated_at = Date.now();
                    await saveMemoDB(localM);
                } else {
                    console.error(`Failed to upload ${filename}`, await putRes.text());
                }
            }
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


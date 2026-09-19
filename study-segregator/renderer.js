const { ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// State Management
let currentLibraryPath = '';
let activeCategory = '';
let currentSubPath = ''; // Relative path inside activeCategory (e.g. "Unit 1" or "")
let categories = [];
let fileOperationMode = 'move'; // 'move' or 'copy'
let searchQuery = '';
let currentViewMode = 'grid'; // 'grid' or 'graph'
const expandedFolders = new Set(); // Tracks expanded folder paths in tree

// DOM Elements
const libraryPathEl = document.getElementById('library-path');
const changeLibraryBtn = document.getElementById('change-library-btn');
const categoryTreeEl = document.getElementById('category-tree');
const addSubjectBtn = document.getElementById('add-subject-btn');
const addSubjectModal = document.getElementById('add-subject-modal');
const newSubjectInput = document.getElementById('new-subject-input');
const confirmAddSubjectBtn = document.getElementById('confirm-add-subject');
const cancelAddSubjectBtn = document.getElementById('cancel-add-subject');

const navBackBtn = document.getElementById('nav-back-btn');
const activeCategoryTitle = document.getElementById('active-category-title');
const activeCategoryPath = document.getElementById('active-category-path');
const openFolderBtn = document.getElementById('open-folder-btn');
const filesCountBadge = document.getElementById('files-count-badge');

const dropZone = document.getElementById('drop-zone');
const browseFilesBtn = document.getElementById('browse-files-btn');
const modeToggleBtn = document.getElementById('mode-toggle-btn');
const targetCategorySelect = document.getElementById('target-category-select');

const viewGridBtn = document.getElementById('view-grid-btn');
const viewGraphBtn = document.getElementById('view-graph-btn');
const filesContainer = document.getElementById('files-container');
const graphContainer = document.getElementById('graph-container');

const newSubfolderBtn = document.getElementById('new-subfolder-btn');
const addSubfolderModal = document.getElementById('add-subfolder-modal');
const newSubfolderInput = document.getElementById('new-subfolder-input');
const confirmAddSubfolderBtn = document.getElementById('confirm-add-subfolder');
const cancelAddSubfolderBtn = document.getElementById('cancel-add-subfolder');

const searchInput = document.getElementById('search-input');
const filesGrid = document.getElementById('files-grid');
const emptyState = document.getElementById('empty-state');
const toastContainer = document.getElementById('toast-container');

// Initialize App
function init() {
    // 1. Resolve Library Path
    const savedPath = localStorage.getItem('study_library_path');
    if (savedPath && fs.existsSync(savedPath)) {
        currentLibraryPath = savedPath;
    } else {
        currentLibraryPath = path.join(os.homedir(), 'Documents', 'StudySegregator_Library');
        localStorage.setItem('study_library_path', currentLibraryPath);
    }

    if (!fs.existsSync(currentLibraryPath)) {
        try {
            fs.mkdirSync(currentLibraryPath, { recursive: true });
        } catch (err) {
            console.error('Failed to create base library directory:', err);
        }
    }

    // 2. Load mode
    const savedMode = localStorage.getItem('study_file_mode');
    if (savedMode === 'copy' || savedMode === 'move') {
        fileOperationMode = savedMode;
    }
    updateModeButton();

    // 3. Setup Default Categories if folder is empty
    ensureDefaultCategories();

    // 4. Load Categories & Render
    refreshCategories();

    // 5. Setup Listeners
    setupEventListeners();

    // 6. Connect Graph Navigation Callback
    window.onGraphNavigateFolder = function(folderFullPath) {
        if (!activeCategory) return;
        const baseCatDir = path.join(currentLibraryPath, activeCategory);
        const rel = path.relative(baseCatDir, folderFullPath);
        currentSubPath = (rel === '.' || rel === '') ? '' : rel;
        switchViewMode('grid');
        renderActiveCategoryView();
    };
}

function ensureDefaultCategories() {
    try {
        const existing = fs.readdirSync(currentLibraryPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);

        if (existing.length === 0) {
            const defaults = ['Computer Networks', 'Operating Systems', 'Mathematics', 'Machine Learning'];
            defaults.forEach(cat => {
                const catDir = path.join(currentLibraryPath, cat);
                if (!fs.existsSync(catDir)) {
                    fs.mkdirSync(catDir, { recursive: true });
                }
            });
        }
    } catch (err) {
        console.error('Error ensuring default categories:', err);
    }
}

function refreshCategories() {
    try {
        if (!fs.existsSync(currentLibraryPath)) {
            fs.mkdirSync(currentLibraryPath, { recursive: true });
        }

        const entries = fs.readdirSync(currentLibraryPath, { withFileTypes: true });
        categories = entries
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));

        if (!activeCategory || !categories.includes(activeCategory)) {
            activeCategory = categories.length > 0 ? categories[0] : '';
            currentSubPath = '';
        }

        renderCategoryTree();
        renderTargetCategoryDropdown();
        renderActiveCategoryView();
    } catch (err) {
        showToast('Error reading directory: ' + err.message, 'error');
    }
}

function getDirectoryItemStats(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return { count: 0, subfolders: [] };
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const subfolders = entries.filter(e => e.isDirectory()).map(e => e.name);
        return { count: entries.length, subfolders };
    } catch (e) {
        return { count: 0, subfolders: [] };
    }
}

// Render Expandable Nested Category Tree in Sidebar
function renderCategoryTree() {
    libraryPathEl.textContent = currentLibraryPath;
    libraryPathEl.title = currentLibraryPath;
    categoryTreeEl.innerHTML = '';

    categories.forEach(cat => {
        const catPath = path.join(currentLibraryPath, cat);
        const nodeEl = buildTreeNode(cat, catPath, '', 0);
        categoryTreeEl.appendChild(nodeEl);
    });
}

function buildTreeNode(name, fullPath, relPath, level) {
    const stats = getDirectoryItemStats(fullPath);
    const hasSubfolders = stats.subfolders.length > 0;
    const isExpanded = expandedFolders.has(fullPath);
    const isCurrentActive = (activeCategory === (level === 0 ? name : activeCategory)) &&
                            (currentSubPath === relPath);

    const li = document.createElement('li');
    li.className = 'tree-node';

    const row = document.createElement('div');
    row.className = 'tree-node-row' + (isCurrentActive ? ' active' : '');
    row.dataset.path = fullPath;
    row.dataset.rel = relPath;
    row.style.paddingLeft = `${10 + level * 12}px`;

    row.innerHTML = `
        <div class="tree-node-left">
            <span class="tree-chevron ${hasSubfolders ? (isExpanded ? 'expanded' : '') : 'leaf'}">▶</span>
            <span class="tree-icon">${level === 0 ? '📁' : '📂'}</span>
            <span class="tree-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
        </div>
        <span class="tree-badge">${stats.count}</span>
    `;

    // Toggle chevron click
    const chevronEl = row.querySelector('.tree-chevron');
    chevronEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!hasSubfolders) return;
        if (expandedFolders.has(fullPath)) {
            expandedFolders.delete(fullPath);
        } else {
            expandedFolders.add(fullPath);
        }
        renderCategoryTree();
    });

    // Row selection click
    row.addEventListener('click', () => {
        if (level === 0) {
            activeCategory = name;
            currentSubPath = '';
        } else {
            currentSubPath = relPath;
        }
        renderCategoryTree();
        renderTargetCategoryDropdown();
        renderActiveCategoryView();
    });

    // Drag & Drop directly onto this specific tree node
    row.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.add('drag-hover');
    });

    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = (fileOperationMode === 'move') ? 'move' : 'copy';
        }
        row.classList.add('drag-hover');
    });

    row.addEventListener('dragleave', (e) => {
        e.preventDefault();
        row.classList.remove('drag-hover');
    });

    row.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('drag-hover');
        const paths = extractFilePaths(e.dataTransfer);
        if (paths.length > 0) {
            segregateFilesToPath(paths, fullPath, name);
        }
    });

    li.appendChild(row);

    // Render Children if expanded
    if (hasSubfolders) {
        const subUl = document.createElement('ul');
        subUl.className = 'tree-sub-list' + (isExpanded ? '' : ' collapsed');
        stats.subfolders.forEach(subName => {
            const childFull = path.join(fullPath, subName);
            const childRel = relPath ? path.join(relPath, subName) : subName;
            const childNode = buildTreeNode(subName, childFull, childRel, level + 1);
            subUl.appendChild(childNode);
        });
        li.appendChild(subUl);
    }

    return li;
}

function renderTargetCategoryDropdown() {
    targetCategorySelect.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (cat === activeCategory) opt.selected = true;
        targetCategorySelect.appendChild(opt);
    });
}

function getCurrentViewingDirectory() {
    if (!activeCategory) return currentLibraryPath;
    return currentSubPath
        ? path.join(currentLibraryPath, activeCategory, currentSubPath)
        : path.join(currentLibraryPath, activeCategory);
}

function switchViewMode(mode) {
    currentViewMode = mode;
    if (mode === 'grid') {
        viewGridBtn.classList.add('active');
        viewGraphBtn.classList.remove('active');
        filesContainer.classList.remove('hidden');
        graphContainer.classList.add('hidden');
    } else {
        viewGridBtn.classList.remove('active');
        viewGraphBtn.classList.add('active');
        filesContainer.classList.add('hidden');
        graphContainer.classList.remove('hidden');
        triggerGraphRender();
    }
}

function triggerGraphRender() {
    if (!activeCategory || !window.renderKnowledgeGraph) return;
    const catBase = path.join(currentLibraryPath, activeCategory);
    window.renderKnowledgeGraph(activeCategory, catBase);
}

function renderActiveCategoryView() {
    if (!activeCategory) {
        activeCategoryTitle.textContent = 'No Subject Selected';
        activeCategoryPath.textContent = '';
        filesCountBadge.textContent = '0 items';
        navBackBtn.classList.add('hidden');
        filesGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    const currentDir = getCurrentViewingDirectory();

    // Configure Header & Breadcrumbs
    if (currentSubPath) {
        navBackBtn.classList.remove('hidden');
        activeCategoryTitle.textContent = path.basename(currentDir);
        const subDisplay = currentSubPath.replace(/\\/g, ' / ');
        activeCategoryPath.innerHTML = `<strong>${escapeHtml(activeCategory)}</strong> / ${escapeHtml(subDisplay)}`;
    } else {
        navBackBtn.classList.add('hidden');
        activeCategoryTitle.textContent = activeCategory;
        activeCategoryPath.textContent = currentDir;
    }
    activeCategoryPath.title = currentDir;

    let items = [];
    try {
        if (fs.existsSync(currentDir)) {
            const rawEntries = fs.readdirSync(currentDir, { withFileTypes: true });
            items = rawEntries.map(ent => {
                const full = path.join(currentDir, ent.name);
                const isDir = ent.isDirectory();
                let size = 0;
                let mtime = new Date();
                let subItemCount = 0;

                try {
                    const stat = fs.statSync(full);
                    size = stat.size;
                    mtime = stat.mtime;
                    if (isDir) {
                        subItemCount = fs.readdirSync(full).length;
                    }
                } catch (e) {}

                return {
                    name: ent.name,
                    fullPath: full,
                    isDir,
                    subItemCount,
                    size,
                    mtime,
                    ext: isDir ? '' : path.extname(ent.name).toLowerCase()
                };
            });

            // Sort: folders first (alphabetical), then files (most recent first)
            items.sort((a, b) => {
                if (a.isDir && !b.isDir) return -1;
                if (!a.isDir && b.isDir) return 1;
                if (a.isDir && b.isDir) return a.name.localeCompare(b.name);
                return b.mtime - a.mtime;
            });
        }
    } catch (err) {
        console.error('Error reading directory entries:', err);
    }

    const folderCount = items.filter(i => i.isDir).length;
    const fileCount = items.filter(i => !i.isDir).length;

    let badgeText = '';
    if (folderCount > 0 && fileCount > 0) {
        badgeText = `${folderCount} folder${folderCount === 1 ? '' : 's'}, ${fileCount} file${fileCount === 1 ? '' : 's'}`;
    } else if (folderCount > 0) {
        badgeText = `${folderCount} folder${folderCount === 1 ? '' : 's'}`;
    } else {
        badgeText = `${fileCount} file${fileCount === 1 ? '' : 's'}`;
    }
    filesCountBadge.textContent = badgeText;

    // Filter by search query if any
    const filtered = searchQuery.trim()
        ? items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : items;

    if (filtered.length === 0) {
        filesGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        if (searchQuery.trim()) {
            emptyState.querySelector('.empty-title').textContent = 'No matching items';
            emptyState.querySelector('.empty-desc').textContent = `No files or folders matching "${searchQuery}".`;
        } else {
            emptyState.querySelector('.empty-title').textContent = 'This folder is empty';
            emptyState.querySelector('.empty-desc').textContent = 'Drop notes, PDFs, code or entire folders above to segregate them.';
        }
    } else {
        emptyState.classList.add('hidden');
        renderItemCards(filtered);
    }

    // Refresh Graph if currently in graph view
    if (currentViewMode === 'graph') {
        triggerGraphRender();
    }
}

function renderItemCards(itemList) {
    filesGrid.innerHTML = '';

    itemList.forEach(item => {
        const card = document.createElement('div');
        card.className = `file-card ${item.isDir ? 'folder-card' : ''}`;

        if (item.isDir) {
            // Folder Card
            card.innerHTML = `
                <div class="file-icon-wrap folder-icon-wrap">
                    📁
                </div>
                <div class="file-info">
                    <div class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        <span class="file-badge-folder">Folder</span>
                        <span class="meta-dot">•</span>
                        <span class="file-size">${item.subItemCount} item${item.subItemCount === 1 ? '' : 's'}</span>
                        <span class="meta-dot">•</span>
                        <span class="file-date">${formatDate(item.mtime)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn open-item-btn" title="Open Folder">
                        <span>Open ↵</span>
                    </button>
                    <button class="action-btn icon-btn reveal-item-btn" title="Show in File Explorer">
                        📂
                    </button>
                    <button class="action-btn icon-btn delete-item-btn" title="Delete Folder">
                        🗑️
                    </button>
                </div>
            `;

            card.querySelector('.open-item-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                navigateToSubfolder(item.name);
            });

            card.addEventListener('dblclick', () => {
                navigateToSubfolder(item.name);
            });

            // Drag and drop directly into this subfolder card!
            card.addEventListener('dragenter', (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.classList.add('drag-hover');
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = (fileOperationMode === 'move') ? 'move' : 'copy';
                }
                card.classList.add('drag-hover');
            });

            card.addEventListener('dragleave', (e) => {
                e.preventDefault();
                card.classList.remove('drag-hover');
            });

            card.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.classList.remove('drag-hover');
                const paths = extractFilePaths(e.dataTransfer);
                if (paths.length > 0) {
                    segregateFilesToPath(paths, item.fullPath, item.name);
                }
            });
        } else {
            // File Card
            const iconData = getFileIconAndColor(item.ext);
            card.innerHTML = `
                <div class="file-icon-wrap" style="background: ${iconData.bg}; color: ${iconData.color};">
                    ${iconData.icon}
                </div>
                <div class="file-info">
                    <div class="file-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                    <div class="file-meta">
                        <span class="file-size">${formatBytes(item.size)}</span>
                        <span class="meta-dot">•</span>
                        <span class="file-date">${formatDate(item.mtime)}</span>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="action-btn open-item-btn" title="Open File">
                        <span>Open</span>
                    </button>
                    <button class="action-btn icon-btn reveal-item-btn" title="Show in File Explorer">
                        📂
                    </button>
                    <button class="action-btn icon-btn delete-item-btn" title="Remove File">
                        🗑️
                    </button>
                </div>
            `;

            card.querySelector('.open-item-btn').addEventListener('click', () => {
                ipcRenderer.invoke('shell:openPath', item.fullPath);
            });

            card.addEventListener('dblclick', () => {
                ipcRenderer.invoke('shell:openPath', item.fullPath);
            });
        }

        // Shared Actions
        card.querySelector('.reveal-item-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            ipcRenderer.invoke('shell:showItemInFolder', item.fullPath);
        });

        card.querySelector('.delete-item-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            handleDeleteItem(item);
        });

        filesGrid.appendChild(card);
    });
}

function navigateToSubfolder(folderName) {
    currentSubPath = currentSubPath ? path.join(currentSubPath, folderName) : folderName;
    renderCategoryTree();
    renderActiveCategoryView();
}

function navigateUpOneDirectory() {
    if (!currentSubPath) return;
    const parent = path.dirname(currentSubPath);
    currentSubPath = (parent === '.' || parent === '/' || parent === '\\') ? '' : parent;
    renderCategoryTree();
    renderActiveCategoryView();
}

function handleDeleteItem(item) {
    const isFolder = item.isDir;
    const promptMsg = isFolder
        ? `Are you sure you want to delete folder "${item.name}" and all contents inside?`
        : `Are you sure you want to delete file "${item.name}"?`;

    if (confirm(promptMsg)) {
        try {
            if (isFolder) {
                fs.rmSync(item.fullPath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(item.fullPath);
            }
            showToast(`Deleted ${item.name}`, 'info');
            refreshCategories();
        } catch (err) {
            showToast(`Failed to delete: ${err.message}`, 'error');
        }
    }
}

// Segregation Logic (Handles both Files AND Folders)
async function segregateFiles(filePaths, targetCategory) {
    if (!filePaths || filePaths.length === 0) return;
    if (!targetCategory) {
        showToast('Please select or create a subject first.', 'error');
        return;
    }

    const targetDir = (targetCategory === activeCategory && currentSubPath)
        ? path.join(currentLibraryPath, activeCategory, currentSubPath)
        : path.join(currentLibraryPath, targetCategory);

    const displayName = (targetCategory === activeCategory && currentSubPath)
        ? `${activeCategory} / ${currentSubPath}`
        : targetCategory;

    await segregateFilesToPath(filePaths, targetDir, displayName);
}

async function segregateFilesToPath(filePaths, targetDir, destinationName) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    let successCount = 0;
    let errors = [];

    for (const srcPath of filePaths) {
        try {
            if (!fs.existsSync(srcPath)) continue;

            const stat = fs.statSync(srcPath);
            const isDirectory = stat.isDirectory();
            const itemName = path.basename(srcPath);
            let destPath = path.join(targetDir, itemName);

            if (fs.existsSync(destPath) && destPath !== srcPath) {
                const parsed = path.parse(itemName);
                let counter = 1;
                while (fs.existsSync(destPath)) {
                    destPath = isDirectory
                        ? path.join(targetDir, `${parsed.name}_(${counter})`)
                        : path.join(targetDir, `${parsed.name}_(${counter})${parsed.ext}`);
                    counter++;
                }
            }

            if (isDirectory) {
                if (fileOperationMode === 'move') {
                    fs.cpSync(srcPath, destPath, { recursive: true });
                    if (srcPath !== destPath) {
                        fs.rmSync(srcPath, { recursive: true, force: true });
                    }
                } else {
                    fs.cpSync(srcPath, destPath, { recursive: true });
                }
            } else {
                if (fileOperationMode === 'move') {
                    fs.copyFileSync(srcPath, destPath);
                    if (srcPath !== destPath) {
                        fs.unlinkSync(srcPath);
                    }
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }

            successCount++;
        } catch (err) {
            errors.push(`${path.basename(srcPath)}: ${err.message}`);
        }
    }

    if (successCount > 0) {
        const actionVerb = fileOperationMode === 'move' ? 'Moved' : 'Copied';
        showToast(`${actionVerb} ${successCount} item${successCount > 1 ? 's' : ''} to "${destinationName}"!`, 'success');
        refreshCategories();
    }

    if (errors.length > 0) {
        showToast(`Failed for ${errors.length} item(s)`, 'error');
        console.error('File operation errors:', errors);
    }
}

function extractFilePaths(dataTransfer) {
    const paths = [];
    if (!dataTransfer) return paths;

    if (dataTransfer.files && dataTransfer.files.length > 0) {
        for (let i = 0; i < dataTransfer.files.length; i++) {
            const file = dataTransfer.files[i];
            let p = '';
            try {
                if (webUtils && typeof webUtils.getPathForFile === 'function') {
                    p = webUtils.getPathForFile(file);
                }
            } catch (err) {
                console.warn('webUtils error:', err);
            }
            if (!p && file.path) {
                p = file.path;
            }
            if (p) paths.push(p);
        }
    }

    if (paths.length === 0 && dataTransfer.items && dataTransfer.items.length > 0) {
        for (let i = 0; i < dataTransfer.items.length; i++) {
            const item = dataTransfer.items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    let p = '';
                    try {
                        if (webUtils && typeof webUtils.getPathForFile === 'function') {
                            p = webUtils.getPathForFile(file);
                        }
                    } catch (err) {}
                    if (!p && file.path) p = file.path;
                    if (p) paths.push(p);
                }
            }
        }
    }

    return paths;
}

function updateModeButton() {
    if (fileOperationMode === 'move') {
        modeToggleBtn.innerHTML = `Mode: <strong>Move</strong> (clean up original)`;
        modeToggleBtn.classList.add('mode-move');
        modeToggleBtn.classList.remove('mode-copy');
    } else {
        modeToggleBtn.innerHTML = `Mode: <strong>Copy</strong> (keep original)`;
        modeToggleBtn.classList.add('mode-copy');
        modeToggleBtn.classList.remove('mode-move');
    }
}

// Helpers
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
    return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getFileIconAndColor(ext) {
    switch (ext) {
        case '.pdf':
            return { icon: '📄', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' };
        case '.doc':
        case '.docx':
        case '.txt':
        case '.rtf':
        case '.odt':
            return { icon: '📝', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' };
        case '.ppt':
        case '.pptx':
        case '.key':
            return { icon: '📊', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' };
        case '.xls':
        case '.xlsx':
        case '.csv':
            return { icon: '📈', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' };
        case '.zip':
        case '.rar':
        case '.7z':
        case '.tar':
        case '.gz':
            return { icon: '📦', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)' };
        case '.py':
        case '.js':
        case '.java':
        case '.cpp':
        case '.c':
        case '.html':
        case '.css':
        case '.json':
            return { icon: '💻', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' };
        case '.png':
        case '.jpg':
        case '.jpeg':
        case '.gif':
        case '.webp':
            return { icon: '🖼️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' };
        case '.mp4':
        case '.mkv':
        case '.mov':
            return { icon: '🎬', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' };
        case '.mp3':
        case '.wav':
            return { icon: '🎵', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)' };
        default:
            return { icon: '📄', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' };
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Event Listeners Setup
function setupEventListeners() {
    // View Switcher (Grid vs Graph)
    viewGridBtn.addEventListener('click', () => switchViewMode('grid'));
    viewGraphBtn.addEventListener('click', () => switchViewMode('graph'));

    // Change base library path
    changeLibraryBtn.addEventListener('click', async () => {
        const newPath = await ipcRenderer.invoke('dialog:selectDirectory', currentLibraryPath);
        if (newPath && newPath !== currentLibraryPath) {
            currentLibraryPath = newPath;
            currentSubPath = '';
            localStorage.setItem('study_library_path', currentLibraryPath);
            showToast('Library location updated!', 'success');
            refreshCategories();
        }
    });

    // Back Navigation Button
    navBackBtn.addEventListener('click', () => {
        navigateUpOneDirectory();
    });

    // Open active directory in Windows Explorer
    openFolderBtn.addEventListener('click', () => {
        const currentDir = getCurrentViewingDirectory();
        if (currentDir && fs.existsSync(currentDir)) {
            ipcRenderer.invoke('shell:openPath', currentDir);
        }
    });

    // Browse files via native dialog
    browseFilesBtn.addEventListener('click', async () => {
        const selectedPaths = await ipcRenderer.invoke('dialog:openFiles');
        if (selectedPaths && selectedPaths.length > 0) {
            const target = targetCategorySelect.value || activeCategory;
            segregateFiles(selectedPaths, target);
        }
    });

    // Toggle Move vs Copy mode
    modeToggleBtn.addEventListener('click', () => {
        fileOperationMode = fileOperationMode === 'move' ? 'copy' : 'move';
        localStorage.setItem('study_file_mode', fileOperationMode);
        updateModeButton();
        showToast(`Files will now be ${fileOperationMode === 'move' ? 'moved (cleaning source)' : 'copied (preserving source)'}.`, 'info');
    });

    // Drag and Drop on main dropZone
    dropZone.addEventListener('click', async () => {
        const selectedPaths = await ipcRenderer.invoke('dialog:openFiles');
        if (selectedPaths && selectedPaths.length > 0) {
            const target = targetCategorySelect.value || activeCategory;
            segregateFiles(selectedPaths, target);
        }
    });

    dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = (fileOperationMode === 'move') ? 'move' : 'copy';
        }
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const target = targetCategorySelect.value || activeCategory;
        const paths = extractFilePaths(e.dataTransfer);
        if (paths.length > 0) {
            segregateFiles(paths, target);
        } else {
            showToast('No valid files or folders detected in drop.', 'error');
        }
    });

    // Support dropping anywhere on main workspace
    const workspaceEl = document.querySelector('.main-workspace');
    if (workspaceEl) {
        workspaceEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = (fileOperationMode === 'move') ? 'move' : 'copy';
            }
        });
        workspaceEl.addEventListener('drop', (e) => {
            if (e.target.closest('#drop-zone') || e.target.closest('.tree-node-row') || e.target.closest('.folder-card')) {
                return;
            }
            e.preventDefault();
            const target = targetCategorySelect.value || activeCategory;
            const paths = extractFilePaths(e.dataTransfer);
            if (paths.length > 0) {
                segregateFiles(paths, target);
            }
        });
    }

    // Prevent default window drag/drop behavior
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // Search filter
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderActiveCategoryView();
    });

    // Add Subject Modal Controls
    addSubjectBtn.addEventListener('click', () => {
        addSubjectModal.classList.remove('hidden');
        newSubjectInput.value = '';
        setTimeout(() => newSubjectInput.focus(), 50);
    });

    cancelAddSubjectBtn.addEventListener('click', () => {
        addSubjectModal.classList.add('hidden');
    });

    confirmAddSubjectBtn.addEventListener('click', () => {
        createCategoryFromInput();
    });

    newSubjectInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createCategoryFromInput();
        if (e.key === 'Escape') addSubjectModal.classList.add('hidden');
    });

    // Add Subfolder Modal Controls
    newSubfolderBtn.addEventListener('click', () => {
        if (!activeCategory) {
            showToast('Please select a subject first.', 'error');
            return;
        }
        addSubfolderModal.classList.remove('hidden');
        newSubfolderInput.value = '';
        setTimeout(() => newSubfolderInput.focus(), 50);
    });

    cancelAddSubfolderBtn.addEventListener('click', () => {
        addSubfolderModal.classList.add('hidden');
    });

    confirmAddSubfolderBtn.addEventListener('click', () => {
        createSubfolderFromInput();
    });

    newSubfolderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createSubfolderFromInput();
        if (e.key === 'Escape') addSubfolderModal.classList.add('hidden');
    });

    // Category selector change sync
    targetCategorySelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val && val !== activeCategory) {
            activeCategory = val;
            currentSubPath = '';
            renderCategoryTree();
            renderActiveCategoryView();
        }
    });
}

function createCategoryFromInput() {
    const rawName = newSubjectInput.value.trim();
    if (!rawName) return;

    const sanitized = rawName.replace(/[\\/:*?"<>|]/g, '_');
    const newDir = path.join(currentLibraryPath, sanitized);

    try {
        if (fs.existsSync(newDir)) {
            showToast(`Subject "${sanitized}" already exists.`, 'info');
        } else {
            fs.mkdirSync(newDir, { recursive: true });
            showToast(`Created subject "${sanitized}"!`, 'success');
        }
        activeCategory = sanitized;
        currentSubPath = '';
        addSubjectModal.classList.add('hidden');
        refreshCategories();
    } catch (err) {
        showToast(`Failed to create subject: ${err.message}`, 'error');
    }
}

function createSubfolderFromInput() {
    const rawName = newSubfolderInput.value.trim();
    if (!rawName) return;

    const sanitized = rawName.replace(/[\\/:*?"<>|]/g, '_');
    const currentDir = getCurrentViewingDirectory();
    const newDir = path.join(currentDir, sanitized);

    try {
        if (fs.existsSync(newDir)) {
            showToast(`Folder "${sanitized}" already exists.`, 'info');
        } else {
            fs.mkdirSync(newDir, { recursive: true });
            showToast(`Created folder "${sanitized}"!`, 'success');
        }
        addSubfolderModal.classList.add('hidden');
        renderCategoryTree();
        renderActiveCategoryView();
    } catch (err) {
        showToast(`Failed to create folder: ${err.message}`, 'error');
    }
}

// Start up
document.addEventListener('DOMContentLoaded', init);

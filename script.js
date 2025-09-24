document.addEventListener('DOMContentLoaded', () => {
    const GITHUB_CLIENT_ID = 'Iv23li1NynDwC1eCb484'; 
    const MIN_ANIMATION_TIME = 3000;

    // --- State Global ---
    let accessToken = null;
    let selectedFiles = [];
    let selectedRepo = '';
    let targetFolder = '';
    let filesToExtract = [];
    let isRepoInitiallyEmpty = false;

    const views = {
        login: document.getElementById('login-view'),
        dashboard: document.getElementById('dashboard-view'),
        modalContainer: document.getElementById('modal-container'),
        uploading: document.getElementById('uploading-view'),
    };
    const userElements = { name: document.getElementById('user-name'), avatar: document.getElementById('user-avatar') };
    const buttons = { login: document.getElementById('login-btn'), logout: document.getElementById('logout-btn'), startUpload: document.getElementById('start-upload-btn') };
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileList = document.getElementById('file-list');
    const uploadStatusText = document.getElementById('upload-status-text');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    const showView = (viewName) => {
        Object.values(views).forEach(view => view.classList.add('hidden'));
        if (views[viewName]) views[viewName].classList.remove('hidden');
    };
    
    const showModal = (modalHtml) => {
        views.modalContainer.innerHTML = modalHtml;
        showView('modalContainer');
        const modalCard = views.modalContainer.querySelector('.card');
        if (modalCard) modalCard.classList.add('modal-enter');
    };

    const closeModal = () => {
        const modalCard = views.modalContainer.querySelector('.card');
        if (modalCard) {
            modalCard.classList.remove('modal-enter');
            modalCard.classList.add('modal-leave');
            setTimeout(() => {
                views.modalContainer.innerHTML = '';
                showView('dashboard');
            }, 300);
        } else {
             showView('dashboard');
        }
    };

    const showToast = (message, isError = false) => {
        toastMessage.textContent = message;
        toast.classList.remove('hidden', 'bg-red-500', 'bg-green-500');
        toast.classList.add(isError ? 'bg-red-500' : 'bg-green-500');
        setTimeout(() => toast.classList.add('hidden'), 4000);
    };

    const apiCall = async (endpoint, options = {}) => {
        if (!accessToken) throw new Error("Access token is missing.");
        const headers = { ...options.headers, 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.github.v3+json' };
        const response = await fetch(`https://api.github.com${endpoint}`, { ...options, headers });
        if (!response.ok) {
            if (response.status === 401) handleLogout();
            const errorData = await response.json().catch(() => ({}));
            throw Object.assign(new Error(errorData.message || `GitHub API Error: ${response.status}`), { status: response.status });
        }
        return response.json();
    };

    const handleLogin = () => {
        const redirectUri = `${window.location.origin}/api/callback`;
        const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=repo,user&redirect_uri=${redirectUri}`;
        window.location.href = authUrl;
    };
    
    const handleLogout = () => {
        accessToken = null;
        sessionStorage.removeItem('github_token');
        showView('login');
    };

    const initApp = async () => {
        try {
            const userData = await apiCall('/user');
            userElements.name.textContent = userData.login;
            userElements.avatar.src = userData.avatar_url;
            showView('dashboard');
        } catch (error) {
            handleLogout();
        }
    };

    const handlePageLoad = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenFromRedirect = urlParams.get('token');
        if (tokenFromRedirect) {
            accessToken = tokenFromRedirect;
            sessionStorage.setItem('github_token', accessToken);
            window.history.replaceState({}, document.title, "/");
        } else {
            accessToken = sessionStorage.getItem('github_token');
        }
        if (accessToken) initApp();
        else showView('login');
    };
    
    const handleFileSelection = (files) => {
        selectedFiles = Array.from(files);
        fileList.innerHTML = selectedFiles.map(f => `<p>${f.name} (${(f.size / 1024).toFixed(1)} KB)</p>`).join('');
        buttons.startUpload.disabled = selectedFiles.length === 0;
    };
    
    const openRepoSelection = async () => {
        const repoListModal = `
            <div class="card w-full max-w-lg rounded-2xl border border-gray-700 p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-white">Pilih Repositori Tujuan</h2>
                    <button onclick="window.closeModal()" class="text-gray-400 text-2xl font-bold hover:text-white transition">&times;</button>
                </div>
                <div id="repo-list-modal" class="max-h-80 overflow-y-auto bg-gray-800 rounded-lg p-2 text-sm">
                    <p class="text-gray-400 p-4 text-center">Memuat repositori...</p>
                </div>
            </div>`;
        showModal(repoListModal);
        
        try {
            const repos = await apiCall('/user/repos?sort=pushed&per_page=100');
            const repoListEl = document.getElementById('repo-list-modal');
            repoListEl.innerHTML = repos.length > 0 ? '' : '<p class="text-gray-400 p-4 text-center">Anda tidak memiliki repositori.</p>';
            repos.forEach(repo => {
                const repoEl = document.createElement('div');
                repoEl.className = 'flex items-center p-3 hover:bg-indigo-700 rounded-md cursor-pointer transition';
                repoEl.innerHTML = `<span>${repo.full_name}</span>`;
                repoEl.onclick = () => {
                    selectedRepo = repo.full_name;
                    checkRepoContentAndProceed();
                };
                repoListEl.appendChild(repoEl);
            });
        } catch (error) {
            document.getElementById('repo-list-modal').innerHTML = `<p class="text-red-400 p-4 text-center">Gagal memuat repositori.</p>`;
        }
    };
    
    const checkRepoContentAndProceed = async () => {
        try {
            await apiCall(`/repos/${selectedRepo}/contents`);
            isRepoInitiallyEmpty = false;
        } catch (error) {
            if (error.status === 404) {
                isRepoInitiallyEmpty = true;
            } else {
                showToast(`Error: ${error.message}`, true);
                closeModal();
                return;
            }
        }
        openFileBrowser();
    };

    const openFileBrowser = async (path = '') => {
        const folderIcon = `<svg class="w-5 h-5 mr-3 text-yellow-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>`;
        const fileIcon = `<svg class="w-5 h-5 mr-3 text-gray-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>`;
        const browserModal = `
            <div class="card w-full max-w-lg rounded-2xl border border-gray-700 p-6 shadow-2xl">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-white truncate">Pilih Folder Tujuan di ${selectedRepo}</h2>
                    <button onclick="window.closeModal()" class="text-gray-400 text-2xl font-bold hover:text-white transition">&times;</button>
                </div>
                <div id="breadcrumb-modal" class="bg-gray-800 rounded-md p-2 text-sm text-gray-400 mb-4 whitespace-nowrap overflow-x-auto"></div>
                <div id="file-list-modal" class="max-h-80 overflow-y-auto bg-gray-800 rounded-lg p-2 text-sm">
                    <p class="text-gray-400 p-4 text-center">Memuat konten...</p>
                </div>
                <div class="mt-5 flex gap-3">
                    <button onclick="window.setTargetFolderAndOpenExtractModal('${path}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-md text-sm transition">Pilih Folder Ini</button>
                </div>
            </div>`;
        showModal(browserModal);

        const breadcrumbEl = document.getElementById('breadcrumb-modal');
        breadcrumbEl.innerHTML = `<span class="cursor-pointer hover:text-white" onclick="window.openFileBrowser('')">root</span>`;
        path.split('/').filter(p=>p).reduce((acc, part) => {
            const currentPath = `${acc}/${part}`;
            breadcrumbEl.innerHTML += ` / <span class="cursor-pointer hover:text-white" onclick="window.openFileBrowser('${currentPath.substring(1)}')">${part}</span>`;
            return currentPath;
        }, '');

        const fileListEl = document.getElementById('file-list-modal');
        try {
            const contents = await apiCall(`/repos/${selectedRepo}/contents/${path}`);
            fileListEl.innerHTML = '';
            contents.sort((a, b) => (a.type === b.type) ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
            contents.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = `flex items-center p-2 hover:bg-gray-700 rounded-md transition ${item.type === 'dir' ? 'cursor-pointer' : ''}`;
                itemEl.innerHTML = `${item.type === 'dir' ? folderIcon : fileIcon}<span>${item.name}</span>`;
                if (item.type === 'dir') itemEl.onclick = () => openFileBrowser(item.path);
                fileListEl.appendChild(itemEl);
            });
        } catch (error) {
            fileListEl.innerHTML = `<p class="text-gray-400 p-4 text-center">${error.status === 404 ? 'Folder ini kosong.' : 'Gagal memuat konten.'}</p>`;
        }
    };

    const setTargetFolderAndOpenExtractModal = (folder) => {
        targetFolder = folder;
        openAutoExtractModal();
    };
    
    const openAutoExtractModal = () => {
        filesToExtract = [];
        const zipFiles = selectedFiles.filter(f => f.name.toLowerCase().endsWith('.zip') || f.name.toLowerCase().endsWith('.7z'));
        const fileItemsHtml = zipFiles.length > 0 ? zipFiles.map(file => `
            <div onclick="window.toggleExtractSelection(this, '${file.name}')" class="file-to-extract-item flex items-center p-3 hover:bg-indigo-700 rounded-md cursor-pointer transition">
                <div class="w-5 h-5 mr-3 border-2 border-gray-400 rounded bg-gray-700 flex-shrink-0"></div>
                <span>${file.name}</span>
            </div>`).join('') : '<p class="text-gray-400 p-4 text-center">Tidak ada file kompresi (.zip, .7z) yang ditemukan.</p>';

        showModal(`
            <div class="card w-full max-w-lg rounded-2xl border border-gray-700 p-6 shadow-2xl">
                <h2 class="text-xl font-bold text-white mb-4">Aktifkan Auto Ekstrak?</h2>
                <p class="text-gray-400 text-sm mb-4">Pilih file kompresi untuk diekstrak. File lain akan diupload seperti biasa.</p>
                <div class="max-h-60 overflow-y-auto bg-gray-800 rounded-lg p-2 text-sm">${fileItemsHtml}</div>
                <div class="mt-5 flex gap-3">
                    <button onclick="window.initiateUploadSequence(false)" class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-3 rounded-md text-sm transition">Skip</button>
                    <button id="confirm-extract-btn" onclick="window.initiateUploadSequence(true)" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-md text-sm transition" disabled>Lanjutkan</button>
                </div>
            </div>`);
    };

    const initiateUploadSequence = (shouldExtract) => {
        if (!shouldExtract) filesToExtract = [];
        if (isRepoInitiallyEmpty) showCachePromptModal();
        else startUploadProcess();
    };

    const showCachePromptModal = () => {
        showModal(`
            <div class="card w-full max-w-lg rounded-2xl border border-gray-700 p-8 shadow-2xl text-center">
                 <h2 class="text-2xl font-bold text-white mb-2">Repositori Baru Terdeteksi</h2>
                 <p class="text-gray-400 mb-6">Repositori ini kosong. Buat file "Cache" sebagai pancingan agar upload berhasil?</p>
                 <div class="flex gap-4">
                    <button onclick="window.closeModal()" class="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition">Tidak</button>
                    <button onclick="window.createCache()" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition">Ya, Buat Cache</button>
                 </div>
            </div>`);
    };

    const createCache = async () => {
        showView('uploading');
        uploadStatusText.textContent = "Membuat cache pancingan...";
        try {
            const response = await fetch('/api/create-cache', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ repo: selectedRepo })
            });
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({}));
                 throw new Error(errorData.message || 'Gagal membuat file cache.');
            }
            await response.json();
            showToast('Cache pancingan berhasil dibuat!');
            startUploadProcess();
        } catch (error) {
            showModal(`<div class="card w-full max-w-lg rounded-2xl border border-gray-700 p-8 shadow-2xl text-center"><h2 class="text-2xl font-bold text-white mb-2">Pancingan Cache Gagal</h2><p class="text-gray-400 mb-6">${error.message}</p><a href="/tutorial.html" target="_blank" class="text-indigo-400 hover:text-indigo-300 transition">Lihat Caranya</a></div>`);
        }
    };
    
    const toggleExtractSelection = (element, fileName) => {
        const checkboxDiv = element.querySelector('div');
        if (filesToExtract.includes(fileName)) {
            filesToExtract = filesToExtract.filter(f => f !== fileName);
            element.classList.remove('selected');
            checkboxDiv.innerHTML = '';
        } else {
            filesToExtract.push(fileName);
            element.classList.add('selected');
            checkboxDiv.innerHTML = `<svg class="w-full h-full text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`;
        }
        document.getElementById('confirm-extract-btn').disabled = filesToExtract.length === 0;
    };

    const startUploadProcess = async () => {
        showView('uploading');
        uploadStatusText.textContent = `Mengupload ${selectedFiles.length} file...`;
        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('files', file));
        formData.append('repo', selectedRepo);
        formData.append('folderPath', targetFolder);
        formData.append('extract', JSON.stringify(filesToExtract));

        const uploadPromise = fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData,
        }).then(async res => {
            if (res.ok) return res.json();
            const errorData = await res.json().catch(() => ({ message: 'Gagal memproses respons error dari server.' }));
            return Promise.reject(new Error(errorData.message || 'Terjadi kesalahan saat upload.'));
        });
        
        try {
            await Promise.all([uploadPromise, new Promise(res => setTimeout(res, MIN_ANIMATION_TIME))]);
            showToast('Upload berhasil!');
        } catch (error) {
            showToast(`Error: ${error.message}`, true);
        } finally {
            closeModal();
            fileList.innerHTML = '';
            selectedFiles = [];
            buttons.startUpload.disabled = true;
        }
    };

    Object.assign(window, { closeModal, createCache, toggleExtractSelection, initiateUploadSequence, setTargetFolderAndOpenExtractModal, openFileBrowser });
    
    buttons.login.addEventListener('click', handleLogin);
    buttons.logout.addEventListener('click', handleLogout);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelection(e.target.files));
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500', 'bg-gray-800'); });
    dropZone.addEventListener('dragleave', (e) => e.currentTarget.classList.remove('border-indigo-500', 'bg-gray-800'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('border-indigo-500', 'bg-gray-800');
        handleFileSelection(e.dataTransfer.files);
    });
    buttons.startUpload.addEventListener('click', openRepoSelection);
    
    handlePageLoad();
});

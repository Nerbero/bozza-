import * as THREE from 'https://esm.sh/three';
import { STLLoader } from 'https://esm.sh/three/examples/jsm/loaders/STLLoader.js';
import { OrbitControls } from 'https://esm.sh/three/examples/jsm/controls/OrbitControls.js';

// Stato globale dell'applicazione
const appState = {
    currentTab: 'home',
    activeFile: null,
    zoomLevel: 100,
    history: [],
    historyIndex: -1,
    audioContext: null,
    mediaRecorder: null,
    activeTool: null,
    selectedElement: null,
    fabricCanvas: null,
    wavesurfer: null,
    ffmpeg: null,
    recentFiles: []
};

// Inizializzazione
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    setupEventListeners();
    initializeModules();
    initializeFabricCanvas();
    initializeFFmpeg();
    loadProject();
    loadTheme();
    loadRecentFiles();
    setInterval(() => saveFile({ silent: true }), 30000);
});

function setupUI() {
    // Attiva il tab iniziale
    switchTab('home');

    // Aggiorna lo stato iniziale
    updateStatusBar();
    updateUndoRedoButtons();
}

function setupEventListeners() {
    // Gestione tab
    document.querySelectorAll('.ribbon-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // Pulsanti file
    document.getElementById('new-file').addEventListener('click', newFile);
    document.getElementById('open-file').addEventListener('click', openFile);
    document.getElementById('save-file').addEventListener('click', () => saveFile({ silent: false }));

    // Pulsanti di modifica
    document.getElementById('undo-btn').addEventListener('click', undo);
    document.getElementById('redo-btn').addEventListener('click', redo);

    // Pulsanti media
    document.getElementById('insert-image').addEventListener('click', insertImage);
    document.getElementById('crop-image').addEventListener('click', startCropTool);
    document.getElementById('adjust-image').addEventListener('click', showAdjustPanel);

    // Pulsanti audio
    document.getElementById('import-audio').addEventListener('click', importAudio);
    document.getElementById('record-audio').addEventListener('click', toggleAudioRecording);
    document.getElementById('audio-eq').addEventListener('click', showEqualizer);

    // Pulsanti video
    document.getElementById('import-video').addEventListener('click', importVideo);
    document.getElementById('cut-video').addEventListener('click', startCutTool);

    // Pulsanti CAD
    document.getElementById('import-cad').addEventListener('click', importCAD);
    document.getElementById('measure-cad').addEventListener('click', startMeasureTool);

    // Zoom
    document.getElementById('zoom-in').addEventListener('click', () => adjustZoom(10));
    document.getElementById('zoom-out').addEventListener('click', () => adjustZoom(-10));

    // Drag and drop
    const editorArea = document.getElementById('editor-area');
    editorArea.addEventListener('dragover', handleDragOver);
    editorArea.addEventListener('drop', handleDrop);

    // Context menu
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', () => {
        document.getElementById('context-menu').style.display = 'none';
    });

    // Theme switcher
    document.getElementById('theme-btn').addEventListener('click', toggleTheme);
}

function initializeModules() {
    // Inizializza l'audio context quando l'utente interagisce
    document.body.addEventListener('click', () => {
        if (!appState.audioContext) {
            appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    }, { once: true });
}

function switchTab(tabName) {
    appState.currentTab = tabName;

    // Aggiorna l'UI
    document.querySelectorAll('.ribbon-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    document.querySelectorAll('.ribbon-content').forEach(content => {
        content.classList.toggle('active', content.dataset.content === tabName);
    });
}

function newFile() {
    if (confirm('Vuoi creare un nuovo file? Tutte le modifiche non salvate andranno perse.')) {
        if (appState.wavesurfer) {
            appState.wavesurfer.destroy();
            appState.wavesurfer = null;
        }
        if (appState.fabricCanvas) {
            appState.fabricCanvas.clear();
            document.getElementById('welcome-message').style.display = 'block';
        }
        document.getElementById('content-container').innerHTML = '';
        appState.activeFile = null;
        appState.history = [];
        appState.historyIndex = -1;
        updateStatusBar();
        updatePropertiesPanel(null);
    }
}

function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,audio/*,video/*,.stl,.step,.iges';
    input.onchange = e => {
        if (e.target.files.length) {
            loadFile(e.target.files[0]);
        }
    };
    input.click();
}

function loadFile(file) {
    showLoading(`Caricamento ${file.name}...`);
    appState.activeFile = file;

    const fileType = detectFileType(file.name);

    switch (fileType) {
        case 'image':
            displayImage(file);
            break;
        case 'audio':
            displayAudio(file);
            hideLoading();
            break;
        case 'video':
            displayVideo(file);
            hideLoading();
            break;
        case 'cad':
            displayCAD(file);
            hideLoading();
            break;
        default:
            alert('Formato file non supportato');
            hideLoading();
    }

    updateStatusBar();
    addToHistory(`Caricato file: ${file.name}`);
    addRecentFile(file.name);
}

function detectFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi'];
    const cadExts = ['stl', 'step', 'iges'];

    if (imageExts.includes(ext)) return 'image';
    if (audioExts.includes(ext)) return 'audio';
    if (videoExts.includes(ext)) return 'video';
    if (cadExts.includes(ext)) return 'cad';
    return 'unknown';
}

function initializeFabricCanvas() {
    appState.fabricCanvas = new fabric.Canvas('editor-canvas');

    function resizeCanvas() {
        const container = document.getElementById('content-container');
        appState.fabricCanvas.setWidth(container.offsetWidth);
        appState.fabricCanvas.setHeight(container.offsetHeight);
        appState.fabricCanvas.renderAll();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    appState.fabricCanvas.on('selection:created', (e) => {
        appState.selectedElement = e.target;
        updatePropertiesPanel(e.target);
    });

    appState.fabricCanvas.on('selection:updated', (e) => {
        appState.selectedElement = e.target;
        updatePropertiesPanel(e.target);
    });

    appState.fabricCanvas.on('selection:cleared', () => {
        appState.selectedElement = null;
        updatePropertiesPanel(null);
    });
}

function displayImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
        fabric.Image.fromURL(e.target.result, (img) => {
            appState.fabricCanvas.clear();
            appState.fabricCanvas.add(img);
            appState.fabricCanvas.centerObject(img);
            img.scaleToWidth(appState.fabricCanvas.getWidth() * 0.8);
            appState.fabricCanvas.renderAll();

            // Hide welcome message
            document.getElementById('welcome-message').style.display = 'none';

            // Setup preview
            setupImagePreview(img.getElement());

            // Select the element
            appState.fabricCanvas.setActiveObject(img);
        });

        hideLoading();
    };
    reader.readAsDataURL(file);
}

function displayAudio(file) {
    const fileUrl = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = fileUrl;

    const container = document.getElementById('content-container');
    container.innerHTML = '';
    container.appendChild(audio);

    // Setup preview e controlli
    setupAudioPreview(fileUrl);

    appState.selectedElement = audio;
    updatePropertiesPanel(audio);
}

function displayVideo(file) {
    const video = document.createElement('video');
    video.controls = true;
    video.src = URL.createObjectURL(file);

    const container = document.getElementById('content-container');
    container.innerHTML = '';
    container.appendChild(video);

    // Setup preview e controlli
    setupVideoPreview(video);

    appState.selectedElement = video;
    updatePropertiesPanel(video);
}

function displayCAD(file) {
    const container = document.getElementById('content-container');
    container.innerHTML = ''; // Clear previous content

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);

    const camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.offsetWidth, container.offsetHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    const loader = new STLLoader();
    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        const geometry = loader.parse(contents);
        const material = new THREE.MeshStandardMaterial({ color: 0x4361ee });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // Center the model
        const box = new THREE.Box3().setFromObject(mesh);
        const center = box.getCenter(new THREE.Vector3());
        mesh.position.sub(center);

        // Zoom to fit
        const size = box.getSize(new THREE.Vector3()).length();
        camera.position.z = size;

        appState.selectedElement = mesh;
        updatePropertiesPanel(mesh);
    };
    reader.readAsArrayBuffer(file);

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    hideLoading();
}

function setupImagePreview(img) {
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = '<h4>Anteprima Immagine</h4>';

    const previewImg = document.createElement('img');
    previewImg.src = img.src;
    previewImg.style.maxWidth = '100%';
    previewContainer.appendChild(previewImg);

    document.getElementById('media-controls').style.display = 'none';
}

function setupAudioPreview(fileUrl) {
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = `
        <h4>Waveform Audio</h4>
        <div id="waveform" style="height: 80px;"></div>
    `;

    if (appState.wavesurfer) {
        appState.wavesurfer.destroy();
    }

    appState.wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: 'violet',
        progressColor: 'purple',
        height: 80,
        barWidth: 2,
        barGap: 1
    });

    appState.wavesurfer.load(fileUrl);

    const controls = document.getElementById('media-controls');
    controls.style.display = 'flex';
    controls.querySelector('#play-btn').onclick = () => appState.wavesurfer.play();
    controls.querySelector('#pause-btn').onclick = () => appState.wavesurfer.pause();
    controls.querySelector('#stop-btn').onclick = () => appState.wavesurfer.stop();
}

function setupVideoPreview(video) {
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = `
        <h4>Timeline Video</h4>
        <div style="height: 60px; background: #334155; position: relative;">
            <div style="position: absolute; top: 0; left: 0; height: 100%; width: 30%; background: #4361ee;"></div>
        </div>
        <p>${video.src.substring(video.src.lastIndexOf('/') + 1)}</p>
    `;

    const controls = document.getElementById('media-controls');
    controls.style.display = 'flex';
    controls.querySelector('#play-btn').onclick = () => video.play();
    controls.querySelector('#pause-btn').onclick = () => video.pause();
    controls.querySelector('#stop-btn').onclick = () => {
        video.pause();
        video.currentTime = 0;
    };
}

function setupCADPreview(canvas) {
    const previewContainer = document.getElementById('preview-container');
    previewContainer.innerHTML = `
        <h4>Vista 3D</h4>
        <canvas width="200" height="150" style="background: #eee;"></canvas>
    `;

    // Copia il modello ridimensionato
    const previewCtx = previewContainer.querySelector('canvas').getContext('2d');
    drawWireframeCube(previewCtx, 200, 150);

    document.getElementById('media-controls').style.display = 'none';
}

function updatePropertiesPanel(element) {
    const propsContainer = document.getElementById('properties-container');
    let content = '';

    if (!element) {
        content = '<p style="padding: 8px; color: var(--text-color-secondary);">Nessun elemento selezionato</p>';
    } else if (element.type === 'image' && appState.fabricCanvas.contains(element)) {
        content = `
            <h3 style="font-size: 13px; margin-bottom: 10px;">Proprietà Immagine</h3>
            <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px; align-items: center;">
                <div>Larghezza:</div>
                <span class="property-value">${Math.round(element.getScaledWidth())}px</span>
                <div>Altezza:</div>
                <span class="property-value">${Math.round(element.getScaledHeight())}px</span>
                <div>Angolo:</div>
                <span class="property-value">${Math.round(element.angle)}°</span>
                <div>Formato:</div>
                <span class="property-value">${appState.activeFile.name.split('.').pop().toUpperCase()}</span>
            </div>
        `;
    } else if (element.tagName === 'AUDIO') {
        content = `
            <h3 style="font-size: 13px; margin-bottom: 10px;">Proprietà Audio</h3>
            <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px; align-items: center;">
                <div>Durata:</div>
                <span class="property-value">${element.duration.toFixed(2)}s</span>
                <div>Formato:</div>
                <span class="property-value">${appState.activeFile.name.split('.').pop().toUpperCase()}</span>
            </div>
        `;
    } else if (element.tagName === 'VIDEO') {
        content = `
            <h3 style="font-size: 13px; margin-bottom: 10px;">Proprietà Video</h3>
            <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px; align-items: center;">
                <div>Risoluzione:</div>
                <span class="property-value">${element.videoWidth}x${element.videoHeight}</span>
                <div>Durata:</div>
                <span class="property-value">${element.duration.toFixed(2)}s</span>
                <div>Formato:</div>
                <span class="property-value">${appState.activeFile.name.split('.').pop().toUpperCase()}</span>
            </div>
        `;
    } else if (element instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(element);
        const size = box.getSize(new THREE.Vector3());
        content = `
            <h3 style="font-size: 13px; margin-bottom: 10px;">Proprietà CAD</h3>
            <div style="display: grid; grid-template-columns: 80px 1fr; gap: 8px; font-size: 12px; align-items: center;">
                <div>Dimensioni:</div>
                <span class="property-value">${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}</span>
                <div>Formato:</div>
                <span class="property-value">${appState.activeFile.name.split('.').pop().toUpperCase()}</span>
            </div>
        `;
    }
    propsContainer.innerHTML = content;
}

function showLoading(message) {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = message;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function updateStatusBar() {
    document.getElementById('file-info').textContent =
        appState.activeFile ? appState.activeFile.name : 'Nessun file aperto';

    if (appState.selectedElement) {
        let type = '';
        if (appState.selectedElement.tagName === 'IMG') type = 'Immagine';
        else if (appState.selectedElement.tagName === 'AUDIO') type = 'Audio';
        else if (appState.selectedElement.tagName === 'VIDEO') type = 'Video';
        else if (appState.selectedElement.id === 'cad-canvas') type = 'Modello CAD';

        document.getElementById('selection-info').textContent = type;
    } else {
        document.getElementById('selection-info').textContent = 'Nessuna selezione';
    }

    document.getElementById('zoom-level').textContent = `${appState.zoomLevel}%`;
}

function adjustZoom(amount) {
    appState.zoomLevel = Math.max(50, Math.min(200, appState.zoomLevel + amount));
    document.getElementById('content-container').style.transform = `scale(${appState.zoomLevel / 100})`;
    updateStatusBar();
}

function addToHistory(actionDescription) {
    // Deep clone the current state to prevent issues with object references
    const state = JSON.parse(JSON.stringify({
        content: document.getElementById('content-container').innerHTML,
        activeFile: appState.activeFile ? { name: appState.activeFile.name, type: appState.activeFile.type, size: appState.activeFile.size } : null,
        selectedElement: null, // We can't serialize the element directly, would need a different approach
        description: actionDescription || 'Azione sconosciuta'
    }));

    // If we undo and then make a new action, we want to clear the 'redo' history
    if (appState.historyIndex < appState.history.length - 1) {
        appState.history = appState.history.slice(0, appState.historyIndex + 1);
    }

    appState.history.push(state);
    appState.historyIndex = appState.history.length - 1;

    // Limit history size to prevent memory issues
    if (appState.history.length > 50) {
        appState.history.shift();
        appState.historyIndex--;
    }
    updateUndoRedoButtons();
}

function undo() {
    if (appState.historyIndex > 0) {
        appState.historyIndex--;
        restoreState(appState.history[appState.historyIndex]);
    }
    updateUndoRedoButtons();
}

function redo() {
    if (appState.historyIndex < appState.history.length - 1) {
        appState.historyIndex++;
        restoreState(appState.history[appState.historyIndex]);
    }
    updateUndoRedoButtons();
}

function restoreState(state) {
    appState.activeFile = state.activeFile;
    document.getElementById('content-container').innerHTML = state.content;
    updateStatusBar();
    // After restoring, we might need to re-select the element and re-attach event listeners
    // This is a simplified version.
}

function updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = appState.historyIndex <= 0;
    document.getElementById('redo-btn').disabled = appState.historyIndex >= appState.history.length - 1;
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    document.getElementById('editor-area').style.backgroundColor = 'rgba(67, 97, 238, 0.1)';
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.getElementById('editor-area').style.backgroundColor = '';

    if (e.dataTransfer.files.length) {
        loadFile(e.dataTransfer.files[0]);
    }
}

function handleContextMenu(e) {
    e.preventDefault();

    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.display = 'block';
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
}

// Funzioni specifiche per i tool
function insertImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = e => {
        if (e.target.files.length) {
            displayImage(e.target.files[0]);
        }
    };
    input.click();
}

function startCropTool() {
    if (!appState.selectedElement || appState.selectedElement.tagName !== 'IMG') {
        alert('Seleziona un\'immagine prima di usare lo strumento ritaglio');
        return;
    }

    alert('Strumento ritaglio attivato - Implementazione completa richiederebbe una libreria come Cropper.js');
}

function showAdjustPanel() {
    if (!appState.selectedElement || appState.selectedElement.tagName !== 'IMG') {
        alert('Seleziona un\'immagine prima di regolare');
        return;
    }

    alert('Pannello regolazioni - Implementazione completa richiederebbe WebGL per filtri avanzati');
}

function importAudio() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = e => {
        if (e.target.files.length) {
            displayAudio(e.target.files[0]);
        }
    };
    input.click();
}

function toggleAudioRecording() {
    if (!appState.mediaRecorder) {
        startAudioRecording();
    } else {
        stopAudioRecording();
    }
}

function startAudioRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            appState.mediaRecorder = new MediaRecorder(stream);
            const audioChunks = [];

            appState.mediaRecorder.ondataavailable = e => {
                audioChunks.push(e.data);
            };

            appState.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                displayAudio(audioBlob);
            };

            appState.mediaRecorder.start();
            alert('Registrazione audio iniziata - Clicca di nuovo per fermare');
        })
        .catch(err => {
            console.error('Errore accesso microfono:', err);
            alert('Impossibile accedere al microfono');
        });
}

function stopAudioRecording() {
    if (appState.mediaRecorder) {
        appState.mediaRecorder.stop();
        appState.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        appState.mediaRecorder = null;
    }
}

function showEqualizer() {
    if (!appState.selectedElement || appState.selectedElement.tagName !== 'AUDIO') {
        alert('Seleziona un audio prima di usare l\'equalizzatore');
        return;
    }

    alert('Equalizzatore - Implementazione completa richiederebbe Web Audio API');
}

function importVideo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = e => {
        if (e.target.files.length) {
            displayVideo(e.target.files[0]);
        }
    };
    input.click();
}

async function initializeFFmpeg() {
    const { FFmpeg } = FFmpegWASM;
    appState.ffmpeg = new FFmpeg();
    appState.ffmpeg.on('log', ({ message }) => {
        console.log(message);
    });
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
    showLoading('Caricamento FFmpeg...');
    await appState.ffmpeg.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
    });
    hideLoading();
}

async function startCutTool() {
    if (!appState.selectedElement || appState.selectedElement.tagName !== 'VIDEO') {
        alert('Seleziona un video prima di usare lo strumento taglia');
        return;
    }
    if (!appState.ffmpeg.loaded) {
        alert('FFmpeg non è ancora caricato. Attendi qualche istante e riprova.');
        return;
    }

    showLoading('Taglio del video in corso...');
    const { fetchFile } = FFmpegUtil;
    const inputFileName = 'input.mp4';
    const outputFileName = 'output.mp4';
    await appState.ffmpeg.writeFile(inputFileName, await fetchFile(appState.activeFile));

    // Taglia i primi 5 secondi del video
    await appState.ffmpeg.exec(['-i', inputFileName, '-t', '5', '-c', 'copy', outputFileName]);

    const data = await appState.ffmpeg.readFile(outputFileName);
    const videoURL = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));

    hideLoading();

    const video = document.createElement('video');
    video.controls = true;
    video.src = videoURL;

    const container = document.getElementById('content-container');
    container.innerHTML = '';
    container.appendChild(video);

    // Non è l'ideale, ma per ora sovrascriviamo il file attivo
    appState.activeFile = new File([data.buffer], outputFileName, { type: 'video/mp4' });
    updateStatusBar();
    addToHistory('Video tagliato');
}

function importCAD() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stl,.step,.iges';
    input.onchange = e => {
        if (e.target.files.length) {
            displayCAD(e.target.files[0]);
        }
    };
    input.click();
}

function startMeasureTool() {
    if (!appState.selectedElement || appState.selectedElement.id !== 'cad-canvas') {
        alert('Seleziona un modello CAD prima di usare lo strumento misura');
        return;
    }

    alert('Strumento misura - Implementazione completa richiederebbe Three.js con raycasting');
}

function saveFile(options = { silent: false }) {
    if (!appState.activeFile) {
        if (!options.silent) {
            alert('Nessun file da salvare');
        }
        return;
    }

    const projectData = {
        content: document.getElementById('content-container').innerHTML,
        activeFileName: appState.activeFile.name,
        // In the future, we can save the actual file content here, maybe in IndexedDB
    };

    localStorage.setItem('ultimateMediaEditorProject', JSON.stringify(projectData));

    if (!options.silent) {
        showLoading('Salvataggio in corso...');
        setTimeout(() => {
            hideLoading();
            alert(`Progetto "${projectData.activeFileName}" salvato con successo`);
        }, 500);
    }
}

function loadProject() {
    const savedData = localStorage.getItem('ultimateMediaEditorProject');
    if (savedData) {
        const projectData = JSON.parse(savedData);
        document.getElementById('content-container').innerHTML = projectData.content;
        appState.activeFile = { name: projectData.activeFileName }; // This is a mock file object
        updateStatusBar();
        alert(`Progetto "${projectData.activeFileName}" caricato.`);
    }
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');

    const isDarkMode = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');

    // Update theme button icon
    document.getElementById('theme-btn').textContent = isDarkMode ? '☀️' : '🌙';
}

function loadTheme() {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-btn').textContent = '☀️';
    } else {
        document.body.classList.remove('dark-mode');
        document.getElementById('theme-btn').textContent = '🌙';
    }
}

function addRecentFile(fileName) {
    // Remove if already exists to avoid duplicates and move to top
    appState.recentFiles = appState.recentFiles.filter(f => f !== fileName);
    appState.recentFiles.unshift(fileName);

    // Limit to 5 recent files
    if (appState.recentFiles.length > 5) {
        appState.recentFiles.pop();
    }

    localStorage.setItem('recentFiles', JSON.stringify(appState.recentFiles));
    updateRecentFilesList();
}

function loadRecentFiles() {
    const recentFiles = localStorage.getItem('recentFiles');
    if (recentFiles) {
        appState.recentFiles = JSON.parse(recentFiles);
        updateRecentFilesList();
    }
}

function updateRecentFilesList() {
    const recentFilesContainer = document.querySelector('.sidebar-section:first-child');
    recentFilesContainer.innerHTML = '<h3>File Recenti</h3>';
    appState.recentFiles.forEach(fileName => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';
        item.style.justifyContent = 'space-between';
        item.innerHTML = `
            <span style="display: flex; align-items: center; gap: 5px;">
                <span class="icon">📄</span>
                <span>${fileName}</span>
            </span>
            <button class="delete-recent-btn" data-filename="${fileName}" style="background: none; border: none; color: var(--text-color); cursor: pointer;">×</button>
        `;
        // TODO: Add click handler to open the file
        recentFilesContainer.appendChild(item);
    });

    document.querySelectorAll('.delete-recent-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent the click from bubbling up to the sidebar item
            const fileNameToDelete = e.target.dataset.filename;
            appState.recentFiles = appState.recentFiles.filter(f => f !== fileNameToDelete);
            localStorage.setItem('recentFiles', JSON.stringify(appState.recentFiles));
            updateRecentFilesList();
        });
    });
}


// Utility per gestire il pulsante Esporta
document.getElementById('export-btn').addEventListener('click', () => {
    if (!appState.activeFile) {
        alert('Nessun file da esportare');
        return;
    }

    // This is a placeholder. Real export functionality will be implemented later.
    const type = detectFileType(appState.activeFile.name);
    let message = `Esporta ${appState.activeFile.name}. Opzioni: `;

    switch(type) {
        case 'image':
            message += 'PNG, JPG, PDF';
            break;
        case 'audio':
            message += 'MP3, WAV';
            break;
        case 'video':
            message += 'MP4, GIF';
            break;
        case 'cad':
            message += 'STL, OBJ, PDF';
            break;
        default:
            message += 'PDF';
    }

    alert(message);
});

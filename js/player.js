document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------
    //  Referencias
    // ------------------------------------------------------------------
    const $ = (id) => document.getElementById(id);
    const app = $('app');
    const audio = $('audio-element');
    const playBtn = $('play-pause-btn');
    const playIcon = $('play-icon');
    const prevBtn = $('prev-btn');
    const nextBtn = $('next-btn');
    const rewindBtn = $('rewind-btn');
    const ffBtn = $('fast-forward-btn');
    const progressBox = $('progress-container');
    const progressFill = $('progress-fill');
    const progressUfo = $('progress-ufo');
    const timeCur = $('time-current');
    const timeTot = $('time-total');
    const songTitle = $('song-title');
    const artistName = $('artist-name');
    const volTrack = $('vol-track');
    const volKnob = $('vol-knob');
    const shuffleBtn = $('shuffle-btn');
    const repeatBtn = $('repeat-btn');
    const listBtn = $('list-btn');
    const loadBtn = $('load-btn');
    const folderBtn = $('folder-btn');
    const fileInput = $('file-input');
    const folderInput = $('folder-input');
    const panel = $('playlist-panel');
    const listEl = $('playlist-list');
    const portalWrap = $('portal-wrap');
    const vizCanvas = $('viz');
    const portalCanvas = $('portal-canvas');
    const matrixCanvas = $('matrix');
    const toastEl = $('toast');

    // ------------------------------------------------------------------
    //  Playlist inicial y canciones cargadas por el usuario
    // ------------------------------------------------------------------
    let playlist = [
        { title: 'En Privado', artist: 'Xavi, Manuel Turizo', src: '../Xavi, Manuel Turizo - En Privado (Official Video) - Xavi Oficial.mp3', blob: false }
    ];
    let idx = 0;
    let shuffle = false;
    let repeat = 0;            // 0 = no, 1 = toda la lista, 2 = una canción
    let userTouched = false;   // para no mostrar errores antes de que el usuario interactúe
    let dragging = false;

    // ------------------------------------------------------------------
    //  Utilidades
    // ------------------------------------------------------------------
    const fmt = (t) => {
        if (!isFinite(t)) return '0:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    let toastTimer;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
    }

    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin storage */ } }
    };

    // Onda al tocar cualquier botón de control
    document.querySelectorAll('.control-btn').forEach((b) => {
        b.addEventListener('pointerdown', () => {
            const r = document.createElement('span');
            r.className = 'ripple';
            b.appendChild(r);
            setTimeout(() => r.remove(), 600);
        });
    });

    // ------------------------------------------------------------------
    //  Audio Web API (analizador para que el portal reaccione a la música)
    // ------------------------------------------------------------------
    let ctx = null, analyser = null, freqData = null, realViz = false;

    function ensureAnalyser() {
        if (ctx) return;
        // Con file:// el navegador silencia el audio si se conecta al analizador,
        // salvo que todas las canciones sean archivos cargados (blob:).
        const allowed = location.protocol !== 'file:' || playlist.every((t) => t.blob);
        if (!allowed) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
            const src = ctx.createMediaElementSource(audio);
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.82;
            src.connect(analyser);
            analyser.connect(ctx.destination);
            freqData = new Uint8Array(analyser.frequencyBinCount);
            realViz = true;
        } catch (e) { ctx = null; realViz = false; }
    }

    // ------------------------------------------------------------------
    //  Reproducción
    // ------------------------------------------------------------------
    function renderInfo() {
        const t = playlist[idx];
        songTitle.textContent = t ? t.title : '—';
        songTitle.title = t ? t.title : '';
        artistName.textContent = t ? t.artist : '—';
        document.title = t ? `${t.title} · Angel más Music` : 'Angel más Music';
        renderPlaylist();
        if ('mediaSession' in navigator && t) {
            navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'Angel más Music' });
        }
    }

    function loadTrack(i, autoplay) {
        if (!playlist.length) return;
        idx = (i + playlist.length) % playlist.length;
        const t = playlist[idx];
        audio.src = t.src;
        audio.load();
        progressFill.style.width = '0%';
        progressUfo.style.left = '0%';
        timeCur.textContent = '0:00';
        timeTot.textContent = '0:00';
        renderInfo();
        if (autoplay) play();
    }

    function setPlayingUI(on) {
        app.classList.toggle('is-playing', on);
        playIcon.src = on ? 'assets/btn-pause.png' : 'assets/btn-play.png';
        playBtn.setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
        playBtn.setAttribute('aria-pressed', String(on));
        portalWrap.setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
        portalWrap.setAttribute('aria-pressed', String(on));
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
    }

    function play() {
        userTouched = true;
        if (!playlist.length) { toast('Cargá canciones con ＋ CANCIONES'); return; }
        ensureAnalyser();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        const p = audio.play();
        if (p && p.catch) p.catch((error) => {
            if (error.name === 'AbortError') return;
            setPlayingUI(false);
            toast('No se pudo iniciar la reproducción. Revisá el archivo de audio.');
        });
    }
    function pause() { audio.pause(); }
    function toggle() { audio.paused ? play() : pause(); }

    function pickNext() {
        if (shuffle && playlist.length > 1) {
            let n;
            do { n = Math.floor(Math.random() * playlist.length); } while (n === idx);
            return n;
        }
        return idx + 1;
    }

    function next() { userTouched = true; loadTrack(pickNext(), true); }
    function prev() {
        userTouched = true;
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }   // como los reproductores de verdad
        loadTrack(idx - 1, true);
    }
    function seekBy(s) {
        if (!isFinite(audio.duration)) return;
        audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + s));
    }

    audio.addEventListener('play', () => setPlayingUI(true));
    audio.addEventListener('pause', () => setPlayingUI(false));
    audio.addEventListener('loadedmetadata', () => {
        timeTot.textContent = fmt(audio.duration);
        setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    });
    audio.addEventListener('timeupdate', () => {
        if (dragging) return;
        const d = audio.duration;
        timeCur.textContent = fmt(audio.currentTime);
        if (d) setProgress(audio.currentTime / d);
    });
    audio.addEventListener('ended', () => {
        if (repeat === 2) { audio.currentTime = 0; play(); return; }
        const last = idx === playlist.length - 1;
        if (last && repeat === 0 && !shuffle) { setPlayingUI(false); audio.currentTime = 0; setProgress(0); return; }
        loadTrack(pickNext(), true);
    });
    audio.addEventListener('error', () => {
        setPlayingUI(false);
        if (userTouched) toast('No pude abrir esa canción. Usá ＋ CANCIONES para cargar tus archivos.');
    });

    function setProgress(p) {
        const normalized = Math.max(0, Math.min(1, p));
        const pct = normalized * 100;
        progressFill.style.width = pct + '%';
        progressUfo.style.left = pct + '%';
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const position = dragging ? normalized * duration : audio.currentTime;
        progressBox.setAttribute('aria-valuenow', String(Math.round(pct)));
        progressBox.setAttribute('aria-valuetext', `${fmt(position)} de ${fmt(duration)}`);
        progressBox.setAttribute('aria-disabled', String(duration <= 0));
    }

    // ------------------------------------------------------------------
    //  Botones
    // ------------------------------------------------------------------
    playBtn.addEventListener('click', toggle);
    portalWrap.addEventListener('click', toggle);
    portalWrap.addEventListener('keydown', (e) => {
        if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault();
            toggle();
        }
    });
    nextBtn.addEventListener('click', next);
    prevBtn.addEventListener('click', prev);
    rewindBtn.addEventListener('click', () => seekBy(-5));
    ffBtn.addEventListener('click', () => seekBy(5));

    shuffleBtn.addEventListener('click', () => {
        shuffle = !shuffle;
        shuffleBtn.classList.toggle('on', shuffle);
        shuffleBtn.setAttribute('aria-pressed', String(shuffle));
        toast(shuffle ? 'Aleatorio activado' : 'Aleatorio desactivado');
    });
    repeatBtn.addEventListener('click', () => {
        repeat = (repeat + 1) % 3;
        repeatBtn.classList.toggle('on', repeat > 0);
        repeatBtn.setAttribute('aria-pressed', String(repeat > 0));
        repeatBtn.setAttribute('aria-label', ['Repetición desactivada', 'Repetir lista', 'Repetir canción'][repeat]);
        repeatBtn.textContent = repeat === 2 ? '🔂 REPEAT 1' : '🔁 REPEAT';
        toast(['Repetir: desactivado', 'Repetir toda la lista', 'Repetir esta canción'][repeat]);
    });
    function setPlaylistOpen(open) {
        panel.classList.toggle('open', open);
        panel.setAttribute('aria-hidden', String(!open));
        listBtn.setAttribute('aria-expanded', String(open));
        if (!open && panel.contains(document.activeElement)) listBtn.focus();
    }
    listBtn.addEventListener('click', () => setPlaylistOpen(!panel.classList.contains('open')));
    $('pl-close').addEventListener('click', () => setPlaylistOpen(false));
    loadBtn.addEventListener('click', () => fileInput.click());
    folderBtn.addEventListener('click', () => folderInput.click());

    // ------------------------------------------------------------------
    //  Cargar archivos del equipo
    // ------------------------------------------------------------------
    function addFiles(files) {
        const list = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(f.name));
        if (!list.length) { toast('No encontré archivos de audio'); return; }
        const placeholdersOnly = playlist.every((t) => !t.blob);
        if (placeholdersOnly) playlist = [];        // saca las canciones de ejemplo
        const firstNew = playlist.length;
        list.forEach((f) => {
            const name = f.name.replace(/\.[^.]+$/, '');
            playlist.push({ title: name, artist: 'Archivo local', src: URL.createObjectURL(f), blob: true });
        });
        toast(`${list.length} canción(es) agregada(s)`);
        loadTrack(firstNew, true);
    }
    fileInput.addEventListener('change', (e) => { addFiles(e.target.files); fileInput.value = ''; });
    folderInput.addEventListener('change', (e) => { addFiles(e.target.files); folderInput.value = ''; });

    // Arrastrar y soltar archivos sobre el reproductor
    ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    }));

    function renderPlaylist() {
        listEl.innerHTML = '';
        if (!playlist.length) { listEl.innerHTML = '<li class="pl-empty">Lista vacía — tocá ＋ CANCIONES</li>'; return; }
        playlist.forEach((t, i) => {
            const li = document.createElement('li');
            li.setAttribute('role', 'button');
            li.tabIndex = 0;
            li.setAttribute('aria-current', i === idx ? 'true' : 'false');
            if (i === idx) li.className = 'current';
            li.innerHTML = `<span class="n">${i + 1}</span><span class="t"></span><span class="eq"><i></i><i></i><i></i></span>`;
            li.querySelector('.t').textContent = t.title;
            li.addEventListener('click', () => loadTrack(i, true));
            li.addEventListener('keydown', (e) => {
                if (e.code === 'Enter' || e.code === 'Space') {
                    e.preventDefault();
                    loadTrack(i, true);
                }
            });
            listEl.appendChild(li);
        });
    }

    // ------------------------------------------------------------------
    //  Barra de progreso arrastrable
    // ------------------------------------------------------------------
    function pctFromEvent(e) {
        const r = progressBox.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    }
    progressBox.addEventListener('pointerdown', (e) => {
        dragging = true;
        progressBox.setPointerCapture(e.pointerId);
        const p = pctFromEvent(e);
        setProgress(p);
        if (audio.duration) timeCur.textContent = fmt(p * audio.duration);
    });
    progressBox.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const p = pctFromEvent(e);
        setProgress(p);
        if (audio.duration) timeCur.textContent = fmt(p * audio.duration);
    });
    const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        if (audio.duration) audio.currentTime = pctFromEvent(e) * audio.duration;
    };
    progressBox.addEventListener('pointerup', endDrag);
    progressBox.addEventListener('pointercancel', () => { dragging = false; });
    progressBox.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowRight' || e.code === 'ArrowUp') {
            e.preventDefault();
            seekBy(5);
        } else if (e.code === 'ArrowLeft' || e.code === 'ArrowDown') {
            e.preventDefault();
            seekBy(-5);
        } else if (e.code === 'Home' && Number.isFinite(audio.duration)) {
            e.preventDefault();
            audio.currentTime = 0;
        } else if (e.code === 'End' && Number.isFinite(audio.duration)) {
            e.preventDefault();
            audio.currentTime = audio.duration;
        }
    });

    // ------------------------------------------------------------------
    //  Volumen (nave vertical)
    // ------------------------------------------------------------------
    let volume = store.get('am_volume', 0.8);
    let muted = false;

    function applyVolume() {
        audio.volume = volume;
        audio.muted = muted;
        volTrack.classList.toggle('muted', muted);
        volTrack.setAttribute('aria-valuenow', String(Math.round(volume * 100)));
        volTrack.setAttribute('aria-valuetext', `${Math.round(volume * 100)}%${muted ? ' (silenciado)' : ''}`);
        const h = volTrack.clientHeight;
        const pad = 14;                                    // la nave no se sale de la barra
        const y = pad + (1 - volume) * (h - pad * 2);
        volKnob.style.top = y + 'px';
    }
    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (volume > 0) muted = false;
        store.set('am_volume', volume);
        applyVolume();
    }
    function volFromEvent(e) {
        const r = volTrack.getBoundingClientRect();
        const pad = 14;
        return 1 - (e.clientY - r.top - pad) / (r.height - pad * 2);
    }
    let volDrag = false;
    volTrack.addEventListener('pointerdown', (e) => { volDrag = true; volTrack.classList.add('dragging'); volTrack.setPointerCapture(e.pointerId); setVolume(volFromEvent(e)); });
    volTrack.addEventListener('pointermove', (e) => { if (volDrag) setVolume(volFromEvent(e)); });
    const volEnd = () => { volDrag = false; volTrack.classList.remove('dragging'); };
    volTrack.addEventListener('pointerup', volEnd);
    volTrack.addEventListener('pointercancel', volEnd);
    volTrack.addEventListener('dblclick', () => { muted = !muted; applyVolume(); });
    volTrack.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowUp' || e.code === 'ArrowRight') {
            e.preventDefault();
            setVolume(volume + 0.05);
        } else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') {
            e.preventDefault();
            setVolume(volume - 0.05);
        } else if (e.code === 'Home') {
            e.preventDefault();
            setVolume(0);
        } else if (e.code === 'End') {
            e.preventDefault();
            setVolume(1);
        }
    });
    $('volume-section').addEventListener('wheel', (e) => { e.preventDefault(); setVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05)); }, { passive: false });
    window.addEventListener('resize', applyVolume);

    // ------------------------------------------------------------------
    //  Teclado
    // ------------------------------------------------------------------
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape' && panel.classList.contains('open')) {
            setPlaylistOpen(false);
            return;
        }
        if (e.target instanceof Element && e.target.closest('input, textarea, select, button, [role="button"], [role="slider"], [contenteditable="true"]')) return;
        switch (e.code) {
            case 'Space': e.preventDefault(); toggle(); break;
            case 'ArrowRight': seekBy(5); break;
            case 'ArrowLeft': seekBy(-5); break;
            case 'ArrowUp': e.preventDefault(); setVolume(volume + 0.05); break;
            case 'ArrowDown': e.preventDefault(); setVolume(volume - 0.05); break;
            case 'KeyN': next(); break;
            case 'KeyP': prev(); break;
            case 'KeyM': muted = !muted; applyVolume(); break;
            case 'KeyS': shuffleBtn.click(); break;
            case 'KeyR': repeatBtn.click(); break;
            case 'KeyL': listBtn.click(); break;
        }
    });

    // Controles del sistema (pantalla de bloqueo, teclas multimedia)
    if ('mediaSession' in navigator) {
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', play);
        ms.setActionHandler('pause', pause);
        ms.setActionHandler('previoustrack', prev);
        ms.setActionHandler('nexttrack', next);
        ms.setActionHandler('seekbackward', () => seekBy(-10));
        ms.setActionHandler('seekforward', () => seekBy(10));
    }

    // ------------------------------------------------------------------
    //  Visualizador circular alrededor del portal + efecto "beat"
    // ------------------------------------------------------------------
    const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const vctx = vizCanvas.getContext('2d');
    const BARS = 96;
    const levels = new Float32Array(BARS);
    let beat = 0;

    function sizeViz() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const s = portalWrap.clientWidth;
        vizCanvas.width = vizCanvas.height = Math.round(s * dpr);
        vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function targetLevels(t) {
        const playing = !audio.paused;
        const out = new Float32Array(BARS);
        let bass = 0;
        if (playing && realViz && analyser) {
            analyser.getByteFrequencyData(freqData);
            const half = BARS / 2;
            for (let i = 0; i < half; i++) {
                const v = freqData[Math.floor(i * 0.9) + 1] / 255;
                out[i] = v; out[BARS - 1 - i] = v;       // simétrico
            }
            bass = (freqData[1] + freqData[2] + freqData[3] + freqData[4]) / (4 * 255);
        } else if (playing) {
            // Sin analizador (p. ej. abierto con file://): onda simulada con pulso
            const pulse = Math.pow(Math.max(0, Math.sin(t * 0.0125)), 6);
            const half = BARS / 2;
            for (let i = 0; i < half; i++) {
                const f = i / half;
                const base = 0.35 + 0.3 * Math.sin(t * 0.003 * (1 + i * 0.07) + i);
                const v = Math.max(0, Math.min(1, base * (1 - f * 0.55) + pulse * (1 - f) * 0.55));
                out[i] = v; out[BARS - 1 - i] = v;
            }
            bass = pulse * 0.9;
        } else {
            for (let i = 0; i < BARS; i++) out[i] = 0.07 + 0.035 * Math.sin(t * 0.002 + i * 0.35);   // respiración
        }
        return { out, bass };
    }

    function drawViz(t) {
        const { out, bass } = targetLevels(t);
        beat = Math.max(bass > 0.45 ? (bass - 0.3) * 1.4 : 0, beat * 0.88);
        beat = Math.min(beat, 1);
        document.documentElement.style.setProperty('--beat', beat.toFixed(3));

        const s = portalWrap.clientWidth;
        const c = s / 2;
        const r0 = s * 0.415;
        const maxLen = s * 0.085;
        vctx.clearRect(0, 0, s, s);
        vctx.lineCap = 'round';
        vctx.lineWidth = Math.max(2, s * 0.0085);
        const hueShift = (t * 0.02) % 360;
        for (let i = 0; i < BARS; i++) {
            levels[i] += (out[i] - levels[i]) * 0.35;
            const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
            const len = 3 + levels[i] * maxLen;
            const cos = Math.cos(a), sin = Math.sin(a);
            vctx.strokeStyle = `hsl(${(i / BARS) * 300 + hueShift}, 100%, 60%)`;
            vctx.shadowColor = vctx.strokeStyle;
            vctx.shadowBlur = 8;
            vctx.beginPath();
            vctx.moveTo(c + cos * r0, c + sin * r0);
            vctx.lineTo(c + cos * (r0 + len), c + sin * (r0 + len));
            vctx.stroke();
        }
    }
    window.addEventListener('resize', sizeViz);

    // ------------------------------------------------------------------
    //  Lluvia binaria de fondo
    // ------------------------------------------------------------------
    const mctx = matrixCanvas.getContext('2d');
    const FS = 15;
    let cols = 0, drops = [];
    function sizeMatrix() {
        matrixCanvas.width = app.clientWidth;
        matrixCanvas.height = app.clientHeight;
        cols = Math.ceil(matrixCanvas.width / FS);
        drops = Array.from({ length: cols }, () => Math.random() * -40);
        mctx.font = `${FS}px "Courier New", monospace`;
    }
    window.addEventListener('resize', sizeMatrix);
    let lastM = 0;
    function drawMatrix(t) {
        if (t - lastM < 55) return;
        lastM = t;
        mctx.globalCompositeOperation = 'destination-out';
        mctx.fillStyle = 'rgba(0,0,0,0.16)';
        mctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
        mctx.globalCompositeOperation = 'source-over';
        const speed = audio.paused ? 0.5 : 1 + beat * 1.5;
        for (let i = 0; i < cols; i++) {
            mctx.fillStyle = i % 5 === 0 ? 'rgba(0,255,102,.9)' : 'rgba(0,229,255,.75)';
            mctx.fillText(Math.random() > 0.5 ? '1' : '0', i * FS, drops[i] * FS);
            if (drops[i] * FS > matrixCanvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i] += speed;
        }
    }

    // ------------------------------------------------------------------
    //  Portal animado por frames (reemplaza al antiguo portal-bg.png)
    // ------------------------------------------------------------------
    const PORTAL = {
        dir: 'assets/portal/',
        count: 121,        // frame_000.webp ... frame_120.webp
        ext: 'webp',
        fps: 15,
        idleFps: 5
    };
    const pctx = portalCanvas.getContext('2d');
    const portalFrames = [];
    let portalPos = 0;          // posición fraccionaria dentro de la secuencia
    let portalDirty = true;     // fuerza un redibujado (carga, resize)

    for (let i = 0; i < PORTAL.count; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { portalDirty = true; };
        img.src = `${PORTAL.dir}frame_${String(i).padStart(3, '0')}.${PORTAL.ext}`;
        portalFrames.push(img);
    }

    function sizePortal() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const s = portalCanvas.clientWidth || 300;
        portalCanvas.width = portalCanvas.height = Math.round(s * dpr);
        portalDirty = true;
    }
    window.addEventListener('resize', sizePortal);

    const frameReady = (i) => portalFrames[i] && portalFrames[i].complete && portalFrames[i].naturalWidth > 0;

    function drawPortal(dt, playing) {
        if (!reduceMotion) {
            const fps = playing ? PORTAL.fps * (1 + beat * 1.1) : PORTAL.idleFps;
            portalPos = (portalPos + dt * fps) % PORTAL.count;
            portalDirty = true;
        }
        if (!portalDirty) return;
        portalDirty = false;
        const a = Math.floor(portalPos);
        const b = (a + 1) % PORTAL.count;
        const f = portalPos - a;
        const w = portalCanvas.width;
        pctx.clearRect(0, 0, w, w);
        const first = frameReady(a) ? portalFrames[a] : (frameReady(0) ? portalFrames[0] : null);
        if (!first) return;
        pctx.globalAlpha = 1;
        pctx.drawImage(first, 0, 0, w, w);
        // mezcla suave con el frame siguiente: movimiento fluido aunque la secuencia sea de 15 fps
        if (f > 0.01 && frameReady(b)) {
            pctx.globalAlpha = f;
            pctx.drawImage(portalFrames[b], 0, 0, w, w);
            pctx.globalAlpha = 1;
        }
    }

    // ------------------------------------------------------------------
    //  Bucle de animación
    // ------------------------------------------------------------------
    let lastT = 0;
    function frame(t) {
        const dt = Math.min(0.1, (t - lastT) / 1000 || 0);   // segundos (con tope para no saltar al volver de otra pestaña)
        lastT = t;
        drawViz(t);
        drawPortal(dt, !audio.paused);
        if (!reduceMotion) drawMatrix(t);
        requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------------
    //  Inicio
    // ------------------------------------------------------------------
    volume = Math.max(0, Math.min(1, volume));
    renderInfo();
    loadTrack(0, false);
    sizeViz();
    sizePortal();
    sizeMatrix();
    applyVolume();
    requestAnimationFrame(frame);
});

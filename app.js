/* =============================================================================
   AI Edu Quiz Quest - game engine
   -----------------------------------------------------------------------------
   The file is split into clearly separated modules so question packs and new
   media types can be added without touching unrelated logic:

     1.  Game state
     2.  DOM references
     3.  Generic helpers
     4.  Audio feedback
     5.  Simulation registry   - lifecycle for 3D / 2D scenes
     6.  Media renderers       - illustration, chart, image, video, 3D, 2D
     7.  Question media
     8.  Mini-lesson renderer  - the rich, multi-section hint
     9.  Legacy hint renderer  - backwards compatibility for old packs
     10. Question flow
     11. Timer
     12. Pack loading and setup

   The full question pack format is documented in QUESTION_FORMAT.md.
   ============================================================================= */

/* ----- 1. Game state ------------------------------------------------------- */
let quizData = null;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let helpUsedCount = 0;
let selectedDuration = 600;
let timeRemaining = 600;
let questionTargetSeconds = 60;
let questionElapsedSeconds = 0;
let timerInterval = null;
let audioContext = null;
let helpUsedThisQuestion = false;
let isPaused = false;     // manual pause (Pause button) - shows the pause overlay
let lessonOpen = false;   // a mini-lesson is expanded - timer frozen, no penalty
let gameFinished = false;
let answerLocked = false;

/* ----- 2. DOM references --------------------------------------------------- */
const els = {
    playgroundScreen: document.getElementById("playground-screen"),
    playgroundGrid: document.getElementById("playground-grid"),
    playgroundTitle: document.getElementById("playground-title"),
    playgroundSubtitle: document.getElementById("playground-subtitle"),
    setupScreen: document.getElementById("setup-screen"),
    gameScreen: document.getElementById("game-screen"),
    resultScreen: document.getElementById("result-screen"),
    fileInput: document.getElementById("json-upload"),
    fileStatus: document.getElementById("file-status"),
    packSelect: document.getElementById("pack-select"),
    timeInput: document.getElementById("time-input"),
    timeStatus: document.getElementById("time-status"),
    startBtn: document.getElementById("start-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    resumeBtn: document.getElementById("resume-btn"),
    pauseOverlay: document.getElementById("pause-overlay"),
    quizTitle: document.getElementById("quiz-title-display"),
    timerDisplay: document.getElementById("timer-display"),
    timerState: document.getElementById("timer-state"),
    questionPaceDisplay: document.getElementById("question-pace-display"),
    paceFill: document.getElementById("pace-fill"),
    scoreDisplay: document.getElementById("score-display"),
    helpDisplay: document.getElementById("help-display"),
    progressDisplay: document.getElementById("progress-display"),
    progressBar: document.getElementById("progress-bar"),
    questionCode: document.getElementById("question-code"),
    questionTime: document.getElementById("question-time"),
    questionTimeValue: document.getElementById("question-time-value"),
    questionText: document.getElementById("question-text"),
    mediaStage: document.getElementById("media-stage"),
    mediaRenderer: document.getElementById("media-renderer"),
    canvasWrapper: document.getElementById("canvas-wrapper"),
    inputArea: document.getElementById("input-area"),
    helpBtn: document.getElementById("help-btn"),
    hintBox: document.getElementById("hint-box"),
    feedback: document.getElementById("feedback-message"),
    finalScore: document.getElementById("final-score"),
    finalHelp: document.getElementById("final-help")
};

/* ----- 3. Generic helpers -------------------------------------------------- */
const formatTime = (totalSeconds) => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const min = Math.floor(safeSeconds / 60);
    const sec = safeSeconds % 60;
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
};

const clearElement = (element) => {
    while (element.firstChild) element.removeChild(element.firstChild);
};

const makeEl = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    return element;
};

// Renders a fraction the way it is written on paper: the numerator above a
// horizontal line above the denominator (no slash).
const makeFraction = (numerator, denominator) => {
    const frac = makeEl("span", "frac");
    frac.appendChild(makeEl("span", "frac-num", String(numerator)));
    frac.appendChild(makeEl("span", "frac-den", String(denominator)));
    return frac;
};

// Fills `element` inline with a mix of plain strings and [num, den] fractions,
// e.g. setDetail(el, [[25, 100], "=", [1, 4], "=", "0.25"]).
const setDetail = (element, segments) => {
    clearElement(element);
    segments.forEach((seg) => {
        if (Array.isArray(seg)) element.appendChild(makeFraction(seg[0], seg[1]));
        else element.appendChild(makeEl("span", "detail-text", seg));
    });
};

// Appends `body` (a string or array of strings) as one <p> per paragraph.
const appendParagraphs = (container, body, className) => {
    if (!body) return;
    const paragraphs = Array.isArray(body) ? body : [body];
    paragraphs.forEach((text) => {
        if (text) container.appendChild(makeEl("p", className, text));
    });
};

const getQuestions = () => quizData?.questions || [];

const getQuizTitle = () => quizData?.quizTitle || quizData?.title || "Quiz Quest";

const getSelectedDurationSeconds = () => {
    const minutes = Math.max(1, parseInt(els.timeInput.value, 10) || 10);
    els.timeInput.value = minutes;
    return minutes * 60;
};

// A question may carry `estimatedSeconds` - the suggested time to answer it.
// Returns a positive whole number of seconds, or null when none is set.
const getQuestionEstimate = (question) => {
    const value = Number(question && question.estimatedSeconds);
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
};

// The suggested total play time: the sum of every question's estimate. Returns
// null unless EVERY question has one, so legacy packs keep the manual time.
const getPackEstimateTotal = () => {
    const questions = getQuestions();
    if (!questions.length) return null;
    let total = 0;
    for (const question of questions) {
        const estimate = getQuestionEstimate(question);
        if (estimate === null) return null;
        total += estimate;
    }
    return total;
};

const updateScoreDisplay = () => {
    const totalQuestions = getQuestions().length;
    els.scoreDisplay.textContent = `${correctAnswers}/${totalQuestions}`;
    els.helpDisplay.textContent = `${helpUsedCount}`;
};

const updateTimerState = () => {
    const timerBox = document.querySelector(".timer-box");
    timerBox.classList.remove("warning", "critical", "paused");

    if (isPaused) {
        timerBox.classList.add("paused");
        els.timerState.textContent = "Paused";
        return;
    }

    if (lessonOpen) {
        timerBox.classList.add("paused");
        els.timerState.textContent = "Studying";
        return;
    }

    if (timeRemaining <= 30) {
        timerBox.classList.add("critical");
        els.timerState.textContent = "Final stretch";
    } else if (timeRemaining <= 120) {
        timerBox.classList.add("warning");
        els.timerState.textContent = "Keep moving";
    } else {
        els.timerState.textContent = "On mission";
    }
};

const updatePaceDisplay = () => {
    els.questionPaceDisplay.textContent = `${formatTime(questionElapsedSeconds)} / ${formatTime(questionTargetSeconds)}`;
    const fill = Math.min(100, (questionElapsedSeconds / questionTargetSeconds) * 100);
    els.paceFill.style.width = `${fill}%`;
    document.querySelector(".pace-box").classList.toggle("over-pace", questionElapsedSeconds > questionTargetSeconds);
};

/* ----- 4. Audio feedback --------------------------------------------------- */
const ensureAudioContext = () => {
    if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext && audioContext.state === "suspended") {
        audioContext.resume().catch(() => {});
    }
    return audioContext;
};

const playFeedbackTone = (type) => {
    const context = ensureAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);

    if (type === "correct") {
        const oscA = context.createOscillator();
        const oscB = context.createOscillator();
        oscA.type = "triangle";
        oscB.type = "sine";
        oscA.frequency.setValueAtTime(660, now);
        oscA.frequency.exponentialRampToValueAtTime(990, now + 0.18);
        oscB.frequency.setValueAtTime(880, now);
        oscB.frequency.exponentialRampToValueAtTime(1320, now + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        oscA.connect(gain);
        oscB.connect(gain);
        oscA.start(now);
        oscB.start(now + 0.02);
        oscA.stop(now + 0.35);
        oscB.stop(now + 0.3);
    } else if (type === "wrong") {
        const osc = context.createOscillator();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.28);
        lfo.type = "sine";
        lfo.frequency.setValueAtTime(18, now);
        lfoGain.gain.setValueAtTime(24, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        osc.connect(gain);
        osc.start(now);
        lfo.start(now);
        osc.stop(now + 0.38);
        lfo.stop(now + 0.38);
    } else if (type === "tick") {
        const osc = context.createOscillator();
        osc.type = "square";
        osc.frequency.setValueAtTime(1240, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.08);
    }
};

/* ----- 5. Simulation registry ---------------------------------------------- */
/* 3D (Three.js) and 2D (Matter.js) scenes need to be torn down to free memory.
   A question can show one scene AND its lesson can show several more, so every
   scene returns a "handle" ({ cleanup, pause, resume }) that is tracked here.
   Handles are grouped so the question scene and the lesson scenes can be
   disposed of independently. */
const simulationGroups = { question: [], lesson: [], playground: [] };

const registerSimulation = (group, handle) => {
    if (handle && typeof handle === "object" && simulationGroups[group]) {
        simulationGroups[group].push(handle);
    }
};

const cleanupSimulations = (group) => {
    (simulationGroups[group] || []).forEach((handle) => {
        try {
            if (typeof handle.cleanup === "function") handle.cleanup();
        } catch (error) {
            console.warn("Simulation cleanup failed", error);
        }
    });
    simulationGroups[group] = [];
};

const cleanupAllSimulations = () => {
    cleanupSimulations("question");
    cleanupSimulations("lesson");
};

const pauseSimulations = (group) => {
    (simulationGroups[group] || []).forEach((handle) => {
        try {
            if (typeof handle.pause === "function") handle.pause();
        } catch (error) {
            console.warn("Simulation pause failed", error);
        }
    });
};

const resumeSimulations = (group) => {
    (simulationGroups[group] || []).forEach((handle) => {
        try {
            if (typeof handle.resume === "function") handle.resume();
        } catch (error) {
            console.warn("Simulation resume failed", error);
        }
    });
};

const setPaused = (nextPaused) => {
    if (gameFinished) return;
    isPaused = nextPaused;
    document.body.classList.toggle("is-paused", isPaused);
    els.pauseOverlay.classList.toggle("hidden", !isPaused);
    els.pauseBtn.textContent = isPaused ? "Resume" : "Pause";
    if (isPaused) {
        pauseSimulations("question");
        pauseSimulations("lesson");
    } else {
        resumeSimulations("question");
        resumeSimulations("lesson");
    }
    updateTimerState();
};

/* ----- 6. Media renderers -------------------------------------------------- */
/* Every renderer has the same shape:  render(container, media) -> handle|void
   A renderer that creates a live scene returns a handle; static renderers
   return nothing. New media types are added by writing one renderer function
   and registering it in MEDIA_RENDERERS below. */

const addMediaText = (container, media) => {
    if (media.title) container.appendChild(makeEl("h3", "media-title", media.title));
    if (media.caption) container.appendChild(makeEl("p", "media-caption", media.caption));
};

function renderChart(container, media) {
    const card = makeEl("div", "chart-card");
    addMediaText(card, media);

    const values = Array.isArray(media.values) ? media.values : [];
    const max = Math.max(1, ...values.map((item) => Number(item.value) || 0));
    const bars = makeEl("div", "chart-bars");

    values.forEach((item, index) => {
        const row = makeEl("div", "chart-row");
        row.style.setProperty("--bar-color", item.color || ["#4f46e5", "#14b8a6", "#f59e0b", "#ef4444"][index % 4]);
        row.appendChild(makeEl("span", "chart-label", item.label));

        const track = makeEl("div", "chart-track");
        const fill = makeEl("div", "chart-fill");
        fill.style.width = `${Math.max(4, ((Number(item.value) || 0) / max) * 100)}%`;
        track.appendChild(fill);
        row.appendChild(track);

        row.appendChild(makeEl("strong", "chart-value", `${item.prefix || ""}${item.value}${item.suffix || ""}`));
        bars.appendChild(row);
    });

    card.appendChild(bars);
    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

function renderImage(container, media) {
    const card = makeEl("figure", "image-card");
    const img = document.createElement("img");
    img.src = media.src || "";
    img.alt = media.alt || media.title || "Question image";
    img.loading = "lazy";
    card.appendChild(img);
    if (media.caption || media.title) {
        card.appendChild(makeEl("figcaption", "media-caption", media.caption || media.title));
    }
    container.appendChild(card);
}

// Video accepts either a direct file (`src` -> <video>) or an embed page
// (`embed` -> <iframe>, e.g. YouTube). Returns a handle so the clip is paused
// when the lesson closes or the game is paused.
function renderVideo(container, media) {
    const card = makeEl("figure", "video-card");
    let videoEl = null;

    if (media.embed) {
        const frame = makeEl("div", "video-frame");
        const iframe = document.createElement("iframe");
        iframe.src = media.embed;
        iframe.title = media.title || media.alt || "Lesson video";
        iframe.loading = "lazy";
        iframe.allow = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        iframe.allowFullscreen = true;
        frame.appendChild(iframe);
        card.appendChild(frame);
    } else if (media.src) {
        videoEl = document.createElement("video");
        videoEl.src = media.src;
        videoEl.controls = true;
        videoEl.preload = "metadata";
        videoEl.playsInline = true;
        if (media.poster) videoEl.poster = media.poster;
        card.appendChild(videoEl);
    }

    if (media.caption || media.title) {
        card.appendChild(makeEl("figcaption", "media-caption", media.caption || media.title));
    }
    container.appendChild(card);

    if (!videoEl) return null;
    const stop = () => {
        try { videoEl.pause(); } catch (error) { /* ignore */ }
    };
    return { pause: stop, resume: null, cleanup: stop };
}

function renderIllustration(container, media) {
    const card = makeEl("div", `illustration-card theme-${media.theme || "study"}`);
    addMediaText(card, media);

    const scene = makeEl("div", "illustration-scene");
    if (media.theme === "triangle") {
        scene.appendChild(makeEl("div", "triangle-shape"));
    } else if (media.theme === "balance") {
        const figure = makeEl("div", "balance-figure");
        figure.appendChild(makeEl("div", "balance-base"));
        figure.appendChild(makeEl("div", "balance-stand"));
        figure.appendChild(makeEl("div", "balance-beam"));
        figure.appendChild(makeEl("div", "balance-pivot"));
        figure.appendChild(makeEl("div", "balance-cord balance-cord-left"));
        figure.appendChild(makeEl("div", "balance-cord balance-cord-right"));
        figure.appendChild(makeEl("div", "balance-pan balance-pan-left", media.left || "x"));
        figure.appendChild(makeEl("div", "balance-pan balance-pan-right", media.right || "?"));
        scene.appendChild(figure);
    } else if (media.theme === "shop") {
        scene.appendChild(makeEl("div", "shop-awning"));
        scene.appendChild(makeEl("div", "shop-counter", media.label || "SALE"));
    } else if (media.theme === "reading") {
        scene.appendChild(makeEl("div", "book-page", media.word || "word"));
        scene.appendChild(makeEl("div", "magnifier"));
    } else {
        scene.appendChild(makeEl("div", "shape-stack"));
        scene.appendChild(makeEl("div", "shape-star"));
    }
    card.appendChild(scene);

    if (Array.isArray(media.callouts) && media.callouts.length) {
        const list = makeEl("div", "callout-list");
        media.callouts.forEach((callout) => list.appendChild(makeEl("span", "callout", callout)));
        card.appendChild(list);
    }

    container.appendChild(card);
}

// A clean 2D "slices" pie: a circle cut into equal slices with some coloured in.
// When `interactive` (the default) it adds two sliders - cut more slices, colour
// more of them - and a live fraction + percentage readout, so a child can play
// and watch how slices, fractions and percentages move together. Pure SVG, no
// animation loop, so it returns no handle.
function renderSlices(container, media) {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const card = makeEl("div", "slices-card");
    addMediaText(card, media);

    const readInt = (value, fallback) => {
        const rounded = Math.round(Number(value));
        return Number.isFinite(rounded) ? rounded : fallback;
    };
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);

    const minSlices = Math.max(1, readInt(media.minSlices, 2));
    const maxSlices = Math.max(minSlices, readInt(media.maxSlices, 12));
    const clampTotal = (n) => Math.min(maxSlices, Math.max(minSlices, n));

    let total = clampTotal(readInt(media.slices, 8));
    let filled = Math.min(total, Math.max(0, readInt(media.filled, Math.round(total / 2))));
    const color = typeof media.color === "string" ? media.color : "#6366f1";
    const interactive = media.interactive !== false;

    const SIZE = 240;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const r = 104;

    const stage = makeEl("div", "slices-stage");
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute("class", "slices-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", media.alt || "A circle divided into equal slices");

    const crust = document.createElementNS(SVG_NS, "circle");
    crust.setAttribute("cx", cx);
    crust.setAttribute("cy", cy);
    crust.setAttribute("r", r + 7);
    crust.setAttribute("class", "slices-crust");
    svg.appendChild(crust);

    const layer = document.createElementNS(SVG_NS, "g");
    svg.appendChild(layer);
    stage.appendChild(svg);
    card.appendChild(stage);

    const readout = makeEl("div", "slices-readout");
    const pctEl = makeEl("span", "slices-pct");
    const detailEl = makeEl("span", "slices-detail");
    readout.appendChild(pctEl);
    readout.appendChild(detailEl);
    card.appendChild(readout);

    const slicePath = (a0, a1) => {
        if (a1 - a0 >= Math.PI * 2 - 1e-6) {
            return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
        }
        const x0 = cx + r * Math.cos(a0);
        const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    };

    const updateReadout = () => {
        const raw = total > 0 ? (filled / total) * 100 : 0;
        const whole = Math.abs(raw - Math.round(raw)) < 1e-9;
        pctEl.textContent = `${whole ? Math.round(raw) : "≈ " + (Math.round(raw * 10) / 10)}%`;
        if (filled === 0) {
            detailEl.textContent = `0 of ${total} slices coloured`;
        } else if (filled === total) {
            detailEl.textContent = `${total}/${total} = one whole circle`;
        } else {
            const divisor = gcd(filled, total);
            const simplified = divisor > 1 ? ` = ${filled / divisor}/${total / divisor}` : "";
            detailEl.textContent = `${filled}/${total}${simplified} of the circle`;
        }
    };

    const draw = () => {
        clearElement(layer);
        const seg = (Math.PI * 2) / total;
        const start = -Math.PI / 2;
        for (let i = 0; i < total; i++) {
            const piece = document.createElementNS(SVG_NS, "path");
            piece.setAttribute("d", slicePath(start + i * seg, start + (i + 1) * seg));
            const isFilled = i < filled;
            piece.setAttribute("class", `slice-piece ${isFilled ? "slice-filled" : "slice-empty"}`);
            if (isFilled) piece.setAttribute("fill", color);
            layer.appendChild(piece);
        }
        updateReadout();
    };

    draw();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        const makeSlider = (labelText, min, max, value) => {
            const wrap = makeEl("label", "slices-control");
            const head = makeEl("span", "slices-control-head");
            head.appendChild(makeEl("span", "slices-control-name", labelText));
            const valueEl = makeEl("span", "slices-control-value", String(value));
            head.appendChild(valueEl);
            const input = document.createElement("input");
            input.type = "range";
            input.min = String(min);
            input.max = String(max);
            input.value = String(value);
            input.className = "slices-range";
            wrap.appendChild(head);
            wrap.appendChild(input);
            return { wrap, input, valueEl };
        };

        const slicesCtl = makeSlider("Number of slices", minSlices, maxSlices, total);
        const filledCtl = makeSlider("Coloured slices", 0, total, filled);

        slicesCtl.input.addEventListener("input", () => {
            total = clampTotal(readInt(slicesCtl.input.value, total));
            slicesCtl.valueEl.textContent = String(total);
            if (filled > total) filled = total;
            filledCtl.input.max = String(total);
            filledCtl.input.value = String(filled);
            filledCtl.valueEl.textContent = String(filled);
            draw();
        });
        filledCtl.input.addEventListener("input", () => {
            filled = Math.min(total, Math.max(0, readInt(filledCtl.input.value, filled)));
            filledCtl.valueEl.textContent = String(filled);
            draw();
        });

        controls.appendChild(slicesCtl.wrap);
        controls.appendChild(filledCtl.wrap);
        card.appendChild(controls);
        card.appendChild(makeEl("p", "slices-tip", media.tip
            || "Drag the sliders to cut the circle and colour the slices. Watch the fraction and percentage change!"));
    }

    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// An interactive 10x10 percent grid. A slider colours squares in (filling by
// rows so a full row of ten reads as 10%), with a live percentage readout. Pure
// SVG, no animation loop.
function renderGrid(container, media) {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const card = makeEl("div", "slices-card");
    addMediaText(card, media);

    const readInt = (value, fallback) => {
        const rounded = Math.round(Number(value));
        return Number.isFinite(rounded) ? rounded : fallback;
    };

    let filled = Math.min(100, Math.max(0, readInt(media.filled, 30)));
    const color = typeof media.color === "string" ? media.color : "#6366f1";
    const interactive = media.interactive !== false;
    const showDecimal = media.showDecimal === true;

    const stage = makeEl("div", "slices-stage");
    const SIZE = 240;
    const pad = 6;
    const cell = (SIZE - pad * 2) / 10;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute("class", "grid-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", media.alt || "A 10 by 10 grid of 100 squares");

    const rects = [];
    for (let i = 0; i < 100; i++) {
        const row = Math.floor(i / 10);
        const col = i % 10;
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", (pad + col * cell + 1).toFixed(2));
        rect.setAttribute("y", (pad + row * cell + 1).toFixed(2));
        rect.setAttribute("width", (cell - 2).toFixed(2));
        rect.setAttribute("height", (cell - 2).toFixed(2));
        rect.setAttribute("rx", "2.5");
        svg.appendChild(rect);
        rects.push(rect);
    }
    stage.appendChild(svg);
    card.appendChild(stage);

    const readout = makeEl("div", "slices-readout");
    const pctEl = makeEl("span", "slices-pct");
    const detailEl = makeEl("span", "slices-detail");
    readout.appendChild(pctEl);
    readout.appendChild(detailEl);
    card.appendChild(readout);

    const draw = () => {
        for (let i = 0; i < 100; i++) {
            const isFilled = i < filled;
            rects[i].setAttribute("class", `grid-cell ${isFilled ? "grid-filled" : "grid-empty"}`);
            if (isFilled) rects[i].setAttribute("fill", color);
            else rects[i].removeAttribute("fill");
        }
        pctEl.textContent = `${filled}%`;
        if (showDecimal) {
            const value = filled / 100;
            let decText = "0";
            if (value !== 0) decText = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
            setDetail(detailEl, [[filled, 100], "=", decText]);
        } else {
            const rows = Math.floor(filled / 10);
            const extra = filled % 10;
            if (filled < 10) {
                detailEl.textContent = `${filled} of 100 squares`;
            } else if (extra === 0) {
                detailEl.textContent = `${rows} full ${rows === 1 ? "row" : "rows"} of ten = ${filled}%`;
            } else {
                detailEl.textContent = `${rows} ${rows === 1 ? "row" : "rows"} of ten + ${extra} = ${filled}%`;
            }
        }
    };
    draw();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        const wrap = makeEl("label", "slices-control");
        const head = makeEl("span", "slices-control-head");
        head.appendChild(makeEl("span", "slices-control-name", "Coloured squares"));
        const valueEl = makeEl("span", "slices-control-value", String(filled));
        head.appendChild(valueEl);
        const input = document.createElement("input");
        input.type = "range";
        input.min = "0";
        input.max = "100";
        input.value = String(filled);
        input.className = "slices-range";
        input.addEventListener("input", () => {
            filled = Math.min(100, Math.max(0, readInt(input.value, filled)));
            valueEl.textContent = String(filled);
            draw();
        });
        wrap.appendChild(head);
        wrap.appendChild(input);
        controls.appendChild(wrap);
        card.appendChild(controls);
        card.appendChild(makeEl("p", "slices-tip", media.tip
            || "Drag the slider to colour squares. Every square is 1%, and every full row of ten is 10%."));
    }

    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// An interactive "percentage of an amount" playground. Two sliders set the
// percentage and the whole amount; a bar and a live working line show the
// result. `mode` reshapes the answer: "of" (the part), "discount" (amount minus
// the part) or "increase" (amount plus the part). Pure DOM, no animation loop.
function renderPercentOf(container, media) {
    const card = makeEl("div", "slices-card");
    addMediaText(card, media);

    const readNum = (value, fallback) => {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    };

    const maxPercent = Math.max(1, readNum(media.maxPercent, 100));
    const maxAmount = Math.max(1, readNum(media.maxAmount, 100));
    let percent = Math.min(maxPercent, Math.max(0, readNum(media.percent, 30)));
    let amount = Math.min(maxAmount, Math.max(0, readNum(media.amount, maxAmount)));
    const prefix = typeof media.prefix === "string" ? media.prefix : "";
    const suffix = typeof media.suffix === "string" ? media.suffix : "";
    const mode = ["of", "discount", "increase"].includes(media.mode) ? media.mode : "of";
    const color = typeof media.color === "string" ? media.color : "#6366f1";
    const interactive = media.interactive !== false;
    const stepPercent = Math.max(1, readNum(media.stepPercent, 1));
    const stepAmount = Math.max(1, readNum(media.stepAmount, 1));

    const fmt = (value) => {
        const rounded = Math.round(value * 100) / 100;
        const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, "");
        return `${prefix}${text}${suffix}`;
    };

    const bar = makeEl("div", "percentof-bar");
    const barFill = makeEl("div", "percentof-fill");
    bar.appendChild(barFill);
    card.appendChild(bar);

    const readout = makeEl("div", "slices-readout");
    const bigEl = makeEl("span", "slices-pct");
    const detailEl = makeEl("span", "slices-detail");
    readout.appendChild(bigEl);
    readout.appendChild(detailEl);
    card.appendChild(readout);

    const draw = () => {
        const part = (percent / 100) * amount;
        if (mode === "discount") {
            const result = amount - part;
            bigEl.textContent = fmt(result);
            detailEl.textContent = `${fmt(amount)} − ${fmt(part)} = ${fmt(result)}  ·  ${percent}% off`;
        } else if (mode === "increase") {
            const result = amount + part;
            bigEl.textContent = fmt(result);
            detailEl.textContent = `${fmt(amount)} + ${fmt(part)} = ${fmt(result)}  ·  ${percent}% up`;
        } else {
            bigEl.textContent = fmt(part);
            detailEl.textContent = `${percent}% of ${fmt(amount)} = ${fmt(part)}`;
        }
        barFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        barFill.style.background = color;
    };
    draw();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        const makeSlider = (labelText, min, max, value, step, label) => {
            const wrap = makeEl("label", "slices-control");
            const head = makeEl("span", "slices-control-head");
            head.appendChild(makeEl("span", "slices-control-name", labelText));
            const valueEl = makeEl("span", "slices-control-value", label(value));
            head.appendChild(valueEl);
            const input = document.createElement("input");
            input.type = "range";
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.className = "slices-range";
            wrap.appendChild(head);
            wrap.appendChild(input);
            return { wrap, input, valueEl };
        };

        const percentCtl = makeSlider("Percentage", 0, maxPercent, percent, stepPercent, (v) => `${v}%`);
        const amountCtl = makeSlider("Whole amount", 0, maxAmount, amount, stepAmount, (v) => fmt(v));

        percentCtl.input.addEventListener("input", () => {
            percent = Math.min(maxPercent, Math.max(0, readNum(percentCtl.input.value, percent)));
            percentCtl.valueEl.textContent = `${percent}%`;
            draw();
        });
        amountCtl.input.addEventListener("input", () => {
            amount = Math.min(maxAmount, Math.max(0, readNum(amountCtl.input.value, amount)));
            amountCtl.valueEl.textContent = fmt(amount);
            draw();
        });

        controls.appendChild(percentCtl.wrap);
        controls.appendChild(amountCtl.wrap);
        card.appendChild(controls);
        card.appendChild(makeEl("p", "slices-tip", media.tip
            || "Slide the percentage and the amount and watch the answer change. Try making the percentage 10% and reading the answer."));
    }

    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// An interactive "percentage desk". One bar (the desk) is cut into N equal
// parts; the child shades k of them and sees the SAME amount four ways at once:
// a fraction, its simplified fraction, a percentage and a decimal. Faint guide
// lines mark the common fractions (1/2, 1/3, 1/4, 1/5 ...). A second panel
// applies that very fraction to a number the child types (e.g. 3/4 of 40 = 30).
// Pure SVG + DOM, no animation loop.
function renderPercentLab(container, media) {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const card = makeEl("div", "slices-card");
    addMediaText(card, media);

    const readInt = (value, fallback) => {
        const rounded = Math.round(Number(value));
        return Number.isFinite(rounded) ? rounded : fallback;
    };
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const terminates = (den) => { let d = den; while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5; return d === 1; };
    const trimNum = (s) => s.replace(/\.?0+$/, "");

    const maxParts = Math.max(2, readInt(media.maxParts, 100));
    let parts = Math.min(maxParts, Math.max(2, readInt(media.parts, 10)));
    let shaded = Math.min(parts, Math.max(0, readInt(media.shaded, 2)));
    let amount = Math.max(0, readInt(media.amount, 40));
    const color = typeof media.color === "string" ? media.color : "#6366f1";
    const interactive = media.interactive !== false;

    const simpleFrac = () => {
        if (shaded === 0) return "0";
        const g = gcd(shaded, parts);
        return g > 1 ? `${shaded / g}/${parts / g}` : `${shaded}/${parts}`;
    };
    const fracText = () => {
        if (shaded === 0) return "0";
        if (shaded === parts) return `${parts}/${parts} = 1 whole`;
        const g = gcd(shaded, parts);
        return g > 1 ? `${shaded}/${parts} = ${shaded / g}/${parts / g}` : `${shaded}/${parts}`;
    };
    const decText = () => {
        const dec = shaded / parts;
        if (dec === 0) return "0";
        if (Number.isInteger(dec)) return String(dec);
        const b = parts / gcd(shaded, parts);
        return terminates(b) ? trimNum(dec.toFixed(6)) : dec.toFixed(2) + "…";
    };
    const pctText = () => {
        const p = (shaded / parts) * 100;
        if (Math.abs(p - Math.round(p)) < 1e-9) return `${Math.round(p)}%`;
        const b = parts / gcd(shaded, parts);
        return terminates(b) ? `${trimNum(p.toFixed(2))}%` : `≈ ${Math.round(p * 10) / 10}%`;
    };
    const fmtAmount = (v) => {
        const r = Math.round(v * 100) / 100;
        return Number.isInteger(r) ? String(r) : trimNum(r.toFixed(2));
    };

    // ----- the desk (SVG bar) -----
    const stage = makeEl("div", "plab-stage");
    const W = 320, H = 104, bx = 16, by = 26, bw = W - bx * 2, bh = 40;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "plab-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", media.alt || "A bar cut into equal parts to show a percentage");

    const mkLine = (x1, y1, x2, y2, cls) => {
        const l = document.createElementNS(SVG_NS, "line");
        l.setAttribute("x1", x1.toFixed(2)); l.setAttribute("y1", y1.toFixed(2));
        l.setAttribute("x2", x2.toFixed(2)); l.setAttribute("y2", y2.toFixed(2));
        l.setAttribute("class", cls);
        return l;
    };
    const mkText = (x, y, cls, text) => {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", x.toFixed(2)); t.setAttribute("y", y.toFixed(2));
        t.setAttribute("class", cls); t.setAttribute("text-anchor", "middle");
        t.textContent = text;
        return t;
    };

    const track = document.createElementNS(SVG_NS, "rect");
    track.setAttribute("x", bx); track.setAttribute("y", by);
    track.setAttribute("width", bw); track.setAttribute("height", bh);
    track.setAttribute("rx", "8"); track.setAttribute("class", "plab-track");
    svg.appendChild(track);

    const fill = document.createElementNS(SVG_NS, "rect");
    fill.setAttribute("x", bx); fill.setAttribute("y", by);
    fill.setAttribute("height", bh); fill.setAttribute("rx", "8");
    fill.setAttribute("class", "plab-fill"); fill.setAttribute("fill", color);
    svg.appendChild(fill);

    // faint, labelled guide lines at the common fractions (constant reference)
    const guideG = document.createElementNS(SVG_NS, "g");
    [[1, 5], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [4, 5]].forEach(([a, b]) => {
        const x = bx + (a / b) * bw;
        guideG.appendChild(mkLine(x, by - 5, x, by + bh + 5, "plab-guide"));
        guideG.appendChild(mkText(x, by + bh + 16, "plab-guide-label", `${a}/${b}`));
    });
    svg.appendChild(guideG);

    // group dividers for the current cut (rebuilt when N changes)
    const dividerG = document.createElementNS(SVG_NS, "g");
    svg.appendChild(dividerG);

    const handle = document.createElementNS(SVG_NS, "polygon");
    handle.setAttribute("class", "plab-handle");
    svg.appendChild(handle);

    svg.appendChild(mkText(bx, by - 12, "plab-end", "0"));
    svg.appendChild(mkText(bx + bw, by - 12, "plab-end", "100%"));

    stage.appendChild(svg);
    card.appendChild(stage);

    // ----- equivalence bar: the same length, written in simplest form -----
    const equiv = makeEl("div", "plab-equiv");
    const equivCaption = makeEl("span", "plab-equiv-caption");
    equiv.appendChild(equivCaption);
    const eqStage = makeEl("div", "plab-equiv-stage");
    const eqBx = 16, eqBy = 6, eqBw = bw, eqBh = 24, eqH = 38;
    const eqsvg = document.createElementNS(SVG_NS, "svg");
    eqsvg.setAttribute("viewBox", `0 0 ${W} ${eqH}`);
    eqsvg.setAttribute("class", "plab-equiv-svg");
    eqsvg.setAttribute("role", "img");
    eqsvg.setAttribute("aria-label", "The same amount written as its simplest fraction");
    const eqTrack = document.createElementNS(SVG_NS, "rect");
    eqTrack.setAttribute("x", eqBx); eqTrack.setAttribute("y", eqBy);
    eqTrack.setAttribute("width", eqBw); eqTrack.setAttribute("height", eqBh);
    eqTrack.setAttribute("rx", "6"); eqTrack.setAttribute("class", "plab-track");
    eqsvg.appendChild(eqTrack);
    const eqFill = document.createElementNS(SVG_NS, "rect");
    eqFill.setAttribute("x", eqBx); eqFill.setAttribute("y", eqBy);
    eqFill.setAttribute("height", eqBh); eqFill.setAttribute("rx", "6");
    eqFill.setAttribute("class", "plab-fill"); eqFill.setAttribute("fill", color);
    eqsvg.appendChild(eqFill);
    const eqDivG = document.createElementNS(SVG_NS, "g");
    eqsvg.appendChild(eqDivG);
    eqStage.appendChild(eqsvg);
    equiv.appendChild(eqStage);
    card.appendChild(equiv);

    // ----- readout (percent + fraction = decimal) -----
    const readout = makeEl("div", "slices-readout");
    const pctEl = makeEl("span", "slices-pct");
    const detailEl = makeEl("span", "slices-detail");
    readout.appendChild(pctEl);
    readout.appendChild(detailEl);
    card.appendChild(readout);

    // ----- "the same fraction of a number" panel -----
    const ofnum = makeEl("div", "plab-ofnum");
    ofnum.appendChild(makeEl("span", "plab-ofnum-title", "The same fraction of a number"));
    const ofRow = makeEl("div", "plab-ofnum-row");
    const ofFracEl = makeEl("span", "plab-ofnum-frac");
    const amountInput = document.createElement("input");
    amountInput.type = "number"; amountInput.min = "0"; amountInput.value = String(amount);
    amountInput.className = "plab-amount"; amountInput.setAttribute("aria-label", "Your number");
    const ofResult = makeEl("span", "plab-ofnum-result");
    ofRow.appendChild(ofFracEl);
    ofRow.appendChild(makeEl("span", "plab-ofnum-of", "of"));
    ofRow.appendChild(amountInput);
    ofRow.appendChild(makeEl("span", "plab-ofnum-eq", "="));
    ofRow.appendChild(ofResult);
    ofnum.appendChild(ofRow);
    card.appendChild(ofnum);

    const drawDividers = () => {
        clearElement(dividerG);
        if (parts <= 60) {
            for (let i = 1; i < parts; i++) {
                const x = bx + (i / parts) * bw;
                dividerG.appendChild(mkLine(x, by, x, by + bh, "plab-divider"));
            }
        }
    };

    const draw = () => {
        const frac = shaded / parts;
        fill.setAttribute("width", (frac * bw).toFixed(2));
        const hx = bx + frac * bw;
        handle.setAttribute("points", `${(hx - 6).toFixed(1)},${by - 5} ${(hx + 6).toFixed(1)},${by - 5} ${hx.toFixed(1)},${by + 5}`);
        pctEl.textContent = pctText();
        const detG = shaded > 0 ? gcd(shaded, parts) : 1;
        if (shaded === 0) setDetail(detailEl, ["0"]);
        else if (shaded === parts) setDetail(detailEl, [[parts, parts], "=", "1 whole"]);
        else if (detG > 1) setDetail(detailEl, [[shaded, parts], "=", [shaded / detG, parts / detG], "=", decText()]);
        else setDetail(detailEl, [[shaded, parts], "=", decText()]);
        clearElement(ofFracEl);
        if (shaded === 0) ofFracEl.appendChild(makeEl("span", "detail-text", "0"));
        else if (shaded === parts) ofFracEl.appendChild(makeEl("span", "detail-text", "1"));
        else { const ofG = gcd(shaded, parts); ofFracEl.appendChild(makeFraction(shaded / ofG, parts / ofG)); }
        ofResult.textContent = fmtAmount(frac * amount);

        // equivalence bar: same fill length, cut into the simplest denominator
        const g = shaded > 0 ? gcd(shaded, parts) : 1;
        const a = shaded > 0 ? shaded / g : 0;
        const b = shaded > 0 ? parts / g : parts;
        eqFill.setAttribute("width", (frac * eqBw).toFixed(2));
        clearElement(eqDivG);
        if (b <= 60) {
            for (let i = 1; i < b; i++) {
                const x = eqBx + (i / b) * eqBw;
                eqDivG.appendChild(mkLine(x, eqBy, x, eqBy + eqBh, "plab-divider"));
            }
        }
        if (shaded === 0) equivCaption.textContent = "Simplest form: 0";
        else if (shaded === parts) equivCaption.textContent = "Simplest form: 1 whole";
        else if (g > 1) equivCaption.textContent = `Simplest form: ${a}/${b}  (same length as ${shaded}/${parts})`;
        else equivCaption.textContent = `${shaded}/${parts} is already in simplest form`;
    };

    drawDividers();
    draw();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        const makeSlider = (labelText, min, max, value) => {
            const wrap = makeEl("label", "slices-control");
            const head = makeEl("span", "slices-control-head");
            head.appendChild(makeEl("span", "slices-control-name", labelText));
            const valueEl = makeEl("span", "slices-control-value", String(value));
            head.appendChild(valueEl);
            const input = document.createElement("input");
            input.type = "range";
            input.min = String(min); input.max = String(max); input.value = String(value);
            input.className = "slices-range";
            wrap.appendChild(head); wrap.appendChild(input);
            return { wrap, input, valueEl };
        };

        const partsCtl = makeSlider("Cut into equal parts", 2, maxParts, parts);
        const shadedCtl = makeSlider("Shade this many parts", 0, parts, shaded);

        partsCtl.input.addEventListener("input", () => {
            parts = Math.min(maxParts, Math.max(2, readInt(partsCtl.input.value, parts)));
            partsCtl.valueEl.textContent = String(parts);
            if (shaded > parts) shaded = parts;
            shadedCtl.input.max = String(parts);
            shadedCtl.input.value = String(shaded);
            shadedCtl.valueEl.textContent = String(shaded);
            drawDividers();
            draw();
        });
        shadedCtl.input.addEventListener("input", () => {
            shaded = Math.min(parts, Math.max(0, readInt(shadedCtl.input.value, shaded)));
            shadedCtl.valueEl.textContent = String(shaded);
            draw();
        });
        amountInput.addEventListener("input", () => {
            amount = Math.max(0, readInt(amountInput.value, amount));
            draw();
        });

        controls.appendChild(partsCtl.wrap);
        controls.appendChild(shadedCtl.wrap);
        card.appendChild(controls);
        card.appendChild(makeEl("p", "slices-tip", media.tip
            || "Cut the desk into parts and shade some - the fraction, percentage and decimal always match. Try cutting into 4 and shading 3 to see 3/4 = 75%."));
    } else {
        amountInput.disabled = true;
    }

    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// An interactive "percentage pizza" - the circle twin of the Percentage Desk.
// The child cuts a pizza into N equal slices, shades k of them, and sees the
// same amount as a fraction, its simplest form, a percentage and a decimal -
// plus that fraction OF a number they type. Pure SVG + DOM, no animation loop.
function renderPercentPie(container, media) {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const card = makeEl("div", "slices-card");
    addMediaText(card, media);

    const readInt = (value, fallback) => {
        const rounded = Math.round(Number(value));
        return Number.isFinite(rounded) ? rounded : fallback;
    };
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const terminates = (den) => { let d = den; while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5; return d === 1; };
    const trimNum = (s) => s.replace(/\.?0+$/, "");

    const maxParts = Math.max(2, readInt(media.maxParts, 100));
    let parts = Math.min(maxParts, Math.max(2, readInt(media.parts, 8)));
    let shaded = Math.min(parts, Math.max(0, readInt(media.shaded, 4)));
    let amount = Math.max(0, readInt(media.amount, 40));
    const color = typeof media.color === "string" ? media.color : "#6366f1";
    const interactive = media.interactive !== false;
    let showTens = media.showGroups !== false;
    let groupSize = Math.max(1, readInt(media.groupSize, 10));
    const showOfNumber = media.showOfNumber !== false;
    const controlsInPopup = media.controlsInPopup === true;

    const simpleFrac = () => {
        if (shaded === 0) return "0";
        const g = gcd(shaded, parts);
        return g > 1 ? `${shaded / g}/${parts / g}` : `${shaded}/${parts}`;
    };
    const fracText = () => {
        if (shaded === 0) return "0";
        if (shaded === parts) return `${parts}/${parts} = 1 whole`;
        const g = gcd(shaded, parts);
        return g > 1 ? `${shaded}/${parts} = ${shaded / g}/${parts / g}` : `${shaded}/${parts}`;
    };
    const decText = () => {
        const dec = shaded / parts;
        if (dec === 0) return "0";
        if (Number.isInteger(dec)) return String(dec);
        const b = parts / gcd(shaded, parts);
        return terminates(b) ? trimNum(dec.toFixed(6)) : dec.toFixed(2) + "…";
    };
    const pctText = () => {
        const p = (shaded / parts) * 100;
        if (Math.abs(p - Math.round(p)) < 1e-9) return `${Math.round(p)}%`;
        const b = parts / gcd(shaded, parts);
        return terminates(b) ? `${trimNum(p.toFixed(2))}%` : `≈ ${Math.round(p * 10) / 10}%`;
    };
    const fmtAmount = (v) => {
        const r = Math.round(v * 100) / 100;
        return Number.isInteger(r) ? String(r) : trimNum(r.toFixed(2));
    };

    // ----- the pizza (large card) -----
    card.classList.add("pie-card");
    const SIZE = 252, cx = SIZE / 2, cy = SIZE / 2, r = 104;
    const mkLine = (x1, y1, x2, y2, cls) => {
        const l = document.createElementNS(SVG_NS, "line");
        l.setAttribute("x1", x1.toFixed(2)); l.setAttribute("y1", y1.toFixed(2));
        l.setAttribute("x2", x2.toFixed(2)); l.setAttribute("y2", y2.toFixed(2));
        l.setAttribute("class", cls);
        return l;
    };
    const mkText = (x, y, cls, text) => {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", x.toFixed(2)); t.setAttribute("y", y.toFixed(2));
        t.setAttribute("class", cls); t.setAttribute("text-anchor", "middle");
        t.textContent = text;
        return t;
    };
    const stage = makeEl("div", "slices-stage");
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute("class", "slices-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", media.alt || "A pizza cut into equal slices");

    const crust = document.createElementNS(SVG_NS, "circle");
    crust.setAttribute("cx", cx); crust.setAttribute("cy", cy); crust.setAttribute("r", r + 7);
    crust.setAttribute("class", "slices-crust");
    svg.appendChild(crust);
    const layer = document.createElementNS(SVG_NS, "g");
    svg.appendChild(layer);

    // faint radial guides at the well-known fractions (constant reference,
    // drawn on top of the slices so the child can see where 1/2, 1/4 ... fall)
    const guideLayer = document.createElementNS(SVG_NS, "g");
    [[1, 5], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [4, 5]].forEach(([a, b]) => {
        const ang = -Math.PI / 2 + (a / b) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        guideLayer.appendChild(mkLine(cx + 0.22 * r * cosA, cy + 0.22 * r * sinA, cx + r * cosA, cy + r * sinA, "plab-guide"));
        guideLayer.appendChild(mkText(cx + (r + 13) * cosA, cy + (r + 13) * sinA + 3, "plab-guide-label", `${a}/${b}`));
    });
    svg.appendChild(guideLayer);

    // bold "every ten slices" group lines on top, in a contrasting colour
    // (rebuilt with the slices) so 100 slices read as ten clear groups of ten
    const tensLayer = document.createElementNS(SVG_NS, "g");
    svg.appendChild(tensLayer);

    stage.appendChild(svg);
    card.appendChild(stage);

    const slicePath = (a0, a1) => {
        if (a1 - a0 >= Math.PI * 2 - 1e-6) {
            return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
        }
        const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        const large = a1 - a0 > Math.PI ? 1 : 0;
        return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    };

    // ----- readout -----
    const readout = makeEl("div", "slices-readout");
    const pctEl = makeEl("span", "slices-pct");
    const detailEl = makeEl("span", "slices-detail");
    readout.appendChild(pctEl); readout.appendChild(detailEl);
    card.appendChild(readout);

    // ----- "the same fraction of a number" panel -----
    const ofnum = makeEl("div", "plab-ofnum");
    ofnum.appendChild(makeEl("span", "plab-ofnum-title", "The same fraction of a number"));
    const ofRow = makeEl("div", "plab-ofnum-row");
    const ofFracEl = makeEl("span", "plab-ofnum-frac");
    const amountInput = document.createElement("input");
    amountInput.type = "number"; amountInput.min = "0"; amountInput.value = String(amount);
    amountInput.className = "plab-amount"; amountInput.setAttribute("aria-label", "Your number");
    const ofResult = makeEl("span", "plab-ofnum-result");
    ofRow.appendChild(ofFracEl);
    ofRow.appendChild(makeEl("span", "plab-ofnum-of", "of"));
    ofRow.appendChild(amountInput);
    ofRow.appendChild(makeEl("span", "plab-ofnum-eq", "="));
    ofRow.appendChild(ofResult);
    ofnum.appendChild(ofRow);
    if (showOfNumber) card.appendChild(ofnum);

    const draw = () => {
        clearElement(layer);
        const seg = (Math.PI * 2) / parts;
        const start = -Math.PI / 2;
        for (let i = 0; i < parts; i++) {
            const piece = document.createElementNS(SVG_NS, "path");
            piece.setAttribute("d", slicePath(start + i * seg, start + (i + 1) * seg));
            const isFilled = i < shaded;
            piece.setAttribute("class", `slice-piece ${isFilled ? "slice-filled" : "slice-empty"}`);
            if (isFilled) piece.setAttribute("fill", color);
            layer.appendChild(piece);
        }
        clearElement(tensLayer);
        if (showTens && groupSize >= 1 && parts > groupSize) {
            for (let i = 0; i < parts; i += groupSize) {
                const ang = start + (i / parts) * Math.PI * 2;
                tensLayer.appendChild(mkLine(cx, cy, cx + r * Math.cos(ang), cy + r * Math.sin(ang), "pie-tens"));
            }
        }
        pctEl.textContent = pctText();
        const detG = shaded > 0 ? gcd(shaded, parts) : 1;
        if (shaded === 0) setDetail(detailEl, ["0"]);
        else if (shaded === parts) setDetail(detailEl, [[parts, parts], "=", "1 whole"]);
        else if (detG > 1) setDetail(detailEl, [[shaded, parts], "=", [shaded / detG, parts / detG], "=", decText()]);
        else setDetail(detailEl, [[shaded, parts], "=", decText()]);
        clearElement(ofFracEl);
        if (shaded === 0) ofFracEl.appendChild(makeEl("span", "detail-text", "0"));
        else if (shaded === parts) ofFracEl.appendChild(makeEl("span", "detail-text", "1"));
        else { const ofG = gcd(shaded, parts); ofFracEl.appendChild(makeFraction(shaded / ofG, parts / ofG)); }
        ofResult.textContent = fmtAmount((shaded / parts) * amount);
        if (typeof media.onChange === "function") media.onChange({ parts, shaded });
    };
    draw();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        // A slider paired with a typeable number box, kept in sync. While the
        // child is typing in the box we leave it alone (only the slider tracks);
        // on blur the box snaps to the clamped value.
        const makeSlider = (labelText, min, max, value, clamp, onChange) => {
            const wrap = makeEl("label", "slices-control");
            const head = makeEl("span", "slices-control-head");
            head.appendChild(makeEl("span", "slices-control-name", labelText));
            const num = document.createElement("input");
            num.type = "number"; num.min = String(min); num.max = String(max); num.value = String(value);
            num.className = "slices-control-num"; num.setAttribute("aria-label", labelText);
            head.appendChild(num);
            const range = document.createElement("input");
            range.type = "range"; range.min = String(min); range.max = String(max); range.value = String(value);
            range.className = "slices-range"; range.setAttribute("aria-label", labelText);
            wrap.appendChild(head); wrap.appendChild(range);
            let cur = value;
            const apply = (raw, fromNum) => {
                cur = clamp(Number.isFinite(raw) ? raw : cur);
                range.value = String(cur);
                if (!fromNum) num.value = String(cur);
                onChange(cur);
            };
            range.addEventListener("input", () => apply(readInt(range.value, cur), false));
            num.addEventListener("input", () => apply(readInt(num.value, cur), true));
            num.addEventListener("change", () => { num.value = String(cur); });
            return {
                wrap, range, num,
                setMax: (m) => { range.max = String(m); num.max = String(m); },
                setValue: (v) => { cur = clamp(v); range.value = String(cur); num.value = String(cur); }
            };
        };
        const shadedCtl = makeSlider("Shade this many slices", 0, parts, shaded,
            (v) => Math.min(parts, Math.max(0, v)),
            (v) => { shaded = v; draw(); });
        const partsCtl = makeSlider("Cut into slices", 2, maxParts, parts,
            (v) => Math.min(maxParts, Math.max(2, v)),
            (v) => { parts = v; if (shaded > parts) shaded = parts; shadedCtl.setMax(parts); shadedCtl.setValue(shaded); draw(); });
        amountInput.addEventListener("input", () => {
            amount = Math.max(0, readInt(amountInput.value, amount));
            draw();
        });
        controls.appendChild(partsCtl.wrap);
        controls.appendChild(shadedCtl.wrap);

        const toggleWrap = makeEl("div", "plab-toggle");
        const tensToggle = document.createElement("input");
        tensToggle.type = "checkbox";
        tensToggle.checked = showTens;
        tensToggle.className = "plab-toggle-input";
        tensToggle.setAttribute("aria-label", "Show group lines");
        const groupInput = document.createElement("input");
        groupInput.type = "number";
        groupInput.min = "1";
        groupInput.value = String(groupSize);
        groupInput.className = "plab-group-input";
        groupInput.setAttribute("aria-label", "Slices per group");
        toggleWrap.appendChild(tensToggle);
        toggleWrap.appendChild(makeEl("span", "plab-toggle-text", "Group every"));
        toggleWrap.appendChild(groupInput);
        toggleWrap.appendChild(makeEl("span", "plab-toggle-text", "slices"));
        tensToggle.addEventListener("change", () => { showTens = tensToggle.checked; draw(); });
        groupInput.addEventListener("input", () => { groupSize = Math.max(1, readInt(groupInput.value, groupSize)); draw(); });
        controls.appendChild(toggleWrap);

        const tipText = media.tip
            || "Cut the pizza into slices and shade some - the fraction, percentage and decimal always match. Try 4 slices with 1 shaded to see 1/4 = 25%.";
        if (controlsInPopup) {
            const adjustBtn = makeEl("button", "plab-adjust", "Adjust the slices");
            adjustBtn.type = "button";
            const popup = makeEl("div", "plab-popup");
            popup.appendChild(controls);
            popup.appendChild(makeEl("p", "slices-tip", tipText));
            const closeBtn = makeEl("button", "plab-popup-close", "Done");
            closeBtn.type = "button";
            popup.appendChild(closeBtn);
            adjustBtn.addEventListener("click", () => {
                const willOpen = !popup.classList.contains("open");
                document.querySelectorAll(".plab-popup.open").forEach((p) => p.classList.remove("open"));
                if (willOpen) popup.classList.add("open");
            });
            closeBtn.addEventListener("click", () => popup.classList.remove("open"));
            card.appendChild(adjustBtn);
            card.appendChild(popup);
        } else {
            card.appendChild(controls);
            card.appendChild(makeEl("p", "slices-tip", tipText));
        }
    } else {
        amountInput.disabled = true;
    }

    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// Compare two pizzas side by side so a child can SEE that two different cuts -
// e.g. 16/40 and 2/5 - are the same amount. A live badge says "Same value!" when
// they match, and optional Add / Subtract buttons combine the two. Each pizza
// reuses renderPercentPie with its controls collapsed into an "Adjust" popup on
// phones (so the small screen shows just the two pizzas and their numbers).
function renderPercentCompare(container, media) {
    const SVG_NS = "http://www.w3.org/2000/svg";
    const card = makeEl("div", "slices-card compare-card");
    addMediaText(card, media);

    const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
    const lcm = (a, b) => (a && b) ? Math.abs(a * b) / gcd(a, b) : (Math.abs(a || b) || 1);
    const trimNum = (s) => s.replace(/\.?0+$/, "");
    const terminates = (den) => { let d = Math.abs(den); if (!d) return true; while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5; return d === 1; };
    const fmtFrac = (num, den) => {
        if (num === 0) return "0";
        const g = gcd(Math.abs(num), Math.abs(den)) || 1;
        const a = num / g, b = den / g;
        return b === 1 ? String(a) : `${a}/${b}`;
    };
    const fmtPct = (num, den) => {
        if (!den) return "0%";
        const p = (num / den) * 100;
        if (Math.abs(p - Math.round(p)) < 1e-9) return `${Math.round(p)}%`;
        const g = gcd(Math.abs(num), Math.abs(den)) || 1;
        return terminates(Math.abs(den) / g) ? `${trimNum(p.toFixed(2))}%` : `≈ ${Math.round(p * 10) / 10}%`;
    };
    const fmtDec = (num, den) => {
        if (num === 0 || !den) return "0";
        const dec = num / den;
        if (Number.isInteger(dec)) return String(dec);
        const g = gcd(Math.abs(num), Math.abs(den)) || 1;
        return terminates(Math.abs(den) / g) ? trimNum(dec.toFixed(6)) : dec.toFixed(2) + "…";
    };

    const seedA = media.left || {};
    const seedB = media.right || {};
    const maxParts = Math.max(2, Number(media.maxParts) || 100);
    const state = {
        A: { parts: Number(seedA.parts) || 8, shaded: (seedA.shaded != null ? Number(seedA.shaded) : 2) },
        B: { parts: Number(seedB.parts) || 4, shaded: (seedB.shaded != null ? Number(seedB.shaded) : 1) }
    };

    const grid = makeEl("div", "compare-grid");
    const sideA = makeEl("div", "compare-side");
    const sideB = makeEl("div", "compare-side");
    grid.appendChild(sideA);
    grid.appendChild(sideB);
    card.appendChild(grid);

    const panel = makeEl("div", "compare-panel");
    const verdict = makeEl("div", "compare-verdict");
    const opRow = makeEl("div", "compare-op-row");
    opRow.appendChild(makeEl("span", "compare-op-label", "Combine:"));
    const addBtn = makeEl("button", "compare-op-btn", "Add +"); addBtn.type = "button";
    const subBtn = makeEl("button", "compare-op-btn", "Subtract −"); subBtn.type = "button";
    opRow.appendChild(addBtn);
    opRow.appendChild(subBtn);
    const opResult = makeEl("div", "compare-op-result");
    panel.appendChild(verdict);
    panel.appendChild(opRow);
    panel.appendChild(opResult);
    const opVisual = makeEl("div", "compare-op-visual");
    opVisual.style.display = "none";
    panel.appendChild(opVisual);
    card.appendChild(panel);

    // A small display-only pizza for the answer (no controls).
    const makeResultPizza = (slices, shadedCount, fill) => {
        const SIZE = 120, c = SIZE / 2, rr = 50;
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", `0 0 ${SIZE} ${SIZE}`);
        svg.setAttribute("class", "compare-result-pie");
        svg.setAttribute("role", "img");
        const crust = document.createElementNS(SVG_NS, "circle");
        crust.setAttribute("cx", c); crust.setAttribute("cy", c); crust.setAttribute("r", rr + 5);
        crust.setAttribute("class", "slices-crust");
        svg.appendChild(crust);
        const path = (a0, a1) => {
            if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M ${c} ${c - rr} A ${rr} ${rr} 0 1 1 ${c - 0.01} ${c - rr} Z`;
            const x0 = c + rr * Math.cos(a0), y0 = c + rr * Math.sin(a0), x1 = c + rr * Math.cos(a1), y1 = c + rr * Math.sin(a1);
            const large = a1 - a0 > Math.PI ? 1 : 0;
            return `M ${c} ${c} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rr} ${rr} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
        };
        const n = Math.max(1, slices);
        const seg = (Math.PI * 2) / n, start = -Math.PI / 2;
        for (let i = 0; i < n; i++) {
            const p = document.createElementNS(SVG_NS, "path");
            p.setAttribute("d", path(start + i * seg, start + (i + 1) * seg));
            const filled = i < shadedCount;
            p.setAttribute("class", `slice-piece ${filled ? "slice-filled" : "slice-empty"}`);
            if (filled) p.setAttribute("fill", fill);
            svg.appendChild(p);
        }
        return svg;
    };

    let op = null;

    const update = () => {
        const A = state.A, B = state.B;
        const vA = A.parts ? A.shaded / A.parts : 0;
        const vB = B.parts ? B.shaded / B.parts : 0;
        const equal = Math.abs(vA - vB) < 1e-9;
        if (equal && (A.shaded > 0 || B.shaded > 0)) {
            verdict.className = "compare-verdict is-equal";
            setDetail(verdict, ["Same value!", [A.shaded, A.parts], "=", [B.shaded, B.parts], "=", fmtPct(A.shaded, A.parts)]);
        } else if (equal) {
            verdict.className = "compare-verdict";
            setDetail(verdict, ["Shade slices on each pizza to compare them."]);
        } else {
            verdict.className = "compare-verdict";
            setDetail(verdict, [[A.shaded, A.parts], `(${fmtPct(A.shaded, A.parts)})`, "vs", [B.shaded, B.parts], `(${fmtPct(B.shaded, B.parts)})`, `— ${vA > vB ? "left" : "right"} is bigger`]);
        }
        addBtn.classList.toggle("active", op === "add");
        subBtn.classList.toggle("active", op === "sub");
        clearElement(opVisual);
        if (op && A.parts && B.parts) {
            const L = lcm(A.parts, B.parts);
            const numA = A.shaded * (L / A.parts);
            const numB = B.shaded * (L / B.parts);
            const num = op === "add" ? numA + numB : numA - numB;
            const sign = op === "add" ? "+" : "−";
            opResult.style.display = "";
            const gR = gcd(Math.abs(num), L) || 1;
            const rN = num / gR, rD = L / gR;
            const seg = [[A.shaded, A.parts], sign, [B.shaded, B.parts], "="];
            if (rD === 1) seg.push(String(rN));
            else if (rN < 0) seg.push("−", [Math.abs(rN), rD]);
            else seg.push([rN, rD]);
            seg.push("=", fmtPct(num, L), "=", fmtDec(num, L));
            setDetail(opResult, seg);
            // Show the answer as pizza(s): one full pizza per whole, plus the
            // leftover - so values over 1 (e.g. 1.6) show two pizzas.
            const g = gcd(Math.abs(num), L) || 1;
            const rden = L / g;
            const absNum = Math.abs(num) / g;
            const whole = Math.floor(absNum / rden);
            const remainder = absNum - whole * rden;
            const fill = num < 0 ? "#dc2626" : "#16a34a";
            const pies = [];
            for (let i = 0; i < whole; i++) pies.push(makeResultPizza(rden, rden, fill));
            if (remainder > 0) pies.push(makeResultPizza(rden, remainder, fill));
            if (pies.length === 0) pies.push(makeResultPizza(Math.max(1, rden), 0, fill));
            if (num < 0) opVisual.appendChild(makeEl("span", "compare-result-sign", "−"));
            pies.forEach((pie, i) => {
                if (i > 0) opVisual.appendChild(makeEl("span", "compare-result-plus", "+"));
                opVisual.appendChild(pie);
            });
            opVisual.style.display = "";
        } else {
            opResult.style.display = "none";
            opResult.textContent = "";
            opVisual.style.display = "none";
        }
    };

    addBtn.addEventListener("click", () => { op = op === "add" ? null : "add"; update(); });
    subBtn.addEventListener("click", () => { op = op === "sub" ? null : "sub"; update(); });

    const makeOpts = (seed, dflt, color, titleText, onChange) => ({
        type: "percentPie",
        title: titleText,
        parts: Number(seed.parts) || dflt.parts,
        shaded: seed.shaded != null ? Number(seed.shaded) : dflt.shaded,
        maxParts: maxParts,
        color: color,
        showOfNumber: false,
        showGroups: media.showGroups === true,
        controlsInPopup: true,
        onChange: onChange
    });

    renderPercentPie(sideA, makeOpts(seedA, { parts: 8, shaded: 2 }, media.leftColor || "#6366f1", media.leftTitle || "Pizza A", (s) => { state.A = s; update(); }));
    renderPercentPie(sideB, makeOpts(seedB, { parts: 4, shaded: 1 }, media.rightColor || "#0ea5e9", media.rightTitle || "Pizza B", (s) => { state.B = s; update(); }));

    update();
    container.appendChild(card);
}

// ----- Variable widgets ("what's in the box?") --------------------------------

// The Mystery Box: a named box (x) that holds a number you can change and peek
// at. Show several identical boxes to teach that every x is the SAME box, so
// they always hold the same value. Pure DOM, no animation loop.
function renderVarBox(container, media) {
    const card = makeEl("div", "slices-card varbox-card");
    addMediaText(card, media);
    const readInt = (v, f) => { const r = Math.round(Number(v)); return Number.isFinite(r) ? r : f; };
    const name = (typeof media.name === "string" && media.name) || "x";
    const min = readInt(media.min, 0);
    const max = Math.max(min + 1, readInt(media.max, 12));
    let value = Math.min(max, Math.max(min, readInt(media.value, 5)));
    const count = Math.min(4, Math.max(1, readInt(media.boxes, 1)));
    const color = typeof media.color === "string" ? media.color : "#6366f1";
    const interactive = media.interactive !== false;
    let open = media.open === true;

    const row = makeEl("div", "varbox-row");
    const windows = [];
    for (let i = 0; i < count; i++) {
        const box = makeEl("div", "varbox");
        box.style.borderColor = color;
        box.appendChild(makeEl("span", "varbox-label", name));
        const win = makeEl("div", "varbox-window");
        box.appendChild(win);
        row.appendChild(box);
        windows.push(win);
    }
    card.appendChild(row);

    const readout = makeEl("div", "slices-readout");
    const big = makeEl("span", "slices-pct");
    readout.appendChild(big);
    card.appendChild(readout);

    const draw = () => {
        windows.forEach((win) => {
            clearElement(win);
            if (!open) {
                win.appendChild(makeEl("span", "varbox-q", "?"));
            } else if (value <= 12) {
                const dots = makeEl("div", "varbox-dots");
                for (let i = 0; i < value; i++) {
                    const d = makeEl("span", "varbox-dot");
                    d.style.background = color;
                    dots.appendChild(d);
                }
                win.appendChild(dots);
            } else {
                win.appendChild(makeEl("span", "varbox-num", String(value)));
            }
        });
        big.textContent = open ? `${name} = ${value}` : `${name} = ?`;
    };
    draw();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        const peek = makeEl("button", "var-btn", open ? "Close the box" : "Peek inside");
        peek.type = "button";
        peek.addEventListener("click", () => { open = !open; peek.textContent = open ? "Close the box" : "Peek inside"; draw(); });
        controls.appendChild(peek);

        const wrap = makeEl("label", "slices-control");
        const head = makeEl("span", "slices-control-head");
        head.appendChild(makeEl("span", "slices-control-name", `Put a number in ${name}`));
        const num = document.createElement("input");
        num.type = "number"; num.min = String(min); num.max = String(max); num.value = String(value); num.className = "slices-control-num";
        head.appendChild(num);
        const range = document.createElement("input");
        range.type = "range"; range.min = String(min); range.max = String(max); range.value = String(value); range.className = "slices-range";
        wrap.appendChild(head); wrap.appendChild(range);
        const apply = (raw, fromNum) => {
            value = Math.min(max, Math.max(min, readInt(raw, value)));
            range.value = String(value);
            if (!fromNum) num.value = String(value);
            if (!open) { open = true; peek.textContent = "Close the box"; }
            draw();
        };
        range.addEventListener("input", () => apply(range.value, false));
        num.addEventListener("input", () => apply(num.value, true));
        num.addEventListener("change", () => { num.value = String(value); });
        controls.appendChild(wrap);
        card.appendChild(controls);
        card.appendChild(makeEl("p", "slices-tip", media.tip
            || `A variable is just a named box. ${name} holds a number you can change - peek inside to see it.${count > 1 ? ` Every ${name} box is the same box, so they always hold the same number.` : ""}`));
    }
    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// The Function Machine: a number goes in, a rule (x * m + b) is applied, an
// output comes out. "Build" mode lets the child set the rule; "guess my rule"
// mode (hideRule) hides it so they work it out from the in/out table. Pure DOM.
function renderFunctionMachine(container, media) {
    const card = makeEl("div", "slices-card fmach-card");
    addMediaText(card, media);
    const readInt = (v, f) => { const r = Math.round(Number(v)); return Number.isFinite(r) ? r : f; };
    let m = readInt(media.multiply, 2);
    let b = readInt(media.add, 1);
    let input = readInt(media.input, 3);
    const hideRule = media.hideRule === true;
    let revealed = !hideRule;
    const compute = (x) => m * x + b;

    const stage = makeEl("div", "fmach-stage");
    const inChip = makeEl("div", "fmach-chip fmach-in", String(input));
    const machine = makeEl("div", "fmach-box");
    machine.appendChild(makeEl("span", "fmach-gear", "⚙"));
    const ruleEl = makeEl("span", "fmach-rule", "");
    machine.appendChild(ruleEl);
    const outChip = makeEl("div", "fmach-chip fmach-out", "?");
    stage.appendChild(inChip);
    stage.appendChild(makeEl("span", "fmach-arrow", "→"));
    stage.appendChild(machine);
    stage.appendChild(makeEl("span", "fmach-arrow", "→"));
    stage.appendChild(outChip);
    card.appendChild(stage);

    const table = makeEl("div", "fmach-table");
    card.appendChild(table);
    const rows = [];
    const refreshRule = () => { ruleEl.textContent = revealed ? `× ${m}  ${b >= 0 ? "+" : "−"} ${Math.abs(b)}` : "? ? ?"; };
    const run = () => {
        const out = compute(input);
        inChip.textContent = String(input);
        outChip.textContent = String(out);
        machine.classList.remove("fmach-run");
        void machine.offsetWidth;
        machine.classList.add("fmach-run");
        rows.unshift({ inV: input, outV: out });
        if (rows.length > 5) rows.pop();
        clearElement(table);
        const head = makeEl("div", "fmach-trow fmach-thead");
        head.appendChild(makeEl("span", "fmach-tcell", "in"));
        head.appendChild(makeEl("span", "fmach-tcell", "out"));
        table.appendChild(head);
        rows.forEach((r) => {
            const tr = makeEl("div", "fmach-trow");
            tr.appendChild(makeEl("span", "fmach-tcell", String(r.inV)));
            tr.appendChild(makeEl("span", "fmach-tcell", String(r.outV)));
            table.appendChild(tr);
        });
    };
    refreshRule();

    const controls = makeEl("div", "slices-controls");
    const mkNumCtl = (labelText, val, onCh) => {
        const wrap = makeEl("label", "slices-control");
        const head = makeEl("span", "slices-control-head");
        head.appendChild(makeEl("span", "slices-control-name", labelText));
        const num = document.createElement("input");
        num.type = "number"; num.value = String(val); num.className = "slices-control-num";
        head.appendChild(num);
        wrap.appendChild(head);
        num.addEventListener("input", () => onCh(readInt(num.value, val)));
        return wrap;
    };
    controls.appendChild(mkNumCtl("Number to put in", input, (v) => { input = v; inChip.textContent = String(v); }));
    if (!hideRule) {
        controls.appendChild(mkNumCtl("Multiply by", m, (v) => { m = v; refreshRule(); }));
        controls.appendChild(mkNumCtl("Then add", b, (v) => { b = v; refreshRule(); }));
    }
    card.appendChild(controls);

    const btnRow = makeEl("div", "var-btn-row");
    const runBtn = makeEl("button", "var-btn", "Run the machine");
    runBtn.type = "button";
    runBtn.addEventListener("click", run);
    btnRow.appendChild(runBtn);
    if (hideRule) {
        const rev = makeEl("button", "var-btn secondary", "Reveal the rule");
        rev.type = "button";
        rev.addEventListener("click", () => { revealed = !revealed; rev.textContent = revealed ? "Hide the rule" : "Reveal the rule"; refreshRule(); });
        btnRow.appendChild(rev);
    }
    card.appendChild(btnRow);
    card.appendChild(makeEl("p", "slices-tip", media.tip
        || (hideRule ? "Feed the machine numbers and watch what comes out. Can you work out the hidden rule?"
            : "Set the rule, type a number, and press Run. The output is the rule done to your number.")));
    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));
    container.appendChild(card);
}

// An interactive 3D volume playground. A real Three.js box (or cylinder) the
// child can orbit, with sliders for its dimensions; the shape resizes and the
// volume updates live. Unlike `threejs`, the geometry is parameterised here -
// no code runs from the JSON. Returns a live handle for cleanup.
function renderVolume3D(container, media) {
    const card = makeEl("div", "slices-card");
    addMediaText(card, media);
    container.appendChild(card);

    const stage = makeEl("div", "volume-stage");
    card.appendChild(stage);

    const readout = makeEl("div", "slices-readout");
    const bigEl = makeEl("span", "slices-pct");
    const detailEl = makeEl("span", "slices-detail");
    readout.appendChild(bigEl);
    readout.appendChild(detailEl);
    card.appendChild(readout);

    const readNum = (value, fallback) => {
        const num = Math.round(Number(value));
        return Number.isFinite(num) ? num : fallback;
    };
    const shape = media.shape === "cylinder" ? "cylinder" : "box";
    const unit = typeof media.unit === "string" ? media.unit : "cm";
    const colorHex = typeof media.color === "string" ? media.color : "#6366f1";
    const minD = Math.max(1, readNum(media.min, 1));
    const maxD = Math.max(minD + 1, readNum(media.max, 6));
    const clampD = (n) => Math.min(maxD, Math.max(minD, Math.round(n)));
    let L = clampD(readNum(media.length, 4));
    let W = clampD(readNum(media.width, 2));
    let H = clampD(readNum(media.height, 3));
    let R = clampD(readNum(media.radius, 2));
    const interactive = media.interactive !== false;

    const width = stage.clientWidth || container.clientWidth || 400;
    const height = 240;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    stage.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.92));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(5, 8, 6);
    const fillLight = new THREE.PointLight(0xffc857, 0.55, 60);
    fillLight.position.set(-6, -3, 5);
    scene.add(keyLight, fillLight);
    camera.position.set(7, 6, 11);
    camera.lookAt(0, 0, 0);

    let orbit = null;
    if (THREE.OrbitControls) {
        orbit = new THREE.OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.08;
        orbit.enablePan = false;
        orbit.minDistance = 7;
        orbit.maxDistance = 26;
    }

    const SCALE = 0.85;
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), metalness: 0.0, roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const latticeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    let mesh = null;
    let edges = null;
    let lattice = null;
    let spin = 0;

    // Builds the wireframe of every 1-unit cube inside an lx by ly by lz block,
    // centred on the origin to match the box mesh - so the child can see the
    // block is made of unit cubes.
    const buildLattice = (lx, ly, lz) => {
        const hx = lx * SCALE / 2;
        const hy = ly * SCALE / 2;
        const hz = lz * SCALE / 2;
        const xAt = (i) => -hx + i * SCALE;
        const yAt = (j) => -hy + j * SCALE;
        const zAt = (k) => -hz + k * SCALE;
        const pts = [];
        for (let j = 0; j <= ly; j++) for (let k = 0; k <= lz; k++) pts.push(xAt(0), yAt(j), zAt(k), xAt(lx), yAt(j), zAt(k));
        for (let i = 0; i <= lx; i++) for (let k = 0; k <= lz; k++) pts.push(xAt(i), yAt(0), zAt(k), xAt(i), yAt(ly), zAt(k));
        for (let i = 0; i <= lx; i++) for (let j = 0; j <= ly; j++) pts.push(xAt(i), yAt(j), zAt(0), xAt(i), yAt(j), zAt(lz));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        return geo;
    };

    const buildMesh = () => {
        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
        if (edges) { scene.remove(edges); edges.geometry.dispose(); }
        if (lattice) { scene.remove(lattice); lattice.geometry.dispose(); lattice = null; }
        const geo = shape === "cylinder"
            ? new THREE.CylinderGeometry(R * SCALE * 0.7, R * SCALE * 0.7, H * SCALE, 44)
            : new THREE.BoxGeometry(L * SCALE, H * SCALE, W * SCALE);
        mesh = new THREE.Mesh(geo, material);
        edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial);
        mesh.rotation.y = spin;
        edges.rotation.y = spin;
        scene.add(mesh, edges);
        if (shape !== "cylinder") {
            lattice = new THREE.LineSegments(buildLattice(L, H, W), latticeMaterial);
            lattice.rotation.y = spin;
            scene.add(lattice);
        }
    };

    const updateReadout = () => {
        if (shape === "cylinder") {
            const volume = Math.round(Math.PI * R * R * H * 10) / 10;
            bigEl.textContent = `${volume} ${unit}³`;
            detailEl.textContent = `π × ${R}² × ${H} = ${volume} ${unit}³`;
        } else {
            const volume = L * W * H;
            bigEl.textContent = `${volume} ${unit}³`;
            detailEl.textContent = `${L} × ${W} × ${H} = ${volume} ${unit}³`;
        }
    };

    buildMesh();
    updateReadout();

    const handleResize = () => {
        const nextWidth = stage.clientWidth || width;
        camera.aspect = nextWidth / height;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, height);
    };
    window.addEventListener("resize", handleResize);

    let active = true;
    let frameId = null;
    const animate = () => {
        if (!active) return;
        frameId = requestAnimationFrame(animate);
        if (!isPaused && mesh) {
            spin += 0.006;
            mesh.rotation.y = spin;
            if (edges) edges.rotation.y = spin;
            if (lattice) lattice.rotation.y = spin;
        }
        if (orbit) orbit.update();
        renderer.render(scene, camera);
    };
    animate();

    if (interactive) {
        const controls = makeEl("div", "slices-controls");
        const makeSlider = (labelText, value, onChange) => {
            const wrap = makeEl("label", "slices-control");
            const head = makeEl("span", "slices-control-head");
            head.appendChild(makeEl("span", "slices-control-name", labelText));
            const valueEl = makeEl("span", "slices-control-value", `${value} ${unit}`);
            head.appendChild(valueEl);
            const input = document.createElement("input");
            input.type = "range";
            input.min = String(minD);
            input.max = String(maxD);
            input.value = String(value);
            input.className = "slices-range";
            input.addEventListener("input", () => {
                const next = clampD(readNum(input.value, value));
                valueEl.textContent = `${next} ${unit}`;
                onChange(next);
                buildMesh();
                updateReadout();
            });
            wrap.appendChild(head);
            wrap.appendChild(input);
            return wrap;
        };

        if (shape === "cylinder") {
            controls.appendChild(makeSlider("Radius", R, (v) => { R = v; }));
            controls.appendChild(makeSlider("Height", H, (v) => { H = v; }));
        } else {
            controls.appendChild(makeSlider("Length", L, (v) => { L = v; }));
            controls.appendChild(makeSlider("Width", W, (v) => { W = v; }));
            controls.appendChild(makeSlider("Height", H, (v) => { H = v; }));
        }
        card.appendChild(controls);
        card.appendChild(makeEl("p", "slices-tip", media.tip
            || "Drag a slider to grow or shrink a side, and spin the shape with your mouse. What happens to the volume if you double one side?"));
    }

    if (media.teachingPoint) card.appendChild(makeEl("p", "teaching-point", media.teachingPoint));

    return {
        pause: null,
        resume: null,
        cleanup: () => {
            active = false;
            if (frameId) cancelAnimationFrame(frameId);
            window.removeEventListener("resize", handleResize);
            if (orbit) orbit.dispose();
            if (mesh) mesh.geometry.dispose();
            if (edges) edges.geometry.dispose();
            if (lattice) lattice.geometry.dispose();
            material.dispose();
            edgeMaterial.dispose();
            latticeMaterial.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode === stage) stage.removeChild(renderer.domElement);
        }
    };
}

function initThreeJS(container, payload) {
    const viewportWidth = container.clientWidth || container.offsetWidth || 640;
    const viewportHeight = container.clientHeight || 320;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, viewportWidth / viewportHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewportWidth, viewportHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(4, 6, 8);
    const fillLight = new THREE.PointLight(0xffc857, 0.85, 30);
    fillLight.position.set(-5, -2, 5);
    scene.add(keyLight, fillLight);
    camera.position.set(0, 0.5, 5);

    let controls = null;
    if (THREE.OrbitControls) {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 2.5;
        controls.maxDistance = 9;
    }

    const handleResize = () => {
        const nextWidth = container.clientWidth || viewportWidth;
        const nextHeight = container.clientHeight || viewportHeight;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener("resize", handleResize);

    try {
        new Function("scene", "camera", "THREE", payload.setup || "")(scene, camera, THREE);
    } catch (error) {
        console.warn("Three.js setup failed", error);
    }

    let active = true;
    let frameId = null;
    const animate = () => {
        if (!active) return;
        frameId = requestAnimationFrame(animate);
        if (!isPaused && payload.update) {
            try {
                new Function("scene", "camera", "THREE", payload.update)(scene, camera, THREE);
            } catch (error) {
                console.warn("Three.js update failed", error);
            }
        }
        if (controls) controls.update();
        renderer.render(scene, camera);
    };
    animate();

    return {
        pause: null,   // the animation loop already checks the global isPaused
        resume: null,
        cleanup: () => {
            active = false;
            if (frameId) cancelAnimationFrame(frameId);
            window.removeEventListener("resize", handleResize);
            if (controls) controls.dispose();
            renderer.dispose();
            if (renderer.domElement.parentNode === container) {
                container.removeChild(renderer.domElement);
            }
        }
    };
}

function initMatterJS(container, payload) {
    const viewportWidth = container.clientWidth || container.offsetWidth || 640;
    const viewportHeight = container.clientHeight || 320;
    const engine = Matter.Engine.create();
    const render = Matter.Render.create({
        element: container,
        engine,
        options: {
            width: viewportWidth,
            height: viewportHeight,
            wireframes: false,
            background: "transparent"
        }
    });

    const wallThickness = 44;
    const boundaryStyle = { isStatic: true, render: { visible: false } };
    const ground = Matter.Bodies.rectangle(viewportWidth / 2, viewportHeight + wallThickness / 2 - 6, viewportWidth + wallThickness, wallThickness, boundaryStyle);
    const leftWall = Matter.Bodies.rectangle(-wallThickness / 2 + 6, viewportHeight / 2, wallThickness, viewportHeight + wallThickness, boundaryStyle);
    const rightWall = Matter.Bodies.rectangle(viewportWidth + wallThickness / 2 - 6, viewportHeight / 2, wallThickness, viewportHeight + wallThickness, boundaryStyle);
    const ceiling = Matter.Bodies.rectangle(viewportWidth / 2, -wallThickness / 2, viewportWidth + wallThickness, wallThickness, boundaryStyle);
    Matter.World.add(engine.world, [ground, leftWall, rightWall, ceiling]);

    try {
        new Function("world", "Matter", "width", "height", payload.setup || "")(engine.world, Matter, viewportWidth, viewportHeight);
    } catch (error) {
        console.warn("Matter.js setup failed", error);
    }

    const mouse = Matter.Mouse.create(render.canvas);
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
        mouse,
        constraint: {
            stiffness: 0.18,
            render: { visible: false }
        }
    });
    Matter.World.add(engine.world, mouseConstraint);
    render.mouse = mouse;

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

    return {
        pause: () => { runner.enabled = false; },
        resume: () => { runner.enabled = true; },
        cleanup: () => {
            Matter.Render.stop(render);
            Matter.Runner.stop(runner);
            Matter.World.clear(engine.world, false);
            Matter.Engine.clear(engine);
            if (render.canvas && render.canvas.parentNode === container) {
                container.removeChild(render.canvas);
            }
            render.textures = {};
        }
    };
}

// The single source of truth for media types. Add a type by adding one entry.
const MEDIA_RENDERERS = {
    illustration: renderIllustration,
    chart: renderChart,
    image: renderImage,
    photo: renderImage,
    video: renderVideo,
    slices: renderSlices,
    grid: renderGrid,
    percentOf: renderPercentOf,
    percentLab: renderPercentLab,
    percentPie: renderPercentPie,
    percentCompare: renderPercentCompare,
    varBox: renderVarBox,
    functionMachine: renderFunctionMachine,
    volume3d: renderVolume3D,
    threejs: (container, media) => initThreeJS(container, media.payload || {}),
    matterjs: (container, media) => initMatterJS(container, media.payload || {})
};

const isCanvasMedia = (media) => media && (media.type === "threejs" || media.type === "matterjs");

// Renders any media object into `container` and tracks live scenes under `group`.
function renderMedia(container, media, group) {
    if (!media || !media.type) return;
    const renderer = MEDIA_RENDERERS[media.type];
    if (typeof renderer !== "function") {
        container.appendChild(makeEl("p", "media-caption", `Unsupported media type: ${media.type}`));
        return;
    }
    let handle = null;
    try {
        handle = renderer(container, media);
    } catch (error) {
        console.warn("Media render failed", error);
    }
    if (handle) registerSimulation(group, handle);
}

/* ----- 7. Question media --------------------------------------------------- */
const getQuestionMedia = (question) => {
    if (question.media) return question.media;
    if (question.engine && question.engine !== "none") {
        return { type: question.engine, payload: question.payload || {} };
    }
    return null;
};

function renderQuestionMedia(question) {
    cleanupSimulations("question");
    clearElement(els.mediaRenderer);
    clearElement(els.canvasWrapper);
    els.mediaRenderer.className = "media-renderer";
    els.canvasWrapper.className = "canvas-wrapper hidden";

    const media = getQuestionMedia(question);
    if (!media || !media.type) {
        els.mediaStage.classList.add("hidden");
        return;
    }

    els.mediaStage.classList.remove("hidden");

    if (isCanvasMedia(media)) {
        els.mediaRenderer.classList.add("hidden");
        els.canvasWrapper.classList.remove("hidden");
        renderMedia(els.canvasWrapper, media, "question");
    } else {
        els.mediaRenderer.classList.remove("hidden");
        els.canvasWrapper.classList.add("hidden");
        renderMedia(els.mediaRenderer, media, "question");
    }
}

/* ----- 8. Mini-lesson renderer --------------------------------------------- */
/* A "lesson" hint is a full teaching unit: an ordered list of sections, each
   with its own text, optional visual (any media type), step list, bullet
   points and a highlighted takeaway note. It expands inline below the
   question; while it is open the timer is frozen and no hint penalty applies. */

const isLessonHint = (question) => {
    const hint = question.hint;
    return Boolean(hint && (hint.format === "lesson" || Array.isArray(hint.sections)));
};

// Builds one lesson section card. The visual is NOT mounted here - the caller
// mounts it after the card is in the DOM so 3D/2D scenes get a real size.
function buildLessonSection(section, index) {
    const card = makeEl("section", "lesson-section");

    const head = makeEl("div", "lesson-section-head");
    head.appendChild(makeEl("span", "lesson-step-badge", String(index + 1)));
    head.appendChild(makeEl("h4", "lesson-section-heading", section.heading || `Step ${index + 1}`));
    card.appendChild(head);

    appendParagraphs(card, section.body, "lesson-text");

    let visualContainer = null;
    if (section.visual && section.visual.type) {
        visualContainer = makeEl("div", isCanvasMedia(section.visual)
            ? "lesson-visual lesson-canvas"
            : "lesson-visual");
        card.appendChild(visualContainer);
    }

    if (Array.isArray(section.steps) && section.steps.length) {
        const list = makeEl("ol", "lesson-steps");
        section.steps.forEach((step) => list.appendChild(makeEl("li", "", step)));
        card.appendChild(list);
    }

    if (Array.isArray(section.points) && section.points.length) {
        const list = makeEl("ul", "lesson-points");
        section.points.forEach((point) => list.appendChild(makeEl("li", "", point)));
        card.appendChild(list);
    }

    if (section.note) {
        const note = makeEl("div", "lesson-note");
        note.appendChild(makeEl("span", "lesson-note-label", "Remember"));
        note.appendChild(makeEl("span", "lesson-note-text", section.note));
        card.appendChild(note);
    }

    return { card, visualContainer, visual: section.visual };
}

function renderLesson(question) {
    cleanupSimulations("lesson");
    clearElement(els.hintBox);
    els.hintBox.classList.add("lesson-mode");

    const lesson = question.hint || {};
    const panel = makeEl("div", "lesson");

    const header = makeEl("header", "lesson-header");
    header.appendChild(makeEl("p", "lesson-eyebrow", "Mini Lesson"));
    header.appendChild(makeEl("h3", "lesson-title", lesson.title || "Let's learn this together"));
    if (lesson.subtitle) header.appendChild(makeEl("p", "lesson-subtitle", lesson.subtitle));
    panel.appendChild(header);

    // The panel is attached before sections are mounted so that any 3D/2D
    // scene reads a correct container width when it initialises.
    els.hintBox.appendChild(panel);

    const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
    sections.forEach((section, index) => {
        const { card, visualContainer, visual } = buildLessonSection(section, index);
        panel.appendChild(card);
        if (visual && visualContainer) {
            renderMedia(visualContainer, visual, "lesson");
        }
    });

    const closeBtn = makeEl("button", "btn-main secondary lesson-close-btn", "Close Lesson");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closeLesson);
    panel.appendChild(closeBtn);
}

function openLesson(question) {
    if (gameFinished) return;
    lessonOpen = true;
    els.hintBox.classList.remove("hidden");   // unhide first so scenes get a real size
    renderLesson(question);
    els.helpBtn.textContent = "Close Lesson";
    els.helpBtn.classList.add("lesson-active");
    updateTimerState();
}

function closeLesson() {
    lessonOpen = false;
    cleanupSimulations("lesson");
    clearElement(els.hintBox);
    els.hintBox.classList.add("hidden");
    els.hintBox.classList.remove("lesson-mode");
    els.helpBtn.textContent = "Open Lesson";
    els.helpBtn.classList.remove("lesson-active");
    updateTimerState();
}

function toggleLesson(question) {
    if (lessonOpen) closeLesson();
    else openLesson(question);
}

/* ----- 9. Legacy hint renderer --------------------------------------------- */
/* Older question packs use a small hint object ({ title, text, steps }).
   They keep working unchanged: a one-shot yellow box that counts as a hint. */

const buildHintText = (question) => {
    if (typeof question.hint === "string") return question.hint;
    if (question.hint?.text) return question.hint.text;
    if (Array.isArray(question.hints) && question.hints.length) return question.hints[0];

    const correct = question.correctAnswer?.toString?.() || "";
    const options = Array.isArray(question.options) ? question.options : [];
    const narrowed = options.filter((option) => option !== correct).slice(0, Math.max(1, options.length - 2));
    if (narrowed.length) return `Try eliminating ${narrowed.join(" and ")} first, then compare what is left.`;

    return "Look for the key number or clue in the picture, chart, or simulation before choosing.";
};

function showLegacyHint(question) {
    if (isPaused || answerLocked) return;

    if (!helpUsedThisQuestion) {
        helpUsedThisQuestion = true;
        helpUsedCount++;
        updateScoreDisplay();
    }

    clearElement(els.hintBox);
    const hint = question.hint;
    if (hint?.title) els.hintBox.appendChild(makeEl("strong", "hint-title", hint.title));
    els.hintBox.appendChild(makeEl("span", "hint-text", buildHintText(question)));
    if (Array.isArray(hint?.steps) && hint.steps.length) {
        const list = makeEl("ol", "hint-steps");
        hint.steps.forEach((step) => list.appendChild(makeEl("li", "", step)));
        els.hintBox.appendChild(list);
    }

    els.hintBox.classList.remove("hidden");
    els.helpBtn.disabled = true;
    els.helpBtn.classList.add("disabled");
    els.helpBtn.textContent = "Hint Used";
}

/* ----- 10. Question flow --------------------------------------------------- */
function loadQuestion() {
    const questions = getQuestions();
    const question = questions[currentQuestionIndex];
    if (!question) {
        finishGame();
        return;
    }

    cleanupAllSimulations();
    lessonOpen = false;
    questionElapsedSeconds = 0;
    helpUsedThisQuestion = false;
    answerLocked = false;

    els.questionCode.textContent = question.code || question.id || `Q-${currentQuestionIndex + 1}`;
    els.questionText.textContent = question.question;

    const estimateSeconds = getQuestionEstimate(question);
    questionTargetSeconds = estimateSeconds
        || Math.max(1, Math.round(selectedDuration / questions.length));
    if (estimateSeconds) {
        els.questionTimeValue.textContent = formatTime(estimateSeconds);
        els.questionTime.classList.remove("hidden");
    } else {
        els.questionTime.classList.add("hidden");
    }

    els.progressDisplay.textContent = `${currentQuestionIndex + 1}/${questions.length}`;
    els.progressBar.style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;
    els.feedback.classList.add("hidden");
    els.feedback.textContent = "";
    els.feedback.className = "feedback hidden";
    els.hintBox.classList.add("hidden");
    els.hintBox.classList.remove("lesson-mode");
    clearElement(els.hintBox);
    els.helpBtn.disabled = false;
    els.helpBtn.classList.remove("disabled", "lesson-active");

    renderQuestionMedia(question);
    renderInputs(question);
    updatePaceDisplay();
    updateTimerState();
}

function renderInputs(question) {
    clearElement(els.inputArea);
    const grid = makeEl("div", "input-grid");

    question.options.forEach((option) => {
        const button = makeEl("button", "answer-btn", option);
        button.type = "button";
        button.addEventListener("click", () => checkAnswer(option, question.correctAnswer));
        grid.appendChild(button);
    });

    els.inputArea.appendChild(grid);

    // A lesson hint is a free, re-openable study panel; a legacy hint is a
    // one-shot reveal that counts against the player.
    if (isLessonHint(question)) {
        els.helpBtn.textContent = "Let's Learn";
        els.helpBtn.onclick = () => toggleLesson(question);
    } else {
        els.helpBtn.textContent = "Show Hint";
        els.helpBtn.onclick = () => showLegacyHint(question);
    }
}

function checkAnswer(userAnswer, correctAnswer) {
    if (isPaused || answerLocked) return;
    answerLocked = true;

    const isCorrect = userAnswer.toString().toLowerCase() === correctAnswer.toString().toLowerCase();
    els.feedback.classList.remove("hidden", "success", "error");

    if (isCorrect) {
        correctAnswers++;
        els.feedback.textContent = "Correct! Nice thinking.";
        els.feedback.classList.add("success");
        playFeedbackTone("correct");
    } else {
        els.feedback.textContent = `Not this time. The answer was ${correctAnswer}.`;
        els.feedback.classList.add("error");
        playFeedbackTone("wrong");
    }

    updateScoreDisplay();
    els.inputArea.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
        if (button.textContent === correctAnswer.toString()) button.classList.add("is-correct");
        if (button.textContent === userAnswer.toString() && !isCorrect) button.classList.add("is-wrong");
    });

    setTimeout(() => {
        currentQuestionIndex++;
        if (currentQuestionIndex < getQuestions().length) loadQuestion();
        else finishGame();
    }, 1800);
}

/* ----- 11. Timer ----------------------------------------------------------- */
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        // The timer is frozen during a manual pause, after the game ends, and
        // while a mini-lesson is open (studying carries no time penalty).
        if (isPaused || gameFinished || lessonOpen) return;

        timeRemaining--;
        questionElapsedSeconds++;

        if (timeRemaining <= 10 && timeRemaining > 0) playFeedbackTone("tick");

        els.timerDisplay.textContent = formatTime(timeRemaining);
        updateTimerState();
        updatePaceDisplay();

        if (timeRemaining <= 0) finishGame();
    }, 1000);
}

function finishGame() {
    if (gameFinished) return;
    clearInterval(timerInterval);
    cleanupAllSimulations();
    lessonOpen = false;
    setPaused(false);
    gameFinished = true;

    els.gameScreen.classList.add("hidden");
    els.resultScreen.classList.remove("hidden");
    els.finalScore.textContent = `${correctAnswers}/${getQuestions().length}`;
    els.finalHelp.textContent = `${helpUsedCount}`;
}

/* ----- 12. Pack loading and setup ------------------------------------------ */
const normalizeQuizData = (data) => {
    const questions = Array.isArray(data.questions) ? data.questions : [];
    return {
        ...data,
        quizTitle: data.quizTitle || data.title || "Quiz Quest",
        questions: questions.map((question, index) => ({
            id: question.id || `q${index + 1}`,
            code: question.code || question.id || `Q-${String(index + 1).padStart(2, "0")}`,
            engine: question.engine || "none",
            payload: question.payload || {},
            ...question
        }))
    };
};

const setLoadedQuiz = (data, sourceLabel) => {
    quizData = normalizeQuizData(data);
    if (!getQuestions().length) throw new Error("No questions found.");
    els.fileStatus.textContent = `${getQuizTitle()} loaded (${getQuestions().length} questions)`;
    if (sourceLabel) els.fileStatus.textContent += ` from ${sourceLabel}`;
    els.startBtn.disabled = false;
    els.startBtn.classList.remove("disabled");

    const suggestedTotal = getPackEstimateTotal();
    if (suggestedTotal) {
        const suggestedMinutes = Math.max(1, Math.ceil(suggestedTotal / 60));
        els.timeInput.value = suggestedMinutes;
        selectedDuration = suggestedMinutes * 60;
        els.timeStatus.textContent = `This pack suggests ${suggestedMinutes} min total - each question carries its own pace target. Adjust the minutes if you like.`;
    } else {
        els.timeStatus.textContent = `Pace target: ${formatTime(Math.round(getSelectedDurationSeconds() / getQuestions().length))} per question.`;
    }
};

els.timeInput.addEventListener("change", () => {
    selectedDuration = getSelectedDurationSeconds();
    if (getPackEstimateTotal()) {
        els.timeStatus.textContent = `Total play time set to ${Math.round(selectedDuration / 60)} min. Each question still keeps its own suggested time.`;
    } else {
        els.timeStatus.textContent = `Pace target: ${formatTime(Math.round(selectedDuration / Math.max(1, getQuestions().length || 1)))} per question.`;
    }
});

els.fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (readEvent) => {
        try {
            setLoadedQuiz(JSON.parse(readEvent.target.result), file.name);
        } catch (error) {
            quizData = null;
            els.fileStatus.textContent = "This question pack could not be read.";
            els.startBtn.disabled = true;
            els.startBtn.classList.add("disabled");
            alert("The JSON file is not valid for this game.");
        }
    };
    reader.readAsText(file);
});

async function loadSelectedBuiltInPack(options = {}) {
    try {
        els.packSelect.disabled = true;
        if (!options.silent) els.fileStatus.textContent = "Loading built-in pack...";
        const response = await fetch(els.packSelect.value);
        if (!response.ok) throw new Error("Pack not found.");
        setLoadedQuiz(await response.json(), "built-in packs");
    } catch (error) {
        quizData = null;
        els.fileStatus.textContent = options.silent ? "No pack selected" : "Built-in pack could not be loaded. Try file upload instead.";
        els.startBtn.disabled = true;
        els.startBtn.classList.add("disabled");
    } finally {
        els.packSelect.disabled = false;
    }
}

els.packSelect.addEventListener("change", () => {
    loadSelectedBuiltInPack();
});

if (window.location.protocol !== "file:") {
    loadSelectedBuiltInPack({ silent: true });
}

/* ----- Pack playground (a warm-up shown after Start, before the questions) ---
   A reusable, in-code library of concept tool-sets, keyed by topic and resolved
   from the loaded pack. It is intentionally NOT read from the pack JSON yet -
   these are meant to become shared, reusable objects we can use across packs and
   screens later. A pack with no matching playground skips straight to the
   questions. The timer stays paused until the child presses Start the questions. */
const PLAYGROUND_LIBRARY = {
    percentage: {
        title: "The Percentage Playground",
        intro: "Warm up with these for a minute - they are the very same tools you will meet inside the lessons. Cut them, shade them, and watch the fraction, percentage and decimal move together.",
        sims: [
            { type: "percentLab", title: "Percentage Desk", caption: "Cut the desk, shade some parts, and read it as a fraction, a percentage and a decimal - all at once.", parts: 10, shaded: 2, amount: 40, maxParts: 100 },
            { type: "percentPie", title: "Percentage Pizza", caption: "The same idea on a pizza - shade slices and watch the fraction, percentage and decimal.", parts: 8, shaded: 4, amount: 40 },
            { type: "grid", title: "Hundred Grid", caption: "Every little square is worth 1%. Colour as many as you like.", filled: 30, showDecimal: true },
            { type: "percentOf", title: "Percent of a Number", caption: "Slide the percentage and the amount to find the part.", percent: 25, amount: 40 },
            { type: "percentCompare", title: "Compare Two", caption: "Set each pizza, then watch for the green 'Same value!' - or add and subtract them.", left: { parts: 8, shaded: 2 }, right: { parts: 4, shaded: 1 } }
        ]
    }
};

// Resolve which playground (if any) to show for the loaded pack. Matched by the
// pack title for now, so it also works for uploaded packs.
function getPlaygroundForPack() {
    const title = (getQuizTitle() || "").toLowerCase();
    if (title.includes("percent")) return PLAYGROUND_LIBRARY.percentage;
    return null;
}

function renderPlaygroundFor(def) {
    if (!els.playgroundGrid) return;
    cleanupSimulations("playground");
    clearElement(els.playgroundGrid);
    if (els.playgroundTitle) els.playgroundTitle.textContent = def.title || "The Playground";
    if (els.playgroundSubtitle && def.intro) els.playgroundSubtitle.textContent = def.intro;
    (def.sims || []).forEach((media) => {
        const cell = makeEl("div", "playground-card");
        els.playgroundGrid.appendChild(cell);
        renderMedia(cell, media, "playground");
    });
}

// Leave the playground and start the timed multiple-choice questions.
function beginQuestions() {
    cleanupSimulations("playground");
    if (els.playgroundGrid) clearElement(els.playgroundGrid);
    if (els.playgroundScreen) els.playgroundScreen.classList.add("hidden");
    els.setupScreen.classList.add("hidden");
    els.gameScreen.classList.remove("hidden");
    els.resultScreen.classList.add("hidden");
    startTimer();
    loadQuestion();
    window.scrollTo(0, 0);
}

document.querySelectorAll(".playground-begin-btn").forEach((btn) => {
    btn.addEventListener("click", beginQuestions);
});

els.startBtn.addEventListener("click", () => {
    if (!quizData) return;

    selectedDuration = getSelectedDurationSeconds();
    timeRemaining = selectedDuration;
    questionTargetSeconds = Math.max(1, Math.round(selectedDuration / getQuestions().length));
    questionElapsedSeconds = 0;
    currentQuestionIndex = 0;
    correctAnswers = 0;
    helpUsedCount = 0;
    isPaused = false;
    lessonOpen = false;
    gameFinished = false;
    answerLocked = false;

    els.quizTitle.textContent = getQuizTitle();
    els.timerDisplay.textContent = formatTime(timeRemaining);
    updateScoreDisplay();
    updatePaceDisplay();
    updateTimerState();

    // Show the pack's playground first (timer stays paused); if the pack has no
    // playground, go straight to the questions.
    const playground = getPlaygroundForPack();
    if (playground) {
        renderPlaygroundFor(playground);
        els.setupScreen.classList.add("hidden");
        els.playgroundScreen.classList.remove("hidden");
        window.scrollTo(0, 0);
    } else {
        beginQuestions();
    }
});

els.pauseBtn.addEventListener("click", () => setPaused(!isPaused));
els.resumeBtn.addEventListener("click", () => setPaused(false));

/* ----- 13. Theme (light / dark) -------------------------------------------- */
/* The initial theme is set by an inline script in index.html (to avoid a
   flash). Here we wire the toggle and keep following the device until the
   visitor makes an explicit choice. */
const THEME_KEY = "aiedu-theme";
const themeToggleBtn = document.getElementById("theme-toggle");

const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
};

const getCurrentTheme = () => document.documentElement.getAttribute("data-theme") || "light";

if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
        const next = getCurrentTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch (error) {
            /* storage unavailable - the choice simply will not persist */
        }
    });
}

if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        let stored = null;
        try {
            stored = localStorage.getItem(THEME_KEY);
        } catch (error) {
            /* ignore */
        }
        if (!stored) applyTheme(event.matches ? "dark" : "light");
    });
}

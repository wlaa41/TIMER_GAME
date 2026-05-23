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
const simulationGroups = { question: [], lesson: [] };

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
            detailEl.textContent = `${filled}% = ${filled}/100 = ${decText}`;
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

    els.setupScreen.classList.add("hidden");
    els.gameScreen.classList.remove("hidden");
    els.resultScreen.classList.add("hidden");
    startTimer();
    loadQuestion();
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

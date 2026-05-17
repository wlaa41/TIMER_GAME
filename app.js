let quizData = null;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let helpUsedCount = 0;
let selectedDuration = 600;
let timeRemaining = 600;
let questionTargetSeconds = 60;
let questionElapsedSeconds = 0;
let timerInterval = null;
let activeSimulationCleanup = null;
let activeSimulationPause = null;
let activeSimulationResume = null;
let audioContext = null;
let helpUsedThisQuestion = false;
let isPaused = false;
let gameFinished = false;
let answerLocked = false;

const els = {
    setupScreen: document.getElementById("setup-screen"),
    gameScreen: document.getElementById("game-screen"),
    resultScreen: document.getElementById("result-screen"),
    fileInput: document.getElementById("json-upload"),
    fileStatus: document.getElementById("file-status"),
    packSelect: document.getElementById("pack-select"),
    loadPackBtn: document.getElementById("load-pack-btn"),
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

const getQuestions = () => quizData?.questions || [];

const getQuizTitle = () => quizData?.quizTitle || quizData?.title || "Quiz Quest";

const getSelectedDurationSeconds = () => {
    const minutes = Math.max(1, parseInt(els.timeInput.value, 10) || 10);
    els.timeInput.value = minutes;
    return minutes * 60;
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

const getQuestionMedia = (question) => {
    if (question.media) return question.media;
    if (question.engine && question.engine !== "none") {
        return {
            type: question.engine,
            payload: question.payload || {}
        };
    }
    return null;
};

const cleanupActiveSimulation = () => {
    if (activeSimulationCleanup) activeSimulationCleanup();
    activeSimulationCleanup = null;
    activeSimulationPause = null;
    activeSimulationResume = null;
};

const setPaused = (nextPaused) => {
    if (gameFinished) return;
    isPaused = nextPaused;
    document.body.classList.toggle("is-paused", isPaused);
    els.pauseOverlay.classList.toggle("hidden", !isPaused);
    els.pauseBtn.textContent = isPaused ? "Resume" : "Pause";
    if (isPaused && activeSimulationPause) activeSimulationPause();
    if (!isPaused && activeSimulationResume) activeSimulationResume();
    updateTimerState();
};

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
    els.timeStatus.textContent = `Pace target: ${formatTime(Math.round(getSelectedDurationSeconds() / getQuestions().length))} per question.`;
};

els.timeInput.addEventListener("change", () => {
    selectedDuration = getSelectedDurationSeconds();
    els.timeStatus.textContent = `Pace target: ${formatTime(Math.round(selectedDuration / Math.max(1, getQuestions().length || 1)))} per question.`;
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
        els.loadPackBtn.disabled = true;
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
        els.loadPackBtn.disabled = false;
    }
}

els.loadPackBtn.addEventListener("click", () => {
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

function loadQuestion() {
    const questions = getQuestions();
    const question = questions[currentQuestionIndex];
    if (!question) {
        finishGame();
        return;
    }

    cleanupActiveSimulation();
    questionElapsedSeconds = 0;
    helpUsedThisQuestion = false;
    answerLocked = false;

    els.questionCode.textContent = question.code || question.id || `Q-${currentQuestionIndex + 1}`;
    els.questionText.textContent = question.question;
    els.progressDisplay.textContent = `${currentQuestionIndex + 1}/${questions.length}`;
    els.progressBar.style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;
    els.feedback.classList.add("hidden");
    els.feedback.textContent = "";
    els.feedback.className = "feedback hidden";
    els.hintBox.classList.add("hidden");
    clearElement(els.hintBox);
    els.helpBtn.disabled = false;
    els.helpBtn.classList.remove("disabled");
    els.helpBtn.textContent = "Show Hint";

    renderMedia(question);
    renderInputs(question);
    updatePaceDisplay();
}

function renderMedia(question) {
    const media = getQuestionMedia(question);
    cleanupActiveSimulation();
    clearElement(els.mediaRenderer);
    clearElement(els.canvasWrapper);
    els.mediaRenderer.className = "media-renderer";
    els.canvasWrapper.className = "canvas-wrapper hidden";

    if (!media) {
        els.mediaStage.classList.add("hidden");
        return;
    }

    els.mediaStage.classList.remove("hidden");

    if (media.type === "threejs") {
        els.mediaRenderer.classList.add("hidden");
        els.canvasWrapper.classList.remove("hidden");
        initThreeJS(els.canvasWrapper, media.payload || question.payload || {});
        return;
    }

    if (media.type === "matterjs") {
        els.mediaRenderer.classList.add("hidden");
        els.canvasWrapper.classList.remove("hidden");
        initMatterJS(els.canvasWrapper, media.payload || question.payload || {});
        return;
    }

    els.mediaRenderer.classList.remove("hidden");
    els.canvasWrapper.classList.add("hidden");

    if (media.type === "chart") {
        renderChart(els.mediaRenderer, media);
    } else if (media.type === "image" || media.type === "photo") {
        renderImage(els.mediaRenderer, media);
    } else {
        renderIllustration(els.mediaRenderer, media);
    }
}

function addMediaText(container, media) {
    if (media.title) container.appendChild(makeEl("h3", "media-title", media.title));
    if (media.caption) container.appendChild(makeEl("p", "media-caption", media.caption));
}

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

function renderIllustration(container, media) {
    const card = makeEl("div", `illustration-card theme-${media.theme || "study"}`);
    addMediaText(card, media);

    const scene = makeEl("div", "illustration-scene");
    if (media.theme === "triangle") {
        scene.appendChild(makeEl("div", "triangle-shape"));
    } else if (media.theme === "balance") {
        scene.appendChild(makeEl("div", "balance-left", media.left || "x"));
        scene.appendChild(makeEl("div", "balance-beam"));
        scene.appendChild(makeEl("div", "balance-right", media.right || "?"));
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

    activeSimulationPause = null;
    activeSimulationResume = null;
    activeSimulationCleanup = () => {
        active = false;
        if (frameId) cancelAnimationFrame(frameId);
        window.removeEventListener("resize", handleResize);
        if (controls) controls.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement);
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

    activeSimulationPause = () => {
        runner.enabled = false;
    };
    activeSimulationResume = () => {
        runner.enabled = true;
    };
    activeSimulationCleanup = () => {
        Matter.Render.stop(render);
        Matter.Runner.stop(runner);
        Matter.World.clear(engine.world, false);
        Matter.Engine.clear(engine);
        if (render.canvas && render.canvas.parentNode === container) {
            container.removeChild(render.canvas);
        }
        render.textures = {};
    };
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
    els.helpBtn.onclick = () => showHint(question);
}

function showHint(question) {
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

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (isPaused || gameFinished) return;

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
    cleanupActiveSimulation();
    setPaused(false);
    gameFinished = true;

    els.gameScreen.classList.add("hidden");
    els.resultScreen.classList.remove("hidden");
    els.finalScore.textContent = `${correctAnswers}/${getQuestions().length}`;
    els.finalHelp.textContent = `${helpUsedCount}`;
}

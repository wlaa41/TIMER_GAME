let quizData = null;
let currentQuestionIndex = 0;
let correctAnswers = 0;
let selectedDuration = 600;
let timeRemaining = 600;
let timerInterval;
let activeSimulationCleanup = null;
let audioContext = null;

const formatTime = (totalSeconds) => {
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const updateScoreDisplay = () => {
    const totalQuestions = quizData?.questions?.length || 0;
    document.getElementById('score-display').innerText = `${correctAnswers}/${totalQuestions}`;
};

const ensureAudioContext = () => {
    if (!audioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) audioContext = new AudioContextClass();
    }
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
    }
    return audioContext;
};

// Sound Controller
const playFeedbackTone = (type) => {
    const context = ensureAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);

    if (type === 'correct') {
        const oscA = context.createOscillator();
        const oscB = context.createOscillator();
        oscA.type = 'triangle';
        oscB.type = 'sine';
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
    } else if (type === 'wrong') {
        const osc = context.createOscillator();
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.28);
        lfo.type = 'sine';
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
    } else if (type === 'tick') {
        const osc = context.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1240, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.08);
    }
};

const timeSelect = document.getElementById('time-select');
timeSelect.addEventListener('change', () => {
    selectedDuration = parseInt(timeSelect.value, 10);
    document.getElementById('time-status').innerText = `MISSION LENGTH SET TO ${formatTime(selectedDuration)}`;
});

// 1. FILE UPLOAD
document.getElementById('json-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            quizData = JSON.parse(event.target.result);
            document.getElementById('file-status').innerText = "CORE SYNCED: " + file.name;
            const btn = document.getElementById('start-btn');
            btn.disabled = false;
            btn.classList.remove('disabled');
            btn.innerText = "INITIATE TRANSIT";
        } catch (err) {
            alert("Corrupt JSON file.");
        }
    };
    reader.readAsText(file);
});

// 2. START MISSION
document.getElementById('start-btn').addEventListener('click', () => {
    selectedDuration = parseInt(timeSelect.value, 10);
    timeRemaining = selectedDuration;
    currentQuestionIndex = 0;
    correctAnswers = 0;
    updateScoreDisplay();
    document.getElementById('timer-display').innerText = formatTime(timeRemaining);
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    startTimer();
    loadQuestion();
});

// 3. ENGINE DISPATCHER
function loadQuestion() {
    const q = quizData.questions[currentQuestionIndex];
    document.getElementById('question-text').innerText = q.question;
    document.getElementById('progress-display').innerText = `${currentQuestionIndex + 1}/${quizData.questions.length}`;
    document.getElementById('progress-bar').style.width = `${((currentQuestionIndex + 1) / quizData.questions.length) * 100}%`;
    
    const wrapper = document.getElementById('canvas-wrapper');
    const stage = document.getElementById('media-stage');
    const feedback = document.getElementById('feedback-message');
    if (activeSimulationCleanup) {
        activeSimulationCleanup();
        activeSimulationCleanup = null;
    }
    wrapper.innerHTML = ''; // Clear previous sim
    stage.classList.add('hidden');
    feedback.classList.add('hidden');
    feedback.innerText = '';

    if (q.engine === 'threejs') {
        stage.classList.remove('hidden');
        initThreeJS(wrapper, q.payload);
    } else if (q.engine === 'matterjs') {
        stage.classList.remove('hidden');
        initMatterJS(wrapper, q.payload);
    }

    renderInputs(q);
}

// --- THREE.JS INJECTOR ---
function initThreeJS(container, payload) {
    const viewportWidth = container.clientWidth || container.offsetWidth || 640;
    const viewportHeight = container.clientHeight || 320;
    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(60, viewportWidth / viewportHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(viewportWidth, viewportHeight);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const keyLight = new THREE.DirectionalLight(0x9edcff, 1.2);
    keyLight.position.set(4, 6, 8);
    const rimLight = new THREE.PointLight(0xff7ac3, 0.9, 30);
    rimLight.position.set(-4, -2, 6);
    scene.add(keyLight, rimLight);
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
    window.addEventListener('resize', handleResize);

    // Inject JSON Setup
    try { new Function('scene', 'camera', 'THREE', payload.setup)(scene, camera, THREE); } catch(e){}

    const animate = () => {
        if (document.getElementById('game-screen').classList.contains('hidden')) return;
        requestAnimationFrame(animate);
        // Inject JSON Update
        if (payload.update) {
            try { new Function('scene', 'camera', 'THREE', payload.update)(scene, camera, THREE); } catch(e){}
        }
        if (controls) controls.update();
        renderer.render(scene, camera);
    };
    animate();

    activeSimulationCleanup = () => {
        window.removeEventListener('resize', handleResize);
        if (controls) controls.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
            container.removeChild(renderer.domElement);
        }
    };
}

// --- MATTER.JS INJECTOR ---
function initMatterJS(container, payload) {
    const viewportWidth = container.clientWidth || container.offsetWidth || 640;
    const viewportHeight = container.clientHeight || 320;
    const engine = Matter.Engine.create();
    const render = Matter.Render.create({
        element: container,
        engine: engine,
        options: {
            width: viewportWidth,
            height: viewportHeight,
            wireframes: false,
            background: 'transparent'
        }
    });
    const wallThickness = 40;
    const boundaryStyle = { isStatic: true, render: { visible: false } };
    const ground = Matter.Bodies.rectangle(viewportWidth / 2, viewportHeight + (wallThickness / 2) - 6, viewportWidth + wallThickness, wallThickness, boundaryStyle);
    const leftWall = Matter.Bodies.rectangle(-(wallThickness / 2) + 6, viewportHeight / 2, wallThickness, viewportHeight + wallThickness, boundaryStyle);
    const rightWall = Matter.Bodies.rectangle(viewportWidth + (wallThickness / 2) - 6, viewportHeight / 2, wallThickness, viewportHeight + wallThickness, boundaryStyle);
    const ceiling = Matter.Bodies.rectangle(viewportWidth / 2, -(wallThickness / 2), viewportWidth + wallThickness, wallThickness, boundaryStyle);
    Matter.World.add(engine.world, [ground, leftWall, rightWall, ceiling]);

    try { new Function('world', 'Matter', payload.setup)(engine.world, Matter); } catch(e){}

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    Matter.Render.run(render);

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

function renderInputs(q) {
    const area = document.getElementById('input-area');
    area.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'input-grid';

    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'btn-main';
        btn.innerText = opt;
        btn.onclick = () => checkAnswer(opt, q.correctAnswer);
        grid.appendChild(btn);
    });
    area.appendChild(grid);
}

function checkAnswer(user, correct) {
    const feedback = document.getElementById('feedback-message');
    feedback.classList.remove('hidden');
    
    if (user.toString().toLowerCase() === correct.toString().toLowerCase()) {
        correctAnswers++;
        feedback.innerText = "SUCCESS: DATA VALIDATED";
        feedback.style.color = "var(--accent-cyan)";
        feedback.style.border = "1px solid rgba(115, 239, 255, 0.28)";
        playFeedbackTone('correct');
    } else {
        feedback.innerText = "CRITICAL: ERROR DETECTED";
        feedback.style.color = "var(--accent-pink)";
        feedback.style.border = "1px solid rgba(255, 92, 168, 0.28)";
        playFeedbackTone('wrong');
    }
    updateScoreDisplay();
    document.getElementById('input-area').innerHTML = ''; // Prevent spam

    setTimeout(() => {
        currentQuestionIndex++;
        if (currentQuestionIndex < quizData.questions.length) loadQuestion();
        else finishGame();
    }, 2000);
}

function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeRemaining--;
        if (timeRemaining <= 10) playFeedbackTone('tick');
        
        document.getElementById('timer-display').innerText = formatTime(Math.max(timeRemaining, 0));
        const timerBox = document.querySelector('.timer-box');
        const timerState = document.getElementById('timer-state');

        timerBox.classList.remove('warning', 'critical');
        if (timeRemaining <= 30) {
            timerBox.classList.add('critical');
            timerState.innerText = 'Critical';
        } else if (timeRemaining <= 120) {
            timerBox.classList.add('warning');
            timerState.innerText = 'Pressure Rising';
        } else {
            timerState.innerText = 'Stable';
        }

        if (timeRemaining <= 0) finishGame();
    }, 1000);
}

function finishGame() {
    clearInterval(timerInterval);
    if (activeSimulationCleanup) {
        activeSimulationCleanup();
        activeSimulationCleanup = null;
    }
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-screen').classList.remove('hidden');
    document.getElementById('final-score').innerText = `${correctAnswers}/${quizData.questions.length}`;
}

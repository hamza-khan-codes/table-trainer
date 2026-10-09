
"use strict";

const $ = (selector) => document.querySelector(selector);

const difficulty = $("#difficulty");
const tableRange = $("#table-range");
const scoreEl = $(".score");
const questionNumber = $(".question-number");
const timerEl = $(".timer");
const accuracyEl = $(".accuracy");
const progressBar = $(".progress-bar");
const progressText = $(".progress-text");
const firstNumberEl = $(".first-number");
const secondNumberEl = $(".second-number");
const questionStatus = $(".question-status");
const answerInput = $("#answer");
const voiceButton = $(".voice-btn");
const startButton = $(".start-btn");
const skipButton = $(".skip-btn");
const submitButton = $(".submit-btn");
const feedbackContain = $("#feedback-contain");
const answerHistory = $(".answer-history");
const clearButton = $(".clear-btn");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
} else {
    voiceButton.title = "Speech recognition is not supported in this browser.";
}

const TOTAL_QUESTIONS = 10;
const TIME_LIMITS = { easy: 30, medium: 15, hard: 5 };
let currentQuestion = null;
let attempted = 0;
let correctCount = 0;
let score = 0;
let questionStartedAt = 0;
let sessionStartedAt = 0;
let timerId = null;
let isPlaying = false;
let isRecognizing = false;
let results = [];
let questionLocked = false;

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateStats() {
    questionNumber.textContent = `${attempted} / ${TOTAL_QUESTIONS}`;
    progressText.textContent = `${attempted} / ${TOTAL_QUESTIONS}`;
    progressBar.style.width = `${(attempted / TOTAL_QUESTIONS) * 100}%`;
    scoreEl.textContent = score;
    accuracyEl.textContent = `${attempted ? Math.round((correctCount / attempted) * 100) : 0}%`;
}

function makeQuestion() {
    const maxTable = Number(tableRange.value);
    const table = Math.floor(Math.random() * (maxTable - 2 + 1)) + 2;
    const multiplier = Math.floor(Math.random() * 10) + 1;
    currentQuestion = { first: table, second: multiplier, answer: table * multiplier };
    firstNumberEl.textContent = table;
    secondNumberEl.textContent = multiplier;
    answerInput.value = "";
    submitButton.disabled = true;
    questionLocked = false;
    feedbackContain.innerHTML = "";
    questionStartedAt = Date.now();
    questionStatus.textContent = "In progress";
    answerInput.focus({ preventScroll: true });
}

function showFeedback(isCorrect, message) {
    feedbackContain.innerHTML = `
    <div class="feedback ${isCorrect ? "correct" : "wrong"}">
      <span class="feedback-icon">${isCorrect ? "✓" : "✕"}</span>
      <div>
        <strong class="feedback-title">${isCorrect ? "Great!" : "Not quite!"}</strong>
        <p class="feedback-message">${message}</p>
      </div>
    </div>`;
}

function renderHistory() {
    if (!results.length) {
        answerHistory.innerHTML = '<div class="empty-history">Your answers will appear here.</div>';
        return;
    }
    answerHistory.innerHTML = results.slice().reverse().map((item) => `
    <div class="history-item">
        <div class="history-question"><strong>${item.first} × ${item.second}</strong><span>= ${item.correctAnswer}</span></div>
        <div class="history-result ${item.isCorrect ? " correct" : "wrong"}">${item.isCorrect ? "Correct" : "Wrong"}${item.userAnswer === null ? " · Timed out" : ""}</div>
    <span class="history-time">${item.timeTaken.toFixed(1)}s</span>
</div>`).join("");
}

function stopClock() {
    if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
    }
}

function updateClock() {
    if (!isPlaying) return;
    const elapsed = Date.now() - sessionStartedAt;
    timerEl.textContent = formatTime(elapsed);
    if (currentQuestion && !questionLocked) {
        const questionElapsed = (Date.now() - questionStartedAt) / 1000;
        const limit = TIME_LIMITS[difficulty.value];
        if (questionElapsed >= limit) submitAnswer(null, true);
    }
}

function startClock() {
    stopClock();
    sessionStartedAt = Date.now();
    timerEl.textContent = "00:00";
    timerId = setInterval(updateClock, 100);
}

function finishGame() {
    isPlaying = false;
    stopClock();
    if (recognition && isRecognizing) recognition.stop();
    questionStatus.textContent = "Completed";
    startButton.disabled = false;
    startButton.textContent = "Practice Again";
    difficulty.disabled = false;
    tableRange.disabled = false;
    skipButton.disabled = true;
    submitButton.disabled = true;
    answerInput.disabled = true;
    voiceButton.disabled = true;
    showFeedback(true, `Practice complete! You scored ${score} out of ${TOTAL_QUESTIONS}.`);
}

function submitAnswer(rawValue, timedOut = false) {
    if (!isPlaying || questionLocked || !currentQuestion) return;
    const value = rawValue === null || rawValue === "" ? null : Number(rawValue);
    if (!timedOut && (value === null || !Number.isFinite(value))) {
        showFeedback(false, "Enter an answer before submitting.");
        return;
    }

    questionLocked = true;
    const elapsed = Math.min((Date.now() - questionStartedAt) / 1000, TIME_LIMITS[difficulty.value]);
    const isCorrect = value !== null && value === currentQuestion.answer;
    attempted += 1;
    if (isCorrect) {
        correctCount += 1;
        score += 10;
    }

    results.push({
        first: currentQuestion.first,
        second: currentQuestion.second,
        correctAnswer: currentQuestion.answer,
        userAnswer: value,
        isCorrect,
        timeTaken: elapsed
    });

    updateStats();
    renderHistory();
    if (timedOut) {
        showFeedback(false, `Time is up! The correct answer was ${currentQuestion.answer}.`);
    } else if (isCorrect) {
        showFeedback(true, `Correct! ${currentQuestion.first} × ${currentQuestion.second} = ${currentQuestion.answer}.`);
    } else {
        showFeedback(false, `The correct answer is ${currentQuestion.answer}.`);
    }

    if (attempted >= TOTAL_QUESTIONS) {
        finishGame();
        return;
    }

    questionStatus.textContent = isCorrect ? "Correct" : timedOut ? "Time up" : "Answered";
    // Briefly show feedback, then move to the next question.
    submitButton.disabled = true;
    skipButton.disabled = true;
    answerInput.disabled = true;
    voiceButton.disabled = true;
    window.setTimeout(() => {
        if (!isPlaying) return;
        makeQuestion();
        answerInput.disabled = false;
        skipButton.disabled = false;
        voiceButton.disabled = !recognition;
        answerInput.focus({ preventScroll: true });
    }, 700);
}

startButton.addEventListener("click", () => {
    stopClock();
    if (recognition && isRecognizing) recognition.stop();
    attempted = 0;
    correctCount = 0;
    score = 0;
    results = [];
    isPlaying = true;
    answerInput.disabled = false;
    difficulty.disabled = true;
    tableRange.disabled = true;
    startButton.disabled = true;
    startButton.textContent = "Practice Running";
    skipButton.disabled = false;
    voiceButton.disabled = !recognition;
    updateStats();
    renderHistory();
    makeQuestion();
    startClock();
});

answerInput.addEventListener("input", () => {
    const value = answerInput.value.trim();
    submitButton.disabled = !isPlaying || questionLocked || value === "" || Number(value) < 0;
});

answerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !submitButton.disabled) submitAnswer(answerInput.value);
});

submitButton.addEventListener("click", () => submitAnswer(answerInput.value));

skipButton.addEventListener("click", () => {
    if (!isPlaying || questionLocked) return;
    submitAnswer(null, true);
});

clearButton.addEventListener("click", () => {
    results = [];
    renderHistory();
});

if (recognition) {
    voiceButton.addEventListener("click", () => {
        if (!isPlaying || isRecognizing) return;
        try {
            recognition.start();
        } catch (error) {
            showFeedback(false, "Voice recognition is already starting. Please try again.");
        }
    });

    recognition.onstart = () => {
        isRecognizing = true;
        voiceButton.classList.add("listening");
        voiceButton.innerHTML = "🔵 <span>Listening…</span>";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        // Speech recognition may return words such as "twenty four", so parse common number words too.
        const spokenNumbers = {
            zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
            seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
            thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
            eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
            fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90
        };
        const normalized = transcript.toLowerCase().replace(/[.,!?]/g, "").trim();
        let spokenValue = Number(normalized);
        if (!Number.isFinite(spokenValue) || normalized === "") {
            const parts = normalized.split(/\s+/);
            if (parts.length === 2 && spokenNumbers[parts[0]] !== undefined && spokenNumbers[parts[1]] !== undefined) {
                spokenValue = spokenNumbers[parts[0]] + spokenNumbers[parts[1]];
            } else {
                spokenValue = spokenNumbers[normalized];
            }
        }
        if (Number.isFinite(spokenValue) && spokenValue >= 0) {
            answerInput.value = spokenValue;
            submitButton.disabled = false;
            submitAnswer(spokenValue);
        } else {
            showFeedback(false, `I heard "${transcript}".Please enter the number manually.`);
        }
    };

    recognition.onerror = (event) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
            showFeedback(false, "Voice recognition had a problem. You can type your answer instead.");
        }
    };

    recognition.onend = () => {
        isRecognizing = false;
        voiceButton.classList.remove("listening");
        voiceButton.innerHTML = "🎤 <span>Speak</span>";
    };
}

window.addEventListener("beforeunload", stopClock);
updateStats();
renderHistory();

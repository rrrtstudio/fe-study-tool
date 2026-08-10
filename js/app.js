import { loadQuestionBank } from "./data-loader.js";
import { getHistory, recordAnswer, resetHistory } from "./storage.js";
import {
  QUIZ_MODES,
  createQuizSession,
  getCurrentQuestion,
  moveToNextQuestion,
  submitAnswer,
} from "./quiz.js";
import { resultMessage, summarizeSession } from "./result.js";

const elements = {
  appMessage: document.querySelector("#app-message"),
  views: [...document.querySelectorAll(".view")],
  home: document.querySelector("#home-view"),
  quiz: document.querySelector("#quiz-view"),
  result: document.querySelector("#result-view"),
  brandHome: document.querySelector("#brand-home"),
  settings: document.querySelector("#quiz-settings"),
  settingsError: document.querySelector("#settings-error"),
  startButton: document.querySelector("#start-quiz"),
  dataSummary: document.querySelector("#data-summary"),
  fieldFilters: document.querySelector("#field-filters"),
  categorySelect: document.querySelector("#category-select"),
  subcategorySelect: document.querySelector("#subcategory-select"),
  historyTotal: document.querySelector("#history-total"),
  historyRate: document.querySelector("#history-rate"),
  historyFieldList: document.querySelector("#history-field-list"),
  resetHistory: document.querySelector("#reset-history"),
  quizPosition: document.querySelector("#quiz-position"),
  quizCategory: document.querySelector("#quiz-category"),
  quizScore: document.querySelector("#quiz-score"),
  quizProgress: document.querySelector("#quiz-progress"),
  questionNumber: document.querySelector("#question-number"),
  questionDifficulty: document.querySelector("#question-difficulty"),
  questionHeading: document.querySelector("#question-heading"),
  answerForm: document.querySelector("#answer-form"),
  choiceList: document.querySelector("#choice-list"),
  answerButton: document.querySelector("#answer-button"),
  feedback: document.querySelector("#feedback"),
  feedbackIcon: document.querySelector("#feedback-icon"),
  feedbackResult: document.querySelector("#feedback-result"),
  feedbackAnswer: document.querySelector("#feedback-answer"),
  feedbackExplanation: document.querySelector("#feedback-explanation"),
  nextButton: document.querySelector("#next-button"),
  resultRate: document.querySelector("#result-rate"),
  resultMessage: document.querySelector("#result-message"),
  resultTotal: document.querySelector("#result-total"),
  resultCorrect: document.querySelector("#result-correct"),
  resultWrong: document.querySelector("#result-wrong"),
  resultMistakes: document.querySelector("#result-mistakes"),
  resultFieldBody: document.querySelector("#result-field-body"),
  wrongReviewSection: document.querySelector("#wrong-review-section"),
  wrongReviewList: document.querySelector("#wrong-review-list"),
  reviewMistakes: document.querySelector("#review-mistakes"),
  retryQuiz: document.querySelector("#retry-quiz"),
  backHome: document.querySelector("#back-home"),
};

const state = {
  bank: null,
  session: null,
  summary: null,
  repeatConfig: null,
};

function setView(view) {
  elements.views.forEach((candidate) => {
    candidate.hidden = candidate !== view;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("#main-content").focus({ preventScroll: true });
}

function showAppMessage(message, type = "warning") {
  elements.appMessage.textContent = message;
  elements.appMessage.dataset.type = type;
  elements.appMessage.hidden = !message;
}

function showSettingsError(message) {
  elements.settingsError.textContent = message;
  elements.settingsError.hidden = !message;
}

function appendOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function populateSubcategories() {
  const category = elements.categorySelect.value;
  const subcategories = [...new Set(
    state.bank.questions
      .filter((question) => question.category === category)
      .map((question) => question.subcategory),
  )].sort((a, b) => a.localeCompare(b, "ja"));

  elements.subcategorySelect.replaceChildren();
  appendOption(elements.subcategorySelect, "", "すべてのサブカテゴリ");
  subcategories.forEach((subcategory) => appendOption(elements.subcategorySelect, subcategory, subcategory));
}

function populateFieldFilters() {
  const categories = [...new Set(state.bank.questions.map((question) => question.category))]
    .sort((a, b) => a.localeCompare(b, "ja"));
  elements.categorySelect.replaceChildren();
  categories.forEach((category) => appendOption(elements.categorySelect, category, category));
  populateSubcategories();
}

function renderHistory() {
  const history = getHistory();
  elements.historyTotal.innerHTML = `${history.totalAnswers}<small>問</small>`;
  elements.historyRate.textContent = history.totalAnswers
    ? `${Math.round((history.totalCorrect / history.totalAnswers) * 100)}%`
    : "—";
  elements.historyFieldList.replaceChildren();

  const fields = Object.entries(history.fields)
    .map(([name, stats]) => ({
      name,
      ...stats,
      accuracy: stats.answers ? Math.round((stats.correct / stats.answers) * 100) : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy || a.name.localeCompare(b.name, "ja"));

  if (fields.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-history";
    empty.textContent = "問題に回答すると、ここに分野別の成績が表示されます。";
    elements.historyFieldList.append(empty);
    return;
  }

  fields.forEach((field) => {
    const row = document.createElement("div");
    row.className = "history-field-row";
    const name = document.createElement("span");
    name.textContent = field.name;
    const track = document.createElement("span");
    track.className = "mini-track";
    const fill = document.createElement("span");
    fill.style.width = `${field.accuracy}%`;
    track.append(fill);
    const rate = document.createElement("strong");
    rate.textContent = `${field.accuracy}%`;
    row.append(name, track, rate);
    elements.historyFieldList.append(row);
  });
}

function readSettings() {
  const form = new FormData(elements.settings);
  const scope = form.get("scope")?.toString() ?? "all";
  return {
    count: Number.parseInt(form.get("count")?.toString() ?? "10", 10),
    mode: form.get("mode")?.toString() ?? QUIZ_MODES.RANDOM,
    conditions: {
      scope,
      category: scope === "field" ? elements.categorySelect.value : "",
      subcategory: scope === "field" ? elements.subcategorySelect.value : "",
    },
  };
}

function beginQuiz(config, rememberConfig = true) {
  showSettingsError("");
  const session = createQuizSession(state.bank.questions, config, getHistory());
  if (session.questions.length === 0) {
    const message = config.mode === QUIZ_MODES.MISTAKES
      ? "この範囲には、過去に間違えた問題がありません。別の出題方式または範囲を選んでください。"
      : "選択した条件に該当する問題がありません。条件を変更してください。";
    showSettingsError(message);
    if (elements.home.hidden) {
      setView(elements.home);
      renderHistory();
    }
    return;
  }

  state.session = session;
  state.summary = null;
  if (rememberConfig) state.repeatConfig = structuredClone(config);
  showAppMessage("");
  setView(elements.quiz);
  renderQuestion();
}

function updateQuizProgress(answered = false) {
  const completed = state.session.index + (answered ? 1 : 0);
  const percent = Math.round((completed / state.session.questions.length) * 100);
  elements.quizProgress.setAttribute("aria-valuenow", String(percent));
  elements.quizProgress.querySelector("span").style.width = `${percent}%`;
}

function renderQuestion() {
  const question = getCurrentQuestion(state.session);
  const position = state.session.index + 1;
  const total = state.session.questions.length;

  elements.quizPosition.textContent = `${position} / ${total}問`;
  elements.quizCategory.textContent = `科目${question.exam} ・ ${question.category} ・ ${question.subcategory}`;
  elements.quizScore.textContent = `${state.session.correctCount}問`;
  elements.questionNumber.textContent = `Q${position}`;
  elements.questionDifficulty.textContent = `難易度 ${question.difficulty} / 5`;
  elements.questionHeading.textContent = question.question;
  elements.choiceList.replaceChildren();

  question.choices.forEach((choice, index) => {
    const label = document.createElement("label");
    label.className = "choice-option";
    label.dataset.index = String(index);
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = String(index);
    const body = document.createElement("span");
    const letter = document.createElement("span");
    letter.className = "choice-letter";
    letter.textContent = String.fromCharCode(65 + index);
    const text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = choice;
    const verdict = document.createElement("span");
    verdict.className = "choice-verdict";
    body.append(letter, text, verdict);
    label.append(input, body);
    elements.choiceList.append(label);
  });

  elements.answerButton.disabled = true;
  elements.answerButton.hidden = false;
  elements.nextButton.hidden = true;
  elements.feedback.hidden = true;
  elements.feedback.className = "feedback";
  updateQuizProgress(false);
  elements.questionHeading.focus({ preventScroll: true });
}

function revealAnswer(answer) {
  const question = getCurrentQuestion(state.session);
  const choiceLabels = [...elements.choiceList.querySelectorAll(".choice-option")];
  choiceLabels.forEach((label, index) => {
    const input = label.querySelector("input");
    const verdict = label.querySelector(".choice-verdict");
    input.disabled = true;
    if (index === answer.correctIndex) {
      label.classList.add("is-correct");
      verdict.textContent = "○ 正解";
    } else if (index === answer.selectedIndex) {
      label.classList.add("is-wrong");
      verdict.textContent = "× あなたの回答";
    }
  });

  elements.answerButton.hidden = true;
  elements.feedback.hidden = false;
  elements.feedback.classList.add(answer.isCorrect ? "correct" : "wrong");
  elements.feedbackIcon.textContent = answer.isCorrect ? "○" : "×";
  elements.feedbackResult.textContent = answer.isCorrect ? "正解" : "不正解";
  elements.feedbackAnswer.textContent = `正しい答え：${String.fromCharCode(65 + answer.correctIndex)}. ${question.choices[answer.correctIndex]}`;
  elements.feedbackExplanation.textContent = question.explanation;
  elements.nextButton.hidden = false;
  elements.nextButton.firstChild.textContent = state.session.index === state.session.questions.length - 1
    ? "結果を見る "
    : "次の問題へ ";
  elements.quizScore.textContent = `${state.session.correctCount}問`;
  updateQuizProgress(true);
  elements.feedback.focus({ preventScroll: true });
}

function appendCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
}

function renderWrongReview(wrongAnswers) {
  elements.wrongReviewList.replaceChildren();
  elements.wrongReviewSection.hidden = wrongAnswers.length === 0;
  elements.reviewMistakes.hidden = wrongAnswers.length === 0;

  wrongAnswers.forEach(({ question, answer }, index) => {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = `${index + 1}. ${question.question}`;
    const body = document.createElement("div");
    body.className = "wrong-detail";
    const selected = document.createElement("p");
    const selectedLabel = document.createElement("strong");
    selectedLabel.textContent = "あなたの回答：";
    selected.append(selectedLabel, question.choices[answer.selectedIndex]);
    const correct = document.createElement("p");
    const correctLabel = document.createElement("strong");
    correctLabel.textContent = "正解：";
    correct.append(correctLabel, question.choices[answer.correctIndex]);
    const explanation = document.createElement("p");
    const explanationLabel = document.createElement("strong");
    explanationLabel.textContent = "解説：";
    explanation.append(explanationLabel, question.explanation);
    body.append(selected, correct, explanation);
    details.append(summary, body);
    elements.wrongReviewList.append(details);
  });
}

function renderResult() {
  state.summary = summarizeSession(state.session);
  const summary = state.summary;
  elements.resultRate.textContent = `${summary.accuracy}%`;
  elements.resultMessage.textContent = resultMessage(summary.accuracy);
  elements.resultTotal.textContent = `${summary.total}問`;
  elements.resultCorrect.textContent = `${summary.correct}問`;
  elements.resultWrong.textContent = `${summary.wrong}問`;
  elements.resultMistakes.textContent = `${summary.wrongAnswers.length}問`;
  elements.resultFieldBody.replaceChildren();

  summary.fields.forEach((field) => {
    const row = document.createElement("tr");
    appendCell(row, `${field.category} / ${field.subcategory}`);
    appendCell(row, `${field.correct} / ${field.total}問`);
    appendCell(row, `${field.accuracy}%`);
    elements.resultFieldBody.append(row);
  });

  renderWrongReview(summary.wrongAnswers);
  setView(elements.result);
}

function navigateHome() {
  state.session = null;
  state.summary = null;
  showSettingsError("");
  renderHistory();
  setView(elements.home);
}

elements.settings.addEventListener("change", (event) => {
  showSettingsError("");
  if (event.target.name === "scope") {
    elements.fieldFilters.hidden = event.target.value !== "field";
  }
});

elements.categorySelect.addEventListener("change", populateSubcategories);

elements.settings.addEventListener("submit", (event) => {
  event.preventDefault();
  beginQuiz(readSettings(), true);
});

elements.answerForm.addEventListener("change", () => {
  if (!state.session?.locked) elements.answerButton.disabled = false;
});

elements.answerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selected = elements.answerForm.querySelector('input[name="answer"]:checked');
  if (!selected || state.session.locked) return;
  const answer = submitAnswer(state.session, Number.parseInt(selected.value, 10));
  recordAnswer(getCurrentQuestion(state.session), answer.isCorrect);
  revealAnswer(answer);
});

elements.nextButton.addEventListener("click", () => {
  if (moveToNextQuestion(state.session)) renderQuestion();
  else renderResult();
});

elements.reviewMistakes.addEventListener("click", () => {
  const questionIds = state.summary.wrongAnswers.map(({ question }) => question.id);
  beginQuiz({
    count: questionIds.length,
    mode: QUIZ_MODES.RANDOM,
    conditions: { scope: "all", category: "", subcategory: "" },
    questionIds,
  }, false);
});

elements.retryQuiz.addEventListener("click", () => {
  if (state.repeatConfig) beginQuiz(state.repeatConfig, false);
});

elements.backHome.addEventListener("click", navigateHome);
elements.brandHome.addEventListener("click", navigateHome);

elements.resetHistory.addEventListener("click", () => {
  const confirmed = window.confirm("累計成績と問題ごとの回答履歴をすべて削除します。元に戻せません。よろしいですか？");
  if (!confirmed) return;
  resetHistory();
  renderHistory();
  showAppMessage("学習履歴をリセットしました。", "success");
});

async function initialize() {
  try {
    state.bank = await loadQuestionBank();
    populateFieldFilters();
    renderHistory();
    elements.dataSummary.textContent = `${state.bank.questions.length}問を利用できます`;
    elements.startButton.disabled = false;
    if (state.bank.issues.length > 0) {
      showAppMessage(
        `${state.bank.issues.length}件の問題データエラーを除外しました。開発者コンソールを確認してください。`,
      );
    }
  } catch (error) {
    console.error(error);
    elements.dataSummary.textContent = "問題データを読み込めませんでした";
    showAppMessage(
      "問題データを読み込めませんでした。index.htmlを直接開いている場合は、READMEの手順でローカルサーバーを起動してください。",
    );
  }
}

initialize();

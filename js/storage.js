const STORAGE_KEY = "choiceQuiz.learningHistory.v1";

function createEmptyHistory() {
  return {
    version: 1,
    totalAnswers: 0,
    totalCorrect: 0,
    questions: {},
    fields: {},
    mistakeIds: [],
    updatedAt: null,
  };
}

function readHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createEmptyHistory();
    const parsed = JSON.parse(saved);
    if (parsed?.version !== 1) return createEmptyHistory();
    return {
      ...createEmptyHistory(),
      ...parsed,
      questions: parsed.questions && typeof parsed.questions === "object" ? parsed.questions : {},
      fields: parsed.fields && typeof parsed.fields === "object" ? parsed.fields : {},
      mistakeIds: Array.isArray(parsed.mistakeIds) ? parsed.mistakeIds : [],
    };
  } catch (error) {
    console.warn("学習履歴を読み込めなかったため、新しい履歴を使用します", error);
    return createEmptyHistory();
  }
}

function writeHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch (error) {
    console.warn("学習履歴を保存できませんでした", error);
    return false;
  }
}

export function getHistory() {
  return readHistory();
}

export function recordAnswer(question, isCorrect) {
  const history = readHistory();
  const now = new Date().toISOString();
  const questionStats = history.questions[question.id] ?? {
    attempts: 0,
    correct: 0,
    incorrect: 0,
    lastAnsweredAt: null,
  };
  const fieldStats = history.fields[question.category] ?? { answers: 0, correct: 0 };

  history.totalAnswers += 1;
  history.totalCorrect += isCorrect ? 1 : 0;
  questionStats.attempts += 1;
  questionStats.correct += isCorrect ? 1 : 0;
  questionStats.incorrect += isCorrect ? 0 : 1;
  questionStats.lastAnsweredAt = now;
  fieldStats.answers += 1;
  fieldStats.correct += isCorrect ? 1 : 0;

  history.questions[question.id] = questionStats;
  history.fields[question.category] = fieldStats;
  if (!isCorrect && !history.mistakeIds.includes(question.id)) history.mistakeIds.push(question.id);
  history.updatedAt = now;

  writeHistory(history);
  return history;
}

export function resetHistory() {
  localStorage.removeItem(STORAGE_KEY);
  return createEmptyHistory();
}

export { STORAGE_KEY };

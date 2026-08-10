export const QUIZ_MODES = Object.freeze({
  RANDOM: "random",
  MISTAKES: "mistakes",
  ADAPTIVE: "adaptive",
});

function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function filterQuestions(questions, conditions) {
  return questions.filter((question) => {
    if (conditions.scope === "A" || conditions.scope === "B") {
      return question.exam === conditions.scope;
    }
    if (conditions.scope === "field") {
      if (question.category !== conditions.category) return false;
      return !conditions.subcategory || question.subcategory === conditions.subcategory;
    }
    return true;
  });
}

function adaptiveWeight(question, history) {
  const questionStats = history.questions?.[question.id];
  const fieldStats = history.fields?.[question.category];
  const fieldAccuracy = fieldStats?.answers ? fieldStats.correct / fieldStats.answers : 0.5;
  const incorrectBonus = Math.min(questionStats?.incorrect ?? 0, 5) * 0.55;
  const unseenBonus = questionStats?.attempts ? 0 : 0.3;
  return 1 + (1 - fieldAccuracy) * 2 + incorrectBonus + unseenBonus;
}

function weightedSampleWithoutReplacement(items, count, getWeight) {
  const pool = [...items];
  const selected = [];
  while (pool.length > 0 && selected.length < count) {
    const weights = pool.map((item) => Math.max(0.01, getWeight(item)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;
    let chosenIndex = 0;
    for (let index = 0; index < weights.length; index += 1) {
      cursor -= weights[index];
      if (cursor <= 0) {
        chosenIndex = index;
        break;
      }
    }
    selected.push(pool.splice(chosenIndex, 1)[0]);
  }
  return selected;
}

export function createQuizSession(allQuestions, config, history) {
  let candidates;

  if (Array.isArray(config.questionIds)) {
    const requestedIds = new Set(config.questionIds);
    candidates = allQuestions.filter((question) => requestedIds.has(question.id));
  } else {
    candidates = filterQuestions(allQuestions, config.conditions);
    if (config.mode === QUIZ_MODES.MISTAKES) {
      const mistakeIds = new Set(history.mistakeIds ?? []);
      candidates = candidates.filter((question) => mistakeIds.has(question.id));
    }
  }

  const requestedCount = Array.isArray(config.questionIds)
    ? candidates.length
    : Math.max(1, Number.parseInt(config.count, 10) || 10);
  const count = Math.min(requestedCount, candidates.length);
  const selected = config.mode === QUIZ_MODES.ADAPTIVE && !config.questionIds
    ? weightedSampleWithoutReplacement(candidates, count, (question) => adaptiveWeight(question, history))
    : shuffled(candidates).slice(0, count);

  return {
    questions: selected,
    index: 0,
    answers: [],
    correctCount: 0,
    locked: false,
    config: { ...config },
  };
}

export function getCurrentQuestion(session) {
  return session.questions[session.index] ?? null;
}

export function submitAnswer(session, selectedIndex) {
  if (session.locked) throw new Error("この問題には回答済みです");
  const question = getCurrentQuestion(session);
  if (!question) throw new Error("回答できる問題がありません");
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.choices.length) {
    throw new Error("選択肢を1つ選んでください");
  }

  const answer = {
    questionId: question.id,
    selectedIndex,
    correctIndex: question.correct,
    isCorrect: selectedIndex === question.correct,
  };
  session.answers.push(answer);
  session.correctCount += answer.isCorrect ? 1 : 0;
  session.locked = true;
  return answer;
}

export function moveToNextQuestion(session) {
  if (!session.locked) throw new Error("現在の問題に回答してください");
  if (session.index >= session.questions.length - 1) return false;
  session.index += 1;
  session.locked = false;
  return true;
}

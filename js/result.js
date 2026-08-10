export function summarizeSession(session) {
  const fields = new Map();
  const wrongAnswers = [];

  session.answers.forEach((answer, index) => {
    const question = session.questions[index];
    const key = `${question.category} / ${question.subcategory}`;
    const stats = fields.get(key) ?? {
      category: question.category,
      subcategory: question.subcategory,
      total: 0,
      correct: 0,
    };
    stats.total += 1;
    stats.correct += answer.isCorrect ? 1 : 0;
    fields.set(key, stats);

    if (!answer.isCorrect) wrongAnswers.push({ question, answer });
  });

  const total = session.answers.length;
  const correct = session.correctCount;
  return {
    total,
    correct,
    wrong: total - correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    fields: [...fields.values()].map((field) => ({
      ...field,
      accuracy: Math.round((field.correct / field.total) * 100),
    })),
    wrongAnswers,
  };
}

export function resultMessage(accuracy) {
  if (accuracy === 100) return "全問正解です。理解がしっかり定着しています。";
  if (accuracy >= 80) return "よくできました。間違えた問題を確認して仕上げましょう。";
  if (accuracy >= 60) return "あと一歩です。解説を読み、弱点を復習しましょう。";
  return "ここから伸ばせます。間違いを一つずつ理解していきましょう。";
}

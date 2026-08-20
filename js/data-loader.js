const CATALOG_URL = new URL("../data/categories.json", import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url.pathname}: 読み込みに失敗しました（HTTP ${response.status}）`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${url.pathname}: JSONの形式が正しくありません`, { cause: error });
  }
}

function validateQuestion(question, sourcePath, seenIds) {
  const issues = [];
  const id = typeof question?.id === "string" && question.id.trim() ? question.id.trim() : "(IDなし)";
  const prefix = `${id} [${sourcePath}]`;

  if (!question || typeof question !== "object" || Array.isArray(question)) {
    return [`${prefix}: 問題がオブジェクトではありません`];
  }
  if (id === "(IDなし)") issues.push(`${prefix}: idが空です`);
  if (seenIds.has(id)) issues.push(`${prefix}: idが重複しています`);
  if (!Array.isArray(question.choices) || question.choices.length !== 4) {
    issues.push(`${prefix}: choicesが4個ではありません`);
  } else if (question.choices.some((choice) => typeof choice !== "string" || !choice.trim())) {
    issues.push(`${prefix}: choicesに空の選択肢があります`);
  }
  if (!Number.isInteger(question.correct) || question.correct < 0 || question.correct > 3) {
    issues.push(`${prefix}: correctは0〜3の整数で指定してください`);
  }
  if (typeof question.question !== "string" || !question.question.trim()) {
    issues.push(`${prefix}: questionが空です`);
  }
  if (typeof question.explanation !== "string" || !question.explanation.trim()) {
    issues.push(`${prefix}: explanationが空です`);
  }
  for (const field of ["exam", "category", "subcategory"]) {
    if (typeof question[field] !== "string" || !question[field].trim()) {
      issues.push(`${prefix}: ${field}が空です`);
    }
  }
  if (!Number.isInteger(question.difficulty) || question.difficulty < 1 || question.difficulty > 5) {
    issues.push(`${prefix}: difficultyは1〜5の整数で指定してください`);
  }
  if (question.format !== undefined && !["standard", "long-code"].includes(question.format)) {
    issues.push(`${prefix}: formatはstandardまたはlong-codeで指定してください`);
  }
  if (question.code !== undefined && (typeof question.code !== "string" || !question.code.trim())) {
    issues.push(`${prefix}: codeは空でない文字列で指定してください`);
  }
  if (question.format === "long-code") {
    const lines = typeof question.code === "string" ? question.code.trim().split(/\r?\n/).length : 0;
    if (lines < 10 || lines > 30) issues.push(`${prefix}: long-codeには10〜30行のcodeが必要です`);
  }
  if (question.visual !== undefined) {
    if (!question.visual || typeof question.visual !== "object" || Array.isArray(question.visual)) {
      issues.push(`${prefix}: visualがオブジェクトではありません`);
    } else {
      if (question.visual.type !== "svg") issues.push(`${prefix}: visual.typeはsvgで指定してください`);
      if (typeof question.visual.src !== "string" || !question.visual.src.trim() || /^(?:\/|https?:|data:)/i.test(question.visual.src)) {
        issues.push(`${prefix}: visual.srcはサイト内の相対パスで指定してください`);
      }
      if (typeof question.visual.alt !== "string" || !question.visual.alt.trim()) issues.push(`${prefix}: visual.altが空です`);
    }
  }
  if (question.table !== undefined) {
    const headers = question.table?.headers;
    const rows = question.table?.rows;
    if (!Array.isArray(headers) || headers.length === 0 || headers.some((cell) => typeof cell !== "string" || !cell.trim())) {
      issues.push(`${prefix}: table.headersが正しくありません`);
    }
    if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(headers) || rows.some((row) => !Array.isArray(row) || row.length !== headers.length || row.some((cell) => typeof cell !== "string"))) {
      issues.push(`${prefix}: table.rowsの列数または値が正しくありません`);
    }
  }

  if (id !== "(IDなし)") seenIds.add(id);
  return issues;
}

export function validateQuestionBank(questionSources) {
  const issues = [];
  const validQuestions = [];
  const seenIds = new Set();

  for (const source of questionSources) {
    const questions = Array.isArray(source.data) ? source.data : source.data?.questions;
    if (!Array.isArray(questions)) {
      issues.push(`${source.path}: questions配列がありません`);
      continue;
    }

    for (const question of questions) {
      const questionIssues = validateQuestion(question, source.path, seenIds);
      issues.push(...questionIssues);
      if (questionIssues.length === 0) validQuestions.push(Object.freeze({ ...question }));
    }
  }

  if (issues.length > 0) {
    console.group(`問題データ検証: ${issues.length}件の問題を検出`);
    issues.forEach((issue) => console.error(issue));
    console.groupEnd();
  } else {
    console.info(`問題データ検証: ${validQuestions.length}問、エラーはありません`);
  }

  return { questions: validQuestions, issues };
}

export async function loadQuestionBank() {
  const catalog = await fetchJson(CATALOG_URL);
  if (!Array.isArray(catalog.questionFiles) || catalog.questionFiles.length === 0) {
    throw new Error("categories.json に questionFiles が登録されていません");
  }

  const sources = await Promise.all(
    catalog.questionFiles.map(async (entry) => {
      if (typeof entry.path !== "string" || !entry.path.trim()) {
        throw new Error("categories.json に path が空の項目があります");
      }
      const url = new URL(entry.path, CATALOG_URL);
      return { path: entry.path, data: await fetchJson(url) };
    }),
  );

  const validation = validateQuestionBank(sources);
  if (validation.questions.length === 0) {
    throw new Error("利用できる問題がありません。コンソールの検証結果を確認してください");
  }

  return Object.freeze({
    catalog: Object.freeze(catalog),
    questions: Object.freeze(validation.questions),
    issues: Object.freeze(validation.issues),
  });
}

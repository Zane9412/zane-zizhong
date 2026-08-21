import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyze,
  colorForScore,
  hasLetterOrDigit,
  normalize,
  STOPWORDS,
} from "../src/analyze.js";

test("normalize lowercases English words but leaves Chinese untouched", () => {
  assert.equal(normalize("Hello"), "hello");
  assert.equal(normalize("你好"), "你好");
});

test("hasLetterOrDigit rejects pure punctuation", () => {
  assert.equal(hasLetterOrDigit("，"), false);
  assert.equal(hasLetterOrDigit("abc"), true);
  assert.equal(hasLetterOrDigit("字"), true);
});

test("analyze filters stopwords and scores known sentiment words", () => {
  const { words } = analyze("我爱代码，我爱写代码");
  const ai = words.find((w) => w.word === "爱");
  assert.ok(ai, "expected the sentiment word 爱 to survive stopword filtering");
  assert.equal(ai.count, 2);
  assert.equal(ai.score, 2);

  // "我" is a stopword and must not appear as its own word
  assert.ok(!words.some((w) => w.word === "我"));
  assert.ok(STOPWORDS.has("我"));
});

test("analyze marks exactly one champion — the heaviest word", () => {
  const { words } = analyze("代码 代码 代码 希望 一次");
  const champions = words.filter((w) => w.champion);
  assert.equal(champions.length, 1);
  assert.equal(champions[0].word, words[0].word, "champion must be the heaviest (first-sorted) word");
});

test("analyze returns nothing for text that is only stopwords/punctuation", () => {
  const { words, totalUnique } = analyze("的了，。！");
  assert.equal(words.length, 0);
  assert.equal(totalUnique, 0);
});

test("colorForScore maps 0 / +2 / -2 to stone / amber / indigo exactly", () => {
  assert.equal(colorForScore(0), "rgb(171,161,146)");
  assert.equal(colorForScore(2), "rgb(232,162,61)");
  assert.equal(colorForScore(-2), "rgb(108,123,217)");
});

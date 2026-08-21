// Pure text analysis: tokenizing, sentiment scoring, color mapping.
// No DOM access here on purpose — this is the part covered by tests.

export const STOPWORDS = new Set([
  "的","了","在","是","我","你","他","她","它","我们","你们","他们","这","那","这个","那个",
  "和","与","或","但","但是","就","也","都","还","又","很","非常","一个","一些","有","没有",
  "不","没","会","能","可以","要","把","被","让","给","从","到","对","为","于","之","其","而",
  "因为","所以","如果","虽然","然后","而且","并且","以及","等","等等","呢","吧","啊","哦","嗯",
  "呀","着","过","地","得","么","什么","怎么","这样","那样","一","二","三","上","下","中","里",
  "the","a","an","and","or","but","is","are","was","were","be","been","being","of","to","in",
  "on","at","for","with","as","by","from","this","that","these","those","it","its","he","she",
  "they","we","you","i","my","your","his","her","their","our","not","no","do","does","did",
  "have","has","had","will","would","can","could","should","may","might","just","so","very"
]);

export const SENTIMENT = {
  // Chinese — strong positive (+2)
  "爱":2,"幸福":2,"快乐":2,"美好":2,"希望":2,"温暖":2,"感动":2,"自由":2,"光明":2,"梦想":2,
  "骄傲":2,"珍惜":2,"感恩":2,"勇敢":2,"灿烂":2,"甜蜜":2,"温柔":2,"美丽":2,"喜悦":2,"欣慰":2,
  // Chinese — mild positive (+1)
  "开心":1,"高兴":1,"满意":1,"舒服":1,"顺利":1,"轻松":1,"有趣":1,"喜欢":1,"美":1,"好":1,
  "棒":1,"值得":1,"期待":1,"安心":1,"平静":1,"温馨":1,"欢喜":1,"惊喜":1,
  // Chinese — strong negative (-2)
  "痛苦":-2,"绝望":-2,"悲伤":-2,"恐惧":-2,"愤怒":-2,"孤独":-2,"崩溃":-2,"黑暗":-2,"冰冷":-2,
  "破碎":-2,"背叛":-2,"死亡":-2,"失望":-2,"悔恨":-2,"挣扎":-2,"撕裂":-2,"荒凉":-2,"绝情":-2,
  // Chinese — mild negative (-1)
  "难过":-1,"累":-1,"烦":-1,"焦虑":-1,"担心":-1,"麻烦":-1,"遗憾":-1,"无聊":-1,"讨厌":-1,
  "糟糕":-1,"疲惫":-1,"沉重":-1,"迷茫":-1,"委屈":-1,"忧愁":-1,"苦涩":-1,

  // English — strong positive (+2)
  "love":2,"happiness":2,"joy":2,"hope":2,"wonderful":2,"beautiful":2,"bright":2,"dream":2,
  "proud":2,"grateful":2,"brave":2,"radiant":2,"sweet":2,"gentle":2,"delighted":2,"amazing":2,
  // English — mild positive (+1)
  "happy":1,"glad":1,"pleased":1,"comfortable":1,"smooth":1,"relaxed":1,"fun":1,"like":1,
  "nice":1,"good":1,"great":1,"worth":1,"expect":1,"calm":1,"peaceful":1,"warm":1,
  // English — strong negative (-2)
  "pain":-2,"despair":-2,"sorrow":-2,"fear":-2,"anger":-2,"lonely":-2,"broken":-2,"dark":-2,
  "cold":-2,"shattered":-2,"betrayal":-2,"death":-2,"disappointed":-2,"regret":-2,"struggle":-2,"torn":-2,
  // English — mild negative (-1)
  "sad":-1,"tired":-1,"annoyed":-1,"anxious":-1,"worried":-1,"trouble":-1,"boring":-1,"hate":-1,
  "bad":-1,"terrible":-1,"exhausted":-1,"heavy":-1,"lost":-1,"wronged":-1
};

export const SAMPLE_TEXT = "凌晨三点，屏幕的光还亮着。代码报错了第十七次，我几乎绝望，手指冰冷地悬在键盘上。可是重新读了一遍报错，忽然笑了——原来是我自己漏了一个括号。那种荒唐又踏实的快乐，像是黑暗里突然被点亮的希望。我保存、运行，测试全部通过，长久悬着的焦虑一下子松开了。这种疲惫过后的甜蜜，大概就是写代码这件事，最让人牵挂的地方。Debugging is exhausting, but the relief and joy when it finally works is worth every struggle.";

export function tokenize(text) {
  const tokens = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const seg = new Intl.Segmenter("zh", { granularity: "word" });
    for (const { segment, isWordLike } of seg.segment(text)) {
      if (isWordLike) tokens.push(segment);
    }
  } else {
    const re = /[A-Za-z0-9']+|[一-鿿]/g;
    let m;
    while ((m = re.exec(text))) tokens.push(m[0]);
  }
  return tokens;
}

export function normalize(tok) {
  return /^[A-Za-z']+$/.test(tok) ? tok.toLowerCase() : tok;
}

export function hasLetterOrDigit(tok) {
  try { return /[\p{L}\p{N}]/u.test(tok); } catch (e) { return /[A-Za-z0-9一-鿿]/.test(tok); }
}

const MAX_WORDS = 70;

export function analyze(text) {
  const freq = new Map();
  for (const raw of tokenize(text)) {
    const tok = normalize(raw.trim());
    if (!tok || !hasLetterOrDigit(tok)) continue;
    if (STOPWORDS.has(tok.toLowerCase()) || STOPWORDS.has(tok)) continue;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }

  const words = [...freq.entries()].map(([word, count]) => {
    const score = SENTIMENT[word] ?? SENTIMENT[word.toLowerCase()] ?? 0;
    const mass = 12 + Math.log(count + 1) * 7 + Math.min(word.length, 6) * 1.2 + Math.abs(score) * 4.5;
    return { word, count, score, mass };
  });

  words.sort((a, b) => b.mass - a.mass);
  const truncated = Math.max(0, words.length - MAX_WORDS);
  const sliced = words.slice(0, MAX_WORDS);
  if (sliced.length) sliced[0].champion = true; // heaviest word overall — the jar's "keystone"
  return { words: sliced, totalUnique: words.length, truncated };
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(c1, c2, t) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}

const STONE = hexToRgb("#ABA192");
const AMBER = hexToRgb("#E8A23D");
const INDIGO = hexToRgb("#6C7BD9");

export function colorForScore(score) {
  const t = Math.min(Math.abs(score) / 2, 1);
  const [r, g, b] = score > 0 ? mix(STONE, AMBER, t) : score < 0 ? mix(STONE, INDIGO, t) : STONE;
  return `rgb(${r},${g},${b})`;
}

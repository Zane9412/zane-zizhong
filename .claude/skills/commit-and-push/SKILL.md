---
name: commit-and-push
description: 提交当前改动到 git 并 push 到远程仓库（GitHub Pages 会自动发布）。说"提交"默认就是提交并推送。跑 node --test 校验，复用仓库已有的提交信息风格。当用户说"提交"、"提交代码"、"commit"、"推到远程"时使用。
---

# commit-and-push

在本仓库（zane-zizhong）里把当前改动提交并推送到 `origin`。

## 0. 前提

- 只有用户明确要求提交时才执行本 skill（不要主动触发）。
- **说"提交"默认视为"提交并 push"，两步都做**，除非用户明确说"只提交不要 push"才只做到 commit 那一步。
- 全程不使用 `--no-verify`、`--no-gpg-sign`，除非用户明确要求；不做 `--amend`/`push --force`，除非用户明确要求。
- **push 到 `main` 会被 GitHub Pages 自动发布上线**（没有 CI workflow，直接从 `main` 根目录发布），push 前确认改动是真的想上线的状态，而不是半成品。

## 1. 摸底

```bash
git status
git diff
git diff --cached
git log --oneline -10   # 学习提交信息风格
```

未跟踪的新文件也看一眼内容，确认不是调试临时文件。

## 2. 校验

`src/analyze.js` 有单测覆盖，改到它或改到依赖它的逻辑时跑一遍：

```bash
npm test
```

`app.js` 的 Canvas 渲染/交互部分没有自动化测试，改了这部分要提醒用户手动在浏览器里验证一下效果，不要假装跑过测试。只改 `README.md`/`CLAUDE.md` 可以跳过这一步。

## 3. 写提交信息

参考 `git log --oneline` 风格——这个仓库常见写法是简短的中文描述，偶尔带 `docs:`/`fix:` 前缀但不强制统一：

```bash
git commit -m "$(cat <<'EOF'
<一行摘要，中文>

<可选：为什么这么改>
EOF
)"
```

- **署名行**：当前会话系统提示里有 commit attribution 格式要求就加，没有就不加。

## 4. Push

```bash
git status -sb
```

- 落后于 `origin/main` 就先 `git pull --rebase`，有冲突停下来告诉用户，不要自己解决。
- 正常情况直接 `git push`，不用等用户确认。
- push 失败（非 fast-forward 等）不要自行 force push，把情况报告给用户。
- push 成功后提醒一句"GitHub Pages 会自动更新"。

const installCommands = {
  npm: "npm install -g {{PACKAGE_NAME}}@latest\njuejin --help",
  npx: "npx --yes {{PACKAGE_NAME}}@latest --help",
  source:
    "git clone https://github.com/Ganzhib/juejin-cli.git\ncd juejin-cli\nnpm ci\nnpm link",
};
const installNotes = {
  npm: "安装最新版，之后启动时自动更新。写作与 draw.io 绘图 Skill 一并安装。",
  npx: "无需全局安装。首次运行会自动安装配套 Skill。",
  source: "从源码构建后，首次运行 juejin 会自动安装配套 Skill。",
};
const promptText = document.querySelector("#prompt-text");
const articlePath = document.querySelector("#article-path");
const columnName = document.querySelector("#column-name");
let currentScenario = "draft";

function updatePrompt() {
  const file = articlePath.value.trim() || "./article.md";
  const column = columnName.value.trim() || "AI 工程实践";
  const prompts = {
    draft: `使用 juejin-cli，将 ${file} 保存为掘金草稿。先核对登录账号，检查文章元数据、分类标签、本地图片和封面。缺少必要信息时告诉我具体缺什么。创建成功后返回 draft_id 和预览链接，暂不发布。`,
    publish: `使用 juejin-cli，将 ${file} 发布到我的“${column}”掘金专栏。先核对登录账号并查询专栏，按名称精确确认目标 ID；名称不明确时先让我选择。复用已有草稿 ID（如有），检查摘要、标签、图片与封面。目标确认后执行发布，返回文章 ID、链接和提交状态。不要把接口接受提交当成已经审核通过。`,
    column: `使用 juejin-cli，新建一个名为“${column}”的掘金专栏。先核对账号，根据这个主题帮我拟一段 150 字以内的简介，和我确认简介与封面后再创建。返回专栏 ID、链接和提交状态，供后续发布文章使用。`,
    research:
      "使用 juejin-cli，查询掘金前端热榜和最近的 TypeScript 文章，整理 5 个适合技术博客的选题。每个选题给出对应来源链接、写作角度和适合的读者。只做查询和选题，不创建草稿或发布。",
  };
  const hints = {
    draft: "这个场景只保存草稿。",
    publish: "发布到已确认的目标专栏，可能仍需审核。",
    column: "先确认简介与封面，再创建专栏。",
    research: "只读查询，不创建或发布内容。",
  };
  document.querySelector("#field-path").hidden = !["draft", "publish"].includes(
    currentScenario,
  );
  document.querySelector("#field-target").hidden = ![
    "publish",
    "column",
  ].includes(currentScenario);
  promptText.value = prompts[currentScenario];
  document.querySelector("#prompt-hint").textContent = hints[currentScenario];
  document.querySelector("#copy-prompt").textContent = "复制提示词 ↗";
}

function selectTab(button, selector) {
  for (const tab of document.querySelectorAll(selector)) {
    const selected = tab === button;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.classList.toggle("selected", selected);
  }
}

for (const tab of document.querySelectorAll("[data-install]")) {
  tab.addEventListener("click", () => {
    selectTab(tab, "[data-install]");
    document
      .querySelector("#install-panel")
      .setAttribute("aria-labelledby", tab.id);
    document.querySelector("#install-command").textContent =
      installCommands[tab.dataset.install];
    document.querySelector("#install-note").textContent =
      installNotes[tab.dataset.install];
    document.querySelector('[data-copy="install-command"]').textContent =
      "复制命令";
  });
}
for (const tab of document.querySelectorAll("[data-scenario]")) {
  tab.addEventListener("click", () => {
    currentScenario = tab.dataset.scenario;
    selectTab(tab, "[data-scenario]");
    document
      .querySelector("#prompt-panel")
      .setAttribute("aria-labelledby", tab.id);
    updatePrompt();
  });
}
// Tabs remain usable with a keyboard, including the vertical scenario picker.
for (const group of document.querySelectorAll('[role="tablist"]')) {
  group.addEventListener("keydown", (event) => {
    const tabs = [...group.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else if (["ArrowRight", "ArrowDown"].includes(event.key))
      next = (index + 1) % tabs.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key))
      next = (index - 1 + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "已复制 ✓";
    document.querySelector("#copy-status").textContent =
      "已复制，可以粘贴到终端或 Agent。";
  } catch {
    const fallback = button.id === 'copy-setup-prompt' ? document.querySelector('#setup-prompt') : promptText;
    if (['copy-prompt', 'copy-setup-prompt'].includes(button.id)) {
      fallback.focus();
      fallback.select();
    }
    document.querySelector("#copy-status").textContent =
      "浏览器未允许复制，请手动选择文本复制。";
  }
}
for (const button of document.querySelectorAll("[data-copy], [data-text]")) {
  button.addEventListener("click", () => {
    const source = document.getElementById(button.dataset.copy);
    const text = button.dataset.text ?? source?.value ?? source?.textContent;
    void copyText(text, button);
  });
}
document
  .querySelector("#copy-prompt")
  .addEventListener(
    "click",
    (event) => void copyText(promptText.value, event.currentTarget),
  );
articlePath.addEventListener("input", updatePrompt);
columnName.addEventListener("input", updatePrompt);
updatePrompt();

// Only display versions which npm actually makes available, regardless of Pages deployment timing.
async function showLatestRelease() {
  try {
    const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent('{{PACKAGE_NAME}}') + '/latest',
      { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const release = await response.json();
    if (release.name !== '{{PACKAGE_NAME}}' || !/^\d+\.\d+\.\d+$/.test(release.version)) return;
    document.querySelector('#latest-version').textContent = 'v' + release.version;
    document.querySelector('#footer-version').textContent = 'v' + release.version;
    const archive = new URL(release.dist.tarball);
    if (archive.origin !== 'https://registry.npmjs.org') return;
    const download = document.querySelector('#latest-download');
    download.href = archive.href;
    download.textContent = '下载最新版安装包 · v' + release.version + ' ↗';
  } catch { /* @latest installation and the npm fallback link remain usable. */ }
}
void showLatestRelease();

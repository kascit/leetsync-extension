const ext = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  settings: {
    version: 1,
    repo: {
      owner: "",
      name: "",
      defaultBranch: "main",
    },
    queue: {
      branch: "leetsync/queue",
      path: ".leetsync/queue",
    },
    output: {
      dir: "solutions",
      includeDate: true,
      includeStatus: true,
    },
    readme: {
      enabled: true,
    },
    sync: {
      mode: "incremental",
    },
    pr: {
      enabled: true,
      autoMerge: true,
      mergeMethod: "squash",
      titleTemplate: "chore(leetcode): sync {count} submissions ({date})",
      bodyTemplate: "Automated sync via LeetSync.",
    },
    state: {
      path: ".leetsync/state.json",
    },
  },
  secrets: {
    githubToken: "",
    githubApiBase: "https://api.github.com",
  },
};

const elements = {
  saveBtn: document.getElementById("saveBtn"),
  testBtn: document.getElementById("testBtn"),
  syncPendingBtn: document.getElementById("syncPendingBtn"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText"),
  pendingCount: document.getElementById("pendingCount"),
  repoOwner: document.getElementById("repoOwner"),
  repoName: document.getElementById("repoName"),
  defaultBranch: document.getElementById("defaultBranch"),
  githubToken: document.getElementById("githubToken"),
  queueBranch: document.getElementById("queueBranch"),
  queuePath: document.getElementById("queuePath"),
  outputDir: document.getElementById("outputDir"),
  syncMode: document.getElementById("syncMode"),
  includeDate: document.getElementById("includeDate"),
  includeStatus: document.getElementById("includeStatus"),
  readmeEnabled: document.getElementById("readmeEnabled"),
  prEnabled: document.getElementById("prEnabled"),
  prAutoMerge: document.getElementById("prAutoMerge"),
  prMergeMethod: document.getElementById("prMergeMethod"),
  prTitleTemplate: document.getElementById("prTitleTemplate"),
  prBodyTemplate: document.getElementById("prBodyTemplate"),
  copyConfigBtn: document.getElementById("copyConfigBtn"),
  configPreview: document.getElementById("configPreview"),
  toast: document.getElementById("toast"),
};

function deepMerge(base, updates) {
  const output = Array.isArray(base) ? base.slice() : { ...base };
  if (!updates) return output;
  for (const [key, value] of Object.entries(updates)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof base[key] === "object"
    ) {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function buildConfig(settings) {
  return {
    version: settings.version,
    repo: settings.repo,
    queue: settings.queue,
    output: settings.output,
    readme: settings.readme,
    sync: settings.sync,
    pr: settings.pr,
    state: settings.state,
  };
}

function applyForm(settings, secrets) {
  elements.repoOwner.value = settings.repo.owner;
  elements.repoName.value = settings.repo.name;
  elements.defaultBranch.value = settings.repo.defaultBranch;
  elements.githubToken.value = secrets.githubToken;
  elements.queueBranch.value = settings.queue.branch;
  elements.queuePath.value = settings.queue.path;
  elements.outputDir.value = settings.output.dir;
  elements.syncMode.value = settings.sync.mode;
  elements.includeDate.checked = settings.output.includeDate;
  elements.includeStatus.checked = settings.output.includeStatus;
  elements.readmeEnabled.checked = settings.readme.enabled;
  elements.prEnabled.checked = settings.pr.enabled;
  elements.prAutoMerge.checked = settings.pr.autoMerge;
  elements.prMergeMethod.value = settings.pr.mergeMethod;
  elements.prTitleTemplate.value = settings.pr.titleTemplate;
  elements.prBodyTemplate.value = settings.pr.bodyTemplate;
}

function readForm() {
  const settings = {
    version: 1,
    repo: {
      owner: elements.repoOwner.value.trim(),
      name: elements.repoName.value.trim(),
      defaultBranch: elements.defaultBranch.value.trim() || "main",
    },
    queue: {
      branch: elements.queueBranch.value.trim() || "leetsync/queue",
      path: elements.queuePath.value.trim() || ".leetsync/queue",
    },
    output: {
      dir: elements.outputDir.value.trim() || "solutions",
      includeDate: elements.includeDate.checked,
      includeStatus: elements.includeStatus.checked,
    },
    readme: {
      enabled: elements.readmeEnabled.checked,
    },
    sync: {
      mode: elements.syncMode.value,
    },
    pr: {
      enabled: elements.prEnabled.checked,
      autoMerge: elements.prAutoMerge.checked,
      mergeMethod: elements.prMergeMethod.value,
      titleTemplate:
        elements.prTitleTemplate.value.trim() ||
        "chore(leetcode): sync {count} submissions ({date})",
      bodyTemplate:
        elements.prBodyTemplate.value.trim() || "Automated sync via LeetSync.",
    },
    state: {
      path: ".leetsync/state.json",
    },
  };

  const secrets = {
    githubToken: elements.githubToken.value.trim(),
    githubApiBase: "https://api.github.com",
  };

  return { settings, secrets };
}

function updatePreview(settings) {
  const config = buildConfig(settings);
  elements.configPreview.textContent = JSON.stringify(config, null, 2);
}

async function refreshStatus() {
  return new Promise((resolve) => {
    ext.runtime.sendMessage({ type: "LEETSYNC_GET_STATUS" }, (response) => {
      if (!response) return resolve();
      elements.pendingCount.textContent = String(response.pending || 0);
      if (response.configured) {
        elements.statusDot.classList.add("ok");
        elements.statusText.textContent = "Configured";
      } else {
        elements.statusDot.classList.remove("ok");
        elements.statusText.textContent = "Not configured";
      }
      resolve();
    });
  });
}

async function loadState() {
  const data = await ext.storage.local.get(null);
  const settings = deepMerge(DEFAULTS.settings, data.settings || {});
  const secrets = deepMerge(DEFAULTS.secrets, data.secrets || {});
  applyForm(settings, secrets);
  updatePreview(settings);
  await refreshStatus();
}

async function saveState() {
  const { settings, secrets } = readForm();
  await ext.storage.local.set({ settings, secrets });
  updatePreview(settings);
  await refreshStatus();
  showToast("Settings saved");
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast("Copied"));
}

function bindCopyButtons() {
  document.querySelectorAll(".copy").forEach((button) => {
    button.addEventListener("click", () => {
      const text = button.getAttribute("data-copy") || "";
      copyText(text);
    });
  });
}

elements.saveBtn.addEventListener("click", () => {
  saveState();
});

elements.testBtn.addEventListener("click", () => {
  ext.runtime.sendMessage({ type: "LEETSYNC_TEST_CONNECTION" }, (response) => {
    if (!response) return;
    if (response.ok) {
      showToast("Connection OK");
    } else if (response.error === "missing_config") {
      showToast("Add repo and token first");
    } else {
      showToast("Connection failed");
    }
  });
});

elements.syncPendingBtn.addEventListener("click", () => {
  ext.runtime.sendMessage({ type: "LEETSYNC_SYNC_PENDING" }, (response) => {
    if (response && response.ok) {
      showToast("Sync attempted");
      refreshStatus();
    }
  });
});

elements.copyConfigBtn.addEventListener("click", () => {
  const { settings } = readForm();
  copyText(JSON.stringify(buildConfig(settings), null, 2));
});

bindCopyButtons();
loadState();

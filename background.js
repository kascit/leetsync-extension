const ext = typeof browser !== "undefined" ? browser : chrome;

const DEFAULTS = {
  settings: {
    version: 1,
    repo: {
      owner: "",
      name: "",
      defaultBranch: "main"
    },
    queue: {
      branch: "leetsync/queue",
      path: ".leetsync/queue"
    },
    output: {
      dir: "solutions",
      includeDate: true,
      includeStatus: true
    },
    readme: {
      enabled: true
    },
    sync: {
      mode: "incremental",
      source: "queue"
    },
    pr: {
      enabled: true,
      autoMerge: true,
      mergeMethod: "squash",
      titleTemplate: "chore(leetcode): sync {count} submissions ({date})",
      bodyTemplate: "Automated sync via LeetSync."
    },
    leetcode: {
      enableFallback: false
    },
    state: {
      path: ".leetsync/state.json"
    }
  },
  secrets: {
    githubToken: "",
    githubApiBase: "https://api.github.com"
  }
};

const branchCache = new Map();

function deepMerge(base, updates) {
  const output = Array.isArray(base) ? base.slice() : { ...base };
  if (!updates) return output;
  for (const [key, value] of Object.entries(updates)) {
    if (value && typeof value === "object" && !Array.isArray(value) && typeof base[key] === "object") {
      output[key] = deepMerge(base[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

async function loadState() {
  const data = await ext.storage.local.get(null);
  return {
    settings: deepMerge(DEFAULTS.settings, data.settings || {}),
    secrets: deepMerge(DEFAULTS.secrets, data.secrets || {}),
    pending: Array.isArray(data.pending) ? data.pending : []
  };
}

async function saveState(partial) {
  return ext.storage.local.set(partial);
}

function isConfigured(settings, secrets) {
  return Boolean(settings.repo.owner && settings.repo.name && secrets.githubToken);
}

async function githubRequest(apiBase, path, token, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `token ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    json = null;
  }

  return { ok: response.ok, status: response.status, json, text };
}

async function ensureQueueBranch(settings, secrets) {
  const { owner, name, defaultBranch } = settings.repo;
  const branch = settings.queue.branch || "leetsync/queue";
  const cacheKey = `${owner}/${name}#${branch}`;

  if (branchCache.get(cacheKey)) return { ok: true };

  const apiBase = secrets.githubApiBase;
  const branchRes = await githubRequest(apiBase, `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(branch)}`, secrets.githubToken);
  if (branchRes.ok) {
    branchCache.set(cacheKey, true);
    return { ok: true };
  }

  const baseRes = await githubRequest(apiBase, `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(defaultBranch || "main")}`, secrets.githubToken);
  if (!baseRes.ok || !baseRes.json || !baseRes.json.object) {
    return { ok: false, error: "base_branch_missing" };
  }

  const createRes = await githubRequest(apiBase, `/repos/${owner}/${name}/git/refs`, secrets.githubToken, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: baseRes.json.object.sha
    })
  });

  if (createRes.ok || createRes.status === 422) {
    branchCache.set(cacheKey, true);
    return { ok: true };
  }

  return { ok: false, error: "branch_create_failed", details: createRes.text };
}

async function pushSubmission(payload, settings, secrets) {
  const { owner, name } = settings.repo;
  const apiBase = secrets.githubApiBase;
  const branch = settings.queue.branch || "leetsync/queue";
  const queuePath = (settings.queue.path || ".leetsync/queue").replace(/^\/+/, "");
  const submissionId = payload.submissionId || payload.submission_id;

  if (!submissionId) {
    return { ok: false, error: "missing_submission_id" };
  }

  const branchRes = await ensureQueueBranch(settings, secrets);
  if (!branchRes.ok) return branchRes;

  const filePath = `${queuePath}/${submissionId}.json`;
  const encodedPath = encodePath(filePath);

  const existsRes = await githubRequest(apiBase, `/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, secrets.githubToken);
  if (existsRes.ok) {
    return { ok: true, skipped: true };
  }

  const content = JSON.stringify(payload, null, 2);
  const putRes = await githubRequest(apiBase, `/repos/${owner}/${name}/contents/${encodedPath}`, secrets.githubToken, {
    method: "PUT",
    body: JSON.stringify({
      message: `leetsync: queue submission ${submissionId}`,
      content: toBase64(content),
      branch
    })
  });

  if (!putRes.ok) {
    return { ok: false, error: "queue_write_failed", details: putRes.text };
  }

  return { ok: true };
}

async function enqueuePending(payload, reason) {
  const state = await loadState();
  state.pending.push({ payload, reason, createdAt: Date.now() });
  await saveState({ pending: state.pending });
}

async function drainPending() {
  const state = await loadState();
  if (!isConfigured(state.settings, state.secrets)) {
    return { ok: false, error: "missing_config" };
  }

  const remaining = [];
  let sent = 0;

  for (const item of state.pending) {
    const result = await pushSubmission(item.payload, state.settings, state.secrets);
    if (result.ok) {
      sent += 1;
    } else {
      remaining.push(item);
    }
  }

  await saveState({ pending: remaining });
  return { ok: true, sent, remaining: remaining.length };
}

async function handleSubmission(payload) {
  const state = await loadState();
  if (!isConfigured(state.settings, state.secrets)) {
    await enqueuePending(payload, "missing_config");
    return { ok: false, error: "missing_config" };
  }

  const result = await pushSubmission(payload, state.settings, state.secrets);
  if (!result.ok) {
    await enqueuePending(payload, result.error || "queue_write_failed");
  }
  return result;
}

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "LEETSYNC_SUBMISSION") {
    handleSubmission(message.payload).then(sendResponse);
    return true;
  }

  if (message.type === "LEETSYNC_SYNC_PENDING") {
    drainPending().then(sendResponse);
    return true;
  }

  if (message.type === "LEETSYNC_GET_STATUS") {
    loadState().then((state) => {
      sendResponse({
        configured: isConfigured(state.settings, state.secrets),
        pending: state.pending.length
      });
    });
    return true;
  }

  if (message.type === "LEETSYNC_TEST_CONNECTION") {
    loadState().then(async (state) => {
      if (!isConfigured(state.settings, state.secrets)) {
        sendResponse({ ok: false, error: "missing_config" });
        return;
      }
      const { owner, name } = state.settings.repo;
      const res = await githubRequest(
        state.secrets.githubApiBase,
        `/repos/${owner}/${name}`,
        state.secrets.githubToken
      );
      sendResponse({ ok: res.ok, status: res.status, error: res.ok ? null : res.text });
    });
    return true;
  }

  return false;
});

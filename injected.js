(function () {
  "use strict";

  const pending = new Map();
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init, ...rest) {
    const url = typeof input === "string" ? input : input && input.url ? input.url : "";
    const method = (init && init.method ? init.method : "GET").toUpperCase();

    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/$/);
    if (submitMatch && method === "POST") {
      const slug = submitMatch[1];
      let body = {};
      try {
        body = JSON.parse(init && init.body ? init.body : "{}");
      } catch (err) {
        body = {};
      }

      const response = await originalFetch(input, init, ...rest);
      response.clone().json().then((data) => {
        if (data && data.submission_id) {
          pending.set(String(data.submission_id), {
            code: body.typed_code || body.code || "",
            lang: body.lang || "",
            slug
          });
          setTimeout(() => pending.delete(String(data.submission_id)), 300000);
        }
      }).catch(() => {});
      return response;
    }

    const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/$/);
    if (checkMatch) {
      const submissionId = checkMatch[1];
      const response = await originalFetch(input, init, ...rest);
      response.clone().json().then((data) => {
        if (!data || data.state !== "SUCCESS") return;

        const pend = pending.get(submissionId) || {};
        const meta = extractProblemMeta();

        window.postMessage({
          source: "LEETSYNC",
          type: "SUBMISSION",
          payload: {
            version: 1,
            source: "extension",
            submissionId,
            slug: pend.slug || meta.slug,
            title: meta.title,
            questionId: meta.questionId,
            difficulty: meta.difficulty,
            tags: meta.tags,
            status: data.status_msg || "Unknown",
            runtime: data.status_runtime || data.display_runtime || "",
            memory: data.memory || "",
            lang: pend.lang || data.lang || "",
            code: pend.code || "",
            timestamp: Math.floor(Date.now() / 1000)
          }
        }, "*");

        pending.delete(submissionId);
      }).catch(() => {});
      return response;
    }

    return originalFetch(input, init, ...rest);
  };

  function extractProblemMeta() {
    const slug = location.pathname.match(/\/problems\/([^/]+)/)?.[1] || "";
    let title = slug;
    let questionId = "0";
    let difficulty = "Unknown";
    let tags = [];

    try {
      const queries = window.__NEXT_DATA__?.props?.pageProps?.dehydratedState?.queries || [];
      for (const q of queries) {
        const qd = q?.state?.data?.question;
        if (qd) {
          title = qd.title || title;
          questionId = qd.questionFrontendId || questionId;
          difficulty = qd.difficulty || difficulty;
          tags = (qd.topicTags || []).map((t) => t.name);
          break;
        }
      }
    } catch (err) {}

    if (title === slug) {
      try {
        const apolloState = window.__APOLLO_STATE__ || {};
        for (const key of Object.keys(apolloState)) {
          if (!key.startsWith("Question:")) continue;
          const q = apolloState[key];
          if (q.titleSlug === slug) {
            title = q.title || title;
            questionId = q.questionFrontendId || questionId;
            difficulty = q.difficulty || difficulty;
            tags = (q.topicTags || []).filter(Boolean).map((r) => apolloState[r.__ref]?.name || "");
            break;
          }
        }
      } catch (err) {}
    }

    if (title === slug) {
      try {
        const el = document.querySelector('[data-cy="question-title"]') || document.querySelector('a[href*="/problems/"]');
        const raw = (el && el.textContent ? el.textContent : "") || document.title || "";
        const m = raw.match(/^(\d+)\.\s+(.+?)(?:\s+-|$)/);
        if (m) {
          questionId = m[1];
          title = m[2].trim();
        }
      } catch (err) {}
    }

    return { slug, title, questionId, difficulty, tags };
  }
})();

const ext = typeof browser !== "undefined" ? browser : chrome;

function inject() {
  const script = document.createElement("script");
  script.src = ext.runtime.getURL("injected.js");
  script.type = "text/javascript";
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

inject();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "LEETSYNC" || data.type !== "SUBMISSION") return;
  ext.runtime.sendMessage({
    type: "LEETSYNC_SUBMISSION",
    payload: data.payload,
  });
});

const ext = typeof browser !== "undefined" ? browser : chrome;

const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const pendingCount = document.getElementById("pendingCount");
const syncBtn = document.getElementById("syncBtn");
const openOptionsBtn = document.getElementById("openOptionsBtn");

function refreshStatus() {
  ext.runtime.sendMessage({ type: "LEETSYNC_GET_STATUS" }, (response) => {
    if (!response) return;
    pendingCount.textContent = String(response.pending || 0);
    if (response.configured) {
      statusDot.classList.add("ok");
      statusText.textContent = "Configured";
    } else {
      statusDot.classList.remove("ok");
      statusText.textContent = "Not configured";
    }
  });
}

syncBtn.addEventListener("click", () => {
  ext.runtime.sendMessage({ type: "LEETSYNC_SYNC_PENDING" }, () => refreshStatus());
});

openOptionsBtn.addEventListener("click", () => {
  if (ext.runtime.openOptionsPage) {
    ext.runtime.openOptionsPage();
  }
});

refreshStatus();

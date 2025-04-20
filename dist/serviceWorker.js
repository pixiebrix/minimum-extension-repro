// Allows users to open the side panel by clicking on the action toolbar icon
// chrome.sidePanel
//   .setPanelBehavior({ openPanelOnActionClick: true })
//   .catch((error) => console.error(error));


const tabPanelState = new Map();


async function initBrowserAction() {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });

  // Disable by default, so that it can be enabled on a per-tab basis.
  // Without this, the sidePanel remains open as the user changes tabs
  void chrome.sidePanel.setOptions({
    enabled: false,
  });

  chrome.action.onClicked.addListener(async (tab) => {

    console.log("Action clicked", tab.id);

    if (tab.id) {
      const isOpen = tabPanelState.get(tab.id) ?? false;

      if (isOpen) {
        tabPanelState.set(tab.id, false);
        await chrome.sidePanel.setOptions({
          enabled: false,
          tabId: tab.id,
        })
      } else {
        console.log("Opening side panel", chrome.runtime.getURL("sidepanel.html?tabId=" + tab.id));

        void chrome.sidePanel.setOptions({
          enabled: true,
          tabId: tab.id,
          path: chrome.runtime.getURL("sidepanel.html?tabId=" + tab.id),
        })

        void chrome.sidePanel.open({
          tabId: tab.id,
        });

        tabPanelState.set(tab.id, true);
      }
    }
  });
}

void initBrowserAction();


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.command === "click") {
    sendResponse({ success: "success" });
  }
});

console.log("Background script loaded.");

let creating; // A global promise to avoid concurrency issues
async function setupOffscreenDocument(path) {
  // Check all windows controlled by the service worker to see if one
  // of them is the offscreen document with the given path
  const offscreenUrl = chrome.runtime.getURL(path);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // create offscreen document
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: path,
      reasons: ['CLIPBOARD'],
      justification: 'reason for needing the document',
    });
    await creating;
    creating = null;
  }
}


// https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers#keep_a_service_worker_alive_continuously

/**
 * Tracks when a service worker was last alive and extends the service worker
 * lifetime by writing the current time to extension storage every 20 seconds.
 * You should still prepare for unexpected termination - for example, if the
 * extension process crashes or your extension is manually stopped at
 * chrome://serviceworker-internals.
 */
let heartbeatInterval;

async function runHeartbeat() {
  await chrome.storage.local.set({ 'last-heartbeat': new Date().getTime() });
  await setupOffscreenDocument("offscreen.html");
}

/**
 * Starts the heartbeat interval which keeps the service worker alive. Call
 * this sparingly when you are doing work which requires persistence, and call
 * stopHeartbeat once that work is complete.
 */
async function startHeartbeat() {
  // Run the heartbeat once at service worker startup.
  runHeartbeat().then(() => {
    // Then again every 20 seconds.
    heartbeatInterval = setInterval(runHeartbeat, 20 * 1000);
  });
}

async function stopHeartbeat() {
  clearInterval(heartbeatInterval);
}

/**
 * Returns the last heartbeat stored in extension storage, or undefined if
 * the heartbeat has never run before.
 */
async function getLastHeartbeat() {
  return (await chrome.storage.local.get('last-heartbeat'))['last-heartbeat'];
}

void startHeartbeat();

console.log("Heartbeat started");
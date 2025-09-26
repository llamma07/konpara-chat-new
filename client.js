// client.js - robust call signaling by username
(() => {
  const socket = io();

  // username from ?name=... fallback to prompt
  let username = new URLSearchParams(window.location.search).get("name") || prompt("Enter username (You or BaileyLaura):") || "Guest";
  username = username.trim();

  // wait for socket connect to register
  socket.on("connect", () => {
    console.log("socket connected:", socket.id);
    socket.emit("register", username);
    console.log("registered as", username);
  });

  // elements
  const messagesEl = document.getElementById("messages");
  const inputEl = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const typingIndicator = document.getElementById("typingIndicator");
  const callBtn = document.getElementById("callBtn");

  const modal = document.getElementById("modal");
  const pmWith = document.getElementById("pmWith");
  const incomingEl = document.getElementById("incomingCall");
  const incomingText = document.getElementById("incomingText");
  const acceptBtn = document.getElementById("acceptCall");
  const declineBtn = document.getElementById("declineCall");
  const closeModalBtn = document.getElementById("closeModal");

  // helpers
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m]);
  }

  function addMessage(msg) {
    const div = document.createElement("div");
    const isYou = (msg.user === username);
    let displayName = msg.user;
    if (username === "BaileyLaura" && !isYou) displayName = "Guest";
    div.className = "message " + (isYou ? "you" : "other");
    div.innerHTML = `<div class="meta">${displayName}</div>${msg.html || escapeHtml(msg.text || "")}`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function sendMessage(text, htmlOverride = null) {
    if (!text && !htmlOverride) return;
    const payload = { user: username, text, html: htmlOverride, ts: Date.now() };
    socket.emit("chatMessage", payload);
    addMessage(payload);
  }

  // send handlers
  sendBtn.addEventListener("click", () => {
    const txt = inputEl.value.trim();
    sendMessage(txt);
    inputEl.value = "";
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const txt = inputEl.value.trim();
      sendMessage(txt);
      inputEl.value = "";
    }
  });

  // receive chat messages
  socket.on("chatMessage", (msg) => {
    if (msg.user === username) return;
    addMessage(msg);
  });

  // typing indicator
  let typingTimer = null;
  inputEl.addEventListener("input", () => {
    socket.emit("typing", { user: username, typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => socket.emit("typing", { user: username, typing: false }), 800);
  });
  socket.on("typing", (t) => {
    if (t.user === username) return;
    typingIndicator.textContent = t.typing ? `${t.user} is typing...` : "";
  });

  // ----------- CALL FLOW -----------
  function determineTarget() {
    if (username === "BaileyLaura") {
      return new URLSearchParams(window.location.search).get("target") || "You";
    } else {
      return "BaileyLaura";
    }
  }

  let currentOtherSocketId = null;
  let currentCallId = null;

  // caller clicks Call
  callBtn.addEventListener("click", () => {
    const targetName = determineTarget();
    currentCallId = Date.now();
    console.log("emitting callRequest", { from: username, to: targetName, callId: currentCallId });
    socket.emit("callRequest", { from: username, to: targetName, callId: currentCallId });
    pmWith.textContent = `Calling ${targetName}...`;
    modal.classList.add("open");
  });

  // incoming call (real)
  socket.on("incomingCall", (data) => {
    console.log("incomingCall", data);
    if (!data || !data.callerSocketId) return;
    incomingText.textContent = `Incoming call from ${data.fromName || "Unknown"}`;
    incomingEl.style.display = "block";
    currentOtherSocketId = data.callerSocketId;
    currentCallId = data.callId;

    acceptBtn.onclick = () => {
      incomingEl.style.display = "none";
      socket.emit("callAccept", { callerSocketId: currentOtherSocketId, callId: currentCallId });
      pmWith.textContent = data.fromName || "Unknown";
      modal.classList.add("open");
    };
    declineBtn.onclick = () => {
      incomingEl.style.display = "none";
      socket.emit("callDecline", { callerSocketId: currentOtherSocketId });
      currentOtherSocketId = null;
      currentCallId = null;
    };
  });

  socket.on("callAccepted", (data) => {
    console.log("callAccepted", data);
    currentOtherSocketId = data?.calleeSocketId || null;
    currentCallId = data?.callId || currentCallId;
    pmWith.textContent = data?.fromName || "Unknown";
    modal.classList.add("open");
  });

  socket.on("callDeclined", (data) => {
    alert(`${data.fromName || "User"} declined the call.`);
    modal.classList.remove("open");
    currentOtherSocketId = null;
    currentCallId = null;
  });

  socket.on("callFailed", (data) => {
    alert("Call failed: " + (data?.reason || "unknown"));
    modal.classList.remove("open");
    currentOtherSocketId = null;
    currentCallId = null;
  });

  socket.on("callEnded", (data) => {
    console.log("callEnded", data);
    modal.classList.remove("open");
    incomingEl.style.display = "none";
    currentOtherSocketId = null;
    currentCallId = null;
  });

  closeModalBtn?.addEventListener("click", () => {
    if (currentOtherSocketId) {
      socket.emit("callEnd", { targetSocketId: currentOtherSocketId });
    } else {
      socket.emit("callEnd", {});
    }
    modal.classList.remove("open");
    currentOtherSocketId = null;
    currentCallId = null;
  });

  // --------- Image paste & drop ----------
  document.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type && item.type.indexOf("image") !== -1) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (ev) => sendMessage("", `<img src="${ev.target.result}" style="max-width:200px;max-height:200px">`);
          reader.readAsDataURL(blob);
        }
      }
    }
  });

  messagesEl.addEventListener("dragover", (e) => e.preventDefault());
  messagesEl.addEventListener("drop", (e) => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) {
      if (file.type?.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => sendMessage("", `<img src="${ev.target.result}" style="max-width:150px;max-height:150px">`);
        reader.readAsDataURL(file);
      }
    }
  });

  // ----------- Keyboard Shortcut: Cmd/Ctrl + F to simulate incoming call -----------
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      console.log("Simulating incoming call from BaileyLaura");

      const fakeData = {
        fromName: "BaileyLaura",
        callerSocketId: "FAKE_SOCKET",
        callId: Date.now()
      };

      incomingText.textContent = `Incoming call from ${fakeData.fromName}`;
      incomingEl.style.display = "block";
      currentOtherSocketId = fakeData.callerSocketId;
      currentCallId = fakeData.callId;

      acceptBtn.onclick = () => {
        incomingEl.style.display = "none";
        pmWith.textContent = fakeData.fromName;
        modal.classList.add("open");
      };
      declineBtn.onclick = () => {
        incomingEl.style.display = "none";
        currentOtherSocketId = null;
        currentCallId = null;
      };
    }
  });

  console.log("client ready as", username);
})();

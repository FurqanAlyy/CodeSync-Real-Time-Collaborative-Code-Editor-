# CodeSync — Real-Time Collaborative Code Editor

A lightweight, real-time collaborative code editor built with React, Monaco Editor, Yjs, and Socket.IO. Multiple users can edit the same document simultaneously with conflict-free merging, live cursor awareness, and presence indicators — all in a single Docker container.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
  - [Production Build](#production-build)
  - [Docker](#docker)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Deployment](#deployment)

---

## Features

- **Real-time collaboration** — multiple users edit the same file simultaneously
- **Conflict-free merging** — built on Yjs CRDTs; concurrent edits never conflict
- **Cursor & selection awareness** — see where other users are editing in real time
- **Presence indicators** — live sidebar showing all connected users with color-coded avatars
- **Persistent username** — stored in `localStorage` and the URL query string
- **Single-container deployment** — the backend serves the built frontend as static files
- **VS Code-grade editor** — Monaco Editor with ligatures, bracket colorization, smooth scrolling

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | React | 19 |
| Build tool | Vite | 7 |
| Editor | Monaco Editor (`@monaco-editor/react`) | 4.7 |
| CRDT engine | Yjs | 13.6 |
| Yjs ↔ Monaco binding | y-monaco | 0.1.6 |
| Yjs transport (client) | y-socket.io | 1.1.3 |
| Styling | Tailwind CSS | v4 |
| Backend framework | Express | 5 |
| WebSocket server | Socket.IO | 4.8 |
| Yjs transport (server) | y-socket.io (server) | 1.1.3 |
| Runtime | Node.js | 20 |
| Container | Docker | — |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Container                   │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │              Node.js (port 3000)             │  │
│  │                                              │  │
│  │   Express ──► serves Frontend (static)       │  │
│  │   Socket.IO ──► WebSocket connections        │  │
│  │   YSocketIO ──► syncs Yjs documents          │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
         ▲                        ▲
         │ HTTP (static)          │ WebSocket
         ▼                        ▼
┌──────────────────┐   ┌──────────────────┐
│    Browser A     │   │    Browser B     │
│                  │   │                  │
│  React + Monaco  │   │  React + Monaco  │
│  Yjs Y.Doc       │◄──►  Yjs Y.Doc       │
│  SocketIOProvider│   │  SocketIOProvider│
└──────────────────┘   └──────────────────┘
```

In development, the Vite dev server (port 5173) proxies all `/socket.io` traffic to the backend (port 3000), so both can run independently.

---

## How It Works

### 1. Shared Document (Yjs CRDT)

Every client creates a `Y.Doc` — a CRDT document that can be concurrently modified by multiple peers without conflicts. The text content lives in a `Y.Text` instance named `"monaco"` inside that document.

```js
const ydoc = new Y.Doc()
const yText = ydoc.getText("monaco")
```

CRDTs (Conflict-free Replicated Data Types) guarantee that any two clients who receive the same set of operations will converge to the same state, regardless of the order those operations arrive.

### 2. Network Transport (y-socket.io)

`SocketIOProvider` connects the local `Y.Doc` to the server over a Socket.IO WebSocket. Any change to the local document is encoded as a compact binary diff and broadcast to all other connected clients through the server's `YSocketIO` instance.

```
Client A edits → diff encoded → sent via Socket.IO
    → server (YSocketIO) broadcasts to all other clients
    → Client B receives diff → applies to its Y.Doc → editor updates
```

The server holds no application-level document state itself — `YSocketIO` simply relays Yjs update messages between clients (and can optionally persist them).

### 3. Editor Binding (y-monaco)

`MonacoBinding` connects the `Y.Text` to Monaco Editor's internal text model. It translates Monaco's `IModelContentChange` events into Yjs operations, and Yjs `update` events into Monaco edits — in both directions, transparently.

The fourth argument to `MonacoBinding` is the Yjs `Awareness` instance, which enables shared cursor and selection decorations.

```js
new MonacoBinding(yText, editor.getModel(), new Set([editor]), provider.awareness)
```

### 4. Presence (Yjs Awareness)

Yjs Awareness is a lightweight ephemeral state layer built on top of the same WebSocket connection. Each client broadcasts a small JSON object containing their username. When any client joins or leaves, a `change` event fires on all peers.

```js
// Set your own presence
provider.awareness.setLocalStateField("user", { username })

// Subscribe to presence changes
provider.awareness.on("change", () => {
  const states = Array.from(provider.awareness.getStates().values())
  // states = [{ user: { username: "alice" } }, { user: { username: "bob" } }, ...]
})
```

On page unload, the local state is cleared so the user disappears from all peers' lists immediately.

### 5. Username & Routing

The username is stored in two places:
- `localStorage` — survives page refresh with no query string
- URL query string (`?username=alice`) — shareable, takes priority on load

```js
const username = new URLSearchParams(window.location.search).get("username")
  || localStorage.getItem("username")
  || ""
```

---

## Project Structure

```
Collaborative-Editor/
│
├── dockerfile                  # Multi-stage Docker build
├── .dockerignore
├── .gitignore
│
├── Backend/
│   ├── server.js               # Express + Socket.IO + YSocketIO server
│   ├── package.json
│   └── public/                 # Served as static files (populated by Docker build)
│       ├── index.html
│       └── assets/
│
└── Frontend/
    ├── index.html              # Vite HTML entry point
    ├── vite.config.js          # Vite config with Socket.IO dev proxy
    ├── eslint.config.js
    ├── package.json
    └── src/
        ├── main.jsx            # React root
        └── app/
            ├── App.jsx         # Entire application (join screen + editor)
            └── App.css         # Tailwind CSS import
```

---

## Getting Started

### Prerequisites

- **Node.js** 20 or later
- **npm** 9 or later
- **Docker** (optional, for container deployment)

### Local Development

Run the backend and frontend as separate dev servers. Vite proxies Socket.IO traffic to the backend automatically.

**1. Install dependencies**

```bash
# Backend
cd Backend
npm install

# Frontend
cd ../Frontend
npm install
```

**2. Start the backend**

```bash
cd Backend
npm run dev          # uses nodemon for auto-reload
# or
node server.js       # without auto-reload
```

The backend starts on **http://localhost:3000**.

**3. Start the frontend**

```bash
cd Frontend
npm run dev
```

The Vite dev server starts on **http://localhost:5173**.

**4. Open in browser**

Navigate to **http://localhost:5173**. Enter a username and start editing. Open a second tab or browser window with a different username to test collaboration.

---

### Production Build

The production setup builds the React app and serves it as static files from the Express backend — a single Node.js process serves everything.

```bash
# 1. Build the frontend
cd Frontend
npm run build        # outputs to Frontend/dist/

# 2. Copy the build into the backend's public folder
cp -r dist/ ../Backend/public/

# 3. Start the backend
cd ../Backend
npm start            # node server.js
```

Visit **http://localhost:3000**.

---

### Docker

The `dockerfile` is a multi-stage build that automates the steps above.

**Build the image**

```bash
docker build -t codesync .
```

**Run the container**

```bash
docker run -p 3000:3000 codesync
```

Visit **http://localhost:3000**.

**With environment variables**

```bash
docker run -p 3000:3000 -e CORS_ORIGIN=https://yourdomain.com codesync
```

**Dockerfile explained**

```dockerfile
# Stage 1 — build the React frontend
FROM node:20-alpine as frontend-builder
COPY ./Frontend /app
WORKDIR /app
RUN npm install && npm run build

# Stage 2 — run the backend, include the built frontend
FROM node:20-alpine
COPY ./Backend /app
WORKDIR /app
RUN npm install
COPY --from=frontend-builder /app/dist /app/public   # inject built frontend
CMD ["node", "server.js"]
```

The final image contains only the backend dependencies and the compiled frontend — no build tools.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGIN` | `*` | Allowed origin for Socket.IO CORS. Set to your frontend URL in production (e.g. `https://yourdomain.com`). |
| `PORT` | `3000` | Port the HTTP server listens on (hardcoded in `server.js` — change if needed). |

### Vite Dev Proxy (`Frontend/vite.config.js`)

The proxy forwards all `/socket.io` requests (including WebSocket upgrades) from the Vite dev server to the backend:

```js
server: {
  proxy: {
    "/socket.io": {
      target: "http://localhost:3000",
      ws: true,
      changeOrigin: true,
    },
  },
},
```

This is only active during `npm run dev`. In production, the frontend is served from the same origin as the backend, so no proxy is needed.

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check. Returns `{ message: "ok", success: true }` with status `200`. |
| `GET` | `/*` | Serves the built React frontend (static files from `public/`). |

### Socket.IO Events

These are handled internally by `y-socket.io` and are not intended to be called directly. They follow the Yjs sync protocol.

| Event | Direction | Description |
|---|---|---|
| `yjs-sync` | bidirectional | Initial document state exchange |
| `yjs-update` | bidirectional | Incremental document updates |
| `awareness-update` | bidirectional | User presence (cursor, username) updates |

---

## Deployment

### AWS (EC2 + Docker)

1. Launch an EC2 instance (Amazon Linux 2 or Ubuntu)
2. Install Docker:
   ```bash
   sudo yum update -y && sudo yum install -y docker
   sudo systemctl start docker
   ```
3. Copy your project to the instance (e.g. via `scp` or `git clone`)
4. Build and run:
   ```bash
   docker build -t codesync .
   docker run -d -p 80:3000 -e CORS_ORIGIN=http://<your-ec2-ip> codesync
   ```
5. Open port 80 in your EC2 security group inbound rules

### Tips for Production

- **Persistence** — By default, document content is lost when the server restarts. Add `y-leveldb` or `y-redis` to persist Yjs documents across restarts.
- **Horizontal scaling** — `YSocketIO` holds state in memory. To run multiple instances behind a load balancer, use `y-redis` as a shared state backend and configure Socket.IO with a Redis adapter.
- **TLS** — Put the container behind a reverse proxy (Nginx, Caddy, AWS ALB) that terminates HTTPS/WSS.
- **CORS** — Always set `CORS_ORIGIN` to your exact frontend origin in production instead of leaving it as `*`.

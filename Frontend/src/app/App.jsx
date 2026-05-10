import "./App.css"
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useState, useEffect } from "react"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"

const COLORS = ["#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"]

function getUserColor(username) {
  let hash = 0
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

function Avatar({ username, size = "md" }) {
  const color = getUserColor(username)
  const initials = username.slice(0, 2).toUpperCase()
  const cls = size === "sm" ? "w-7 h-7 text-[11px]" : "w-9 h-9 text-sm"
  return (
    <div
      className={`${cls} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none`}
      style={{ backgroundColor: color }}
      title={username}
    >
      {initials}
    </div>
  )
}

function CodeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function App() {
  const editorRef = useRef(null)
  const providerRef = useRef(null)
  const bindingRef = useRef(null)

  const [username, setUsername] = useState(() => {
    return new URLSearchParams(window.location.search).get("username") ||
      localStorage.getItem("username") || ""
  })
  const [users, setUsers] = useState([])
  const [synced, setSynced] = useState(false)

  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc])

  const handleMount = (editor) => {
    editorRef.current = editor
    if (providerRef.current && !bindingRef.current) {
      bindingRef.current = new MonacoBinding(
        yText,
        editor.getModel(),
        new Set([editor]),
        providerRef.current.awareness
      )
    }
  }

  const handleJoin = (e) => {
    e.preventDefault()
    const name = e.target.username.value.trim()
    if (!name) return
    localStorage.setItem("username", name)
    setUsername(name)
    window.history.pushState({}, "", "?username=" + name)
  }

  useEffect(() => {
    if (!username) return

    const provider = new SocketIOProvider("/", "monaco", ydoc, { autoConnect: true })
    providerRef.current = provider
    provider.awareness.setLocalStateField("user", { username })

    if (editorRef.current && !bindingRef.current) {
      bindingRef.current = new MonacoBinding(
        yText,
        editorRef.current.getModel(),
        new Set([editorRef.current]),
        provider.awareness
      )
    }

    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values())
      setUsers(states.filter(s => s.user?.username).map(s => s.user))
    }

    provider.socket.on("connect", () => setSynced(true))
    provider.socket.on("disconnect", () => setSynced(false))

    updateUsers()
    provider.awareness.on("change", updateUsers)

    const handleBeforeUnload = () => provider.awareness.setLocalStateField("user", null)
    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      provider.awareness.off("change", updateUsers)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      provider.disconnect()
      providerRef.current = null
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [username, ydoc, yText])

  /* ── Join screen ─────────────────────────────────────── */
  if (!username) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">

          <div className="flex items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white">
              <CodeIcon size={18} />
            </div>
            <span className="text-white text-xl font-bold tracking-tight">CodeSync</span>
          </div>

          <div className="bg-[#12121e] border border-white/[0.07] rounded-2xl p-8 shadow-[0_0_80px_rgba(124,58,237,0.08)]">
            <h2 className="text-white text-2xl font-semibold mb-1">Join session</h2>
            <p className="text-gray-500 text-sm mb-7">Enter a username to start collaborating</p>

            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  autoFocus
                  placeholder="e.g. ada_lovelace"
                  className="w-full bg-[#0a0a12] border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-gray-700 text-sm focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors mt-1 flex items-center justify-center gap-2"
              >
                Join Session
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          </div>

          <p className="text-center text-gray-700 text-xs mt-6">
            Real-time collaborative code editor
          </p>
        </div>
      </div>
    )
  }

  /* ── Editor screen ───────────────────────────────────── */
  return (
    <div className="h-screen flex flex-col bg-[#0a0a12] overflow-hidden">

      {/* ── Header ── */}
      <header className="h-12 bg-[#12121e] border-b border-white/[0.06] flex items-center px-5 gap-4 flex-shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-white">
            <CodeIcon size={13} />
          </div>
          <span className="text-white font-bold text-sm tracking-tight">CodeSync</span>
        </div>

        <div className="w-px h-4 bg-white/10 flex-shrink-0" />

        {/* File tab */}
        <div className="flex items-center gap-1.5 bg-[#0a0a12] border border-white/[0.07] rounded-lg px-3 py-1.5 text-xs text-gray-400">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-gray-300 font-medium">main.js</span>
        </div>

        <div className="flex-1" />

        {/* Stacked avatars */}
        <div className="flex items-center">
          {users.slice(0, 6).map((user, i) => (
            <div key={i} className="ring-2 ring-[#12121e] rounded-full" style={{ marginLeft: i === 0 ? 0 : -6 }}>
              <Avatar username={user.username} size="sm" />
            </div>
          ))}
          {users.length > 6 && (
            <div
              className="w-7 h-7 rounded-full bg-white/10 text-gray-400 text-[10px] font-bold flex items-center justify-center ring-2 ring-[#12121e]"
              style={{ marginLeft: -6 }}
            >
              +{users.length - 6}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-white/10 flex-shrink-0" />

        {/* Language badge */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
          JavaScript
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-52 bg-[#12121e] border-r border-white/[0.06] flex flex-col flex-shrink-0">

          <div className="px-4 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              Collaborators
            </span>
            <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 rounded-full px-2 py-0.5 leading-4">
              {users.length}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 px-2 pb-4 overflow-y-auto flex-1">
            {users.map((user, i) => {
              const isMe = user.username === username
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-colors ${isMe ? "bg-violet-500/10" : "hover:bg-white/[0.04]"}`}
                >
                  <Avatar username={user.username} size="sm" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[13px] text-gray-200 font-medium truncate leading-snug">
                      {user.username}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-violet-400 leading-tight">you</span>
                    )}
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                </div>
              )
            })}
          </div>

        </aside>

        {/* ── Editor ── */}
        <main className="flex-1 overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="javascript"
            defaultValue={"// Welcome to CodeSync\n// Start typing — your changes sync in real time\n"}
            theme="vs-dark"
            onMount={handleMount}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
              fontLigatures: true,
              lineHeight: 22,
              padding: { top: 20, bottom: 20 },
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              renderLineHighlight: "gutter",
              cursorBlinking: "smooth",
              smoothScrolling: true,
              bracketPairColorization: { enabled: true },
              tabSize: 2,
            }}
          />
        </main>
      </div>

      {/* ── Status bar ── */}
      <footer className="h-6 flex-shrink-0 bg-violet-700 flex items-center px-4 gap-3 text-white/80 text-[11px] font-medium flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${synced ? "bg-emerald-300" : "bg-yellow-300 animate-pulse"}`} />
          <span>{synced ? "Connected" : "Connecting…"}</span>
        </div>
        <span className="text-white/30">·</span>
        <span>{users.length} {users.length === 1 ? "user" : "users"} online</span>
        <div className="flex-1" />
        <span>JavaScript</span>
        <span className="text-white/30">·</span>
        <span>UTF-8</span>
        <span className="text-white/30">·</span>
        <span>LF</span>
      </footer>

    </div>
  )
}

export default App

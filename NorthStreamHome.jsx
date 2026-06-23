import React, { useState, useEffect, useRef, useCallback } from "react";

/* ==========================================================
   NORTHSTREAM — Live Web App
   Real M3U fetching + HLS.js playback
   Sources: iptv-org index, sports, Free-TV
========================================================== */

/* ---------------- Playlist sources ---------------- */
const SOURCES = {
  general: {
    id: "general",
    label: "General",
    desc: "All channels (iptv-org)",
    url: "https://iptv-org.github.io/iptv/index.m3u",
  },
  sports: {
    id: "sports",
    label: "Sports",
    desc: "Sports channels only (iptv-org)",
    url: "https://iptv-org.github.io/iptv/categories/sports.m3u",
  },
  freetv: {
    id: "freetv",
    label: "Full TV",
    desc: "News · Movies · Kids · Music (Free-TV)",
    url: "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8",
  },
};

const PROXIES = [
  u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${u}`,
];

async function fetchWithFallback(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (res.ok) { const t = await res.text(); if (t.includes("#EXTM3U")) return t; }
  } catch {}
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error();
      const t = await res.text();
      if (t.includes("#EXTM3U")) return t;
    } catch {}
  }
  throw new Error("All sources failed");
}

/* ---------------- M3U parser ---------------- */
function parseM3U(text) {
  const lines = text.split("\n");
  const channels = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF")) {
      current = { id: "", name: "", url: "", logo: "", country: "", category: "", quality: "" };
      // name is after the last comma
      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) current.name = nameMatch[1].trim();
      // tvg-id
      const idMatch = line.match(/tvg-id="([^"]*)"/);
      if (idMatch) current.id = idMatch[1];
      // tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      if (logoMatch) current.logo = logoMatch[1];
      // tvg-country
      const countryMatch = line.match(/tvg-country="([^"]*)"/);
      if (countryMatch) current.country = countryMatch[1];
      // group-title → category
      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) current.category = groupMatch[1].trim() || "General";
      else current.category = "General";
    } else if (line && !line.startsWith("#") && current) {
      current.url = line;
      if (!current.id) current.id = `ch-${channels.length}`;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

/* ---------------- Utility ---------------- */
function groupByCategory(channels) {
  const groups = {};
  channels.forEach((ch) => {
    const cat = ch.category || "General";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(ch);
  });
  // Sort groups alphabetically
  const sorted = {};
  Object.keys(groups).sort().forEach((k) => (sorted[k] = groups[k]));
  return sorted;
}

const SHOW_TITLES = [
  "Morning Briefing","Live Coverage","Studio Talk","Evening Edition","Late Edition",
  "The Daily","Signal Check","Open Air","Night Watch","Weekend Special",
];
function mockEpgFor(channel) {
  let seed = channel.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + channel.name.length;
  const slots = [];
  let hour = 6;
  for (let i = 0; i < 5; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const title = SHOW_TITLES[seed % SHOW_TITLES.length];
    const duration = 1 + (seed % 2);
    slots.push({ time: `${String(hour % 24).padStart(2, "0")}:00`, title, live: i === 1 });
    hour += duration;
  }
  return slots;
}

/* ---------------- Icons ---------------- */
const Ic = (d, w = 24, extra = {}) => (props) => (
  <svg viewBox={`0 0 ${w} ${w}`} width={props.size || 18} height={props.size || 18}
    fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" {...extra} {...props}>
    {d}
  </svg>
);

const IconSearch   = Ic(<><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>);
const IconPlay     = (p) => <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="currentColor" {...p}><path d="M8 5v14l11-7z"/></svg>;
const IconPause    = (p) => <svg viewBox="0 0 24 24" width={p.size||16} height={p.size||16} fill="currentColor" {...p}><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>;
const IconChevronDown = Ic(<polyline points="6 9 12 15 18 9"/>);
const IconClose    = Ic(<><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>);
const IconLock     = Ic(<><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>);
const IconUnlock   = Ic(<><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.4-2"/></>);
const IconSignal   = Ic(<><path d="M4 18a8 8 0 0 1 16 0"/><path d="M8 18a4 4 0 0 1 8 0"/><line x1="12" y1="18" x2="12" y2="18" strokeWidth="3"/><line x1="12" y1="9" x2="12" y2="4"/></>);
const IconHome     = Ic(<><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/></>);
const IconGuide    = Ic(<><rect x="3" y="4" width="18" height="16" rx="1.5"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="4" x2="8" y2="9"/></>);
const IconHeart    = Ic(<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>);
const IconSettings = Ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>);
const IconSun      = Ic(<><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></>);
const IconMoon     = Ic(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>);
const IconRetry    = Ic(<><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/></>);
const IconBookmark = Ic(<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>);
const IconGlobe    = Ic(<><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></>, 24);
const IconLink     = Ic(<><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></>);
const IconCheck    = Ic(<polyline points="20 6 9 17 4 12"/>);
const IconWarn     = Ic(<><path d="M12 3 2 20h20L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/></>);
const IconTv       = Ic(<><rect x="2" y="7" width="20" height="13" rx="2"/><path d="M15 2l-3 5-3-5"/></>);
const IconLoader   = Ic(<><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></>);

/* ---------------- Theme tokens ---------------- */
const THEMES = {
  dark: {
    bg: "#05080A", bgElevated: "#0A1015", bgCard: "#0E1620",
    border: "rgba(120,245,200,0.12)", borderStrong: "rgba(120,245,200,0.28)",
    text: "#E8F2EE", textDim: "#7C9089",
    accent: "#39FFB0", accentDim: "rgba(57,255,176,0.15)",
    shadow: "0 20px 50px rgba(0,0,0,0.55)", warn: "#FFB23E", err: "#FF6B5E",
  },
  light: {
    bg: "#F2F6F4", bgElevated: "#FFFFFF", bgCard: "#FFFFFF",
    border: "rgba(15,45,35,0.10)", borderStrong: "rgba(15,45,35,0.22)",
    text: "#0C1A15", textDim: "#5C6D66",
    accent: "#0E9E6B", accentDim: "rgba(14,158,107,0.12)",
    shadow: "0 16px 40px rgba(15,45,35,0.10)", warn: "#C47A00", err: "#C0392B",
  },
};

/* ============================================================
   ROOT COMPONENT
============================================================ */
export default function NorthStreamHome() {
  const [mode, setMode]           = useState("dark");
  const t = THEMES[mode];

  /* --- Source / channel state --- */
  const [activeSourceId, setActiveSourceId] = useState("general");
  const [customUrl, setCustomUrl]           = useState("");
  const [customDraft, setCustomDraft]       = useState("");
  const [customStatus, setCustomStatus]     = useState("idle");

  const [channels, setChannels]   = useState([]);
  const [loadState, setLoadState] = useState("idle"); // idle|loading|ok|error
  const [loadError, setLoadError] = useState("");

  /* --- UI state --- */
  const [screen, setScreen]       = useState("home");
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchFocused, setSearchFocused]   = useState(false);
  const [heroIndex, setHeroIndex]           = useState(0);
  const heroTimer = useRef(null);

  /* --- Player state --- */
  const [activeChannel, setActiveChannel]   = useState(null);
  const [playerState, setPlayerState]       = useState("closed");
  const [isPlaying, setIsPlaying]           = useState(true);
  const [isLocked, setIsLocked]             = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isRetrying, setIsRetrying]         = useState(false);
  const [hlsError, setHlsError]             = useState(false);
  const videoRef = useRef(null);
  const hlsRef   = useRef(null);
  const dragStartY = useRef(null);

  /* --- Favorites --- */
  const [favorites, setFavorites] = useState(() => new Set());
  const toggleFavorite = (id) => setFavorites((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  /* ---- Fetch + parse M3U ---- */
  const fetchSource = useCallback(async (url) => {
    setLoadState("loading");
    setLoadError("");
    setChannels([]);
    setHeroIndex(0);
    try {
      const text = await fetchWithFallback(url);
      const parsed = parseM3U(text);
      if (!parsed.length) throw new Error("No channels found in playlist");
      setChannels(parsed);
      setLoadState("ok");
    } catch (e) {
      setLoadError(e.message || "Failed to load playlist");
      setLoadState("error");
    }
  }, []);

  /* Load default source on mount */
  useEffect(() => {
    fetchSource(SOURCES[activeSourceId].url);
  }, []); // eslint-disable-line

  /* ---- Switch built-in source ---- */
  const switchSource = (id) => {
    setActiveSourceId(id);
    setCustomUrl("");
    setCustomStatus("idle");
    setScreen("home");
    setActiveCategory("All");
    fetchSource(SOURCES[id].url);
  };

  /* ---- Load custom URL ---- */
  const loadCustomUrl = () => {
    const url = customDraft.trim();
    if (!url) return;
    setCustomStatus("loading");
    setActiveSourceId("custom");
    setCustomUrl(url);
    fetchSource(url);
    setTimeout(() => setCustomStatus("active"), 1200); // optimistic
    setScreen("home");
    setActiveCategory("All");
  };
  const clearCustomUrl = () => {
    setCustomUrl("");
    setCustomDraft("");
    setCustomStatus("idle");
    setActiveSourceId("general");
    fetchSource(SOURCES.general.url);
  };

  /* ---- Hero auto-scroll 3s ---- */
  const featuredChannels = channels.slice(0, 8);
  const startHeroTimer = useCallback(() => {
    clearInterval(heroTimer.current);
    heroTimer.current = setInterval(() => {
      setHeroIndex((i) => (i + 1) % Math.max(featuredChannels.length, 1));
    }, 3000);
  }, [featuredChannels.length]);

  useEffect(() => {
    if (featuredChannels.length > 1) startHeroTimer();
    return () => clearInterval(heroTimer.current);
  }, [featuredChannels.length]); // eslint-disable-line

  /* ---- HLS.js player ---- */
  const HLS_CFG = {
    maxBufferLength: 60, maxMaxBufferLength: 120, startLevel: 0,
    abrEwmaDefaultEstimate: 500000, testBandwidth: false, progressive: true,
    lowLatencyMode: false, fragLoadingTimeOut: 8000, manifestLoadingTimeOut: 8000,
    fragLoadingMaxRetry: 3, manifestLoadingMaxRetry: 3, enableWorker: false,
  };

  const loadStream = useCallback(async (url) => {
    setHlsError(false);
    const video = videoRef.current;
    if (!video) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    try {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
        video.play().catch(() => {});
        setIsPlaying(true);
      } else {
        const HLS = (await import("https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js")).default || window.Hls;
        if (!HLS || !HLS.isSupported()) { setHlsError(true); return; }
        const hls = new HLS(HLS_CFG);
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(HLS.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
          setIsPlaying(true);
        });
        hls.on(HLS.Events.ERROR, (_, data) => {
          if (data.fatal) setHlsError(true);
        });
      }
    } catch { setHlsError(true); }
  }, []);

  const openChannel = (ch) => {
    setActiveChannel(ch);
    setPlayerState("full");
    setIsPlaying(true);
    setIsLocked(false);
    setControlsVisible(true);
    setHlsError(false);
    setIsRetrying(false);
    setTimeout(() => loadStream(ch.url), 80);
  };

  const closePlayer = () => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) videoRef.current.src = "";
    setPlayerState("closed");
    setActiveChannel(null);
    setIsLocked(false);
    setControlsVisible(true);
  };

  const retryStream = () => {
    if (!activeChannel) return;
    setIsRetrying(true);
    setHlsError(false);
    setTimeout(() => {
      loadStream(activeChannel.url);
      setIsRetrying(false);
    }, 600);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  /* ---- Swipe handlers ---- */
  const onTouchStart = (e) => { dragStartY.current = e.touches[0].clientY; };
  const onMiniTouchEnd = (e) => {
    if (dragStartY.current == null) return;
    if (e.changedTouches[0].clientY - dragStartY.current < -30) setPlayerState("full");
    dragStartY.current = null;
  };
  const onFullTouchEnd = (e) => {
    if (dragStartY.current == null || isLocked) return;
    if (e.changedTouches[0].clientY - dragStartY.current > 40) setPlayerState("mini");
    dragStartY.current = null;
  };

  /* ---- Derived channel lists ---- */
  const categories = ["All", ...Array.from(new Set(channels.map((c) => c.category))).sort()];
  const displayChannels = channels.filter((c) => {
    const catOk = activeCategory === "All" || c.category === activeCategory;
    const searchOk = !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    return catOk && searchOk;
  }).slice(0, 200);
  const searchResults = searchQuery.trim()
    ? channels.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 30)
    : [];
  const grouped = groupByCategory(displayChannels);
  const heroChannel = featuredChannels[heroIndex] || null;

  /* ================================================================
     RENDER
  ================================================================ */
  return (
    <div style={{
      minHeight: "100vh",
      background: t.bg,
      color: t.text,
      fontFamily: "'Space Grotesk','Inter',sans-serif",
      transition: "background 0.3s,color 0.3s",
      paddingTop: playerState === "mini" ? "64px" : "0",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;} body{margin:0;}
        .ns-sb::-webkit-scrollbar{height:0;width:0;}
        .ns-fade{animation:nsFade 0.2s ease;}
        @keyframes nsFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes nsSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes nsPulse{0%,100%{opacity:1}50%{opacity:.4}}
        .ns-pulse{animation:nsPulse 1.8s ease-in-out infinite;}
        .ns-spin{animation:nsSpin 1s linear infinite;}
        button{font-family:inherit;cursor:pointer;} input{font-family:inherit;}
        video{display:block;width:100%;height:100%;object-fit:contain;background:#000;}
      `}</style>

      {/* ===== HIDDEN VIDEO ELEMENT (always mounted) ===== */}
      <video
        ref={videoRef}
        style={{ display: "none" }}
        playsInline
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* ===== MINI PLAYER (sticky top) ===== */}
      {playerState === "mini" && activeChannel && (
        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onMiniTouchEnd}
          onClick={() => setPlayerState("full")}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, height: "64px",
            background: t.bgElevated, borderBottom: `1px solid ${t.border}`,
            display: "flex", alignItems: "center", gap: "12px", padding: "0 14px",
            zIndex: 200, boxShadow: t.shadow, cursor: "pointer",
          }}
        >
          {/* Tiny live video feed in mini player */}
          <div style={{
            width: "80px", height: "46px", borderRadius: "6px", overflow: "hidden",
            background: "#000", flexShrink: 0, border: `1px solid ${t.borderStrong}`,
          }}>
            <video
              ref={(el) => { if (el && videoRef.current && el !== videoRef.current) {
                // mirror: same hls instance, just attach to this element too
              }}}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              src={videoRef.current?.src || ""}
              muted playsInline autoPlay
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {activeChannel.name}
            </div>
            <div style={{ fontSize: "11px", color: t.textDim, display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="ns-pulse" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, display: "inline-block" }} />
              Live · {activeChannel.category}
            </div>
          </div>
          <Btn t={t} onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
            {isPlaying ? <IconPause size={15}/> : <IconPlay size={15}/>}
          </Btn>
          <Btn t={t} onClick={(e) => { e.stopPropagation(); closePlayer(); }}>
            <IconClose size={15}/>
          </Btn>
        </div>
      )}

      {/* ===== FULLSCREEN PLAYER ===== */}
      {playerState === "full" && activeChannel && (
        <div className="ns-fade" style={{
          position: "fixed", inset: 0, background: "#000", zIndex: 300,
          display: "flex", flexDirection: "column",
        }}>
          {/* Video surface */}
          <div
            onTouchStart={!isLocked ? onTouchStart : undefined}
            onTouchEnd={!isLocked ? onFullTouchEnd : undefined}
            onClick={() => setControlsVisible((v) => !v)}
            style={{
              width: "100%", aspectRatio: "16/9", position: isLocked ? "sticky" : "relative",
              top: 0, zIndex: 5, flexShrink: 0, background: "#000", cursor: "pointer",
            }}
          >
            {/* Real video — show/hide via CSS so we don't remount */}
            <video
              ref={videoRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Overlay controls */}
            <div style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              justifyContent: "space-between", padding: "14px",
              opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? "auto" : "none",
              transition: "opacity 0.2s", background: controlsVisible ? "linear-gradient(to bottom, rgba(0,0,0,.5) 0%, transparent 35%, transparent 65%, rgba(0,0,0,.5) 100%)" : "none",
            }}>
              {/* Top row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Btn t={t} dark onClick={(e) => { e.stopPropagation(); setPlayerState("mini"); }}>
                  <IconChevronDown size={16}/>
                </Btn>
                <div style={{
                  fontSize: "11px", fontFamily: "'JetBrains Mono',monospace",
                  background: "rgba(0,0,0,.4)", border: `1px solid ${t.borderStrong}`,
                  borderRadius: "20px", padding: "4px 10px",
                  display: "flex", alignItems: "center", gap: "6px", color: "#fff",
                }}>
                  <span className="ns-pulse" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, display: "inline-block" }} />
                  LIVE
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Btn t={t} dark active={isLocked} onClick={(e) => { e.stopPropagation(); setIsLocked((l) => !l); }}>
                    {isLocked ? <IconLock size={15}/> : <IconUnlock size={15}/>}
                  </Btn>
                  <Btn t={t} dark onClick={(e) => { e.stopPropagation(); closePlayer(); }}>
                    <IconClose size={15}/>
                  </Btn>
                </div>
              </div>
              {/* Center play/pause */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Btn t={t} dark large onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
                  {isPlaying ? <IconPause size={22}/> : <IconPlay size={22}/>}
                </Btn>
              </div>
              {/* Bottom: channel name */}
              <div style={{ color: "#fff", fontSize: "13px", fontWeight: 600 }}>
                {activeChannel.name}
                {activeChannel.country ? <span style={{ fontWeight: 400, marginLeft: "8px", opacity: .7 }}>{activeChannel.country}</span> : null}
              </div>
            </div>

            {/* HLS error overlay */}
            {hlsError && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: "12px",
                background: "rgba(0,0,0,.75)", color: "#fff",
              }}>
                <IconTv size={32} style={{ color: t.accent }}/>
                <div style={{ fontSize: "14px", fontWeight: 600 }}>Stream unavailable</div>
                <div style={{ fontSize: "12px", opacity: .7, textAlign: "center", maxWidth: "200px" }}>
                  This channel may be offline or geo-blocked
                </div>
                <button onClick={retryStream} style={{
                  marginTop: "4px", padding: "8px 18px", borderRadius: "20px",
                  background: t.accent, border: "none", color: t.bg,
                  fontSize: "12px", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px",
                }}>
                  <IconRetry size={13}/> Retry
                </button>
              </div>
            )}

            {/* Tiny active-lock dot when controls hidden */}
            {!controlsVisible && isLocked && (
              <div style={{ position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: "50%", background: t.accent }} />
            )}
          </div>

          {/* Scrollable content below player */}
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: t.bg }}>
            <div style={{ padding: "18px 18px 0" }}>
              {/* Channel info header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: t.accent, fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".06em", marginBottom: "4px" }}>
                    {activeChannel.category?.toUpperCase()} · FREE-TO-AIR
                  </div>
                  <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, lineHeight: 1.2 }}>{activeChannel.name}</h2>
                </div>
                <button
                  onClick={() => toggleFavorite(activeChannel.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: "5px", marginLeft: "10px", flexShrink: 0,
                    background: favorites.has(activeChannel.id) ? t.accentDim : "transparent",
                    border: `1px solid ${favorites.has(activeChannel.id) ? t.accent : t.border}`,
                    borderRadius: "20px", padding: "6px 12px",
                    color: favorites.has(activeChannel.id) ? t.accent : t.textDim,
                    fontSize: "12px", fontWeight: 600,
                  }}
                >
                  <IconBookmark size={13} fill={favorites.has(activeChannel.id) ? "currentColor" : "none"}/>
                  {favorites.has(activeChannel.id) ? "Saved" : "Save"}
                </button>
              </div>

              {/* Meta badges */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "14px" }}>
                {activeChannel.country && <MetaPill t={t} icon={<IconGlobe size={12}/>} label={activeChannel.country} />}
                {activeChannel.quality && <MetaPill t={t} icon={<IconTv size={12}/>} label={activeChannel.quality} />}
                {activeChannel.alwaysOn && <MetaPill t={t} icon={<IconSignal size={12}/>} label="24/7" />}
              </div>

              {/* Retry button */}
              <button
                onClick={retryStream}
                disabled={isRetrying}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  padding: "11px", borderRadius: "10px",
                  border: `1px dashed ${t.borderStrong}`, background: t.bgCard,
                  color: isRetrying ? t.accent : t.textDim,
                  fontSize: "13px", fontWeight: 600, marginBottom: "20px",
                }}
              >
                <span style={{ display: "flex" }} className={isRetrying ? "ns-spin" : ""}>
                  <IconRetry size={14}/>
                </span>
                {isRetrying ? "Reconnecting…" : "Stream not loading? Retry"}
              </button>
            </div>

            {/* More channels in same category */}
            {channels.filter((c) => c.category === activeChannel.category && c.id !== activeChannel.id).length > 0 && (
              <div style={{ padding: "0 18px 24px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: t.textDim, marginBottom: "10px" }}>
                  More in {activeChannel.category}
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                  gap: "10px",
                }}>
                  {channels
                    .filter((c) => c.category === activeChannel.category && c.id !== activeChannel.id)
                    .slice(0, 20)
                    .map((c) => (
                      <ChannelCard
                        key={c.id} channel={c} t={t}
                        onClick={() => openChannel(c)}
                        isFavorite={favorites.has(c.id)}
                        onToggleFavorite={() => toggleFavorite(c.id)}
                        compact fullWidth
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== HOME SCREEN ===== */}
      {screen === "home" && (
        <>
          {/* Header */}
          <header style={{ padding: "20px 16px 0", position: "relative", zIndex: 10 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "34px", height: "34px", borderRadius: "9px",
                  background: `linear-gradient(135deg,${t.accent},transparent)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${t.borderStrong}`,
                }}>
                  <IconSignal size={18} style={{ color: t.bg }}/>
                </div>
                <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "-.02em" }}>
                  North<span style={{ color: t.accent }}>Stream</span>
                </span>
              </div>
            </div>

            {/* Search */}
            <div style={{ position: "relative", marginBottom: "14px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                background: t.bgCard, border: `1px solid ${searchFocused ? t.borderStrong : t.border}`,
                borderRadius: "12px", padding: "10px 12px", transition: "border .15s",
              }}>
                <span style={{ color: t.textDim, display: "flex" }}><IconSearch size={16}/></span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Search channels…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: t.text, fontSize: "14px" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", color: t.textDim, display: "flex", padding: 0 }}>
                    <IconClose size={14}/>
                  </button>
                )}
              </div>
              {searchFocused && searchQuery && (
                <div className="ns-fade" style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                  background: t.bgElevated, border: `1px solid ${t.border}`,
                  borderRadius: "12px", boxShadow: t.shadow, zIndex: 50,
                  maxHeight: "280px", overflowY: "auto",
                }}>
                  {searchResults.length === 0
                    ? <div style={{ padding: "14px", fontSize: "13px", color: t.textDim }}>No channels found</div>
                    : searchResults.map((ch) => (
                      <button key={ch.id} onMouseDown={() => { openChannel(ch); setSearchQuery(""); }}
                        style={{
                          width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "10px",
                          padding: "10px 14px", background: "transparent", border: "none",
                          borderBottom: `1px solid ${t.border}`, color: t.text,
                        }}>
                        {ch.logo
                          ? <img src={ch.logo} alt="" width="22" height="22" style={{ borderRadius: "4px", objectFit: "contain", background: t.bgCard }}
                              onError={(e) => { e.target.style.display = "none"; }}/>
                          : <span style={{ color: t.accent, display: "flex" }}><IconSignal size={14}/></span>}
                        <span style={{ fontSize: "13px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</span>
                        <span style={{ fontSize: "11px", color: t.textDim, flexShrink: 0 }}>{ch.category}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Category pills */}
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "14px" }} className="ns-sb">
              {categories.map((cat) => {
                const active = cat === activeCategory;
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{
                    flexShrink: 0, padding: "7px 14px", borderRadius: "20px",
                    fontSize: "13px", fontWeight: 600,
                    border: `1px solid ${active ? t.accent : t.border}`,
                    background: active ? t.accentDim : "transparent",
                    color: active ? t.accent : t.textDim, transition: "all .15s",
                  }}>{cat}</button>
                );
              })}
            </div>
          </header>

          {/* Loading / error state */}
          {loadState === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: "14px", color: t.textDim }}>
              <span className="ns-spin" style={{ color: t.accent, display: "flex" }}><IconLoader size={28}/></span>
              <div style={{ fontSize: "14px" }}>Loading channels…</div>
            </div>
          )}
          {loadState === "error" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: "12px" }}>
              <IconWarn size={28} style={{ color: t.warn }}/>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>Failed to load playlist</div>
              <div style={{ fontSize: "12px", color: t.textDim, textAlign: "center" }}>{loadError}</div>
              <button onClick={() => fetchSource(customUrl || SOURCES[activeSourceId]?.url || SOURCES.general.url)}
                style={{ padding: "8px 18px", borderRadius: "20px", background: t.accent, border: "none", color: t.bg, fontSize: "12px", fontWeight: 700 }}>
                Retry
              </button>
            </div>
          )}

          {/* Hero banner */}
          {loadState === "ok" && heroChannel && (
            <section style={{ padding: "0 16px 24px" }}>
              <div
                onMouseEnter={() => clearInterval(heroTimer.current)}
                onMouseLeave={startHeroTimer}
                onClick={() => openChannel(heroChannel)}
                style={{
                  position: "relative", width: "100%", aspectRatio: "16/8.5",
                  borderRadius: "18px", overflow: "hidden", cursor: "pointer",
                  border: `1px solid ${t.border}`,
                  background: `linear-gradient(135deg, ${t.accentDim}, ${t.bg} 85%)`,
                }}
              >
                {heroChannel.logo && (
                  <img src={heroChannel.logo} alt="" style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", opacity: .18,
                  }} onError={(e) => { e.target.style.display = "none"; }}/>
                )}
                <div style={{
                  position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                  justifyContent: "flex-end", padding: "20px",
                  background: "linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 60%)",
                }}>
                  <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono',monospace", color: t.accent, letterSpacing: ".06em", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="ns-pulse" style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.accent, display: "inline-block" }}/>
                    LIVE · {heroChannel.category?.toUpperCase()}
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{heroChannel.name}</div>
                  {heroChannel.country && <div style={{ fontSize: "12px", color: "rgba(255,255,255,.6)", marginTop: "4px" }}>{heroChannel.country}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px" }}>
                    <div style={{
                      width: "34px", height: "34px", borderRadius: "50%",
                      background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}>
                      <IconPlay size={14}/>
                    </div>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,.75)" }}>Tap to watch</span>
                  </div>
                </div>
                {/* progress dots */}
                <div style={{ position: "absolute", top: "14px", right: "14px", display: "flex", gap: "5px" }}>
                  {featuredChannels.map((_, i) => (
                    <div key={i} style={{
                      width: i === heroIndex ? "16px" : "6px", height: "4px", borderRadius: "2px",
                      background: i === heroIndex ? t.accent : "rgba(255,255,255,.3)", transition: "all .3s",
                    }}/>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Channel rails */}
          {loadState === "ok" && (
            <main style={{ padding: "0 16px 100px" }}>
              {Object.entries(grouped).map(([category, chs]) => (
                <div key={category} style={{ marginBottom: "26px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700 }}>{category}</h3>
                    <span style={{ fontSize: "12px", color: t.textDim }}>{chs.length}</span>
                  </div>
                  <div style={{ display: "flex", gap: "12px", overflowX: "auto" }} className="ns-sb">
                    {chs.map((ch) => (
                      <ChannelCard
                        key={ch.id} channel={ch} t={t}
                        onClick={() => openChannel(ch)}
                        isFavorite={favorites.has(ch.id)}
                        onToggleFavorite={() => toggleFavorite(ch.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </main>
          )}
        </>
      )}

      {/* ===== GUIDE SCREEN ===== */}
      {screen === "guide" && (
        <GuideScreen t={t} channels={channels.filter((c) => favorites.has(c.id))} onOpenChannel={openChannel} />
      )}

      {/* ===== FAVORITES SCREEN ===== */}
      {screen === "favorites" && (
        <FavoritesScreen t={t} channels={channels.filter((c) => favorites.has(c.id))}
          onOpenChannel={openChannel} onToggleFavorite={toggleFavorite} />
      )}

      {/* ===== SETTINGS SCREEN ===== */}
      {screen === "settings" && (
        <SettingsScreen
          t={t} mode={mode} setMode={setMode}
          activeSourceId={activeSourceId}
          onSwitchSource={switchSource}
          customUrl={customUrl} customDraft={customDraft}
          setCustomDraft={setCustomDraft} customStatus={customStatus}
          onLoadCustomUrl={loadCustomUrl} onClearCustomUrl={clearCustomUrl}
          favoriteCount={favorites.size} channelCount={channels.length}
        />
      )}

      {/* ===== BOTTOM TAB NAV ===== */}
      <nav style={{
        position: "fixed", bottom: 0, left: 0, right: 0, height: "64px",
        background: t.bgElevated, borderTop: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-around", zIndex: 150,
      }}>
        {[
          { key: "home", label: "Home", Icon: IconHome },
          { key: "guide", label: "Guide", Icon: IconGuide },
          { key: "favorites", label: "Favorites", Icon: IconHeart },
          { key: "settings", label: "Settings", Icon: IconSettings },
        ].map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setScreen(key)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
            background: "transparent", border: "none",
            color: screen === key ? t.accent : t.textDim, fontSize: "10px", fontWeight: 600,
          }}>
            <Icon size={20}/>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

/* ============================================================
   SUB-COMPONENTS
============================================================ */

/* Small icon button */
function Btn({ t, children, onClick, dark, active, large }) {
  return (
    <button onClick={onClick} style={{
      width: large ? "58px" : "38px", height: large ? "58px" : "38px",
      borderRadius: "50%", border: `1px solid ${active ? t.accent : dark ? "rgba(255,255,255,.25)" : t.borderStrong}`,
      background: active ? t.accentDim : dark ? "rgba(0,0,0,.35)" : "transparent",
      color: active ? t.accent : dark ? "#fff" : t.text,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

function MetaPill({ t, icon, label, warn }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      fontSize: "11px", padding: "5px 10px", borderRadius: "20px",
      background: warn ? "rgba(255,178,62,.12)" : t.bgCard,
      border: `1px solid ${warn ? t.warn : t.border}`,
      color: warn ? t.warn : t.textDim,
    }}>
      {icon}{label}
    </span>
  );
}

function MiniBadge({ t, label, accent }) {
  return (
    <span style={{
      fontSize: "9px", fontFamily: "'JetBrains Mono',monospace",
      padding: "2px 5px", borderRadius: "6px",
      background: accent ? t.accentDim : "transparent",
      border: `1px solid ${accent ? t.accent : t.border}`,
      color: accent ? t.accent : t.textDim, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function ChannelCard({ channel, t, onClick, isFavorite, onToggleFavorite, compact, fullWidth }) {
  return (
    <div style={{ flexShrink: fullWidth ? undefined : 0, width: fullWidth ? "100%" : compact ? "118px" : "138px", position: "relative" }}>
      <button onClick={onClick} style={{
        width: "100%", background: t.bgCard, border: `1px solid ${t.border}`,
        borderRadius: "14px", padding: "10px", display: "flex", flexDirection: "column",
        gap: "8px", textAlign: "left", color: t.text, transition: "border .15s",
      }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = t.borderStrong}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = t.border}
      >
        {/* Logo / placeholder */}
        <div style={{
          width: "100%", aspectRatio: "16/9", borderRadius: "8px", overflow: "hidden",
          background: `linear-gradient(135deg,${t.accentDim},transparent)`,
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative",
        }}>
          {channel.logo
            ? <img src={channel.logo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}/>
            : null}
          <span style={{ color: t.accent, display: channel.logo ? "none" : "flex" }}><IconSignal size={20}/></span>
          <div style={{
            position: "absolute", bottom: "4px", right: "4px",
            width: "20px", height: "20px", borderRadius: "50%",
            background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          }}>
            <IconPlay size={10}/>
          </div>
        </div>
        <div style={{ fontSize: "11px", fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {channel.name}
        </div>
        {!compact && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
            {channel.country && <MiniBadge t={t} label={channel.country} />}
            {channel.quality && <MiniBadge t={t} label={channel.quality} />}
          </div>
        )}
      </button>
      {onToggleFavorite && (
        <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          style={{
            position: "absolute", top: "14px", right: "14px",
            width: "22px", height: "22px", borderRadius: "50%", border: "none",
            background: "rgba(0,0,0,.45)", color: isFavorite ? t.accent : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          <IconBookmark size={11} fill={isFavorite ? "currentColor" : "none"}/>
        </button>
      )}
    </div>
  );
}

/* ---- Guide screen ---- */
function GuideScreen({ t, channels, onOpenChannel }) {
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700 }}>Guide</h2>
      <p style={{ margin: "0 0 18px", fontSize: "13px", color: t.textDim }}>Schedule for your saved channels</p>
      {channels.length === 0
        ? <EmptyState t={t} icon={<IconGuide size={26}/>} title="No saved channels" subtitle="Save a channel from its card or player to see its schedule here." />
        : channels.map((ch) => {
          const slots = mockEpgFor(ch);
          return (
            <div key={ch.id} style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
              <button onClick={() => onOpenChannel(ch)} style={{
                display: "flex", alignItems: "center", gap: "10px", background: "transparent",
                border: "none", color: t.text, marginBottom: "10px", width: "100%", textAlign: "left",
              }}>
                {ch.logo
                  ? <img src={ch.logo} alt="" width="28" height="28" style={{ borderRadius: "6px", objectFit: "contain", background: t.bgCard }}
                      onError={(e) => { e.target.style.display = "none"; }}/>
                  : <div style={{ width: "28px", height: "28px", borderRadius: "7px", background: t.accentDim, display: "flex", alignItems: "center", justifyContent: "center", color: t.accent }}>
                      <IconSignal size={14}/>
                    </div>}
                <span style={{ fontSize: "14px", fontWeight: 600 }}>{ch.name}</span>
              </button>
              {slots.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "6px 8px", borderRadius: "7px",
                  background: s.live ? t.accentDim : "transparent",
                }}>
                  <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono',monospace", color: s.live ? t.accent : t.textDim, width: "38px", flexShrink: 0 }}>{s.time}</span>
                  <span style={{ fontSize: "12px", color: s.live ? t.text : t.textDim, fontWeight: s.live ? 600 : 400, flex: 1 }}>{s.title}</span>
                  {s.live && <span style={{ fontSize: "9px", color: t.accent, display: "flex", alignItems: "center", gap: "3px", fontFamily: "'JetBrains Mono',monospace" }}>
                    <span className="ns-pulse" style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.accent, display: "inline-block" }}/>NOW
                  </span>}
                </div>
              ))}
            </div>
          );
        })}
    </div>
  );
}

/* ---- Favorites screen ---- */
function FavoritesScreen({ t, channels, onOpenChannel, onToggleFavorite }) {
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: 700 }}>Favorites</h2>
      <p style={{ margin: "0 0 18px", fontSize: "13px", color: t.textDim }}>{channels.length} saved channel{channels.length !== 1 ? "s" : ""}</p>
      {channels.length === 0
        ? <EmptyState t={t} icon={<IconHeart size={26}/>} title="Nothing saved yet" subtitle="Tap the bookmark on any channel card to save it here." />
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "12px" }}>
            {channels.map((ch) => (
              <ChannelCard key={ch.id} channel={ch} t={t} onClick={() => onOpenChannel(ch)}
                isFavorite={true} onToggleFavorite={() => onToggleFavorite(ch.id)} fullWidth />
            ))}
          </div>}
    </div>
  );
}

/* ---- Settings screen ---- */
function SettingsScreen({
  t, mode, setMode, activeSourceId, onSwitchSource,
  customUrl, customDraft, setCustomDraft, customStatus, onLoadCustomUrl, onClearCustomUrl,
  favoriteCount, channelCount,
}) {
  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <h2 style={{ margin: "0 0 18px", fontSize: "20px", fontWeight: 700 }}>Settings</h2>

      {/* Appearance */}
      <SectionCard t={t} title="Appearance" icon={mode === "dark" ? <IconMoon size={16}/> : <IconSun size={16}/>}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>Theme</div>
            <div style={{ fontSize: "11px", color: t.textDim }}>{mode === "dark" ? "Dark mode" : "Light mode"}</div>
          </div>
          <Toggle on={mode === "dark"} t={t} onToggle={() => setMode((m) => m === "dark" ? "light" : "dark")} />
        </div>
      </SectionCard>

      {/* Built-in sources */}
      <div style={{ marginBottom: "14px" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: t.textDim, letterSpacing: ".06em", fontFamily: "'JetBrains Mono',monospace", marginBottom: "10px" }}>
          CHANNEL SOURCES
        </div>
        <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: "14px", overflow: "hidden" }}>
          {Object.values(SOURCES).map((src, i, arr) => (
            <div key={src.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px",
              borderBottom: i < arr.length - 1 ? `1px solid ${t.border}` : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{src.label}</div>
                <div style={{ fontSize: "11px", color: t.textDim }}>{src.desc}</div>
              </div>
              <Toggle
                on={activeSourceId === src.id && !customUrl}
                t={t}
                onToggle={() => { if (activeSourceId !== src.id || customUrl) onSwitchSource(src.id); }}
              />
            </div>
          ))}
        </div>
        <div style={{ fontSize: "10px", color: t.textDim, marginTop: "6px", paddingLeft: "4px" }}>
          Turn one on to reload channels from that source. Turning one on turns the others off.
        </div>
      </div>

      {/* Custom M3U */}
      <SectionCard t={t} title="Custom playlist" icon={<IconLink size={15}/>} subtitle="Load channels from your own M3U link">
        {customUrl && (
          <div style={{
            display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px",
            padding: "8px 10px", borderRadius: "8px",
            background: t.accentDim, border: `1px solid ${t.accent}`,
          }}>
            <IconCheck size={12} style={{ color: t.accent, flexShrink: 0 }}/>
            <span style={{
              fontSize: "11px", color: t.accent, fontFamily: "'JetBrains Mono',monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
            }}>{customUrl}</span>
          </div>
        )}
        <input
          value={customDraft}
          onChange={(e) => setCustomDraft(e.target.value)}
          placeholder="https://example.com/playlist.m3u8"
          style={{
            width: "100%", background: t.bg, border: `1px solid ${t.border}`,
            borderRadius: "10px", padding: "10px 12px",
            fontSize: "12px", fontFamily: "'JetBrains Mono',monospace",
            color: t.text, outline: "none", marginBottom: "10px",
          }}
        />
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={onLoadCustomUrl} disabled={!customDraft.trim() || customStatus === "loading"}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              padding: "10px", borderRadius: "10px", border: "none",
              background: t.accent, color: t.bg, fontSize: "12px", fontWeight: 700,
              opacity: !customDraft.trim() ? .5 : 1,
            }}>
            <span style={{ display: "flex" }} className={customStatus === "loading" ? "ns-spin" : ""}><IconLink size={13}/></span>
            {customStatus === "loading" ? "Loading…" : "Use this playlist"}
          </button>
          {customUrl && (
            <button onClick={onClearCustomUrl} style={{
              padding: "10px 14px", borderRadius: "10px",
              border: `1px solid ${t.border}`, background: "transparent",
              color: t.textDim, fontSize: "12px", fontWeight: 600,
            }}>Reset</button>
          )}
        </div>
      </SectionCard>

      {/* Stats */}
      <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: "14px", overflow: "hidden" }}>
        <SettingsRow t={t} label="Channels loaded" value={channelCount.toLocaleString()} />
        <SettingsRow t={t} label="Saved channels" value={String(favoriteCount)} />
        <SettingsRow t={t} label="Active source" value={customUrl ? "Custom playlist" : SOURCES[activeSourceId]?.label || "—"} last />
      </div>
    </div>
  );
}

function Toggle({ on, t, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      width: "44px", height: "24px", borderRadius: "14px", flexShrink: 0,
      background: on ? t.accentDim : t.border, border: `1px solid ${on ? t.accent : t.border}`,
      position: "relative", transition: "background .2s,border .2s",
    }}>
      <div style={{
        position: "absolute", top: "2px", left: on ? "22px" : "2px",
        width: "18px", height: "18px", borderRadius: "50%",
        background: on ? t.accent : t.textDim, transition: "left .2s,background .2s",
      }}/>
    </button>
  );
}

function SectionCard({ t, title, icon, subtitle, children }) {
  return (
    <div style={{ background: t.bgCard, border: `1px solid ${t.border}`, borderRadius: "14px", padding: "16px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: subtitle ? "2px" : "14px" }}>
        <span style={{ color: t.accent, display: "flex" }}>{icon}</span>
        <span style={{ fontSize: "13px", fontWeight: 700 }}>{title}</span>
      </div>
      {subtitle && <div style={{ fontSize: "11px", color: t.textDim, marginBottom: "14px" }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function SettingsRow({ t, label, value, last }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 16px", borderBottom: last ? "none" : `1px solid ${t.border}`,
    }}>
      <span style={{ fontSize: "13px" }}>{label}</span>
      <span style={{ fontSize: "12px", color: t.textDim, fontFamily: "'JetBrains Mono',monospace" }}>{value}</span>
    </div>
  );
}

function EmptyState({ t, icon, title, subtitle }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 20px", color: t.textDim }}>
      <div style={{
        width: "56px", height: "56px", borderRadius: "50%",
        background: t.bgCard, border: `1px solid ${t.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: "14px", color: t.accent,
      }}>{icon}</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: t.text, marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "12px", maxWidth: "240px", lineHeight: 1.5 }}>{subtitle}</div>
    </div>
  );
}

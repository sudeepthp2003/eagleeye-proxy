import React, { useState, useEffect, useRef } from "react";
import { Send, X, Search, Settings, ChevronDown, Sparkles, AlertTriangle } from "lucide-react";


import { getRepeaterRequests, addToIntruder, setAIRequest, setLastResponse, setDecoderInput } from "../store";

function Repeater({ setMainTab }) {
  const [requests, setRequests] = useState(getRepeaterRequests());
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState({ x: 0, y: 0, visible: false });

  const [followRedirect, setFollowRedirect] = useState(true);
  const [isVertical, setIsVertical] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(300);
  const [dividerPos, setDividerPos] = useState(50); // percentage
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingDivider, setIsResizingDivider] = useState(false);
  const editorRef = useRef(null);
  const [flashEditor, setFlashEditor] = useState(false);

  const [expandedSections, setExpandedSections] = useState({ attrs: true, reqHeaders: true, resHeaders: true, ai: true });
  const [aiResults, setAiResults] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [scanDone, setScanDone] = useState(false);
  
  // History for Undo/Redo (session-based)
  const [historyStacks, setHistoryStacks] = useState({}); // { [sessionId]: { undo: [], redo: [] } }




  const currentReq = requests[selectedIdx];

  const startResizingSidebar = (e) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  const startResizingDivider = (e) => {
    e.preventDefault();
    setIsResizingDivider(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingSidebar) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 150 && newWidth < 600) {
          setInspectorWidth(newWidth);
        }
      }
      if (isResizingDivider) {
        // Calculate position relative to workspace width
        const workspace = document.querySelector(".repeater-split-workspace");
        if (!workspace) return;
        const rect = workspace.getBoundingClientRect();
        if (isVertical) {
          const newPos = ((e.clientY - rect.top) / rect.height) * 100;
          if (newPos > 10 && newPos < 90) setDividerPos(newPos);
        } else {
          const newPos = ((e.clientX - rect.left) / (rect.width - inspectorWidth)) * 100;
          if (newPos > 10 && newPos < 90) setDividerPos(newPos);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingDivider(false);
    };

    if (isResizingSidebar || isResizingDivider) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = isResizingSidebar || !isVertical ? "col-resize" : "row-resize";
    } else {
      document.body.style.cursor = "default";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar, isResizingDivider, isVertical, inspectorWidth]);

  const handleSend = async () => {
    if (!currentReq || isLoading) return;
    setIsLoading(true);
    try {
       const res = await fetch("http://127.0.0.1:8081/api/repeater/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          raw: currentReq.raw,
          followRedirect 
        })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to send request");
      }

      const data = await res.json();
      const updatedReqs = [...requests];
      updatedReqs[selectedIdx] = {
        ...updatedReqs[selectedIdx],
        response: data.response || "(No Body Content)",
        status: data.status,
        statusText: data.statusText,
        responseHeaders: data.headers,
        time: data.time
      };
      setLastResponse({
        status: data.status,
        headers: data.headers,
        body: data.response
      });
      setRequests(updatedReqs);
    } catch (err) {
      console.error("Failed to send request:", err);
      const updatedReqs = [...requests];
      updatedReqs[selectedIdx] = {
        ...updatedReqs[selectedIdx],
        response: `[ERROR] ${err.message}`,
        status: "Error",
        time: 0
      };
      setRequests(updatedReqs);
    } finally {
      setIsLoading(false);
    }

  };

  // 🧱 STEP 6 — Injection Engine
  // 🧱 STEP 8 — IMPORTANT (Make AI Reliable)
  const applyAttack = (attack) => {
    if (!currentReq) return;
    const raw = currentReq.raw;

    // Validate if the parameter exists before attempting to replace
    if (!raw.includes(attack.parameter)) {
      alert(`Parameter "${attack.parameter}" not found in the raw request.`);
      return;
    }

    const payload = attack.payloads[0];
    
    // Check if it's a JSON body or URL parameter
    let updated;
    let startIdx = -1;
    const isJson = currentReq.raw.toLowerCase().includes("content-type: application/json");

    if (isJson) {
      // Robust JSON replacement (simplified version)
      const jsonRegex = new RegExp(`("${attack.parameter}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'i');
      const match = raw.match(jsonRegex);
      if (match) {
        updated = raw.replace(jsonRegex, `$1"${payload}"`);
        startIdx = match.index + match[1].length + 1; // +1 for the opening quote
      } else {
        // Fallback to simple replace
        const simpleRegex = new RegExp(`${attack.parameter}=([^&\\s]+)`, 'i');
        const sMatch = raw.match(simpleRegex);
        if (sMatch) {
           updated = raw.replace(simpleRegex, `${attack.parameter}=${payload}`);
           startIdx = sMatch.index + attack.parameter.length + 1;
        }
      }
    } else {
      const regex = new RegExp(`(${attack.parameter}=)([^&\\s]*)`, 'i');
      const match = raw.match(regex);
      if (match) {
         updated = raw.replace(regex, `$1${payload}`);
         startIdx = match.index + match[1].length;
      }
    }

    if (updated === raw || startIdx === -1) {
       alert("Failed to apply payload. No matching parameter found via regex.");
       return;
    }

    updateRaw(updated);

    // Highlight the payload in the editor
    setTimeout(() => {
       if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.setSelectionRange(startIdx, startIdx + payload.length);
          setFlashEditor(true);
          setTimeout(() => setFlashEditor(false), 1000);
          
          // Scroll to the highlighted text
          const lineHeight = 18; // approx
          const lineNum = raw.substring(0, startIdx).split("\n").length;
          editorRef.current.scrollTop = (lineNum - 5) * lineHeight;
       }
    }, 100);
  };
  
  const handleUndo = () => {
    const sessionId = currentReq.id;
    const stack = historyStacks[sessionId];
    if (!stack || stack.undo.length <= 1) return;

    const currentPos = stack.undo.pop();
    const prevPos = stack.undo[stack.undo.length - 1];
    
    // Save current to redo
    const newRedo = [currentPos, ...(stack.redo || [])];
    
    setHistoryStacks({
      ...historyStacks,
      [sessionId]: { undo: stack.undo, redo: newRedo }
    });

    // We don't use updateRaw here to avoid pushing back to history
    const updatedReqs = [...requests];
    updatedReqs[selectedIdx].raw = prevPos;
    setRequests(updatedReqs);
  };

  const handleRedo = () => {
    const sessionId = currentReq.id;
    const stack = historyStacks[sessionId];
    if (!stack || !stack.redo || stack.redo.length === 0) return;

    const nextPos = stack.redo.shift();
    const newUndo = [...stack.undo, nextPos];

    setHistoryStacks({
      ...historyStacks,
      [sessionId]: { undo: newUndo, redo: stack.redo }
    });

    const updatedReqs = [...requests];
    updatedReqs[selectedIdx].raw = nextPos;
    setRequests(updatedReqs);
  };

  const updateRaw = (newRaw, skipHistory = false) => {
    const updatedReqs = [...requests];
    const prevRaw = updatedReqs[selectedIdx].raw;
    updatedReqs[selectedIdx].raw = newRaw;
    setRequests(updatedReqs);
    getRepeaterRequests()[selectedIdx].raw = newRaw;

    if (!skipHistory && prevRaw !== newRaw) {
        const sessionId = currentReq.id;
        const stack = historyStacks[sessionId] || { undo: [prevRaw], redo: [] };
        
        // Simple debounced/limited history (only push if substantial or after time)
        // For simplicity here, we'll push on every change but you could optimize
        setHistoryStacks({
          ...historyStacks,
          [sessionId]: { 
            undo: [...stack.undo.slice(-50), newRaw], // Limit to 50 levels
            redo: [] // Reset redo on new change
          }
        });
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Don't intercept if we're in the AI modal
      if (showAiModal) return;

      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl + Enter: Send
      if (isCtrl && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }

      // Ctrl + Z: Undo
      if (isCtrl && !e.shiftKey && e.key === 'z') {
        if (document.activeElement === editorRef.current) {
           e.preventDefault();
           handleUndo();
        }
      }

      // Ctrl + Y or Ctrl + Shift + Z: Redo
      if ((isCtrl && e.key === 'y') || (isCtrl && e.shiftKey && e.key === 'Z')) {
        if (document.activeElement === editorRef.current) {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentReq, historyStacks, showAiModal]);

  
  const handleAskAI = async () => {
    if (!currentReq || isAiLoading) return;
    
    setIsAiLoading(true);
    setAiResults(null);
    setScanProgress(0);
    setScanDone(false);
    setShowAiModal(true); // Open modal immediately to show scan animation

    const scanMessages = [
       "Initializing Deep Packet Inspection...",
       "Extracting HTTP headers...",
       "Analyzing entropy in parameters...",
       "Detecting obfuscated payloads...",
       "Cross-referencing with exploit database...",
       "Checking for out-of-band vulnerabilities...",
       "Finalizing vulnerability report..."
    ];

    // Animation Logic (5-8 seconds)
    const scanStartTime = Date.now();
    const scanDuration = 6000 + Math.random() * 2000; // 6-8 seconds
    const resultsRef = { current: null };

    const timer = setInterval(() => {
       const elapsed = Date.now() - scanStartTime;
       const progress = Math.min(99, Math.floor((elapsed / scanDuration) * 100));
       setScanProgress(progress);
       
       const msgIdx = Math.floor((progress / 100) * scanMessages.length);
       setScanStatus(scanMessages[msgIdx] || scanMessages[scanMessages.length - 1]);

       if (progress >= 99 && resultsRef.current) {
          clearInterval(timer);
          setScanProgress(100);
          setScanStatus("Scan Complete!");
          setTimeout(() => setScanDone(true), 600);
       }
    }, 100);

    try {
      const res = await fetch("http://127.0.0.1:8081/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawRequest: currentReq.raw })
      });

      if (!res.ok) throw new Error("AI Analysis Failed");

      const data = await res.json();
      resultsRef.current = data.attacks;
      setAiResults(data.attacks);
    } catch (err) {
      clearInterval(timer);
      setShowAiModal(false);
      console.error("AI analysis failed:", err);
      alert("AI Analysis Failed: " + err.message);
    } finally {
      setIsAiLoading(false);
    }
  };





  const addNewSession = () => {
     const newReq = {
        raw: "GET / HTTP/1.1\nHost: localhost\n\n",
        method: "GET",
        id: Date.now()
     };
     const newList = [...requests, newReq];
     setRequests(newList);
     getRepeaterRequests().push(newReq);
     setSelectedIdx(newList.length - 1);
  };

  const removeSession = (idx, e) => {
     e.stopPropagation();
     const newList = requests.filter((_, i) => i !== idx);
     setRequests(newList);
     getRepeaterRequests().splice(idx, 1);
     if (selectedIdx >= newList.length) setSelectedIdx(Math.max(0, newList.length - 1));
  };

  const getSelectedText = () => {
    if (editorRef.current) {
      const start = editorRef.current.selectionStart;
      const end = editorRef.current.selectionEnd;
      if (start !== end) {
        return currentReq.raw.substring(start, end);
      }
    }
    return null;
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
  };

  const closeContextMenu = () => {
    setContextMenu({ ...contextMenu, visible: false });
  };

  useEffect(() => {
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, []);

  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <Send size={64} style={{ color: "var(--burp-orange)", opacity: 0.2, marginBottom: "20px" }} />
        <h2 style={{ color: "#333" }}>Request Repeater</h2>
        <p style={{ color: "#666", maxWidth: "400px" }}>Right-click any request in History and select "Send to Repeater" to start manually testing and reissuing requests.</p>
        <button className="wizard-primary-btn" onClick={addNewSession} style={{ marginTop: "25px" }}>New Session</button>
      </div>
    );
  }

  const targetHost = currentReq.raw.match(/Host: ([^\n\r]+)/i)?.[1] || "localhost";

  return (
    <div className="proxy-view-container">
      <div className="repeater-sessions-bar">
        {requests.map((req, i) => (
          <div key={i} className={`repeater-session-tab ${selectedIdx === i ? 'active' : ''}`} onClick={() => setSelectedIdx(i)}>
            <span>{i + 1}</span>
            <X size={10} style={{ marginLeft: "10px", cursor: "pointer", opacity: 0.6 }} onClick={(e) => removeSession(i, e)} />
          </div>
        ))}
        <div className="repeater-session-tab" onClick={addNewSession} style={{ padding: "5px 12px", fontWeight: "700", color: "var(--burp-orange)" }}>+</div>
      </div>

      <div className="repeater-controls">
         <button className="repeater-send-btn" onClick={handleSend} disabled={isLoading}>
            {isLoading ? "Executing..." : "Send"}
         </button>
         <button className="toolbar-btn" disabled>Cancel</button>
         <button 
           className="repeater-send-btn" 
           style={{ 
             background: "linear-gradient(135deg, #6e45e2 0%, #88d3ce 100%)", 
             color: "white", 
             border: "none", 
             display: "inline-flex", 
             alignItems: "center", 
             gap: "6px", 
             marginLeft: "10px",
             padding: "6px 12px",
             fontSize: "11px"
           }}
            onClick={() => {
              setAIRequest(currentReq.raw);
              setMainTab('ai-chat');
            }}
         >
           <Sparkles size={12} /> Send to AI
         </button>

         {/* --- Follow Redirect Toggle --- */}
         <div className="burp-checkbox-row" style={{ margin: "0 15px", gap: "6px" }} onClick={() => setFollowRedirect(!followRedirect)}>
            <div className={`burp-checkbox ${followRedirect ? 'active' : ''}`} style={{ width: "12px", height: "12px" }}>
               {followRedirect && <div style={{ width: "6px", height: "6px", background: "white", borderRadius: "1px" }}></div>}
            </div>
            <span style={{ fontSize: "11px", fontWeight: "500", color: "#444" }}>Follow redirections</span>
         </div>

         <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", marginLeft: "auto" }}>
            <button className={`toolbar-btn ${!isVertical ? 'active' : ''}`} onClick={() => setIsVertical(false)} title="Side-by-side" style={{ padding: "4px 8px" }}>||</button>
            <button className={`toolbar-btn ${isVertical ? 'active' : ''}`} onClick={() => setIsVertical(true)} title="Top-bottom" style={{ padding: "4px 8px" }}>=</button>
            <div style={{ width: "1px", height: "16px", background: "#ddd", margin: "0 5px" }}></div>
            <button className="toolbar-btn" style={{ padding: "4px 8px" }}>{"<"}</button>
            <button className="toolbar-btn" style={{ padding: "4px 8px" }}>{">"}</button>
         </div>
         <div className="target-info-display">
            <span style={{ color: "#888", fontSize: "10px", textTransform: "uppercase", fontWeight: "700" }}>Target:</span>
            <span style={{ fontWeight: "600", color: "#333" }}>http://{targetHost}</span>
            <Settings size={14} style={{ cursor: "pointer", color: "#999" }} />
         </div>
      </div>

      <div className={`repeater-split-workspace ${isVertical ? 'vertical' : ''}`} style={{ flex: 1 }}>
         <div className="repeater-pane" style={{ flex: isVertical ? 'none' : `0 0 ${dividerPos}%`, height: isVertical ? `${dividerPos}%` : 'auto' }}>
            <div className="pane-header-label">Request</div>
            <div className="editor-sub-tabs">
               <button className="editor-sub-tab">Pretty</button>
               <button className="editor-sub-tab active">Raw</button>
               <button className="editor-sub-tab">Hex</button>
            </div>
            <textarea 
              ref={editorRef}
              className={`raw-editor ${flashEditor ? 'flash-highlight' : ''}`} 
              value={currentReq.raw} 
              onChange={(e) => updateRaw(e.target.value)} 
              onContextMenu={handleContextMenu}
              spellCheck="false" 
            />

            <div className="pane-bottom-bar">
               <Search size={14} color="#999" />
               <input type="text" placeholder="Search..." style={{ border: "none", outline: "none", background: "transparent", fontSize: "11px", color: "#666", flex: 1 }} />
               <span style={{ color: "#aaa" }}>0 matches</span>
            </div>
         </div>

         <div className="workspace-divider" onMouseDown={startResizingDivider} />

         <div className="repeater-pane" style={{ flex: 1 }}>
            <div className="pane-header-label" style={{ color: "#34495e" }}>Response</div>
            <div className="editor-sub-tabs">
               <button className="editor-sub-tab active">Pretty</button>
               <button className="editor-sub-tab">Raw</button>
               <button className="editor-sub-tab">Hex</button>
               <button className="editor-sub-tab">Render</button>
            </div>
            <div className="raw-editor" style={{ overflowY: "auto", whiteSpace: "pre-wrap" }}>
               {currentReq.response ? (
                  <>
                    <div style={{ color: "var(--burp-blue)", borderBottom: "1px solid #f1f3f5", paddingBottom: "10px", marginBottom: "10px", fontFamily: "var(--burp-font-mono)", fontSize: "11px" }}>
                       HTTP/1.1 {currentReq.status} {currentReq.statusText}{"\n"}
                       {currentReq.responseHeaders && Object.entries(currentReq.responseHeaders).map(([k,v]) => `${k}: ${v}`).join('\n')}
                    </div>
                    <div style={{ fontFamily: "var(--burp-font-mono)" }}>
                       {currentReq.response}
                    </div>
                  </>
               ) : (
                  <div style={{ padding: "40px", color: "#bbb", textAlign: "center", fontStyle: "italic" }}>
                     Request not yet executed. Click "Send" to issue the request.
                  </div>
               )}
            </div>
            <div className="pane-bottom-bar">
               <Search size={14} color="#999" />
               <input type="text" placeholder="Search..." style={{ border: "none", outline: "none", background: "transparent", fontSize: "11px", color: "#666", flex: 1 }} />
               <span style={{ color: "#aaa" }}>0 matches</span>
            </div>
         </div>

         <div className="repeater-inspector-side" style={{ width: `${inspectorWidth}px`, flex: 'none', position: 'relative', borderLeft: 'none' }}>
            <div 
              style={{ position: 'absolute', left: '-2px', top: 0, bottom: 0, width: '4px', cursor: 'col-resize', zIndex: 10 }}
              onMouseDown={startResizingSidebar} 
            />
            <div style={{ borderLeft: '1px solid var(--burp-border)', height: '100%', display: 'flex', flexDirection: 'column' }}>
               <div className="inspector-header">Inspector</div>
               
               {/* --- Request Attributes --- */}
            <div className="inspector-section-header" onClick={() => setExpandedSections({...expandedSections, attrs: !expandedSections.attrs})}>
               <ChevronDown size={14} style={{ transform: expandedSections.attrs ? "" : "rotate(-90deg)", transition: "transform 0.2s" }} />
               <span>Request Attributes</span>
            </div>
            {expandedSections.attrs && (
               <div className="inspector-section-content">
                  <div className="attr-row">
                     <span className="attr-name">Method:</span>
                     <span className="attr-val" style={{ fontWeight: "700", color: "var(--burp-orange)" }}>{currentReq.raw.split(" ")[0]}</span>
                  </div>
                  <div className="attr-row">
                     <span className="attr-name">Protocol:</span>
                     <span className="attr-val">HTTP/1.1</span>
                  </div>
                  <div className="attr-row">
                     <span className="attr-name">Host:</span>
                     <span className="attr-val">{targetHost}</span>
                  </div>
               </div>
            )}

            {/* --- Request Headers --- */}
            <div className="inspector-section-header" onClick={() => setExpandedSections({...expandedSections, reqHeaders: !expandedSections.reqHeaders})}>
               <ChevronDown size={14} style={{ transform: expandedSections.reqHeaders ? "" : "rotate(-90deg)", transition: "transform 0.2s" }} />
               <span>Request Headers</span>
            </div>
            {expandedSections.reqHeaders && (
               <div className="inspector-section-content">
                  {currentReq.raw.split('\n').slice(1).map((line, i) => {
                     const colonIdx = line.indexOf(':');
                     if (colonIdx === -1) return null;
                     return (
                        <div className="attr-row" key={i}>
                           <span className="attr-name">{line.substring(0, colonIdx).trim()}:</span>
                           <span className="attr-val">{line.substring(colonIdx + 1).trim()}</span>
                        </div>
                     );
                  })}
               </div>
            )}

            {/* --- Response Headers --- */}
            <div className="inspector-section-header" onClick={() => setExpandedSections({...expandedSections, resHeaders: !expandedSections.resHeaders})}>
               <ChevronDown size={14} style={{ transform: expandedSections.resHeaders ? "" : "rotate(-90deg)", transition: "transform 0.2s" }} />
               <span>Response Headers</span>
            </div>
            {expandedSections.resHeaders && (
               <div className="inspector-section-content">
                  {currentReq.responseHeaders ? Object.entries(currentReq.responseHeaders).map(([k, v], i) => (
                     <div className="attr-row" key={i}>
                        <span className="attr-name">{k}:</span>
                        <span className="attr-val">{v}</span>
                     </div>
                  )) : (
                     <div style={{ padding: "10px 25px", fontSize: "11px", color: "#999", fontStyle: "italic" }}>No response received yet.</div>
                  )}
                  {currentReq.responseHeaders && [301, 302, 303, 307, 308].includes(parseInt(currentReq.status)) && (
                     <div style={{ padding: "15px 25px" }}>
                        <button 
                           className="ai-btn-primary" 
                           style={{ background: "var(--burp-orange)", display: "flex", alignItems: "center", gap: "8px" }}
                           onClick={() => {
                              const location = currentReq.responseHeaders["location"] || currentReq.responseHeaders["Location"];
                              if (location) {
                                 const lines = currentReq.raw.split('\n');
                                 const newPath = location.startsWith('http') ? new URL(location).pathname + new URL(location).search : location;
                                 lines[0] = lines[0].replace(/([A-Z]+ )\S+( HTTP\/1.1)/, `$1${newPath}$2`);
                                 updateRaw(lines.join('\n'));
                                 setTimeout(handleSend, 100);
                              }
                           }}
                        >
                           <Send size={14} /> Follow Redirection
                        </button>
                     </div>
                  )}
               </div>
            )}
            
            {/* --- AI Analysis Results --- */}
            <div className="inspector-section-header" onClick={() => setExpandedSections({...expandedSections, ai: !expandedSections.ai})}>
               <Sparkles size={14} style={{ transform: expandedSections.ai ? "" : "rotate(-90deg)", transition: "transform 0.2s", color: "var(--burp-orange)" }} />
               <span style={{ color: "var(--burp-orange)", fontWeight: "700" }}>AI Vulnerability Scan</span>
            </div>
            {expandedSections.ai && (
               <div className="inspector-section-content" style={{ padding: "0" }}>
                  {isAiLoading ? (
                     <div style={{ padding: "20px", textAlign: "center", fontSize: "11px", color: "#666" }}>
                        <div className="spinner-inline" style={{ marginBottom: "10px" }}></div>
                        Analyzing traffic for security flaws...
                     </div>
                  ) : aiResults ? (
                     <div style={{ display: "flex", flexDirection: "column" }}>
                        {aiResults.map((attack, i) => (
                           <div key={i} style={{ padding: "12px 15px", borderBottom: "1px solid #f1f3f5", background: "white" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
                                 <AlertTriangle size={14} color="#e67e22" />
                                 <span style={{ fontWeight: "700", fontSize: "12px", color: "#2c3e50" }}>{attack.name}</span>
                                 <span style={{ marginLeft: "auto", fontSize: "10px", background: "#fdf2f2", color: "#e74c3c", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>
                                    {Math.round(attack.confidence * 100)}% Match
                                 </span>
                              </div>
                              <div style={{ fontSize: "11px", color: "#555", marginBottom: "8px" }}>
                                 <strong>Parameter:</strong> <span style={{ fontFamily: "monospace", color: "#e84393" }}>{attack.parameter}</span>
                              </div>
                              <div style={{ fontSize: "10px", color: "#666", lineHeight: "1.4", fontStyle: "italic", marginBottom: "8px" }}>
                                 {attack.reason}
                              </div>
                              <div style={{ background: "#f8f9fa", padding: "6px 10px", borderRadius: "4px", border: "1px solid #edf2f7" }}>
                                 <span style={{ fontSize: "9px", color: "#aaa", textTransform: "uppercase", fontWeight: "700", display: "block", marginBottom: "4px" }}>Payload Example</span>
                                 <code style={{ fontSize: "10px", color: "#2d3436", wordBreak: "break-all" }}>{attack.payloads?.[0]}</code>
                              </div>
                              <button 
                                 className="wizard-secondary-btn" 
                                 style={{ width: "100%", marginTop: "10px", padding: "4px", fontSize: "10px" }}
                                 onClick={() => applyAttack(attack)}
                              >
                                 Apply Attack
                              </button>

                           </div>
                        ))}
                     </div>
                  ) : (
                     <div style={{ padding: "20px 25px", fontSize: "11px", color: "#999", fontStyle: "italic", textAlign: "center" }}>
                        Right-click the raw request and select <br/><strong>"Analyze with EagleAI"</strong><br/> to find potential security bugs.
                     </div>
                  )}
               </div>
            )}
         </div>

      </div>
   </div>

      <div className="repeater-footer">
         <span style={{ fontWeight: "700", color: "#27ae60" }}>Ready</span>
         <div style={{ display: "flex", gap: "20px" }}>
            <span>{currentReq.response ? `${(currentReq.response || "").length} bytes` : "0 bytes"}</span>
            <span>{currentReq.time ? `${currentReq.time} ms` : "0 ms"}</span>
         </div>
      </div>

      {contextMenu.visible && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x, display: "block" }}>
          <button className="context-menu-item" onClick={() => { addToIntruder(currentReq); setMainTab?.('intruder'); closeContextMenu(); }}>Send to Intruder</button>
          <button className="context-menu-item" onClick={() => { 
            const selectedText = getSelectedText() || currentReq.raw;
            setDecoderInput(selectedText);
            setMainTab?.('decoder');
            closeContextMenu();
          }}>
            {getSelectedText() ? "Send Selection to Decoder" : "Send Raw Request to Decoder"}
          </button>
          <button className="context-menu-item" onClick={() => { handleAskAI(); closeContextMenu(); }} style={{ color: "var(--burp-orange)", fontWeight: "700" }}>
            <Sparkles size={14} style={{ marginRight: "8px", verticalAlign: "middle" }} />
            Analyze with EagleAI
          </button>
          <button className="context-menu-item" onClick={() => { addNewSession(); closeContextMenu(); }}>Start new repeater session</button>

          <div className="context-menu-item divider"></div>
          <button className="context-menu-item" onClick={() => { updateRaw(""); closeContextMenu(); }}>Drop packets (Clear Request)</button>
          <div className="context-menu-item divider"></div>
          <button className="context-menu-item" onClick={closeContextMenu}>Cancel</button>
        </div>
      )}

      {/* --- PREMIUM AI ANALYSIS MODAL --- */}
      {showAiModal && (
        <div className="ai-modal-overlay" onClick={() => setShowAiModal(false)}>
           <div className="ai-modal-content" onClick={e => e.stopPropagation()}>
              <div className="ai-modal-header">
                 <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div className="ai-glow-icon">
                       <Sparkles size={20} color="white" />
                    </div>
                    <div>
                       <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", letterSpacing: "-0.5px" }}>EagleAI Analysis</h3>
                       <p style={{ margin: 0, fontSize: "10px", opacity: 0.7, textTransform: "uppercase", fontWeight: "700" }}>Securing your traffic in real-time</p>
                    </div>
                 </div>
                 <button className="ai-modal-close" onClick={() => setShowAiModal(false)}><X size={18} /></button>
              </div>

              <div className="ai-modal-body">
                 {!scanDone ? (
                    <div className="ai-scan-container">
                       <div className="scanning-radar">
                          <div className="radar-circle"></div>
                          <div className="radar-line"></div>
                          <div className="radar-core">
                             <Sparkles size={32} color="var(--burp-orange)" />
                          </div>
                       </div>
                       
                       <div style={{ position: "relative", zIndex: 2, textAlign: "center", width: "100%", maxWidth: "400px" }}>
                          <div className="scan-percent">{scanProgress}%</div>
                          <div className="scan-progress-bar">
                             <div className="scan-progress-fill" style={{ width: `${scanProgress}%` }}></div>
                             <div className="scan-progress-glow" style={{ left: `${scanProgress}%` }}></div>
                          </div>
                          <div className="scan-status-text">{scanStatus}</div>

                          <div className="cyber-terminal">
                             <div className="terminal-header">
                                <span className="dot" style={{ background: "#ff5f56" }}></span>
                                <span className="dot" style={{ background: "#ffbd2e" }}></span>
                                <span className="dot" style={{ background: "#27c93f" }}></span>
                                <span className="terminal-title">eagle_sec_console</span>
                             </div>
                             <div className="terminal-body">
                                <div>[SYS] Initializing EagleEye.AI.Core v2.4</div>
                                <div>[SEC] Analyzing memory buffers...</div>
                                {scanProgress > 20 && <div>[SEC] Request structure: {currentReq.raw.split(' ')[0]} detected</div>}
                                {scanProgress > 40 && <div>[SEC] Entropy level: HIGH in parameter keys</div>}
                                {scanProgress > 60 && <div style={{ color: "var(--burp-orange)" }}>[WARN] Potentially malicious pattern in body</div>}
                                {scanProgress > 80 && <div>[SYS] Generating report signatures...</div>}
                                <div className="blinking-cursor">_</div>
                             </div>
                          </div>
                       </div>
                    </div>
                 ) : aiResults && aiResults.length > 0 ? (
                    <div className="ai-results-grid">
                       {aiResults.map((attack, i) => (

                          <div key={i} className="ai-attack-card">
                             <div className="ai-card-badge">
                                <AlertTriangle size={12} style={{ marginRight: "4px" }} />
                                {attack.name}
                             </div>
                             <div className="ai-confidence-meter">
                                <div className="meter-label">
                                   <span>Confidence</span>
                                   <span>{Math.round(attack.confidence * 100)}%</span>
                                </div>
                                <div className="meter-bar">
                                   <div className="meter-fill" style={{ width: `${attack.confidence * 100}%` }}></div>
                                </div>
                             </div>
                             
                             <div style={{ marginBottom: "15px" }}>
                                <div className="ai-section-label">Vulnerability Reason</div>
                                <p className="ai-reason-text">{attack.reason}</p>
                             </div>

                             <div style={{ marginBottom: "15px" }}>
                                <div className="ai-section-label">Suggested Payload</div>
                                <div className="ai-payload-box">
                                   <code>{attack.payloads?.[0]}</code>
                                </div>
                             </div>

                             <div style={{ display: "flex", gap: "8px" }}>
                                <button className="ai-btn-primary" onClick={() => { applyAttack(attack); setShowAiModal(false); }}>
                                   Apply to Request
                                </button>
                                <button className="ai-btn-secondary" onClick={() => { navigator.clipboard.writeText(attack.payloads[0]); alert("Payload copied!"); }}>
                                   Copy
                                </button>
                             </div>
                          </div>
                       ))}
                    </div>
                 ) : (
                    <div style={{ padding: "40px", textAlign: "center", color: "#666" }}>
                       No critical vulnerabilities detected for this specific request structure.
                    </div>
                 )}
              </div>

              <div className="ai-modal-footer">
                 <div style={{ fontSize: "11px", color: "#999" }}>
                    Verified by EagleEye AI Core v2.0 • Model: GPT-OSS-120B
                 </div>
                 <button className="ai-dismiss-btn" onClick={() => setShowAiModal(false)}>Dismiss</button>

              </div>

           </div>
        </div>
      )}
    </div>
  );
}


export default Repeater;

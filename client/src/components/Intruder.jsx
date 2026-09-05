import React, { useState, useEffect } from "react";
import { Zap, Play, Trash2, Edit3, Settings as SettingsIcon, List, Search, ChevronDown, Plus, Minus, Target } from "lucide-react";
import { getIntruderBase } from "../store";

export default function Intruder() {
  const [activeSubTab, setActiveSubTab] = useState("positions"); 
  const [baseRequest, setBaseRequest] = useState("");
  const [attackType, setAttackType] = useState("sniper");
  const [currentPayloadSet, setCurrentPayloadSet] = useState(0);
  const [payloadSets, setPayloadSets] = useState(["admin\nroot\nguest", "123456\npassword\nadmin123"]);
  
  const [attackSettings, setAttackSettings] = useState({
    threads: 5,
    delay: 0,
    followRedirects: true
  });
  
  const [results, setResults] = useState([]);
  const [isAttacking, setIsAttacking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const pauseRef = React.useRef(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [statusFilter, setStatusFilter] = useState(null);

  useEffect(() => {
    const base = getIntruderBase();
    if (base && !baseRequest) {
      setBaseRequest(base.raw);
    }
  }, []);

  const clearPositions = () => {
    setBaseRequest(baseRequest.replace(/§/g, ""));
  };

  const autoDetect = () => {
    let newRaw = baseRequest.replace(/§/g, "");
    newRaw = newRaw.replace(/(=)([^&\n\s]+)/g, "$1§$2§");
    setBaseRequest(newRaw);
  };

  const addMarker = () => {
    const textarea = document.getElementById("intruder-editor");
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const marked = text.substring(0, start) + "§" + text.substring(start, end) + "§" + text.substring(end);
    setBaseRequest(marked);
  };

  const [selectedResultId, setSelectedResultId] = useState(null);
  const selectedResult = results.find(r => r.id === selectedResultId);
  const [grepMatch, setGrepMatch] = useState("");
  const stopRef = React.useRef(false);

  const runAttack = async () => {
    setIsAttacking(true);
    setIsPaused(false);
    pauseRef.current = false;
    setActiveSubTab("results");
    setResults([]);
    stopRef.current = false;
    
    const parts = baseRequest.split("§");
    const numMarkers = Math.floor(parts.length / 2);
    const sets = payloadSets.map(s => s.split("\n").filter(p => p.trim()));

    // Generate Payload Combinations based on Attack Type
    let attackQueue = [];
    
    if (attackType === "sniper") {
        // One list, one marker at a time. Total = listLen * numMarkers
        const list = sets[0] || [];
        for (let m = 0; m < numMarkers; m++) {
            for (let p of list) {
                const payloads = Array(numMarkers).fill(null);
                payloads[m] = p;
                attackQueue.push(payloads);
            }
        }
    } else if (attackType === "battering ram") {
        // One list, all markers at once. Total = listLen
        const list = sets[0] || [];
        for (let p of list) {
            attackQueue.push(Array(numMarkers).fill(p));
        }
    } else if (attackType === "pitchfork") {
        // Parallel lists. Total = min(listLens)
        const minLen = Math.min(...sets.slice(0, numMarkers).map(s => s.length));
        for (let i = 0; i < minLen; i++) {
            attackQueue.push(sets.slice(0, numMarkers).map(s => s[i]));
        }
    } else if (attackType === "cluster bomb") {
        // Cartesian product. Total = list1 * list2 * ...
        const cartesian = (arrays) => {
            return arrays.reduce((a, b) => a.flatMap(d => b.map(e => [d, e].flat())));
        };
        const activeSets = sets.slice(0, numMarkers);
        if (activeSets.length > 0) {
            attackQueue = cartesian(activeSets);
            if (!Array.isArray(attackQueue[0])) attackQueue = attackQueue.map(v => [v]);
        }
    }

    setProgress({ completed: 0, total: attackQueue.length });

    const concurrency = parseInt(attackSettings.threads) || 1;
    const delay = parseInt(attackSettings.delay) || 0;

    for (let i = 0; i < attackQueue.length; i += concurrency) {
        if (stopRef.current) break;
        while(pauseRef.current) await new Promise(r => setTimeout(r, 200));

        const batch = attackQueue.slice(i, i + concurrency);
        const batchPromises = batch.map(async (currentPayloads, batchIdx) => {
            let finalRequest = "";
            let payloadMarkerIdx = 0;
            for (let j = 0; j < parts.length; j++) {
                finalRequest += parts[j];
                if (j % 2 === 0 && j < parts.length - 1) {
                    // Replace with the payload for THIS marker (if using Sniper, others remain original)
                    const p = currentPayloads[payloadMarkerIdx];
                    finalRequest += (p !== null ? p : parts[j+1]); 
                    j++; // Skip the original text that was between § markers
                    payloadMarkerIdx++;
                }
            }

            const startTime = Date.now();
            try {
                const res = await fetch("http://127.0.0.1:8081/api/repeater/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ raw: finalRequest, followRedirect: attackSettings.followRedirects })
                });
                const data = await res.json();
                const wordCount = (data.response || "").split(/\s+/).filter(w => w.length > 0).length;
                const isMatch = grepMatch && data.response?.toLowerCase().includes(grepMatch.toLowerCase());

                return {
                    id: Date.now() + Math.random(),
                    payload: currentPayloads.filter(p => p !== null).join(" / "),
                    status: data.status,
                    length: (data.response || "").length,
                    words: wordCount,
                    time: data.time || (Date.now() - startTime),
                    rawRequest: finalRequest,
                    response: data.response,
                    headers: data.headers,
                    statusText: data.statusText,
                    isMatch
                };
            } catch (err) {
                return { id: Date.now() + Math.random(), payload: "Error", status: "Error", length: 0, words: 0, time: 0, isMatch: false };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        setResults(prev => [...prev, ...batchResults]);
        setProgress(p => ({ ...p, completed: i + batch.length }));

        if (delay > 0) await new Promise(r => setTimeout(r, delay));
    }
    setIsAttacking(false);
  };

  const stopAttack = () => {
    stopRef.current = true;
    setIsAttacking(false);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    pauseRef.current = !isPaused;
  };

  if (!getIntruderBase() && !isAttacking) {
    return (
      <div className="empty-state">
        <Zap size={64} style={{ color: "var(--burp-orange)", opacity: 0.2, marginBottom: "20px" }} />
        <h2 style={{ color: "#333" }}>Intruder</h2>
        <p style={{ color: "#666", maxWidth: "450px" }}>Select a request from HTTP History and send it to Intruder to perform automated attacks and fuzzing.</p>
      </div>
    );
  }

  return (
    <div className="proxy-view-container">
      {/* Intruder Sub Tabs */}
      <div className="sub-nav">
        <button className={`sub-tab-btn ${activeSubTab === 'positions' ? 'active' : ''}`} onClick={() => setActiveSubTab('positions')}>Positions</button>
        <button className={`sub-tab-btn ${activeSubTab === 'payloads' ? 'active' : ''}`} onClick={() => setActiveSubTab('payloads')}>Payloads</button>
        <button className={`sub-tab-btn ${activeSubTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveSubTab('settings')}>Settings</button>
        <button className={`sub-tab-btn ${activeSubTab === 'results' ? 'active' : ''}`} onClick={() => setActiveSubTab('results')}>Results</button>
        
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
           {isAttacking && (
              <>
                 <div style={{ fontSize: "10px", color: "#666", marginRight: "10px" }}>
                    {progress.completed} / {progress.total} requests
                 </div>
                 <button className="repeater-send-btn" style={{ padding: "4px 15px", background: "#3498db" }} onClick={togglePause}>
                    {isPaused ? "Resume" : "Pause"}
                 </button>
                 <button className="repeater-send-btn" style={{ padding: "4px 15px", background: "#e74c3c" }} onClick={stopAttack}>Stop</button>
              </>
           )}
           <button className="repeater-send-btn" style={{ padding: "4px 20px" }} onClick={runAttack} disabled={isAttacking}>
              {isAttacking ? "Attacking..." : "Start Attack"}
           </button>
        </div>
      </div>

      <div className="tab-content" style={{ background: "white" }}>
        {activeSubTab === "positions" && (
           <div className="repeater-split-workspace">
              <div className="repeater-pane" style={{ flex: 3 }}>
                <div className="pane-header-label">Attack Configuration</div>
                <textarea 
                  id="intruder-editor"
                  className="raw-editor" 
                  value={baseRequest} 
                  onChange={(e) => setBaseRequest(e.target.value)} 
                  spellCheck="false" 
                />
              </div>
              <div className="repeater-inspector-side" style={{ width: "220px", padding: "15px" }}>
                 <div className="inspector-header">Payload Positions</div>
                 <p style={{ fontSize: "11px", color: "#666", marginBottom: "15px" }}>The payload markers (§) define the points where payloads will be inserted.</p>
                 <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button className="toolbar-btn" onClick={addMarker} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <Plus size={14} /> Add §
                    </button>
                    <button className="toolbar-btn" onClick={clearPositions} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <Trash2 size={14} /> Clear §
                    </button>
                    <button className="toolbar-btn" onClick={autoDetect} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                       <Target size={14} /> Auto-detect
                    </button>
                 </div>

                 <div className="inspector-header" style={{ marginTop: "30px" }}>Attack Type</div>
                 <select className="toolbar-btn" style={{ width: "100%", marginTop: "10px" }} value={attackType} onChange={(e) => setAttackType(e.target.value.toLowerCase())}>
                    <option value="sniper">Sniper</option>
                    <option value="battering ram">Battering Ram</option>
                    <option value="pitchfork">Pitchfork</option>
                    <option value="cluster bomb">Cluster Bomb</option>
                 </select>
              </div>
           </div>
        )}

        {activeSubTab === "payloads" && (
           <div className="repeater-split-workspace" style={{ flex: 1 }}>
              {/* Left Side: Editors */}
              <div className="repeater-pane" style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                 {/* --- Payload Sets --- */}
                 <div className="burp-groupbox">
                    <div className="burp-groupbox-label">Payload Sets</div>
                    <div style={{ display: "flex", gap: "30px", alignItems: "center" }}>
                       <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "11px", color: "#666" }}>Payload set:</span>
                          <select className="toolbar-btn" style={{ minWidth: "50px" }} value={currentPayloadSet} onChange={(e) => setCurrentPayloadSet(parseInt(e.target.value))}>
                             <option value={0}>1</option>
                             <option value={1}>2</option>
                          </select>
                       </div>
                       <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "11px", color: "#666" }}>Payload type:</span>
                          <select className="toolbar-btn" style={{ minWidth: "150px" }}>
                             <option>Simple list</option>
                             <option disabled>Runtime file</option>
                             <option disabled>Custom iterator</option>
                             <option disabled>Brute forcer</option>
                          </select>
                       </div>
                    </div>
                 </div>

                 {/* --- Payload Options --- */}
                 <div className="burp-groupbox" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "300px" }}>
                    <div className="burp-groupbox-label">Payload Options [Simple list]</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                       <label style={{ fontSize: "11px", fontWeight: "700", color: "#444" }}>Enter a new payload:</label>
                       <span style={{ fontSize: "10px", color: "#888" }}>Payload count: {(payloadSets[currentPayloadSet] || "").split('\n').filter(p => p.trim()).length}</span>
                    </div>
                    <textarea 
                       placeholder="One payload per line..."
                       style={{ 
                         flex: 1, 
                         width: "100%", 
                         border: "1px solid var(--burp-border)", 
                         borderRadius: "3px", 
                         padding: "12px", 
                         fontFamily: "var(--burp-font-mono)", 
                         fontSize: "12px",
                         outline: "none",
                         lineHeight: "1.6",
                         boxShadow: "inset 0 1px 3px rgba(0,0,0,0.05)"
                       }}
                       value={payloadSets[currentPayloadSet] || ""}
                       onChange={(e) => {
                          const newSets = [...payloadSets];
                          newSets[currentPayloadSet] = e.target.value;
                          setPayloadSets(newSets);
                       }}
                    />
                 </div>

                 {/* --- Payload Encoding --- */}
                 <div className="burp-groupbox">
                    <div className="burp-groupbox-label">Payload Encoding</div>
                    <div className="burp-checkbox-row" style={{ alignItems: "center" }}>
                       <div className="burp-checkbox active">✓</div>
                       <span className="burp-checkbox-label">URL-encode these characters:</span>
                       <input type="text" className="toolbar-btn" style={{ marginLeft: "10px", width: "200px" }} defaultValue="& = # % ?" />
                    </div>
                 </div>
              </div>

              {/* Right Side: Sidebar */}
              <div className="repeater-inspector-side" style={{ width: "220px" }}>
                 <div className="inspector-header">Payload Control</div>
                 <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button className="toolbar-btn" style={{ justifyContent: "center" }} onClick={() => {}}>Add</button>
                    <button className="toolbar-btn" style={{ justifyContent: "center" }} onClick={() => {}}>Load ...</button>
                    <button className="toolbar-btn" style={{ justifyContent: "center", color: "#e74c3c" }} onClick={() => {
                       const newSets = [...payloadSets];
                       newSets[currentPayloadSet] = "";
                       setPayloadSets(newSets);
                    }}>
                       <Trash2 size={14} style={{ marginRight: "8px" }} /> Clear
                    </button>
                 </div>

                 <div className="inspector-header" style={{ marginTop: "10px" }}>Quick Presets</div>
                 <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <button className="toolbar-btn" onClick={() => { const s = [...payloadSets]; s[currentPayloadSet] = "admin\nroot\nuser\nguest\ntest"; setPayloadSets(s); }}>Usernames</button>
                    <button className="toolbar-btn" onClick={() => { const s = [...payloadSets]; s[currentPayloadSet] = "password\n123456\nadmin123\nqwerty\nletmein"; setPayloadSets(s); }}>Passwords</button>
                    <button className="toolbar-btn" onClick={() => { const s = [...payloadSets]; s[currentPayloadSet] = "' OR 1=1 --\n\" OR 1=1 --\nadmin' --\nadmin' #"; setPayloadSets(s); }}>SQL Injection</button>
                 </div>
              </div>
           </div>
        )}

        {activeSubTab === "settings" && (
           <div className="settings-main">
              <div className="burp-groupbox">
                 <div className="burp-groupbox-label">Grep - Match</div>
                 <div className="burp-checkbox-row">
                    <span className="burp-checkbox-label" style={{ width: "120px" }}>Match String:</span>
                    <input type="text" className="toolbar-btn" style={{ width: "200px" }} value={grepMatch} onChange={(e) => setGrepMatch(e.target.value)} placeholder="e.g. Welcome, Login failed" />
                 </div>
              </div>

              <div className="burp-groupbox">
                 <div className="burp-groupbox-label">Request Engine</div>
                 <div className="burp-checkbox-row">
                    <span className="burp-checkbox-label" style={{ width: "120px" }}>Number of threads:</span>
                    <input type="number" className="toolbar-btn" style={{ width: "60px" }} value={attackSettings.threads} onChange={(e) => setAttackSettings({...attackSettings, threads: e.target.value})} />
                 </div>
                 <div className="burp-checkbox-row">
                    <span className="burp-checkbox-label" style={{ width: "120px" }}>Pause between:</span>
                    <input type="number" className="toolbar-btn" style={{ width: "60px" }} value={attackSettings.delay} onChange={(e) => setAttackSettings({...attackSettings, delay: e.target.value})} />
                    <span className="burp-checkbox-desc">ms</span>
                 </div>
                 <div className="burp-checkbox-row" onClick={() => setAttackSettings({...attackSettings, followRedirects: !attackSettings.followRedirects})}>
                    <div className={`burp-checkbox ${attackSettings.followRedirects ? 'active' : ''}`}>{attackSettings.followRedirects ? "✓" : ""}</div>
                    <div>
                       <div className="burp-checkbox-label">Follow redirections</div>
                       <div className="burp-checkbox-desc">Requests that meet redirection criteria will be followed automatically.</div>
                    </div>
                 </div>
              </div>
           </div>
        )}

        {activeSubTab === "results" && (
           <div className="history-view-layout">
              <div className="toolbar" style={{ background: "#f8f9fa", borderBottom: "1px solid var(--burp-border)", padding: "5px 15px", gap: "10px" }}>
                 <span style={{ fontSize: "11px", fontWeight: "700", color: "#666" }}>Filter Results:</span>
                 <button className={`toolbar-btn ${!statusFilter ? 'active' : ''}`} onClick={() => setStatusFilter(null)}>All</button>
                 <button className={`toolbar-btn ${statusFilter === '2xx' ? 'active' : ''}`} onClick={() => setStatusFilter('2xx')}>2xx (Success)</button>
                 <button className={`toolbar-btn ${statusFilter === '3xx' ? 'active' : ''}`} onClick={() => setStatusFilter('3xx')}>3xx (Redir)</button>
                 <button className={`toolbar-btn ${statusFilter === 'err' ? 'active' : ''}`} onClick={() => setStatusFilter('err')}>Errors</button>
                 <button className={`toolbar-btn ${statusFilter === 'match' ? 'active' : ''}`} onClick={() => setStatusFilter('match')}>Matched</button>
              </div>

              <div className="log-table-container" style={{ height: selectedResult ? "45%" : "calc(100% - 35px)", borderBottom: selectedResult ? "2px solid var(--burp-border)" : "none" }}>
                 <table>
                    <thead>
                       <tr>
                          <th style={{ width: "50px" }}>#</th>
                          <th>Payload(s)</th>
                          <th style={{ width: "80px" }}>Status</th>
                          <th style={{ width: "100px" }}>Length</th>
                          <th style={{ width: "100px" }}>Words</th>
                          <th style={{ width: "100px" }}>Time (ms)</th>
                          {(statusFilter === 'match' || grepMatch) && <th style={{ width: "100px" }}>Match</th>}
                       </tr>
                    </thead>
                    <tbody>
                       {results
                        .filter(res => {
                           if (!statusFilter) return true;
                           if (statusFilter === '2xx') return res.status >= 200 && res.status < 300;
                           if (statusFilter === '3xx') return res.status >= 300 && res.status < 400;
                           if (statusFilter === 'err') return res.status >= 400 || res.status === "Error";
                           if (statusFilter === 'match') return res.isMatch;
                           return true;
                        })
                        .map((res, i) => (
                          <tr key={res.id} onClick={() => setSelectedResultId(res.id)} className={`${selectedResultId === res.id ? 'row-selected' : ''} ${res.isMatch ? 'match-highlight' : ''}`} style={{ cursor: "pointer" }}>
                             <td>{i + 1}</td>
                             <td style={{ fontFamily: "var(--burp-font-mono)", fontWeight: "600", color: "var(--burp-orange)" }}>{res.payload}</td>
                             <td>{res.status}</td>
                             <td>{res.length}</td>
                             <td>{res.words}</td>
                             <td>{res.time}</td>
                             {(statusFilter === 'match' || grepMatch) && <td>{res.isMatch ? "✓" : ""}</td>}
                          </tr>
                       ))}
                       {results.length === 0 && (
                          <tr>
                             <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "#999", fontStyle: "italic" }}>
                                {isAttacking ? "Attack is running... results will appear here." : "Start an attack to see results."}
                             </td>
                          </tr>
                       )}
                    </tbody>
                 </table>
              </div>

              {selectedResult && (
                 <div className="repeater-split-workspace" style={{ flex: 1, borderTop: "1px solid var(--burp-border)" }}>
                    <div className="repeater-pane">
                       <div className="pane-header-label">Request for payload: {selectedResult.payload}</div>
                       <div className="raw-editor" style={{ overflowY: "auto", fontSize: "11px", whiteSpace: "pre-wrap" }}>
                          {selectedResult.rawRequest}
                       </div>
                    </div>
                    <div className="repeater-pane">
                       <div className="pane-header-label">Response</div>
                       <div className="raw-editor" style={{ overflowY: "auto", fontSize: "11px", whiteSpace: "pre-wrap" }}>
                          <div style={{ color: "var(--burp-blue)", borderBottom: "1px solid #f1f3f5", paddingBottom: "5px", marginBottom: "5px" }}>
                             HTTP/1.1 {selectedResult.status} {selectedResult.statusText}{"\n"}
                             {Object.entries(selectedResult.headers || {}).map(([k,v]) => `${k}: ${v}`).join('\n')}
                          </div>
                          {selectedResult.response}
                       </div>
                    </div>
                 </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
}

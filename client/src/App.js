import React, { useEffect, useState } from "react";
import { Shield, Activity, AlertTriangle, Terminal, Search, Trash2, Settings, List, Lock, Unlock, Play, FileText, Send, Zap, Download, Sparkles } from "lucide-react";
import "./App.css"; // Fixed Sparkles import

// Components
import Welcome from "./components/Welcome";
import Setup from "./components/Setup";
import ProxySettings from "./components/ProxySettings";
import Intercept from "./components/Intercept";
import Repeater from "./components/Repeater";
import Intruder from "./components/Intruder";
import AIPage from "./pages/AI";
import Decoder from "./components/Decoder";

// Store
import { addToRepeater, getRepeaterRequests, addToIntruder, setAIRequest, toRaw, setDecoderInput } from "./store";

function App() {
  const [step, setStep] = useState(() => {
    const savedStep = localStorage.getItem("eagleeye_step");
    return savedStep ? parseInt(savedStep) : 1;
  }); // 1: Welcome, 2: Setup, 3: Dashboard
  const [mainTab, setMainTab] = useState("dashboard"); 
  const [proxyTab, setProxyTab] = useState("intercept"); 
  
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("");
  const [interceptOn, setInterceptOn] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  
  useEffect(() => {
    localStorage.setItem("eagleeye_step", step);
  }, [step]);

  const fetchLogs = () => {
    fetch("http://127.0.0.1:8081/api/logs")
      .then((res) => res.json())
      .then((data) => setLogs(data.reverse()))
      .catch((err) => console.error("Error fetching logs:", err));
  };

  const fetchInterceptStatus = () => {
    fetch("http://127.0.0.1:8081/api/intercept-status")
      .then((res) => res.json())
      .then((data) => setInterceptOn(data.interceptOn))
      .catch((err) => console.error("Error fetching intercept status:", err));
  };

  const toggleIntercept = () => {
    fetch("http://127.0.0.1:8081/api/toggle-intercept", { method: "POST" })
      .then((res) => res.json())
      .then((data) => setInterceptOn(data.interceptOn))
      .catch((err) => console.error("Error toggling intercept:", err));
  };

  const startProxy = () => {
    fetch("http://127.0.0.1:8081/start")
      .then(() => setStep(3))
      .catch((err) => {
        console.error("Failed to start proxy:", err);
        setStep(3);
      });
  };

  const handleRightClick = (e, request) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      request
    });
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    const handleGlobalClick = () => closeContextMenu();
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    if (step === 3) {
      fetchLogs();
      fetchInterceptStatus();
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [step]);

  if (step === 1) return <Welcome onStart={() => setStep(2)} />;
  if (step === 2) return <Setup onNext={startProxy} onBack={() => setStep(1)} />;

  const totalIssues = logs.reduce((acc, log) => acc + (log.issues?.length || 0), 0);
  
  const filteredLogs = logs.filter(log => 
    log.url.toLowerCase().includes(filter.toLowerCase()) || 
    log.method.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="app-wrapper">
      {/* Top Menu Bar Simulation */}
      <div className="top-menu-sim">
        <div className="top-left-menu">
           <div className="menu-group">
              <span className="menu-root">Burp</span>
              <span className="menu-root">Project</span>
              <span className="menu-root">Intruder</span>
              <span className="menu-root">Repeater</span>
              <span className="menu-root">Window</span>
              <span className="menu-root">Help</span>
           </div>
        </div>
        <div className="top-right-telemetry">
           <div className="telemetry-pill">
              <div className="pulse-dot green"></div>
              <span>PROXY ACTIVE: 8080</span>
           </div>
           <div className="telemetry-pill">
              <Shield size={10} color={interceptOn ? "#ff6633" : "#666"} />
              <span>INTERCEPT: {interceptOn ? "ON" : "OFF"}</span>
           </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <nav className="main-nav">
        <div className="nav-container">
          <button className={`main-tab-btn ${mainTab === 'dashboard' ? 'active' : ''}`} onClick={() => setMainTab('dashboard')}>
            <Activity size={13} /> Dashboard
          </button>
          <button className={`main-tab-btn ${mainTab === 'proxy' ? 'active' : ''}`} onClick={() => setMainTab('proxy')}>
            <Shield size={13} /> Proxy
          </button>
          <button className={`main-tab-btn ${mainTab === 'intruder' ? 'active' : ''}`} onClick={() => setMainTab('intruder')}>
            <Shield size={13} /> Intruder
          </button>
          <button className={`main-tab-btn ${mainTab === 'repeater' ? 'active' : ''}`} onClick={() => setMainTab('repeater')}>
            <Send size={13} /> Repeater
          </button>
          <button className={`main-tab-btn ${mainTab === 'decoder' ? 'active' : ''}`} onClick={() => setMainTab('decoder')}>
            <Lock size={13} /> Decoder
          </button>
          <button className={`main-tab-btn ${mainTab === 'ai-chat' ? 'active' : ''}`} onClick={() => setMainTab('ai-chat')}>
            <Terminal size={13} /> AI Assistant
          </button>
          <button className={`main-tab-btn ${mainTab === 'logger' ? 'active' : ''}`} onClick={() => setMainTab('logger')}>
            <List size={13} /> Logger
          </button>
          <button className={`main-tab-btn ${mainTab === 'settings' ? 'active' : ''}`} onClick={() => setMainTab('settings')}>
            <Settings size={13} /> User Options
          </button>
        </div>
      </nav>

      <div className="tab-content">
        {/* DASHBOARD TAB */}
        {mainTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div className="dash-stats-bar">
               <div className="dash-stat-item">
                  <span className="dash-stat-label">Total Requests</span>
                  <span className="dash-stat-value">{logs.length}</span>
               </div>
               <div className="dash-stat-item">
                  <span className="dash-stat-label">Security Issues</span>
                  <span className="dash-stat-value">{totalIssues}</span>
               </div>
               <div className="dash-stat-item">
                  <span className="dash-stat-label">System Health</span>
                  <span className="dash-stat-value">100%</span>
               </div>
            </div>

            <div className="dashboard-grid">
               <div className="dashboard-card">
                  <div className="dashboard-card-header">Tasks</div>
                  <div className="dashboard-card-content">
                     <div className="dash-list-row">
                        <div className="severity-dot severity-low"></div>
                        <span>Live Proxy Listener (8080)</span>
                        <span className="task-status">RUNNING</span>
                     </div>
                     <div className="dash-list-row">
                        <div className="severity-dot severity-low"></div>
                        <span>Dashboard API Server (8081)</span>
                        <span className="task-status">RUNNING</span>
                     </div>
                  </div>
               </div>

               <div className="dashboard-card">
                  <div className="dashboard-card-header">Issue activity</div>
                  <div className="dashboard-card-content">
                     {logs.filter(l => l.issues?.length > 0).length > 0 ? (
                       logs.filter(l => l.issues?.length > 0).map((log, i) => (
                         <div key={i} className="dash-list-row">
                            <div className={`severity-dot severity-${log.issues[0].priority?.toLowerCase() || 'medium'}`}></div>
                            <span>{log.issues[0].title || "Security Warning"}</span>
                            <span style={{ marginLeft: "auto", color: "#666" }}>{log.url}</span>
                         </div>
                       ))
                     ) : (
                       <div style={{ padding: "20px", color: "#999", textAlign: "center", fontSize: "11px" }}>No issues found yet.</div>
                     )}
                  </div>
               </div>

               <div className="dashboard-card" style={{ gridColumn: "span 2" }}>
                  <div className="dashboard-card-header">Event log</div>
                  <div className="dashboard-card-content">
                     <div className="dash-list-row">
                        <span className="event-time">{new Date().toLocaleTimeString()}</span>
                        <span className="event-msg">Certificate authority loaded successfully.</span>
                     </div>
                     <div className="dash-list-row">
                        <span className="event-time">{new Date().toLocaleTimeString()}</span>
                        <span className="event-msg">Proxy service started on port 8080.</span>
                     </div>
                     {logs.slice(0, 5).map((log, i) => (
                        <div key={i} className="dash-list-row">
                           <span className="event-time">{new Date(log.id).toLocaleTimeString()}</span>
                           <span className="event-msg">Forwarded {log.method} request to {log.url}</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>
          </div>
        )}

        {/* PROXY TAB */}
        {mainTab === "proxy" && (
          <div className="proxy-view-container">
            <nav className="sub-nav">
              <button className={`sub-tab-btn ${proxyTab === 'intercept' ? 'active' : ''}`} onClick={() => setProxyTab('intercept')}>Intercept</button>
              <button className={`sub-tab-btn ${proxyTab === 'history' ? 'active' : ''}`} onClick={() => setProxyTab('history')}>HTTP History</button>
              <button className={`sub-tab-btn ${proxyTab === 'options' ? 'active' : ''}`} onClick={() => setProxyTab('options')}>Options</button>
            </nav>

            {proxyTab === "intercept" && (
              <Intercept 
                interceptOn={interceptOn} 
                onToggle={toggleIntercept} 
                logs={logs} 
                onRightClick={handleRightClick}
              />
            )}

            {proxyTab === "history" && (
              <div className="history-view-layout">
                <div className="log-table-container">
                  <div className="table-scroll-container">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Method</th>
                          <th>URL</th>
                          <th>Status</th>
                          <th>Length</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLogs.map((log, i) => (
                          <tr key={i} 
                              className={`${log.intercepted ? 'row-intercepted' : ''} ${selectedLog?.id === log.id ? 'row-selected' : ''}`} 
                              onClick={() => setSelectedLog(log)}
                              onContextMenu={(e) => handleRightClick(e, log)}>
                            <td style={{ color: "#999" }}>{logs.length - i}</td>
                            <td><span className={`method-label ${log.method}`}>{log.method}</span></td>
                            <td className="url-cell">{log.url}</td>
                            <td><span className="status-badge" style={{color: log.status >= 400 ? "#c0392b" : "#27ae60"}}>{log.status}</span></td>
                            <td className="length-cell">{log.responseBody ? log.responseBody.length : 0}</td>
                            <td className="time-cell">{log.time ? `${log.time} ms` : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {selectedLog && (
                  <div className="history-detail-panel">
                    <div className="panel-header">
                       <span style={{ fontSize: "11px", fontWeight: "700", color: "#333" }}>Request detail: {selectedLog.url}</span>
                       <button className="close-panel" onClick={() => setSelectedLog(null)} style={{cursor: "pointer", border: "none", background: "transparent"}}>X</button>
                    </div>
                    <div className="detail-tabs">
                       <div className="detail-section">
                          <h4>Request</h4>
                          <pre>{`${selectedLog.method} ${selectedLog.url} HTTP/1.1\n` + Object.entries(selectedLog.headers || {}).map(([k,v]) => `${k}: ${v}`).join('\n') + "\n\n" + (selectedLog.body || "")}</pre>
                       </div>
                       <div className="detail-section">
                          <h4>Response</h4>
                          <pre>{`HTTP/1.1 ${selectedLog.status}\n` + (selectedLog.responseHeaders ? Object.entries(selectedLog.responseHeaders).map(([k,v]) => `${k}: ${v}`).join('\n') : "") + "\n\n" + (selectedLog.responseBody || "")}</pre>
                       </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {proxyTab === "options" && <ProxySettings />}
          </div>
        )}

        {mainTab === "repeater" && <Repeater setMainTab={setMainTab} />}
        {mainTab === "decoder" && <Decoder setMainTab={setMainTab} />}
        {mainTab === "logger" && (
           <div className="empty-state">
              <Shield size={64} style={{opacity: 0.1, marginBottom: "20px"}} />
              <h3>Logger</h3>
              <p>Capture every single request for detailed analysis.</p>
           </div>
        )}
        {mainTab === "settings" && <ProxySettings />}
        {mainTab === "intruder" && <Intruder />}
        {mainTab === "ai-chat" && <AIPage setMainTab={setMainTab} />}
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button className="context-menu-item" onClick={() => { addToRepeater(contextMenu.request); setMainTab('repeater'); closeContextMenu(); }}>Send to Repeater</button>
          <button className="context-menu-item" onClick={() => { addToIntruder(contextMenu.request); setMainTab('intruder'); closeContextMenu(); }}>Send to Intruder</button>
          <button className="context-menu-item" onClick={() => { 
            const raw = contextMenu.request.raw || toRaw(contextMenu.request);
            setDecoderInput(raw);
            setMainTab('decoder');
            closeContextMenu();
          }}>Send to Decoder</button>
          <button className="context-menu-item" onClick={() => { 
            const raw = contextMenu.request.raw || toRaw(contextMenu.request);
            setAIRequest(raw); 
            setMainTab('ai-chat'); 
            closeContextMenu(); 
          }}>Send to AI Assistant</button>

          <div className="context-menu-item divider"></div>
          <button className="context-menu-item" onClick={() => {
            if (contextMenu.request.id) {
               fetch("http://127.0.0.1:8081/api/intercept/drop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: contextMenu.request.id }) })
                 .then(closeContextMenu)
                 .catch((err) => {
                   console.error("Error dropping request:", err);
                   closeContextMenu();
                 });
            } else { closeContextMenu(); }
          }}>Drop</button>
          <div className="context-menu-item divider"></div>
          <button className="context-menu-item" onClick={closeContextMenu}>Cancel</button>
        </div>
      )}
    </div>
  );
}

export default App;

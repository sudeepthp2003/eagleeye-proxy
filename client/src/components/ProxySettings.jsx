import React, { useState } from "react";
import { Check } from "lucide-react";

export default function ProxySettings() {
  const [activeSideTab, setActiveSideTab] = useState("listeners");
  const [interceptResponse, setInterceptResponse] = useState(false);
  const [followRedirects, setFollowRedirects] = useState(true);

  return (
    <div className="settings-layout">
      {/* Sidebar */}
      <div className="settings-sidebar">
        <button 
          className={`settings-side-btn ${activeSideTab === 'listeners' ? 'active' : ''}`}
          onClick={() => setActiveSideTab('listeners')}
        >
          Proxy Listeners
        </button>
        <button 
          className={`settings-side-btn ${activeSideTab === 'interceptBy' ? 'active' : ''}`}
          onClick={() => setActiveSideTab('interceptBy')}
        >
          Interception Rules
        </button>
        <button 
          className={`settings-side-btn ${activeSideTab === 'cert' ? 'active' : ''}`}
          onClick={() => setActiveSideTab('cert')}
        >
          Certificate Authority
        </button>
        <button 
          className={`settings-side-btn ${activeSideTab === 'misc' ? 'active' : ''}`}
          onClick={() => setActiveSideTab('misc')}
        >
          Miscellaneous
        </button>
      </div>

      {/* Main Content */}
      <div className="settings-main">
        {activeSideTab === "listeners" && (
          <div style={{ maxWidth: "800px" }}>
             <div className="burp-groupbox">
                <div className="burp-groupbox-label">Proxy Listeners</div>
                <p style={{ margin: "0 0 15px 0", fontSize: "11px", color: "#666" }}>
                  Define the addresses and ports that the proxy will listen on.
                </p>
                <div className="log-table-container" style={{ height: "auto", minHeight: "100px", border: "1px solid #ddd" }}>
                   <table>
                      <thead>
                        <tr>
                          <th>Running</th>
                          <th>Interface</th>
                          <th>Port</th>
                          <th>TLS</th>
                        </tr>
                      </thead>
                      <tbody>
                         <tr>
                            <td><div className="severity-dot severity-low" style={{ margin: "auto" }}></div></td>
                            <td>127.0.0.1</td>
                            <td>8080</td>
                            <td>Enabled (HTTP/1.1)</td>
                         </tr>
                      </tbody>
                   </table>
                </div>
                <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
                   <button className="toolbar-btn">Add</button>
                   <button className="toolbar-btn">Edit</button>
                   <button className="toolbar-btn">Remove</button>
                </div>
             </div>

             <div className="burp-groupbox">
                <div className="burp-groupbox-label">Certificate Authority</div>
                <p style={{ margin: "0 0 15px 0", fontSize: "11px", color: "#666" }}>
                  To intercept HTTPS traffic, you must install EagleEye's CA certificate in your browser.
                </p>
                <div style={{ display: "flex", gap: "12px" }}>
                   <button 
                     className="toolbar-btn primary" 
                     onClick={() => window.open("http://localhost:8081/download-ca")}
                   >
                     Regenerate CA certificate
                   </button>
                   <button 
                     className="toolbar-btn" 
                     onClick={() => window.open("http://localhost:8081/download-ca")}
                   >
                     Import / export CA certificate
                   </button>
                </div>
             </div>
          </div>
        )}

        {activeSideTab === "interceptBy" && (
          <div style={{ maxWidth: "800px" }}>
             <div className="burp-groupbox">
                <div className="burp-groupbox-label">Intercept Requests</div>
                <div className="burp-checkbox-row" onClick={() => {}}>
                   <div className="burp-checkbox active"><Check size={10} /></div>
                   <div>
                      <div className="burp-checkbox-label">Intercept requests based on the following rules</div>
                      <div className="burp-checkbox-desc">Requests that do not match these rules will automatically follow default behavior.</div>
                   </div>
                </div>
             </div>

             <div className="burp-groupbox">
                <div className="burp-groupbox-label">Intercept Responses</div>
                <div className="burp-checkbox-row" onClick={() => setInterceptResponse(!interceptResponse)}>
                   <div className={`burp-checkbox ${interceptResponse ? 'active' : ''}`}>{interceptResponse && <Check size={10} />}</div>
                   <div>
                      <div className="burp-checkbox-label">Intercept responses based on the following rules</div>
                      <div className="burp-checkbox-desc">Check this to pause server responses before they reach your browser.</div>
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeSideTab === "cert" && (
          <div style={{ maxWidth: "800px" }}>
             <div className="burp-groupbox">
                <div className="burp-groupbox-label">CA Certificate Storage</div>
                <p style={{ margin: "0 0 15px 0", fontSize: "11px", color: "#666" }}>
                  Status: <strong>EagleEye CA is currently active.</strong>
                </p>
                <div className="dash-list-row">
                   <div className="event-time">Key Size:</div>
                   <span>2048-bit RSA</span>
                </div>
                <div className="dash-list-row">
                   <div className="event-time">Format:</div>
                   <span>X.509 (PEM)</span>
                </div>
             </div>
          </div>
        )}

        {activeSideTab === "misc" && (
          <div style={{ maxWidth: "800px" }}>
             <div className="burp-groupbox">
                <div className="burp-groupbox-label">Performance & Misc</div>
                <div className="burp-checkbox-row" onClick={() => setFollowRedirects(!followRedirects)}>
                   <div className={`burp-checkbox ${followRedirects ? 'active' : ''}`}>{followRedirects && <Check size={10} />}</div>
                   <div className="burp-checkbox-label">Automatically follow HTTP redirections</div>
                </div>

                <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid #eee" }}>
                   <button 
                     className="toolbar-btn" 
                     onClick={() => {
                       localStorage.removeItem("eagleeye_step");
                       window.location.reload();
                     }}
                   >
                     Reset Application Onboarding
                   </button>
                   <p style={{ fontSize: "10px", color: "#999", marginTop: "5px" }}>
                     This will return you to the welcome screen and setup wizard.
                   </p>
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

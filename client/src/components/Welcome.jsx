import React from "react";
import { Shield, ArrowRight } from "lucide-react";

export default function Welcome({ onStart }) {
  return (
    <div className="wizard-container">
      <div className="wizard-card welcome-card">
        <div style={{ display: "flex", alignItems: "center", gap: "15px", marginBottom: "30px" }}>
            <div style={{ background: "var(--burp-orange)", padding: "10px", borderRadius: "8px", color: "white" }}>
               <Shield size={40} />
            </div>
            <div>
               <h1 style={{ margin: 0, fontSize: "24px", color: "#333" }}>EagleEye</h1>
               <div style={{ fontSize: "11px", color: "#999", textTransform: "uppercase", letterSpacing: "1px" }}>Secure Proxy Suite</div>
            </div>
        </div>

        <h2 className="wizard-title">New project setup</h2>
        <p className="wizard-subtitle">
          Select how you want to start your security testing session. You can create a temporary project or use a disk-based project.
        </p>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "30px" }}>
           <div style={{ border: "1px solid var(--burp-orange)", padding: "12px", borderRadius: "5px", background: "#fff9f6", cursor: "pointer" }}>
              <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px" }}>Temporary project</div>
              <div style={{ fontSize: "11px", color: "#666" }}>Your project data will be stored in memory and lost when EagleEye is closed.</div>
           </div>
           <div style={{ border: "1px solid #ddd", padding: "12px", borderRadius: "5px", opacity: 0.6 }}>
              <div style={{ fontWeight: "700", fontSize: "13px", marginBottom: "4px" }}>New project on disk</div>
              <div style={{ fontSize: "11px", color: "#666" }}>Save project data to a file for later auditing and reporting. (Requires Pro)</div>
           </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
           <button className="wizard-primary-btn" onClick={onStart}>
             Next <ArrowRight size={16} />
           </button>
        </div>
        
        <div className="wizard-footer">
          Build v2026.4.17 - Standard Edition
        </div>
      </div>
    </div>
  );
}

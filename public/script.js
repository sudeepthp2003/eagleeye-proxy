let allLogs = [];

async function fetchLogs() {
    try {
        const response = await fetch('/api/logs');
        const logs = await response.json();
        allLogs = logs;
        renderTraffic(logs);
        updateStats(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
    }
}

function updateStats(logs) {
    document.getElementById('total-req').textContent = logs.length;
    
    let totalIssues = 0;
    let criticalIssues = 0;
    
    logs.forEach(log => {
        totalIssues += log.issues.length;
        criticalIssues += log.issues.filter(i => i.type === 'Critical').length;
    });
    
    document.getElementById('total-issues').textContent = totalIssues;
    document.getElementById('total-critical').textContent = criticalIssues;
}

function renderTraffic(logs) {
    const tbody = document.getElementById('traffic-body');
    const filter = document.getElementById('filter-input').value.toLowerCase();
    
    tbody.innerHTML = '';
    
    logs.reverse().forEach(log => {
        if (filter && !log.url.toLowerCase().includes(filter) && !log.method.toLowerCase().includes(filter)) {
            return;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="method-badge method-${log.method}">${log.method}</span></td>
            <td class="url-text" title="${log.url}">${log.url}</td>
            <td><span class="status-status">${log.status}</span></td>
            <td>
                ${log.issues.map(issue => `
                    <span class="issue-pill issue-${issue.type}" title="${issue.message}">
                        ${issue.type}
                    </span>
                `).join('') || '<span style="color: #64748b">None</span>'}
            </td>
            <td>${new Date(log.time).toLocaleTimeString()}</td>
            <td><button class="btn btn-secondary btn-sm" onclick="showDetails('${log.id}')">View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function showDetails(id) {
    const log = allLogs.find(l => l.id === id);
    if (!log) return;

    const modal = document.getElementById('details-modal');
    const body = document.getElementById('modal-details-body');
    
    body.innerHTML = `
        <h2 style="margin-bottom: 24px">Request Details</h2>
        <div class="details-grid">
            <div>
                <div class="section-title">Overview</div>
                <div class="card" style="padding: 16px; margin-bottom: 24px; background: rgba(255,255,255,0.03)">
                    <p><strong>Method:</strong> ${log.method}</p>
                    <p><strong>Path:</strong> ${log.path}</p>
                    <p><strong>Time:</strong> ${new Date(log.time).toLocaleString()}</p>
                    <p><strong>Status:</strong> ${log.status}</p>
                </div>

                <div class="section-title">Security Issues (${log.issues.length})</div>
                <div class="issues-list">
                    ${log.issues.map(i => `
                        <div class="issue-pill issue-${i.type}" style="display: block; margin-bottom: 8px; padding: 12px; border-radius: 8px">
                            <strong>${i.type}</strong>: ${i.message}
                        </div>
                    `).join('') || '<p>No issues detected.</p>'}
                </div>
            </div>
            <div>
                <div class="section-title">Request Headers</div>
                <pre class="code-block">${JSON.stringify(log.headers, null, 2)}</pre>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Event Listeners
document.getElementById('clear-logs').addEventListener('click', async () => {
    await fetch('/api/logs', { method: 'DELETE' });
    fetchLogs();
});

document.getElementById('filter-input').addEventListener('input', () => {
    renderTraffic(allLogs);
});

document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('details-modal').style.display = 'none';
});

window.onclick = function(event) {
    const modal = document.getElementById('details-modal');
    if (event.target == modal) {
        modal.style.display = 'none';
    }
}

// Initial fetch and poll
fetchLogs();
setInterval(fetchLogs, 2000);

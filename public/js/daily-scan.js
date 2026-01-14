document.addEventListener('DOMContentLoaded', () => {
  const summaryEl = document.getElementById('reportSummary');
  const byPersonEl = document.getElementById('reportByPerson');
  const refreshBtn = document.getElementById('refreshReport');

  async function loadReport() {
    summaryEl.textContent = 'Loading...';
    byPersonEl.innerHTML = '';
    try {
      const resp = await fetch('/api/gameplan/daily-scan/report', { credentials: 'include' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        summaryEl.textContent = 'Error: ' + (err.error || resp.statusText);
        return;
      }
      const data = await resp.json();
      const s = data.summary || {};
      summaryEl.innerHTML = `
        <div class="metric-box">
          <div><strong>Analysis Date:</strong> ${new Date().toLocaleDateString()}</div>
          <div><strong>Total Completed Scans:</strong> ${s.totalCompleted || 0}</div>
          <div><strong>Total Cancelled Scans:</strong> ${s.totalCancelled || 0}</div>
          <div><strong>Total Units Counted:</strong> ${s.totalUnits || 0}</div>
          <div><strong>Total New Units Found:</strong> ${s.totalNewUnits || 0}</div>
        </div>
      `;

      const byPerson = data.byPerson || {};
      const people = Object.keys(byPerson).sort((a,b)=> (byPerson[b].units||0)-(byPerson[a].units||0));
      if (!people.length) {
        byPersonEl.textContent = 'No person-level data available.';
        return;
      }

      const table = document.createElement('table');
      table.className = 'simple-table';
      table.innerHTML = `<thead><tr><th>Person</th><th>Completed</th><th>Cancelled</th><th>Units</th><th>New Units</th></tr></thead>`;
      const tbody = document.createElement('tbody');
      people.forEach(name => {
        const p = byPerson[name];
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${name || '--'}</td><td>${p.completed||0}</td><td>${p.cancelled||0}</td><td>${p.units||0}</td><td>${p.newUnits||0}</td>`;
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      byPersonEl.appendChild(table);
    } catch (e) {
      summaryEl.textContent = 'Error loading report';
      console.error(e);
    }
  }

  refreshBtn?.addEventListener('click', loadReport);
  loadReport();
});

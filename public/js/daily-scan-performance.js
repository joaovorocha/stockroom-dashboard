// Daily Scan Performance Page
(function() {
  'use strict';

  let charts = {};
  let scanData = [];
  let filteredData = [];

  // Store employee name mapping
  let employeeNameMap = {};
  let employeePhotoMap = {};
  let employeeDataCache = [];

  // Load employees and create email-to-name mapping
  async function loadEmployeeNames() {
    try {
      const response = await fetch('/api/gameplan/employees', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        const allEmployees = [
          ...(data.employees.SA || []),
          ...(data.employees.BOH || []),
          ...(data.employees.MANAGEMENT || []),
          ...(data.employees.TAILOR || [])
        ];
        
        // Store full employee data
        employeeDataCache = allEmployees;
        
        // Create mapping from email to first name and photos
        allEmployees.forEach(emp => {
          if (emp.name) {
            const firstName = emp.name.split(' ')[0]; // Get first name only
            const email = emp.id ? emp.id.toLowerCase() : '';
            const employeeId = emp.employeeId ? emp.employeeId.toLowerCase() : '';
            
            // Map by ID and employeeId
            if (email) {
              employeeNameMap[email] = firstName;
              if (emp.photo) employeePhotoMap[email] = emp.photo;
            }
            if (employeeId) {
              employeeNameMap[employeeId] = firstName;
              if (emp.photo) employeePhotoMap[employeeId] = emp.photo;
            }
            
            // Also map common email formats
            if (emp.name) {
              const nameParts = emp.name.split(' ');
              if (nameParts.length >= 2) {
                const firstInitial = nameParts[0][0].toLowerCase();
                const lastName = nameParts[nameParts.length - 1].toLowerCase();
                const emailFormat = firstInitial + lastName;
                employeeNameMap[emailFormat] = firstName;
                if (emp.photo) employeePhotoMap[emailFormat] = emp.photo;
              }
            }
          }
        });
        
        console.log('Employee name mapping loaded:', employeeNameMap);
      }
    } catch (error) {
      console.error('Error loading employee names:', error);
    }
  }

  // Get display name from email (returns first name only)
  function getEmployeeDisplayName(email) {
    if (!email) return 'Unknown';
    
    const normalized = normalizeEmployeeEmail(email);
    
    // Check if we have a mapped name
    if (employeeNameMap[normalized]) {
      return employeeNameMap[normalized];
    }
    
    // Try other formats
    const emailLower = email.toLowerCase();
    if (employeeNameMap[emailLower]) {
      return employeeNameMap[emailLower];
    }
    
    // Extract from email if format is firstname@domain or similar
    if (email.includes('@')) {
      const prefix = email.split('@')[0];
      if (employeeNameMap[prefix.toLowerCase()]) {
        return employeeNameMap[prefix.toLowerCase()];
      }
    }
    
    // Fallback to capitalized normalized name
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  // Normalize employee email to consistent format
  function normalizeEmployeeEmail(email) {
    if (!email) return 'Unknown';
    
    // If it's an email, extract prefix and normalize
    if (email.includes('@')) {
      const emailPrefix = email.split('@')[0].toLowerCase();
      return emailPrefix;
    }
    
    // If it's a full name like "Daniel iraheta" or "Ivan Ramos", 
    // convert to email format: first initial + last name
    const nameParts = email.trim().split(/\s+/);
    if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      return (firstName[0] + lastName).toLowerCase();
    }
    
    // Otherwise just lowercase it
    return email.toLowerCase().replace(/\s+/g, '');
  }

  // Update dynamic labels based on current filters
  function updateDynamicLabels() {
    const employeeFilter = document.getElementById('filterEmployee');
    const dateRangeFilter = document.getElementById('filterDateRange');
    const statusFilter = document.getElementById('filterStatus');

    // Build period text from date range filter
    let periodText = 'YTD';
    if (dateRangeFilter) {
      const dateValue = dateRangeFilter.value;
      switch(dateValue) {
        case '7':
          periodText = 'Last 7 Days';
          break;
        case '30':
          periodText = 'Last 30 Days';
          break;
        case '90':
          periodText = 'Last 90 Days';
          break;
        case '365':
          periodText = 'Last Year';
          break;
        case 'all':
          periodText = 'YTD';
          break;
        default:
          periodText = 'YTD';
      }
    }

    // Get employee name if filtered
    let employeeName = '';
    if (employeeFilter && employeeFilter.value) {
      const selectedOption = employeeFilter.options[employeeFilter.selectedIndex];
      employeeName = selectedOption ? ` - ${selectedOption.text}` : '';
    }

    // Get status if filtered
    let statusText = '';
    if (statusFilter && statusFilter.value) {
      statusText = ` (${statusFilter.options[statusFilter.selectedIndex].text})`;
    }

    // Update main section title
    const mainTitle = document.getElementById('storeMetricsTitle');
    if (mainTitle) {
      mainTitle.textContent = `📊 Store Metrics ${periodText}${employeeName}${statusText}`;
    }

    // Update subtitle
    const subtitle = document.getElementById('storeMetricsSubtitle');
    if (subtitle) {
      if (periodText === 'YTD') {
        subtitle.textContent = 'Year-to-date performance indicators for San Francisco';
      } else {
        subtitle.textContent = `Performance indicators for ${periodText.toLowerCase()}`;
      }
    }

    // Update KPI labels
    const kpiAccuracyLabel = document.getElementById('kpiAccuracyLabel');
    const kpiCompletedLabel = document.getElementById('kpiCompletedLabel');
    const kpiMissedLabel = document.getElementById('kpiMissedLabel');
    const kpiUndecodableLabel = document.getElementById('kpiUndecodableLabel');

    if (kpiAccuracyLabel) kpiAccuracyLabel.textContent = `Average Accuracy ${periodText}`;
    if (kpiCompletedLabel) kpiCompletedLabel.textContent = `Total Scans ${periodText}`;
    if (kpiMissedLabel) kpiMissedLabel.textContent = `Avg Missed Units ${periodText}`;
    if (kpiUndecodableLabel) kpiUndecodableLabel.textContent = `Undecodable Rate ${periodText}`;

    // Update chart titles
    const accuracyTrendTitle = document.getElementById('accuracyTrendTitle');
    const discrepancyTitle = document.getElementById('discrepancyTitle');
    const topPerformersTitle = document.getElementById('topPerformersTitle');
    const employeeTableTitle = document.getElementById('employeeTableTitle');

    if (accuracyTrendTitle) accuracyTrendTitle.textContent = `Accuracy Trend ${periodText}`;
    if (discrepancyTitle) discrepancyTitle.textContent = `Discrepancy Breakdown ${periodText}`;
    if (topPerformersTitle) topPerformersTitle.textContent = `🏆 Top Performers ${periodText} (Accuracy)`;
    if (employeeTableTitle) employeeTableTitle.textContent = `👤 ${periodText} Employee Scan`;
  }

  // Tab switching (check if tabs exist first)
  const tabs = document.querySelectorAll('.tab');
  if (tabs.length > 0) {
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        
        // Update active tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Update active content
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
        });
        const tabContent = document.getElementById(tabId + 'Tab');
        if (tabContent) tabContent.classList.add('active');

        // Resize charts when switching to performance tab
        if (tabId === 'performance') {
          setTimeout(() => {
            Object.values(charts).forEach(chart => {
              if (chart) chart.resize();
            });
          }, 100);
        }
      });
    });
  }

  // Load employee performance from database for YTD totals
  async function loadEmployeePerformance() {
    try {
      const scanResponse = await fetch('/api/gameplan/daily-scan/results?days=9999', {
        credentials: 'include'
      });
      
      const missedResponse = await fetch('/api/gameplan/daily-scan/missed?days=9999', {
        credentials: 'include'
      });
      
      if (scanResponse.ok) {
        const scans = await scanResponse.json();
        const missedData = missedResponse.ok ? await missedResponse.json() : [];
        
        // Create map of missed scans by employee
        const missedMap = new Map();
        missedData.forEach(item => {
          missedMap.set(normalizeEmployeeEmail(item.scheduled_employee), parseInt(item.missed_count || 0));
        });
        
        // Group scans by employee to get totals
        const empMap = new Map();
        scans.forEach(scan => {
          const empName = normalizeEmployeeEmail(scan.counted_by);
          if (!empMap.has(empName)) {
            empMap.set(empName, {
              name: scan.counted_by,
              countsDone: 0,
              missedScans: 0,
              missedAvailable: 0,
              missedReserved: 0,
              expectedUnits: 0,
              countedUnits: 0
            });
          }
          const emp = empMap.get(empName);
          emp.countsDone++;
          emp.missedAvailable += parseInt(scan.missed_available || 0);
          emp.missedReserved += parseInt(scan.missed_reserved || 0);
          emp.expectedUnits += parseInt(scan.expected_units || 0);
          emp.countedUnits += parseInt(scan.counted_units || 0);
        });
        
        // Add missed scans count from API
        missedMap.forEach((missedCount, empName) => {
          if (empMap.has(empName)) {
            empMap.get(empName).missedScans = missedCount;
          } else {
            // Employee has missed scans but no completed scans - still show them
            empMap.set(empName, {
              name: empName,
              countsDone: 0,
              missedScans: missedCount,
              missedAvailable: 0,
              missedReserved: 0,
              expectedUnits: 0,
              countedUnits: 0,
              accuracy: 0
            });
          }
        });
        
        // Calculate accuracy for each employee
        const employeesWithTotals = Array.from(empMap.values()).map(emp => ({
          ...emp,
          accuracy: emp.expectedUnits > 0 ? (emp.countedUnits / emp.expectedUnits) * 100 : 0
        }));
        
        console.log('Employee performance from DB:', employeesWithTotals);
        renderEmployeePerformanceTable(employeesWithTotals);
      }
    } catch (error) {
      console.error('Error loading employee performance:', error);
    }
  }

  // Initialize page
  async function init() {
    await loadEmployeeNames();
    updateDynamicLabels(); // Set initial labels
    await loadTodayAssignment();
    await loadLookerData();
    await loadScanData();
    await loadEmployeePerformance();
    setupFilters();
    setupImport();
    
    // Refresh data when date range changes (if element exists)
    const dateFilter = document.getElementById('dateRangeFilter');
    if (dateFilter) {
      dateFilter.addEventListener('change', loadScanData);
    }
  }

  // Load Looker data (from Gmail imports)
  async function loadLookerData() {
    try {
      const response = await fetch('/api/gameplan/daily-scan/looker-data', {
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('Session expired. Please log in again.');
      }

      if (response.ok) {
        const data = await response.json();
        console.log('Looker data loaded:', data);
        
        // KPIs now calculated from database scan data in updateKPIs()
        // Looker data used only for employee performance charts

        // Update employee performance data
        if (data.employee && data.employee.employees && data.employee.employees.length > 0) {
          renderEmployeePerformanceCharts(data.employee.employees);
          // Employee table now loaded from database via loadEmployeePerformance()
        }

        // Update last updated time
        if (data.lastUpdated) {
          const updated = new Date(data.lastUpdated).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          document.getElementById('lastUpdated').textContent = `Looker: ${updated}`;
        }
      }
    } catch (error) {
      console.error('Error loading Looker data:', error);
      const lastUpdatedEl = document.getElementById('lastUpdated');
      if (lastUpdatedEl && error.message.includes('Session expired')) {
        lastUpdatedEl.textContent = 'Session expired. Please log in again.';
      }
    }
  }

  // Load today's assignment
  async function loadTodayAssignment() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/gameplan/daily-scan/check?date=${today}`, {
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('Session expired. Please log in again.');
      }

      if (response.ok) {
        const data = await response.json();
        
        if (data.assigned) {
          document.getElementById('assignedEmployee').textContent = data.employeeName || 'Unknown';
          
          // Check if today's scan is completed
          const todayResult = scanData.find(scan => 
            scan.scan_date === today && 
            scan.counted_by && 
            scan.counted_by.toLowerCase().includes(data.employeeName.toLowerCase().split(' ')[0])
          );

          if (todayResult) {
            document.getElementById('todayStatus').textContent = 'Completed';
            document.getElementById('todayStatus').className = 'scan-status-badge completed';
            document.getElementById('todayExpected').textContent = todayResult.expected_units.toLocaleString();
            document.getElementById('todayCounted').textContent = todayResult.counted_units.toLocaleString();
            
            const accuracy = ((todayResult.counted_units / todayResult.expected_units) * 100).toFixed(1);
            document.getElementById('todayAccuracy').textContent = accuracy + '%';
          } else {
            document.getElementById('todayStatus').textContent = 'Pending';
            document.getElementById('todayStatus').className = 'scan-status-badge pending';
          }
        } else {
          document.getElementById('assignedEmployee').textContent = 'Not Assigned';
          document.getElementById('todayStatus').textContent = 'Not Started';
          document.getElementById('todayStatus').className = 'scan-status-badge not-started';
        }
      }
    } catch (error) {
      console.error('Error loading today assignment:', error);
      const statusEl = document.getElementById('todayStatus');
      if (statusEl && error.message.includes('Session expired')) {
        statusEl.textContent = 'Session expired';
        statusEl.className = 'scan-status-badge';
      }
    }
  }

  // Load employee performance from database for YTD totals
  async function loadEmployeePerformance() {
    try {
      const response = await fetch('/api/gameplan/daily-scan/performance?days=9999', {
        credentials: 'include'
      });

      if (response.ok) {
        const employees = await response.json();
        console.log('Employee performance from DB:', employees);
        
        // Transform database data to match expected format
        const formattedEmployees = employees.map(emp => ({
          name: emp.counted_by,
          countsDone: parseInt(emp.total_scans),
          accuracy: parseFloat(emp.avg_accuracy),
          missedAvailable: 0, // Will calculate from individual scans
          missedReserved: 0,
          expectedUnits: 0,
          countedUnits: 0
        }));
        
        // Get detailed scan data to calculate totals
        const scanResponse = await fetch('/api/gameplan/daily-scan/results?days=9999', {
          credentials: 'include'
        });
        
        if (scanResponse.ok) {
          const scans = await scanResponse.json();
          
          // Group scans by employee to get totals
          const empMap = new Map();
          scans.forEach(scan => {
            const empName = normalizeEmployeeEmail(scan.counted_by);
            if (!empMap.has(empName)) {
              empMap.set(empName, {
                name: scan.counted_by,
                countsDone: 0,
                missedAvailable: 0,
                missedReserved: 0,
                expectedUnits: 0,
                countedUnits: 0
              });
            }
            const emp = empMap.get(empName);
            emp.countsDone++;
            emp.missedAvailable += parseInt(scan.missed_available || 0);
            emp.missedReserved += parseInt(scan.missed_reserved || 0);
            emp.expectedUnits += parseInt(scan.expected_units || 0);
            emp.countedUnits += parseInt(scan.counted_units || 0);
          });
          
          // Calculate accuracy for each employee
          const employeesWithTotals = Array.from(empMap.values()).map(emp => ({
            ...emp,
            accuracy: emp.expectedUnits > 0 ? (emp.countedUnits / emp.expectedUnits) * 100 : 0
          }));
          
          renderEmployeePerformanceTable(employeesWithTotals);
        }
      }
    } catch (error) {
      console.error('Error loading employee performance:', error);
    }
  }

  // Load scan data
  async function loadScanData() {
    try {
      const dateFilter = document.getElementById('filterDateRange');
      // Default to 'all' to show all historical data including December imports
      let days = 'all';
      if (dateFilter && dateFilter.value) {
        days = dateFilter.value;
      }
      
      const url = days === 'all' 
        ? '/api/gameplan/daily-scan/results?days=9999'
        : `/api/gameplan/daily-scan/results?days=${days}`;
      
      const response = await fetch(url, {
        credentials: 'include'
      });

      if (response.status === 401 || response.status === 403) {
        throw new Error('Session expired. Please log in again.');
      }

      if (response.ok) {
        scanData = await response.json();
        filteredData = [...scanData];
        
        updateKPIs();
        renderCharts();
        renderDetailsTable();
        
        const lastUpdated = new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const lastUpdatedEl = document.getElementById('lastUpdated');
        if (lastUpdatedEl) {
          lastUpdatedEl.textContent = `Updated ${lastUpdated}`;
        }
      }
    } catch (error) {
      console.error('Error loading scan data:', error);
      const lastUpdatedEl = document.getElementById('lastUpdated');
      if (lastUpdatedEl) {
        lastUpdatedEl.textContent = error.message.includes('Session expired')
          ? 'Session expired. Please log in again.'
          : 'Error loading data';
      }
    }
  }

  // Update KPI cards
  function updateKPIs() {
    if (scanData.length === 0) return;

    // Calculate total accuracy (total counted / total expected, not average of averages)
    const totalCounted = scanData.reduce((sum, scan) => sum + (parseInt(scan.counted_units) || 0), 0);
    const totalExpected = scanData.reduce((sum, scan) => sum + (parseInt(scan.expected_units) || 0), 0);
    const avgAccuracy = totalExpected > 0 ? ((totalCounted / totalExpected) * 100).toFixed(1) : '0.0';
    
    const avgAccuracyEl = document.getElementById('avgAccuracy');
    if (avgAccuracyEl) avgAccuracyEl.textContent = avgAccuracy + '%';
    
    const kpiAccuracy = document.getElementById('kpiAccuracy');
    if (kpiAccuracy) {
      kpiAccuracy.classList.remove('success', 'warning', 'error');
      if (parseFloat(avgAccuracy) >= 99) {
        kpiAccuracy.classList.add('success');
      } else if (parseFloat(avgAccuracy) >= 95) {
        kpiAccuracy.classList.add('warning');
      } else {
        kpiAccuracy.classList.add('error');
      }
    }

    // Calculate average missed units per scan
    const totalMissed = scanData.reduce((sum, scan) => {
      return sum + (parseInt(scan.missed_available) || 0) + (parseInt(scan.missed_reserved) || 0);
    }, 0);
    const avgMissed = Math.round(totalMissed / scanData.length);
    
    const avgMissedEl = document.getElementById('avgMissed');
    if (avgMissedEl) avgMissedEl.textContent = avgMissed.toLocaleString();
    
    const kpiMissed = document.getElementById('kpiMissed');
    if (kpiMissed) {
      kpiMissed.classList.remove('success', 'warning', 'error');
      if (avgMissed <= 10) {
        kpiMissed.classList.add('success');
      } else if (avgMissed <= 50) {
        kpiMissed.classList.add('warning');
      } else {
        kpiMissed.classList.add('error');
      }
    }

    // Total completed scans
    const completed = scanData.length; // All records in database are completed
    const totalCompletedEl = document.getElementById('totalCompleted');
    if (totalCompletedEl) totalCompletedEl.textContent = completed;
    
    const kpiCompleted = document.getElementById('kpiCompleted');
    if (kpiCompleted) kpiCompleted.classList.add('success');

    // Undecodable rate
    const totalUndecodable = scanData.reduce((sum, scan) => {
      return sum + (parseInt(scan.undecodable_units) || 0);
    }, 0);
    const undecodableRate = totalExpected > 0 ? ((totalUndecodable / totalExpected) * 100).toFixed(2) : '0.00';
    
    const undecodableRateEl = document.getElementById('undecodableRate');
    if (undecodableRateEl) undecodableRateEl.textContent = undecodableRate + '%';
    
    const kpiUndecodable = document.getElementById('kpiUndecodable');
    if (kpiUndecodable) {
      kpiUndecodable.classList.remove('success', 'warning', 'error');
      if (parseFloat(undecodableRate) <= 0.5) {
        kpiUndecodable.classList.add('success');
      } else if (parseFloat(undecodableRate) <= 2) {
        kpiUndecodable.classList.add('warning');
      } else {
        kpiUndecodable.classList.add('error');
      }
    }
  }

  // Render all charts
  function renderCharts() {
    renderAccuracyTrend();
    renderDiscrepancyBreakdown();
    renderTopPerformers();
    renderMissedUnits();
    renderEmployeeComparison();
  }

  // Accuracy Trend Chart
  function renderAccuracyTrend() {
    const ctx = document.getElementById('accuracyTrendChart');
    if (!ctx) return;

    // Sort by date
    const sortedData = [...scanData].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedData.map(scan => {
      const date = new Date(scan.scan_date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    
    const accuracyData = sortedData.map(scan => {
      return ((scan.counted_units / scan.expected_units) * 100).toFixed(1);
    });

    // Calculate min and max for dynamic scaling
    const accuracyValues = accuracyData.map(v => parseFloat(v));
    const minAccuracy = Math.min(...accuracyValues);
    const maxAccuracy = Math.max(...accuracyValues);
    
    // Set scale from 95% to provide better view of variations
    const yMin = 95;
    const yMax = 100;

    if (charts.accuracyTrend) {
      charts.accuracyTrend.destroy();
    }

    charts.accuracyTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Accuracy %',
          data: accuracyData,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `Accuracy: ${context.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            min: yMin,
            max: yMax,
            ticks: {
              stepSize: 1,
              callback: (value) => value.toFixed(0) + '%'
            },
            grid: {
              color: (context) => {
                // Highlight the 95-100% zone
                if (context.tick.value >= 95) {
                  return 'rgba(16, 185, 129, 0.1)';
                }
                return 'rgba(0, 0, 0, 0.1)';
              }
            }
          }
        }
      }
    });
  }

  // Discrepancy Breakdown Chart
  function renderDiscrepancyBreakdown() {
    const ctx = document.getElementById('discrepancyChart');
    if (!ctx) return;

    const totals = scanData.reduce((acc, scan) => {
      acc.missedAvailable += scan.missed_available || 0;
      acc.missedReserved += scan.missed_reserved || 0;
      acc.newUnits += scan.new_units || 0;
      acc.undecodable += scan.undecodable_units || 0;
      return acc;
    }, { missedAvailable: 0, missedReserved: 0, newUnits: 0, undecodable: 0 });

    if (charts.discrepancy) {
      charts.discrepancy.destroy();
    }

    charts.discrepancy = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Missed (Available)', 'Missed (Reserved)', 'New Units', 'Undecodable'],
        datasets: [{
          data: [totals.missedAvailable, totals.missedReserved, totals.newUnits, totals.undecodable],
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // Render employee performance charts from Looker data
  function renderEmployeePerformanceCharts(employees) {
    if (!employees || employees.length === 0) return;

    // Top Performers Chart (from Looker data)
    const topPerformersCtx = document.getElementById('topPerformersChart');
    if (topPerformersCtx) {
      const top5 = employees.slice(0, 5);
      
      if (charts.topPerformers) {
        charts.topPerformers.destroy();
      }

      charts.topPerformers = new Chart(topPerformersCtx, {
        type: 'bar',
        data: {
          labels: top5.map(e => e.name),
          datasets: [{
            label: 'Accuracy %',
            data: top5.map(e => e.accuracy),
            backgroundColor: '#10b981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          indexAxis: 'y',
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: (value) => value + '%'
              }
            }
          }
        }
      });
    }

    // Most Missed Units Chart (from Looker data)
    const missedUnitsCtx = document.getElementById('missedUnitsChart');
    if (missedUnitsCtx) {
      const sortedByMissed = [...employees].sort((a, b) => b.missedReserved - a.missedReserved).slice(0, 5);
      
      if (charts.missedUnits) {
        charts.missedUnits.destroy();
      }

      charts.missedUnits = new Chart(missedUnitsCtx, {
        type: 'bar',
        data: {
          labels: sortedByMissed.map(e => e.name),
          datasets: [{
            label: 'Missed Reserved Units',
            data: sortedByMissed.map(e => e.missedReserved),
            backgroundColor: '#f59e0b'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          indexAxis: 'y',
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              beginAtZero: true
            }
          }
        }
      });
    }

    // Employee Comparison Chart
    const comparisonCtx = document.getElementById('employeeComparisonChart');
    if (comparisonCtx) {
      if (charts.employeeComparison) {
        charts.employeeComparison.destroy();
      }

      charts.employeeComparison = new Chart(comparisonCtx, {
        type: 'bar',
        data: {
          labels: employees.map(e => e.name),
          datasets: [
            {
              label: 'Accuracy %',
              data: employees.map(e => e.accuracy),
              backgroundColor: '#10b981',
              yAxisID: 'y'
            },
            {
              label: 'Counts Done',
              data: employees.map(e => e.countsDone),
              backgroundColor: '#3b82f6',
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: true, position: 'top' }
          },
          scales: {
            y: {
              type: 'linear',
              display: true,
              position: 'left',
              title: { display: true, text: 'Accuracy %' },
              max: 100
            },
            y1: {
              type: 'linear',
              display: true,
              position: 'right',
              title: { display: true, text: 'Counts Done' },
              grid: {
                drawOnChartArea: false
              }
            }
          }
        }
      });
    }
  }

  // Render employee performance table with scan KPIs only
  function renderEmployeePerformanceTable(employees) {
    const tbody = document.getElementById('employeePerformanceBody');
    const tfoot = document.getElementById('employeePerformanceTotals');
    if (!tbody || !employees || employees.length === 0) return;

    // Filter out employees with no scan data
    const employeesWithScans = employees.filter(emp => 
      emp.countsDone && emp.countsDone > 0 || emp.missedScans > 0
    );

    if (employeesWithScans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div><h3>No scan data available</h3></div></td></tr>';
      if (tfoot) tfoot.style.display = 'none';
      return;
    }

    // Calculate YTD totals
    let totalCountsDone = 0;
    let totalMissedScans = 0;
    let totalMissedAvailable = 0;
    let totalMissedReserved = 0;
    let totalExpected = 0;
    let totalCounted = 0;

    tbody.innerHTML = employeesWithScans.map(emp => {
      const accuracy = emp.accuracy ? emp.accuracy.toFixed(1) + '%' : '--';
      const countsDone = emp.countsDone ? emp.countsDone.toLocaleString() : '--';
      const missedScans = emp.missedScans ? emp.missedScans.toLocaleString() : '0';
      const missedAvailable = emp.missedAvailable ? emp.missedAvailable.toLocaleString() : '0';
      const missedReserved = emp.missedReserved ? emp.missedReserved.toLocaleString() : '0';
      
      // Accumulate totals
      totalCountsDone += emp.countsDone || 0;
      totalMissedScans += emp.missedScans || 0;
      totalMissedAvailable += emp.missedAvailable || 0;
      totalMissedReserved += emp.missedReserved || 0;
      totalExpected += emp.expectedUnits || 0;
      totalCounted += emp.countedUnits || 0;
      
      // Color code accuracy
      let accuracyClass = '';
      if (emp.accuracy >= 99) accuracyClass = 'style="color:#10b981;font-weight:600;"';
      else if (emp.accuracy >= 95) accuracyClass = 'style="color:#f59e0b;font-weight:600;"';
      else if (emp.accuracy > 0) accuracyClass = 'style="color:#ef4444;font-weight:600;"';
      
      // Color code missed scans
      let missedScansClass = '';
      if (emp.missedScans > 3) missedScansClass = 'style="color:#ef4444;font-weight:600;"';
      else if (emp.missedScans > 0) missedScansClass = 'style="color:#f59e0b;font-weight:600;"';
      
      return `
        <tr>
          <td style="font-weight:600;">${getEmployeeDisplayName(emp.name)}</td>
          <td ${accuracyClass}>${accuracy}</td>
          <td>${countsDone}</td>
          <td ${missedScansClass}>${missedScans}</td>
          <td>${missedAvailable}</td>
          <td>${missedReserved}</td>
        </tr>
      `;
    }).join('');

    // Display YTD totals
    if (tfoot) {
      const totalAccuracyPct = totalExpected > 0 ? ((totalCounted / totalExpected) * 100).toFixed(1) : '0.0';
      const totalAccuracyEl = document.getElementById('totalAccuracy');
      const totalCountsDoneEl = document.getElementById('totalCountsDone');
      const totalMissedScansEl = document.getElementById('totalMissedScans');
      const totalMissedAvailableEl = document.getElementById('totalMissedAvailable');
      const totalMissedReservedEl = document.getElementById('totalMissedReserved');
      
      if (totalAccuracyEl) {
        totalAccuracyEl.textContent = totalAccuracyPct + '%';
        // Color code total accuracy
        if (parseFloat(totalAccuracyPct) >= 99) totalAccuracyEl.style.color = '#10b981';
        else if (parseFloat(totalAccuracyPct) >= 95) totalAccuracyEl.style.color = '#f59e0b';
        else totalAccuracyEl.style.color = '#ef4444';
      }
      if (totalCountsDoneEl) totalCountsDoneEl.textContent = totalCountsDone.toLocaleString();
      if (totalMissedScansEl) {
        totalMissedScansEl.textContent = totalMissedScans.toLocaleString();
        // Color code total missed scans
        if (totalMissedScans > 10) totalMissedScansEl.style.color = '#ef4444';
        else if (totalMissedScans > 0) totalMissedScansEl.style.color = '#f59e0b';
      }
      if (totalMissedAvailableEl) totalMissedAvailableEl.textContent = totalMissedAvailable.toLocaleString();
      if (totalMissedReservedEl) totalMissedReservedEl.textContent = totalMissedReserved.toLocaleString();
      
      tfoot.style.display = '';
    }
  }

  // Top Performers Chart
  function renderTopPerformers() {
    const ctx = document.getElementById('topPerformersChart');
    if (!ctx) return;

    // Group by employee and calculate totals (not averages)
    const employeeStats = {};
    scanData.forEach(scan => {
      const employee = normalizeEmployeeEmail(scan.counted_by);
      if (!employeeStats[employee]) {
        employeeStats[employee] = { totalCounted: 0, totalExpected: 0 };
      }
      employeeStats[employee].totalCounted += parseInt(scan.counted_units) || 0;
      employeeStats[employee].totalExpected += parseInt(scan.expected_units) || 0;
    });

    // Calculate accuracy from totals and sort
    const performers = Object.entries(employeeStats)
      .map(([employee, stats]) => ({
        employee,
        avgAccuracy: stats.totalExpected > 0 ? (stats.totalCounted / stats.totalExpected) * 100 : 0
      }))
      .sort((a, b) => b.avgAccuracy - a.avgAccuracy)
      .slice(0, 5);

    // Create custom HTML layout with medals instead of chart
    const container = ctx.parentElement;
    const canvas = container.querySelector('canvas');
    
    // Hide canvas and create custom layout
    if (canvas) canvas.style.display = 'none';
    
    let existingList = container.querySelector('.top-performers-list');
    if (!existingList) {
      existingList = document.createElement('div');
      existingList.className = 'top-performers-list';
      container.appendChild(existingList);
    }

    // Medal emojis for top 3
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    
    existingList.innerHTML = performers.map((p, index) => {
      const displayName = getEmployeeDisplayName(p.employee);
      const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
      const accuracy = p.avgAccuracy.toFixed(1);
      
      return `
        <div class="performer-item" style="display: flex; align-items: center; gap: 16px; padding: 12px; margin-bottom: 8px; background: var(--background); border-radius: 8px; border: 2px solid ${index === 0 ? '#fbbf24' : index === 1 ? '#9ca3af' : index === 2 ? '#d97706' : 'var(--border)'};">
          <div style="font-size: 32px; min-width: 40px; text-align: center;">${medals[index]}</div>
          <div class="employee-avatar" style="width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; font-size: 18px; flex-shrink: 0;">
            ${initials}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 15px; color: var(--text); margin-bottom: 2px;">${displayName}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">Scan Accuracy</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 24px; font-weight: 700; color: #10b981;">${accuracy}%</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Most Missed Units Chart
  function renderMissedUnits() {
    const ctx = document.getElementById('missedUnitsChart');
    if (!ctx) return;

    // Group by employee and sum missed units
    const employeeStats = {};
    scanData.forEach(scan => {
      const employee = normalizeEmployeeEmail(scan.counted_by);
      if (!employeeStats[employee]) {
        employeeStats[employee] = 0;
      }
      employeeStats[employee] += (scan.missed_available || 0) + (scan.missed_reserved || 0);
    });

    // Sort and get top 5
    const topMissed = Object.entries(employeeStats)
      .map(([employee, missed]) => ({ employee, missed }))
      .sort((a, b) => b.missed - a.missed)
      .slice(0, 5);

    if (charts.missedUnits) {
      charts.missedUnits.destroy();
    }

    charts.missedUnits = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topMissed.map(p => getEmployeeDisplayName(p.employee)),
        datasets: [{
          label: 'Missed Units',
          data: topMissed.map(p => p.missed),
          backgroundColor: '#f59e0b'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            beginAtZero: true
          }
        }
      }
    });
  }

  // Employee Comparison Chart
  function renderEmployeeComparison() {
    const ctx = document.getElementById('employeeComparisonChart');
    if (!ctx) return;

    // Group by employee
    const employeeStats = {};
    scanData.forEach(scan => {
      const employee = normalizeEmployeeEmail(scan.counted_by);
      if (!employeeStats[employee]) {
        employeeStats[employee] = {
          expected: 0,
          counted: 0,
          missed: 0,
          newUnits: 0
        };
      }
      employeeStats[employee].expected += scan.expected_units;
      employeeStats[employee].counted += scan.counted_units;
      employeeStats[employee].missed += (scan.missed_available || 0) + (scan.missed_reserved || 0);
      employeeStats[employee].newUnits += scan.new_units || 0;
    });

    const employees = Object.keys(employeeStats);
    
    if (charts.employeeComparison) {
      charts.employeeComparison.destroy();
    }

    charts.employeeComparison = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: employees.map(email => getEmployeeDisplayName(email)),
        datasets: [
          {
            label: 'Expected',
            data: Object.values(employeeStats).map(s => s.expected),
            backgroundColor: '#60a5fa'
          },
          {
            label: 'Counted',
            data: Object.values(employeeStats).map(s => s.counted),
            backgroundColor: '#10b981'
          },
          {
            label: 'Missed',
            data: Object.values(employeeStats).map(s => s.missed),
            backgroundColor: '#ef4444'
          },
          {
            label: 'New',
            data: Object.values(employeeStats).map(s => s.newUnits),
            backgroundColor: '#8b5cf6'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  // Render details table
  function renderDetailsTable() {
    const tbody = document.getElementById('resultsTableBody');
    if (!tbody) return;
    
    if (filteredData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-secondary);">No data available</td></tr>';
      return;
    }

    // Sort by date descending
    const sortedData = [...filteredData].sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = sortedData.map(scan => {
      const accuracy = ((scan.counted_units / scan.expected_units) * 100).toFixed(1);
      const totalMissed = (scan.missed_available || 0) + (scan.missed_reserved || 0);
      const date = new Date(scan.scan_date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
      
      let accuracyColor = '#10b981';
      if (accuracy < 95) accuracyColor = '#ef4444';
      else if (accuracy < 99) accuracyColor = '#f59e0b';

      // Render scheduled scan status
      let scheduledScanBadge = '';
      const scanStatus = scan.scan_status || 'EXECUTED';
      const scheduledEmployee = scan.scheduled_employee;
      const actualEmployee = scan.counted_by;
      
      if (!scheduledEmployee) {
        // No scheduled employee - unscheduled scan
        scheduledScanBadge = '<span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#f3f4f6;color:#6b7280;">Unscheduled</span>';
      } else if (scanStatus === 'EXECUTED') {
        // Scheduled employee completed it
        scheduledScanBadge = `<span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;">✓ ${getEmployeeDisplayName(scheduledEmployee)}</span>`;
      } else if (scanStatus === 'COMPLETED_BY_OTHER') {
        // Different employee completed it
        scheduledScanBadge = `<span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#fef3c7;color:#92400e;">⚠️ By ${getEmployeeDisplayName(actualEmployee)}</span>`;
      } else if (scanStatus === 'SCHEDULED') {
        // Future scheduled scan
        scheduledScanBadge = `<span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#dbeafe;color:#1e40af;">⏳ ${getEmployeeDisplayName(scheduledEmployee)}</span>`;
      } else if (scanStatus === 'MISSED') {
        // Scheduled but not completed
        scheduledScanBadge = `<span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;">✗ ${getEmployeeDisplayName(scheduledEmployee)}</span>`;
      }

      return `
        <tr>
          <td>${date}</td>
          <td>${getEmployeeDisplayName(scan.counted_by)}</td>
          <td>${scheduledScanBadge}</td>
          <td>${scan.expected_units.toLocaleString()}</td>
          <td>${scan.counted_units.toLocaleString()}</td>
          <td>${totalMissed.toLocaleString()}</td>
          <td>${(scan.new_units || 0).toLocaleString()}</td>
          <td>${(scan.undecodable_units || 0).toLocaleString()}</td>
          <td style="color:${accuracyColor};font-weight:600;">${accuracy}%</td>
          <td><span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${scan.status === 'COMPLETED' ? '#d1fae5' : '#fee2e2'};color:${scan.status === 'COMPLETED' ? '#065f46' : '#991b1b'}">${scan.status}</span></td>
        </tr>
      `;
    }).join('');
  }

  // Setup filters
  function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const filterDateRange = document.getElementById('filterDateRange');
    const filterEmployee = document.getElementById('filterEmployee');
    const filterStatusKPI = document.getElementById('filterStatus');

    // Add date range filter listener
    if (filterDateRange) {
      filterDateRange.addEventListener('change', () => {
        updateDynamicLabels();
        loadScanData();
      });
    }

    // Add employee filter listener
    if (filterEmployee) {
      filterEmployee.addEventListener('change', () => {
        updateDynamicLabels();
        loadScanData();
      });
    }

    // Add status filter listener
    if (filterStatusKPI) {
      filterStatusKPI.addEventListener('change', () => {
        updateDynamicLabels();
        loadScanData();
      });
    }

    if (!searchInput || !statusFilter) return;

    const applyFilters = () => {
      const searchTerm = searchInput.value.toLowerCase();
      const statusValue = statusFilter.value;

      filteredData = scanData.filter(scan => {
        const matchesSearch = !searchTerm || 
          (scan.counted_by && scan.counted_by.toLowerCase().includes(searchTerm)) ||
          scan.scan_date.includes(searchTerm);
        
        const matchesStatus = !statusValue || scan.status === statusValue;

        return matchesSearch && matchesStatus;
      });

      renderDetailsTable();
    };

    searchInput.addEventListener('input', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
  }

  // Setup CSV import
  function setupImport() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput') || document.getElementById('csvFileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    if (!fileInput) return;

    // Enable upload button when file is selected
    if (uploadBtn) {
      fileInput.addEventListener('change', (e) => {
        uploadBtn.disabled = e.target.files.length === 0;
        const statusEl = document.getElementById('uploadStatus');
        if (statusEl && e.target.files.length > 0) {
          statusEl.textContent = `Ready to upload: ${e.target.files[0].name}`;
        }
      });

      uploadBtn.addEventListener('click', () => {
        if (fileInput.files.length > 0) {
          handleFileUpload(fileInput.files[0]);
        }
      });
    }

    // Drag and drop handlers (if dropZone exists)
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          handleFileUpload(files[0]);
        }
      });
    }

    // Direct file input change (fallback)
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0 && !uploadBtn) {
        // Auto-upload if no button (old behavior)
        handleFileUpload(e.target.files[0]);
      }
    });

    const historyBody = document.getElementById('importHistoryBody');
    if (historyBody) {
      loadImportHistory();
    }
  }

  // Handle file upload
  async function handleFileUpload(file) {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    const progressDiv = document.getElementById('importProgress');
    const progressBar = document.getElementById('importProgressBar');
    const progressPercent = document.getElementById('importPercent');
    const progressStatus = document.getElementById('importStatus');
    const uploadStatus = document.getElementById('uploadStatus');

    if (uploadStatus) uploadStatus.textContent = 'Uploading...';
    if (progressDiv) progressDiv.style.display = 'block';
    if (progressStatus) progressStatus.textContent = 'Reading file...';

    try {
      const response = await fetch('/api/gameplan/daily-scan/import', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (progressBar) progressBar.style.width = '50%';
      if (progressPercent) progressPercent.textContent = '50%';
      if (progressStatus) progressStatus.textContent = 'Processing records...';

      if (response.ok) {
        const result = await response.json();

        const imported = result.imported || 0;
        const updated = result.updated || 0;
        const skipped = result.skipped || 0;
        const summary = `Imported ${imported}, Updated ${updated}, Skipped ${skipped}`;
        
        if (progressBar) progressBar.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
        if (progressStatus) progressStatus.textContent = `Success: ${summary}`;
        if (uploadStatus) uploadStatus.textContent = `✓ ${summary}`;

        setTimeout(() => {
          if (progressDiv) progressDiv.style.display = 'none';
          if (progressBar) progressBar.style.width = '0%';
          if (progressPercent) progressPercent.textContent = '0%';
          
          // Reload data
          loadScanData();
          const historyBody = document.getElementById('importHistoryBody');
          if (historyBody) loadImportHistory();
          
          // Reset file input
          const fileInput = document.getElementById('csvFileInput');
          if (fileInput) fileInput.value = '';
          const uploadBtn = document.getElementById('uploadBtn');
          if (uploadBtn) uploadBtn.disabled = true;
        }, 2000);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      if (progressStatus) progressStatus.textContent = `Error: ${error.message}`;
      if (uploadStatus) uploadStatus.textContent = `✗ Error: ${error.message}`;
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.style.background = '#ef4444';
      }
      
      setTimeout(() => {
        if (progressDiv) progressDiv.style.display = 'none';
        if (progressBar) progressBar.style.background = '#3b82f6';
      }, 3000);
    }
  }

  // Load import history
  async function loadImportHistory() {
    try {
      const response = await fetch('/api/gameplan/daily-scan/import-history', {
        credentials: 'include'
      });

      if (response.ok) {
        const history = await response.json();
        const tbody = document.getElementById('importHistoryBody');
        
        if (history.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-secondary);">No imports yet</td></tr>';
          return;
        }

        tbody.innerHTML = history.map(item => {
          const date = new Date(item.imported_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          
          return `
            <tr>
              <td>${date}</td>
              <td>${item.records_count}</td>
              <td>${item.imported_by}</td>
              <td><span style="padding:4px 8px;border-radius:12px;font-size:11px;font-weight:600;background:#d1fae5;color:#065f46;">SUCCESS</span></td>
            </tr>
          `;
        }).join('');
      }
    } catch (error) {
      console.error('Error loading import history:', error);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

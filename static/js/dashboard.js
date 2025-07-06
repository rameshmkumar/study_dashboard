document.addEventListener('DOMContentLoaded', async function() {
  // --- Global State & Configuration ---
  let dailyTasks = []; // Holds tasks for the current day, fetched from backend
  let currentSelectedTaskId = null; // DB ID of the task selected for the timer
  let timerInterval = null;
  let currentSessionId = null; // Session ID for current timer
  let serverSyncInterval = null; // Interval for syncing with server
  let timerState = 'stopped'; // stopped, running, paused
  let currentViewDate = new Date(); // Current date being viewed
  let focusModeActive = false; // Focus mode state

  // --- Client-Side Timer Variables (Quick Fix for Scalability) ---
  let clientTimerStartTime = null; // When timer started (client-side)
  let baseTimeSpent = 0; // Base time from server when timer started
  let lastSyncTime = null; // Last time we synced with server

  // DOM elements
  const timerDisplay = document.getElementById('timerDisplay');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const stopBtn = document.getElementById('stopBtn');
  const currentTaskLabel = document.getElementById('currentTaskLabel');
  const taskOptionsContainer = document.getElementById('taskOptions'); // Renamed for clarity
  const scheduleTableBody = document.getElementById('scheduleTableBody');
  const activityLog = document.getElementById('activityLog');
  const notification = document.getElementById('notification');
  // Note: Removed dailyNotes and saveNotesBtn as we now use individual notes only
  const currentTimeEl = document.getElementById('currentTime');
  const currentDateEl = document.getElementById('currentDate');
  const progressBar = document.getElementById('progressBar');
  const progressPercent = document.getElementById('progressPercent');
  const completedTasksEl = document.getElementById('completedTasks');
  const timeWorkedEl = document.getElementById('timeWorked');
  const streakValueEl = document.getElementById('streakValue');
  const streakContainer = document.getElementById('streakContainer');
  const taskSummaryList = document.getElementById('taskSummary'); // Renamed for clarity
  const addTaskBtn = document.getElementById('addTaskBtn'); // New button
  const addTaskModal = document.getElementById('addTaskModal'); // New modal
  const closeAddTaskModalBtn = document.getElementById('closeAddTaskModalBtn'); // New
  const addTaskForm = document.getElementById('addTaskForm'); // New
  
  // Notes elements
  const addNoteBtn = document.getElementById('addNoteBtn');
  const addNoteModal = document.getElementById('addNoteModal');
  const closeAddNoteModalBtn = document.getElementById('closeAddNoteModalBtn');
  const addNoteForm = document.getElementById('addNoteForm');
  const notesList = document.getElementById('notesList');
  
  // Date navigation elements
  const datePicker = document.getElementById('datePicker');
  const prevDateBtn = document.getElementById('prevDateBtn');
  const nextDateBtn = document.getElementById('nextDateBtn');
  
  // Focus mode toggle
  const focusModeToggle = document.getElementById('focusModeToggle');

  // --- Client-Side Timer Functions (Quick Fix for Scalability) ---
  function getCurrentElapsedTime() {
    if (timerState !== 'running' || !clientTimerStartTime) {
      return baseTimeSpent;
    }
    // Calculate elapsed time since timer started
    const elapsed = Date.now() - clientTimerStartTime;
    return baseTimeSpent + elapsed;
  }
  
  // Sync timer with server data when tab becomes visible
  // Debounce sync operations to prevent conflicts
  let syncTimeout = null;
  function debouncedSync() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      syncTimerWithServer();
    }, 1000); // Wait 1 second before syncing
  }

  function startClientTimer(taskTimeSpent = 0) {
    clientTimerStartTime = Date.now();
    baseTimeSpent = taskTimeSpent;
    lastSyncTime = Date.now();
  }

  function stopClientTimer() {
    const finalTime = getCurrentElapsedTime();
    clientTimerStartTime = null;
    baseTimeSpent = 0;
    lastSyncTime = null;
    return finalTime;
  }

  // --- API Helper Functions ---
  let csrfToken = null;
  
  // Get CSRF token for API requests
  async function getCsrfToken() {
    if (!csrfToken) {
      try {
        const response = await fetch('/api/csrf-token');
        if (response.ok) {
          const data = await response.json();
          csrfToken = data.csrf_token;
        }
      } catch (error) {
        console.error('Failed to get CSRF token:', error);
      }
    }
    return csrfToken;
  }

  async function fetchData(url = '', method = 'GET', data = null) {
    const config = {
      method: method,
      headers: { 
        'Content-Type': 'application/json',
        'Connection': 'keep-alive' // Optimize connection reuse
      },
    };
    
    // Add CSRF token for state-changing requests
    if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
      const token = await getCsrfToken();
      if (token) {
        config.headers['X-CSRFToken'] = token;
      }
    }
    
    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }
    try {
      const response = await fetch(url, config);
      if (response.status === 401) { // Unauthorized
        window.location.href = '/login'; // Redirect to login
        return null;
      }
      if (response.status === 400 && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        // CSRF token might be expired, refresh and retry once
        csrfToken = null;
        const newToken = await getCsrfToken();
        if (newToken && config.headers['X-CSRFToken'] !== newToken) {
          config.headers['X-CSRFToken'] = newToken;
          return fetchData(url, method, data); // Retry once
        }
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
        console.error('API Error:', response.status, errorData);
        showNotification(`Error: ${errorData.message || response.statusText}`, 'error');
        return null;
      }
      if (response.status === 204 || response.headers.get("content-length") === "0" ) return true; // No content for DELETE
      return response.json();
    } catch (error) {
      console.error('Network or parsing error:', error);
      showNotification('Network error. Please try again.', 'error');
      return null;
    }
  }

  function getTodayDateString() {
    return getDateString(new Date());
  }
  
  function getCurrentViewDateString() {
    return getDateString(currentViewDate);
  }
  
  function getDateString(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- Core App Logic ---
  async function initApp() {
    // Initialize theme first
    initializeTheme();
    
    // Initialize date picker with today's date
    if (datePicker) {
      datePicker.value = getCurrentViewDateString();
    }
    
    await loadDataForDate(getCurrentViewDateString());
    
    // Check for existing running timer and resume if found (only for today)
    if (getCurrentViewDateString() === getTodayDateString()) {
      await checkForRunningTimer();
    }
    
    setupDateNavigation();
    
    // Event listeners
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    stopBtn.addEventListener('click', stopTimer);
    
    // Tab visibility detection to fix timer sync issues
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        // Tab became visible - resync timer with debouncing
        console.log('Tab became visible, scheduling timer sync...');
        debouncedSync();
      }
    });
    
    // Window focus detection as backup
    window.addEventListener('focus', function() {
      setTimeout(() => {
        console.log('Window focused, scheduling timer sync...');
        debouncedSync();
      }, 100); // Small delay to ensure tab is fully active
    });
    
    if(addTaskBtn) addTaskBtn.addEventListener('click', () => {
      // Set current time as default
      setCurrentTimeAsDefault();
      addTaskModal.style.display = 'block';
      
      // Make time input fully clickable after a brief delay to ensure modal is rendered
      setTimeout(() => {
        setupTimeInputClickHandler();
      }, 100);
    });
    if(closeAddTaskModalBtn) closeAddTaskModalBtn.addEventListener('click', () => {
      addTaskModal.style.display = 'none';
      addTaskForm.reset();
      // Reset modal title and button text in case it was in edit mode
      document.getElementById('addTaskModalTitle').textContent = "Add New Task";
      document.getElementById('addTaskSubmitBtn').textContent = "Add Task";
      addTaskForm.onsubmit = handleAddTask; // Reset to default add handler
    });
    if(addTaskForm) addTaskForm.addEventListener('submit', handleAddTask);
    
    // Notes event listeners
    if(addNoteBtn) addNoteBtn.addEventListener('click', () => {
      // Clear any edit mode state
      delete addNoteForm.dataset.editing;
      document.getElementById('addNoteModalTitle').textContent = "Add New Note";
      document.getElementById('addNoteSubmitBtn').textContent = "Add Note";
      addNoteModal.style.display = 'block';
    });
    if(closeAddNoteModalBtn) closeAddNoteModalBtn.addEventListener('click', () => {
      addNoteModal.style.display = 'none';
      delete addNoteForm.dataset.editing; // Clear edit mode when closing
    });
    if(addNoteForm) addNoteForm.addEventListener('submit', handleAddNote);
    
    // Focus mode toggle
    if(focusModeToggle) focusModeToggle.addEventListener('click', toggleFocusMode);

    window.onclick = function(event) {
        if (event.target == addTaskModal) {
            addTaskModal.style.display = "none";
            addTaskForm.reset();
            // Reset modal title and button text in case it was in edit mode
            document.getElementById('addTaskModalTitle').textContent = "Add New Task";
            document.getElementById('addTaskSubmitBtn').textContent = "Add Task";
            addTaskForm.onsubmit = handleAddTask; // Reset to default add handler
        }
        if (event.target == addNoteModal) {
            addNoteModal.style.display = "none";
            delete addNoteForm.dataset.editing; // Clear edit mode when closing
        }
    }
    
    setInterval(updateDateTime, 1000 * 30); // Update time less frequently
    setInterval(refreshDataPeriodically, 1000 * 60 * 5); // Refresh data every 5 mins
  }

  async function refreshDataPeriodically() {
    if (timerState === 'running') return; // Don't refresh if timer is active
    const dateString = getTodayDateString();
    const summaryData = await fetchData(`/api/daily-summary?date=${dateString}`);
    if (!summaryData) return;

    dailyTasks = summaryData.tasks || [];
    renderSchedule();
    renderTaskOptions();
    updateAllStats();
    // Potentially update notes and activity log if needed, or assume they are managed by user actions mostly
  }
  
  // --- Timer Functions (Server-Side) ---
  function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  async function startTimer() {
    try {
      if (currentSelectedTaskId === null) {
        showNotification('Please select a task first.', 'warning');
        return;
      }
      
      const task = getTaskById(currentSelectedTaskId);
      if (!task || task.status === 'completed') {
          showNotification('Cannot start a completed task or task not found.', 'warning');
          return;
      }

      // Only allow timer for today's tasks
      if (getCurrentViewDateString() !== getTodayDateString()) {
        showNotification('You can only start timers for today\'s tasks.', 'warning');
        return;
      }

      // Generate new session ID
      currentSessionId = generateSessionId();
      
      // Update UI immediately for responsiveness
      timerState = 'running';
      if (startBtn) startBtn.disabled = true;
      if (pauseBtn) pauseBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = false;
      
      // Start client timer with current time spent
      startClientTimer(task.time_spent || 0);
      
      // Start local timer display immediately
      clearInterval(timerInterval);
      timerInterval = setInterval(updateTimerDisplay, 100);
      
      // Disable task switching
      if (taskOptionsContainer) {
        taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'none');
      }
      
      // Send to server in background (non-blocking)
      fetchData('/api/timer/start', 'POST', {
        task_id: currentSelectedTaskId,
        session_id: currentSessionId
      }).then(result => {
        if (!result || result.status !== 'success') {
          // Revert UI changes if server call failed
          timerState = 'stopped';
          if (startBtn) startBtn.disabled = false;
          if (pauseBtn) pauseBtn.disabled = true;
          if (stopBtn) stopBtn.disabled = true;
          clearInterval(timerInterval);
          if (taskOptionsContainer) {
            taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'auto');
          }
          showNotification('Failed to start timer. Please try again.', 'error');
          return;
        }
        
        // Update local task state with server response
        if (task) {
          task.status = 'in-progress';
          task.timer_session_id = currentSessionId;
        }
        
        // Start server sync interval
        clearInterval(serverSyncInterval);
        serverSyncInterval = setInterval(syncTimerWithServer, 60000);
        
        // Log activity
        addActivityLog(`Started working on: ${task.title}`, task.id);
        
        showNotification('Timer started!');
        updateAllStats();
      }).catch(error => {
        console.error('Error starting timer on server:', error);
        // Revert UI changes if server call failed
        timerState = 'stopped';
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = true;
        clearInterval(timerInterval);
        if (taskOptionsContainer) {
          taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'auto');
        }
        showNotification('Failed to start timer. Please try again.', 'error');
      });
    } catch (error) {
      console.error('Error starting timer:', error);
      showNotification('An error occurred while starting the timer.', 'error');
    }
  }
  
  async function pauseTimer() {
    try {
      if (timerState !== 'running' || !currentSelectedTaskId || !currentSessionId) {
        showNotification('No active timer to pause.', 'warning');
        return;
      }
      
      // Get client-calculated time before pausing
      const finalTime = getCurrentElapsedTime();
      
      const result = await fetchData('/api/timer/pause', 'POST', {
        task_id: currentSelectedTaskId,
        session_id: currentSessionId,
        client_time: finalTime
      });
      
      if (!result) {
        showNotification('Failed to pause timer. Please try again.', 'error');
        return;
      }
      
      if (result.status === 'success') {
        timerState = 'paused';
        
        // Update local task state
        const task = getTaskById(currentSelectedTaskId);
        if (task) {
          task.status = 'paused';
          task.time_spent = result.time_spent;
          addActivityLog(`Paused task: ${task.title}`, task.id);
        }
        
        // Stop intervals
        clearInterval(timerInterval);
        clearInterval(serverSyncInterval);
        
        // Update UI
        if (startBtn) startBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = true;
        if (taskOptionsContainer) {
          taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'auto');
        }
        
        showNotification(`Timer paused! Session time: ${formatDuration(result.elapsed_in_session)}`);
        updateAllStats();
      } else {
        showNotification(result.error || 'Failed to pause timer', 'error');
      }
    } catch (error) {
      console.error('Error pausing timer:', error);
      showNotification('An error occurred while pausing the timer.', 'error');
    }
  }
  
  async function stopTimer() {
    try {
      if (timerState === 'stopped' || !currentSelectedTaskId || !currentSessionId) {
        showNotification('No active timer to stop.', 'warning');
        return;
      }

      // Get client-calculated time before stopping
      const finalTime = stopClientTimer();
      
      // Update UI immediately for responsiveness
      timerState = 'stopped';
      clearInterval(timerInterval);
      clearInterval(serverSyncInterval);
      
      // Reset UI states
      if (startBtn) startBtn.disabled = false;
      if (pauseBtn) pauseBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = true;
      if (taskOptionsContainer) {
        taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'auto');
      }
      
      // Send to server in background
      fetchData('/api/timer/stop', 'POST', {
        task_id: currentSelectedTaskId,
        session_id: currentSessionId,
        client_time: finalTime
      }).then(result => {
        if (!result || result.status !== 'success') {
          showNotification('Failed to stop timer on server, but stopped locally.', 'warning');
          return;
        }
        const task = getTaskById(currentSelectedTaskId);
        if (task) {
          task.status = 'completed';
          task.time_spent = result.time_spent;
        }
        
        showNotification(`Task completed! Total time: ${formatDuration(result.time_spent)}`);
        resetTimerUI();
        renderSchedule();
        updateAllStats();
      }).catch(error => {
        console.error('Error stopping timer on server:', error);
        showNotification('Timer stopped locally, but server sync failed.', 'warning');
      });
      
      // Reset timer state regardless
      currentSelectedTaskId = null;
      currentSessionId = null;
    } catch (error) {
      console.error('Error stopping timer:', error);
      showNotification('An error occurred while stopping the timer.', 'error');
    }
  }

  async function syncTimerWithServer() {
    if (timerState !== 'running' || !currentSelectedTaskId || !currentSessionId) return;
    
    // Send client-calculated time to server for backup
    const clientTime = getCurrentElapsedTime();
    
    const result = await fetchData('/api/timer/sync', 'POST', {
      task_id: currentSelectedTaskId,
      session_id: currentSessionId,
      client_time: clientTime  // Send our calculated time
    });
    
    if (!result) return;
    
    if (result.status === 'session_invalid') {
      showNotification('Timer session expired. Please restart the timer.', 'warning');
      resetTimerUI();
      return;
    }
    
    if (result.status === 'success') {
      // Update sync time but keep using client-side calculation
      lastSyncTime = Date.now();
      
      // Optionally update base time if server and client differ significantly
      const serverTime = result.time_spent || 0;
      const timeDifference = Math.abs(clientTime - serverTime);
      
      if (timeDifference > 10000) { // More than 10 seconds difference
        console.log('Large time difference detected, syncing with server');
        baseTimeSpent = serverTime;
        clientTimerStartTime = Date.now();
      }
    }
  }

  function resetTimerUI() {
    timerState = 'stopped';
    currentSessionId = null;
    
    // Clean up client-side timer
    stopClientTimer();
    
    // Clear intervals
    clearInterval(timerInterval);
    clearInterval(serverSyncInterval);
    
    // Reset display
    timerDisplay.textContent = formatTime(0);
    currentSelectedTaskId = null;
    currentTaskLabel.textContent = 'No active task';
    
    // Reset buttons
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    
    // Re-enable task selection
    taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'auto');
    document.querySelectorAll('.task-option.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.schedule-item.selected-task').forEach(el => el.classList.remove('selected-task'));
  }

  function updateTimerDisplay() {
    // Client-side timer display update (no server polling!)
    if (timerState !== 'running' || !currentSelectedTaskId) {
      // If timer is not running, just display current task time
      const task = getTaskById(currentSelectedTaskId);
      if (task && timerDisplay) {
        timerDisplay.textContent = formatTime(task.time_spent || 0);
      }
      return;
    }
    
    // Calculate current time client-side
    const currentTime = getCurrentElapsedTime();
    
    // Update display immediately (no waiting for server!)
    if (timerDisplay) {
      timerDisplay.textContent = formatTime(currentTime);
    }
    
    // Update local task data for other UI elements
    const task = getTaskById(currentSelectedTaskId);
    if (task) {
      task.time_spent = currentTime;
    }
  }

  // Resume timer functionality - check for existing running timers on page load
  async function checkForRunningTimer() {
    try {
      const dateString = getTodayDateString();
      const summaryData = await fetchData(`/api/daily-summary?date=${dateString}`);
      
      if (!summaryData || !summaryData.tasks) return;
      
      // Find any task with in-progress status and active timer
      const runningTask = summaryData.tasks.find(task => 
        task.status === 'in-progress' && task.timer_session_id
      );
      
      if (runningTask) {
        console.log('Found running timer for task:', runningTask.title, 'Timer start time:', runningTask.timer_start_time);
        
        // Set timer state variables first
        currentSelectedTaskId = runningTask.id;
        currentSessionId = runningTask.timer_session_id;
        timerState = 'running';
        
        // Calculate current elapsed time based on server timer_start_time
        let currentElapsed = runningTask.time_spent || 0;
        if (runningTask.timer_start_time) {
          const timerStartTime = new Date(runningTask.timer_start_time);
          const now = new Date();
          const sessionElapsed = now.getTime() - timerStartTime.getTime();
          
          // Validate timer session age - reject if older than 24 hours
          const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
          if (sessionElapsed > maxSessionAge || sessionElapsed < 0) {
            console.log('Timer session too old or invalid, resetting:', Math.round(sessionElapsed / 1000), 'seconds');
            // Clean up stale timer session
            await fetchData('/api/timer/cleanup', 'POST', {
              task_id: runningTask.id,
              session_id: runningTask.timer_session_id
            });
            showNotification('Stale timer session detected and cleaned up', 'warning');
            return;
          }
          
          currentElapsed = (runningTask.time_spent || 0) + sessionElapsed;
          console.log('Calculated elapsed time:', Math.round(currentElapsed / 1000), 'seconds');
        }
        
        // Start client-side timer from calculated current time
        startClientTimer(currentElapsed);
        
        // Update UI components
        if (currentTaskLabel) currentTaskLabel.textContent = runningTask.title;
        
        // Update timer display immediately
        updateTimerDisplay();
        
        // Update task selection UI
        selectTaskForTimer(runningTask.id, true); // Prevent new session
        
        // Set button states
        if (startBtn) startBtn.disabled = true;
        if (pauseBtn) pauseBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
        
        // Start intervals
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimerDisplay, 100); // More frequent updates
        clearInterval(serverSyncInterval);
        serverSyncInterval = setInterval(syncTimerWithServer, 60000); // Every minute for better sync
        
        // Disable task switching during active timer
        if (taskOptionsContainer) {
          taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'none');
        }
        
        showNotification('Resumed existing timer session!', 'success');
      }
    } catch (error) {
      console.error('Error checking for running timer:', error);
    }
  }

  // --- Data Handling & Rendering ---
  function getTaskById(id) {
    return dailyTasks.find(task => task.id === id);
  }
  
  function selectTaskForTimer(taskId, preventNewSession = false) {
    if (timerState === 'running' && !preventNewSession) {
      showNotification("Please stop or pause the current task before switching.", 'warning');
      return;
    }
    
    const task = getTaskById(taskId);
    if (!task || task.status === 'completed') {
        showNotification('This task is completed or not found.', 'warning');
        if (currentSelectedTaskId === taskId) resetTimerUI();
        return;
    }

    currentSelectedTaskId = taskId;
    currentTaskLabel.textContent = task.title;
    timerDisplay.textContent = formatTime(task.time_spent);

    // Update UI for selection
    taskOptionsContainer.querySelectorAll('.task-option').forEach(el => el.classList.remove('selected'));
    const taskOptionEl = document.getElementById(`taskOption-${taskId}`);
    if (taskOptionEl) taskOptionEl.classList.add('selected');
    
    // Fix: Use correct selector and class names
    scheduleTableBody.querySelectorAll('.schedule-item').forEach(row => row.classList.remove('selected-task'));
    const scheduleRowEl = document.getElementById(`scheduleRow-${taskId}`);
    if (scheduleRowEl) scheduleRowEl.classList.add('selected-task');
    
    // Update button states based on task status and timer state
    if (task.status === 'in-progress' && timerState === 'running') {
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
    } else if (task.status === 'paused' || timerState === 'stopped') {
      startBtn.disabled = false;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
    }
  }
  
  async function updateTaskStatusOnBackend(taskId, status, timeSpent) {
    const task = getTaskById(taskId);
    if (!task) return;

    task.status = status;
    task.time_spent = timeSpent; // Ensure local JS object reflects this for timer display

    // API call to update status and time_spent
    const result = await fetchData(`/api/user-tasks/${taskId}/status`, 'PUT', {
      status: task.status,
      time_spent: task.time_spent // Send the total accumulated time
    });

    if (result) {
        renderSchedule(); // Re-render the schedule to reflect status changes
        renderTaskOptions(); // Re-render task options in case status affects them
        updateAllStats();
    } else {
        // Handle error, maybe revert local state or notify user
        showNotification('Failed to update task status.', 'error');
    }
  }

  function renderSchedule() {
    scheduleTableBody.innerHTML = '';
    const sortedTasks = [...dailyTasks].sort((a,b) => {
        if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
        if (a.start_time) return -1;
        if (b.start_time) return 1;
        return a.id - b.id; // Fallback to creation order if no times
    });

    if (sortedTasks.length === 0) {
        scheduleTableBody.innerHTML = '<div class="schedule-loading">No tasks scheduled for today. Add one!</div>';
        return;
    }

    sortedTasks.forEach(task => {
      const item = document.createElement('div');
      item.id = `scheduleRow-${task.id}`;
      item.className = 'schedule-item';
      if (task.status === 'in-progress') item.classList.add('current-task');
      if (task.status === 'completed') item.classList.add('completed-task');
      if (task.status === 'paused') item.classList.add('paused-task');
      if (currentSelectedTaskId === task.id && task.status !== 'completed') item.classList.add('selected-task'); // Use separate class for selection
      
      let timeDisplay = task.start_time || 'Any Time';
      if (task.start_time && task.duration_minutes) {
        const [hours, minutes] = task.start_time.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + task.duration_minutes * 60000);
        timeDisplay = `${task.start_time} - ${endDate.getHours().toString().padStart(2,'0')}:${endDate.getMinutes().toString().padStart(2,'0')}`;
      } else if (task.duration_minutes) {
        timeDisplay += ` (${task.duration_minutes}m)`;
      }

      const isCriticalTask = ['Project Building', 'Targeted Practice', 'Cloud Learning', 'Job Application'].includes(task.title);

      item.innerHTML = `
        <div class="schedule-item-time">${timeDisplay}</div>
        <div class="schedule-item-focus">
          <div class="schedule-item-title">${isCriticalTask ? `<span class="task-focus-highlight">${task.title}</span>` : task.title}</div>
          ${task.description ? `<div class="schedule-item-description">${task.description}</div>` : ''}
        </div>
        <div class="schedule-item-status">
          <div id="statusIndicator-${task.id}" class="status-indicator ${task.status}"></div>
        </div>
        <div class="schedule-item-actions">
          <button class="btn-tiny select-btn" data-task-id="${task.id}" ${task.status === 'completed' ? 'disabled' : ''}>${currentSelectedTaskId === task.id ? 'Selected' : 'Select'}</button>
          <button class="btn-tiny edit-btn" data-task-id="${task.id}" ${task.status === 'completed' ? 'disabled' : ''}>Edit</button>
          <button class="btn-tiny delete-btn" data-task-id="${task.id}">Del</button>
        </div>`;
      
      item.querySelector('.select-btn').addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent row click if button is distinct
          selectTaskForTimer(task.id);
      });
      item.querySelector('.edit-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openEditTaskModal(task.id);
      });
      item.querySelector('.delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          handleDeleteTask(task.id);
      });

      // Optional: Clicking item also selects task IF not completed
      item.addEventListener('click', () => {
        if (task.status !== 'completed') {
            selectTaskForTimer(task.id);
        }
      });
      scheduleTableBody.appendChild(item);
    });
  }
  
  function renderTaskOptions() {
    taskOptionsContainer.innerHTML = '';
    const activeTasks = dailyTasks.filter(task => task.status !== 'completed');
    
    if (activeTasks.length === 0) {
        taskOptionsContainer.innerHTML = '<p style="color: var(--secondary-text); font-size: 0.9em;">No active tasks to select. Add a task or enjoy your break!</p>';
    }

    activeTasks.forEach(task => {
      const option = document.createElement('div');
      option.id = `taskOption-${task.id}`;
      option.className = 'task-option';
      if (currentSelectedTaskId === task.id) option.classList.add('selected');
      if (task.status === 'paused') option.classList.add('paused');
      
      let displayText = task.title;
      if (task.status === 'paused') displayText += ' (Paused)';
      if (task.status === 'in-progress') displayText += ' (Running)';
      
      option.textContent = displayText;
      option.addEventListener('click', () => selectTaskForTimer(task.id));
      taskOptionsContainer.appendChild(option);
    });
  }
  
  async function addActivityLog(message, taskDbId = null) {
    const result = await fetchData('/api/activity/log', 'POST', { message, task_db_id: taskDbId });
    if (result) {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const logEl = document.createElement('div');
      logEl.className = 'activity-item';
      logEl.innerHTML = `${message}<div class="activity-time">${timeString}</div>`;
      if (activityLog.firstChild && activityLog.firstChild.textContent === "No activity yet today") {
        activityLog.innerHTML = ''; // Clear placeholder
      }
      activityLog.prepend(logEl); // Add to top
    }
  }
  
  function renderActivityLog(logs) {
    activityLog.innerHTML = '';
    if (!logs || logs.length === 0) {
      activityLog.innerHTML = '<div class="activity-item" style="text-align:center; color:var(--secondary-text);">No activity yet today</div>';
      return;
    }
    logs.forEach(log => {
      const logEl = document.createElement('div');
      logEl.className = 'activity-item';
      const timeString = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      logEl.innerHTML = `${log.message}<div class="activity-time">${timeString}</div>`;
      activityLog.appendChild(logEl); // Original appends, but prepend might be better for recent first. Keeping as append for now.
    });
  }

  function renderStreak(streakCount) {
    streakContainer.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const day = document.createElement('div');
      day.className = 'streak-day';
      if (i < streakCount) {
         day.classList.add('completed');
      }
      streakContainer.appendChild(day);
    }
    streakValueEl.textContent = `${streakCount} day${streakCount !== 1 ? 's' : ''}`;
  }
  
  async function saveNotes() {
    const result = await fetchData('/api/notes/save', 'POST', { 
        date: getTodayDateString(),
        notes: dailyNotes.value 
    });
    if (result) {
        showNotification('Notes saved successfully');
    }
  }

  function updateAllStats() {
      const totalTasks = dailyTasks.length; // Or filter out breaks if tasks can be marked as break
      const completedTasksCount = dailyTasks.filter(t => t.status === 'completed').length;
      let totalTimeWorkedMs = 0;
      dailyTasks.forEach(t => totalTimeWorkedMs += (t.time_spent || 0));

      completedTasksEl.textContent = `${completedTasksCount}/${totalTasks}`;
      timeWorkedEl.textContent = formatDuration(totalTimeWorkedMs);
      
      const progressPercentage = totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;
      progressBar.style.width = `${progressPercentage}%`;
      progressPercent.textContent = `${progressPercentage}%`;
      
      renderTaskSummary();
      // Streak is updated via initApp or refreshData
  }

  function renderTaskSummary() {
    taskSummaryList.innerHTML = '';
    const categoryTimes = {};
    dailyTasks.forEach(task => {
      if (task.time_spent > 0) {
        // Could categorize tasks if they had a 'category' field
        // For now, just summarize by title
        categoryTimes[task.title] = (categoryTimes[task.title] || 0) + task.time_spent;
      }
    });
    
    if (Object.keys(categoryTimes).length === 0) {
        taskSummaryList.innerHTML = '<li class="summary-item" style="justify-content:center; color:var(--secondary-text);">No time tracked yet.</li>';
        return;
    }

    Object.entries(categoryTimes).forEach(([category, time]) => {
      const item = document.createElement('li');
      item.className = 'summary-item';
      item.innerHTML = `
        <span class="summary-label">${category}</span>
        <span class="summary-value">${formatDuration(time)}</span>`;
      taskSummaryList.appendChild(item);
    });
  }

  // --- Task CRUD ---
  async function handleAddTask(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('addTaskSubmitBtn');
    
    // Prevent duplicate submissions
    if (submitBtn.disabled) {
        return;
    }
    
    const title = document.getElementById('newTaskTitle').value;
    const description = document.getElementById('newTaskDescription').value;
    const startTime = document.getElementById('newTaskStartTime').value;
    const duration = document.getElementById('newTaskDuration').value;

    if (!title) {
        showNotification('Task title is required.', 'warning');
        return;
    }

    // Disable submit button and show loading state
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';

    const newTaskData = {
        entry_date: getTodayDateString(),
        title,
        description,
        start_time: startTime || null, // Ensure empty string becomes null for DB
        duration_minutes: duration ? parseInt(duration) : null,
    };

    try {
        const createdTask = await fetchData('/api/user-tasks', 'POST', newTaskData);
        if (createdTask) {
            dailyTasks.push(createdTask);
            addActivityLog(`Added task: ${createdTask.title}`);
            renderSchedule();
            renderTaskOptions();
            updateAllStats();
            addTaskModal.style.display = 'none';
            addTaskForm.reset();
            showNotification('Task added successfully!');
        }
    } finally {
        // Re-enable submit button
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Task';
    }
  }

  function openEditTaskModal(taskId) {
    const task = getTaskById(taskId);
    if (!task) return;

    // Populate a general modal or redirect to a specific edit page.
    // For simplicity, let's re-use the add task modal structure if possible,
    // or create a new dedicated edit modal.
    // This example assumes you might re-purpose addTaskModal or have a similar one.
    // You'd need to populate form fields:
    document.getElementById('newTaskTitle').value = task.title;
    document.getElementById('newTaskDescription').value = task.description || '';
    document.getElementById('newTaskStartTime').value = task.start_time || '';
    document.getElementById('newTaskDuration').value = task.duration_minutes || '';
    
    // Change form submit handler to update instead of add
    addTaskForm.onsubmit = async (event) => {
        event.preventDefault();
        await handleUpdateTask(taskId);
        addTaskForm.onsubmit = handleAddTask; // Reset to default add handler
    };
    document.getElementById('addTaskModalTitle').textContent = "Edit Task"; // Change modal title
    document.getElementById('addTaskSubmitBtn').textContent = "Save Changes"; // Change submit button text
    addTaskModal.style.display = 'block';
    
    // Setup time input click handler for edit mode too
    setTimeout(() => {
      setupTimeInputClickHandler();
    }, 100);
  }

  async function handleUpdateTask(taskId) {
    const title = document.getElementById('newTaskTitle').value;
    const description = document.getElementById('newTaskDescription').value;
    const startTime = document.getElementById('newTaskStartTime').value;
    const duration = document.getElementById('newTaskDuration').value;
    
    const task = getTaskById(taskId); // Get current status and time_spent
    if (!task) return;

    if (!title) {
        showNotification('Task title is required.', 'warning');
        return;
    }
    
    const updatedTaskData = {
        title,
        description,
        start_time: startTime || null,
        duration_minutes: duration ? parseInt(duration) : null,
        status: task.status, // Preserve current status and time_spent
        time_spent: task.time_spent
    };

    const result = await fetchData(`/api/user-tasks/${taskId}`, 'PUT', updatedTaskData);
    if (result) {
        const index = dailyTasks.findIndex(t => t.id === taskId);
        if (index !== -1) dailyTasks[index] = result; // Update local task array
        
        addActivityLog(`Updated task: ${result.title}`);
        renderSchedule();
        renderTaskOptions();
        updateAllStats();
        addTaskModal.style.display = 'none';
        addTaskForm.reset();
        document.getElementById('addTaskModalTitle').textContent = "Add New Task"; // Reset modal title
        document.getElementById('addTaskSubmitBtn').textContent = "Add Task"; // Reset submit button text
        showNotification('Task updated successfully!');
    }
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    const result = await fetchData(`/api/user-tasks/${taskId}`, 'DELETE');
    if (result) { // result will be true on successful 204/200 from DELETE
        const task = getTaskById(taskId);
        addActivityLog(`Deleted task: ${task ? task.title : 'Unknown'}`);
        dailyTasks = dailyTasks.filter(t => t.id !== taskId);
        if (currentSelectedTaskId === taskId) {
            resetTimerUI(); // Reset timer if the deleted task was selected
        }
        renderSchedule();
        renderTaskOptions();
        updateAllStats();
        showNotification('Task deleted successfully!');
    }
  }


  // --- Utility & UI Functions ---
  function setCurrentTimeAsDefault() {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // Format as HH:MM
    const startTimeField = document.getElementById('newTaskStartTime');
    if (startTimeField) {
      startTimeField.value = currentTime;
    }
  }

  function setupTimeInputClickHandler() {
    const timeInput = document.getElementById('newTaskStartTime');
    if (timeInput) {
      // Remove any existing click handlers to prevent duplicates
      timeInput.removeEventListener('click', openTimePicker);
      
      // Add click handler to make entire field clickable
      timeInput.addEventListener('click', openTimePicker);
    }
  }

  function openTimePicker(event) {
    // Focus the input and trigger the time picker
    const timeInput = event.target;
    timeInput.focus();
    
    // Try to show the picker (this works in most modern browsers)
    if (timeInput.showPicker) {
      try {
        timeInput.showPicker();
      } catch (e) {
        // Fallback for browsers that don't support showPicker
        console.log('showPicker not supported, using focus fallback');
      }
    }
  }

  function formatTime(milliseconds) {
    if (isNaN(milliseconds) || milliseconds < 0) milliseconds = 0;
    const totalSeconds = Math.floor(milliseconds / 1000);
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }
  
  function formatDuration(ms) {
    if (isNaN(ms) || ms <= 0) return `0s`;
    const totalSeconds = Math.round(ms / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s`;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  
  function updateDateTime() {
    const now = new Date();
    currentTimeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    currentDateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  
  function showNotification(message, type = 'success') { // types: success, error, warning
    notification.textContent = message;
    notification.className = 'notification show'; // Reset classes
    if (type === 'error') {
        notification.style.backgroundColor = 'var(--danger-color)';
    } else if (type === 'warning') {
        notification.style.backgroundColor = 'var(--warning-color)';
    } else {
        notification.style.backgroundColor = 'var(--accent-color)'; // Default success
    }
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
  }
  
  // --- Notes Functions ---
  async function loadIndividualNotes() {
    await loadIndividualNotesForDate(getCurrentViewDateString());
  }
  
  function renderNotesList(notes) {
    notesList.innerHTML = '';
    
    if (!notes || notes.length === 0) {
      notesList.innerHTML = '<p style="color: var(--secondary-text); font-size: 0.9em; text-align: center; padding: 20px;">No notes for today. Click "Add Note" to create one!</p>';
      return;
    }
    
    notes.forEach(note => {
      const noteEl = document.createElement('div');
      noteEl.className = 'note-item';
      noteEl.innerHTML = `
        <div class="note-header">
          <div class="note-info">
            ${note.title ? `<h4 class="note-title">${note.title}</h4>` : ''}
            <span class="note-type note-type-${note.note_type}">${note.note_type}</span>
            <span class="note-time">${new Date(note.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</span>
          </div>
          <div class="note-actions">
            <button class="btn-tiny edit-note-btn" data-note-id="${note.id}">Edit</button>
            <button class="btn-tiny delete-note-btn" data-note-id="${note.id}">Del</button>
          </div>
        </div>
        <div class="note-content">${note.content}</div>
      `;
      
      // Add event listeners for edit and delete
      noteEl.querySelector('.edit-note-btn').addEventListener('click', () => openEditNoteModal(note.id));
      noteEl.querySelector('.delete-note-btn').addEventListener('click', () => handleDeleteNote(note.id));
      
      notesList.appendChild(noteEl);
    });
  }
  
  async function handleAddNote(event) {
    event.preventDefault();
    
    // Check if we're in edit mode
    const editingId = addNoteForm.dataset.editing;
    if (editingId) {
      await handleUpdateNote(editingId);
      return;
    }
    
    const title = document.getElementById('newNoteTitle').value;
    const content = document.getElementById('newNoteContent').value;
    const noteType = document.getElementById('newNoteType').value;
    
    if (!content.trim()) {
      showNotification('Note content is required.', 'warning');
      return;
    }
    
    const noteData = {
      title: title,
      content: content,
      note_type: noteType,
      entry_date: getCurrentViewDateString()
    };
    
    const result = await fetchData('/api/user-notes', 'POST', noteData);
    
    if (result) {
      showNotification('Note added successfully!');
      addNoteModal.style.display = 'none';
      addNoteForm.reset();
      await loadIndividualNotes(); // Reload notes
    }
  }
  
  function openEditNoteModal(noteId) {
    // Find the note data
    // For simplicity, we'll fetch it from the server
    fetchData(`/api/user-notes`).then(result => {
      if (!result || !result.notes) return;
      
      const note = result.notes.find(n => n.id === noteId);
      if (!note) return;
      
      // Populate form
      document.getElementById('editNoteId').value = noteId;
      document.getElementById('newNoteTitle').value = note.title || '';
      document.getElementById('newNoteContent').value = note.content;
      document.getElementById('newNoteType').value = note.note_type;
      
      // Change modal state to edit mode
      addNoteForm.dataset.editing = noteId;
      
      document.getElementById('addNoteModalTitle').textContent = "Edit Note";
      document.getElementById('addNoteSubmitBtn').textContent = "Save Changes";
      addNoteModal.style.display = 'block';
    });
  }
  
  async function handleUpdateNote(noteId) {
    const title = document.getElementById('newNoteTitle').value;
    const content = document.getElementById('newNoteContent').value;
    const noteType = document.getElementById('newNoteType').value;
    
    if (!content.trim()) {
      showNotification('Note content is required.', 'warning');
      return;
    }
    
    const noteData = {
      title: title,
      content: content,
      note_type: noteType
    };
    
    const result = await fetchData(`/api/user-notes/${noteId}`, 'PUT', noteData);
    
    if (result) {
      showNotification('Note updated successfully!');
      addNoteModal.style.display = 'none';
      addNoteForm.reset();
      delete addNoteForm.dataset.editing; // Clear edit mode
      document.getElementById('addNoteModalTitle').textContent = "Add New Note";
      document.getElementById('addNoteSubmitBtn').textContent = "Add Note";
      await loadIndividualNotes(); // Reload notes
    }
  }
  
  async function handleDeleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    const result = await fetchData(`/api/user-notes/${noteId}`, 'DELETE');
    
    if (result) {
      showNotification('Note deleted successfully!');
      await loadIndividualNotes(); // Reload notes
    }
  }

  // --- Date Navigation Functions ---
  async function loadDataForDate(dateString) {
    const summaryData = await fetchData(`/api/daily-summary?date=${dateString}`);
    if (!summaryData) return;

    dailyTasks = summaryData.tasks || [];
    renderActivityLog(summaryData.activityLog);
    renderStreak(summaryData.streak);
    
    renderSchedule();
    renderTaskOptions();
    updateDateTime();
    updateAllStats();
    
    // Load individual notes for the selected date
    await loadIndividualNotesForDate(dateString);
    
    // Update date display
    updateDateDisplay(dateString);
  }
  
  function setupDateNavigation() {
    if (datePicker) {
      datePicker.addEventListener('change', async (e) => {
        const selectedDate = new Date(e.target.value);
        currentViewDate = selectedDate;
        await loadDataForDate(getCurrentViewDateString());
      });
    }
    
    if (prevDateBtn) {
      prevDateBtn.addEventListener('click', async () => {
        currentViewDate.setDate(currentViewDate.getDate() - 1);
        if (datePicker) datePicker.value = getCurrentViewDateString();
        await loadDataForDate(getCurrentViewDateString());
      });
    }
    
    if (nextDateBtn) {
      nextDateBtn.addEventListener('click', async () => {
        currentViewDate.setDate(currentViewDate.getDate() + 1);
        if (datePicker) datePicker.value = getCurrentViewDateString();
        await loadDataForDate(getCurrentViewDateString());
      });
    }
  }
  
  function updateDateDisplay(dateString) {
    const date = new Date(dateString);
    const isToday = dateString === getTodayDateString();
    
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    
    let displayText = date.toLocaleDateString(undefined, options);
    if (isToday) {
      displayText += ' (Today)';
    }
    
    if (currentDateEl) {
      currentDateEl.textContent = displayText;
    }
  }
  
  async function loadIndividualNotesForDate(dateString) {
    const result = await fetchData(`/api/user-notes?date=${dateString}`);
    
    if (!result) return;
    
    renderNotesList(result.notes);
  }

  // --- Theme Toggle Functions ---
  function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    
    if (focusModeActive) {
      exitLightTheme();
    } else {
      enterLightTheme();
    }
  }
  
  function enterLightTheme() {
    // Add light theme class to body
    document.body.classList.add('light-mode');
    
    // Update toggle appearance (OFF for light theme)
    if (focusModeToggle) {
      focusModeToggle.classList.remove('active');
    }
    
    // Save theme preference
    localStorage.setItem('darkTheme', 'false');
    
    // Trigger storage event for other pages
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'darkTheme',
      newValue: 'false'
    }));
    
    if (typeof showNotification === 'function') {
      showNotification('Light theme activated!', 'success');
    }
  }
  
  function exitLightTheme() {
    // Remove light theme class from body (back to dark)
    document.body.classList.remove('light-mode');
    
    // Update toggle appearance (ON for dark theme)
    if (focusModeToggle) {
      focusModeToggle.classList.add('active');
    }
    
    // Save theme preference
    localStorage.setItem('darkTheme', 'true');
    
    // Trigger storage event for other pages
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'darkTheme',
      newValue: 'true'
    }));
    
    if (typeof showNotification === 'function') {
      showNotification('Dark theme activated!', 'success');
    }
  }
  
  // Initialize theme based on saved preference
  function initializeTheme() {
    const savedTheme = localStorage.getItem('darkTheme');
    
    // Default to dark theme if no preference saved
    if (savedTheme === 'false') {
      focusModeActive = false;
      enterLightTheme();
    } else {
      focusModeActive = true;
      exitLightTheme();
    }
  }

  // --- Start the Application ---
  initApp();
});
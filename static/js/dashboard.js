document.addEventListener('DOMContentLoaded', async function() {
  // --- Global State & Configuration ---
  let dailyTasks = []; // Holds tasks for the current day, fetched from backend
  let currentSelectedTaskId = null; // DB ID of the task selected for the timer
  let timerInterval = null;
  let timerStartTime = 0; // Timestamp when current segment started
  let accumulatedPausedTime = 0; // Total time paused for current segment
  let timerIsPaused = false;
  // focusModeActive remains client-side for now

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
  const dailyNotes = document.getElementById('dailyNotes');
  const saveNotesBtn = document.getElementById('saveNotesBtn');
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

  // --- API Helper Functions ---
  async function fetchData(url = '', method = 'GET', data = null) {
    const config = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (data && (method === 'POST' || method === 'PUT')) {
      config.body = JSON.stringify(data);
    }
    try {
      const response = await fetch(url, config);
      if (response.status === 401) { // Unauthorized
        window.location.href = '/login'; // Redirect to login
        return null;
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
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- Core App Logic ---
  async function initApp() {
    const dateString = getTodayDateString();
    
    const summaryData = await fetchData(`/api/daily-summary?date=${dateString}`);
    if (!summaryData) return; // Error handled by fetchData

    dailyTasks = summaryData.tasks || [];
    dailyNotes.value = summaryData.notes || '';
    renderActivityLog(summaryData.activityLog);
    renderStreak(summaryData.streak);
    
    renderSchedule();
    renderTaskOptions();
    updateDateTime();
    updateAllStats();
    
    // Event listeners
    startBtn.addEventListener('click', startTimer);
    pauseBtn.addEventListener('click', pauseTimer);
    stopBtn.addEventListener('click', stopTimer);
    saveNotesBtn.addEventListener('click', saveNotes);
    
    if(addTaskBtn) addTaskBtn.addEventListener('click', () => addTaskModal.style.display = 'block');
    if(closeAddTaskModalBtn) closeAddTaskModalBtn.addEventListener('click', () => addTaskModal.style.display = 'none');
    if(addTaskForm) addTaskForm.addEventListener('submit', handleAddTask);

    window.onclick = function(event) {
        if (event.target == addTaskModal) {
            addTaskModal.style.display = "none";
        }
    }
    
    setInterval(updateDateTime, 1000 * 30); // Update time less frequently
    setInterval(refreshDataPeriodically, 1000 * 60 * 5); // Refresh data every 5 mins
  }

  async function refreshDataPeriodically() {
    if (timerInterval) return; // Don't refresh if timer is active
    const dateString = getTodayDateString();
    const summaryData = await fetchData(`/api/daily-summary?date=${dateString}`);
    if (!summaryData) return;

    dailyTasks = summaryData.tasks || [];
    renderSchedule();
    renderTaskOptions();
    updateAllStats();
    // Potentially update notes and activity log if needed, or assume they are managed by user actions mostly
  }
  
  // --- Timer Functions ---
  function startTimer() {
    if (currentSelectedTaskId === null) {
      showNotification('Please select a task first.', 'warning');
      return;
    }
    const task = getTaskById(currentSelectedTaskId);
    if (!task || task.status === 'completed') {
        showNotification('Cannot start a completed task or task not found.', 'warning');
        return;
    }

    if (timerIsPaused) { // Resuming
      timerStartTime = Date.now() - accumulatedPausedTime;
      timerIsPaused = false;
    } else { // Starting new or switching
      timerStartTime = Date.now();
      accumulatedPausedTime = 0;
      addActivityLog(`Started working on: ${task.title}`, task.id);
      updateTaskStatusOnBackend(task.id, 'in-progress', task.time_spent); // time_spent doesn't change yet
    }
    
    clearInterval(timerInterval); // Clear any existing interval
    timerInterval = setInterval(updateTimerDisplay, 1000);
    
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'none');
  }
  
  function pauseTimer() {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    accumulatedPausedTime = Date.now() - timerStartTime;
    timerIsPaused = true;
    
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    
    const task = getTaskById(currentSelectedTaskId);
    if (task) {
        addActivityLog(`Paused task: ${task.title}`, task.id);
    }
  }
  
  async function stopTimer() {
    if (!timerInterval && !timerIsPaused) return; // Nothing to stop if not running or paused

    clearInterval(timerInterval);
    timerInterval = null;

    const task = getTaskById(currentSelectedTaskId);
    if (!task) {
        resetTimerUI();
        return;
    }

    const elapsedTimeInSegment = timerIsPaused ? accumulatedPausedTime : (Date.now() - timerStartTime);
    task.time_spent += elapsedTimeInSegment;
    
    await updateTaskStatusOnBackend(task.id, 'completed', task.time_spent);
    addActivityLog(`Completed task: ${task.title} (Total: ${formatDuration(task.time_spent)})`, task.id);
    showNotification(`Task completed! Time: ${formatDuration(elapsedTimeInSegment)}`);
    
    resetTimerUI();
    updateAllStats(); // This will re-render schedule, options, etc.
  }

  function resetTimerUI() {
    timerDisplay.textContent = formatTime(0);
    currentSelectedTaskId = null;
    currentTaskLabel.textContent = 'No active task';
    timerStartTime = 0;
    accumulatedPausedTime = 0;
    timerIsPaused = false;
    
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    stopBtn.disabled = true;
    taskOptionsContainer.querySelectorAll('.task-option').forEach(opt => opt.style.pointerEvents = 'auto');
    document.querySelectorAll('.task-option.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.schedule-row.current-task').forEach(el => el.classList.remove('current-task'));

  }

  function updateTimerDisplay() {
    if (!timerStartTime || currentSelectedTaskId === null) return;
    const currentElapsedTimeInSegment = Date.now() - timerStartTime;
    const task = getTaskById(currentSelectedTaskId);
    if (!task) return;
    const totalDisplayTime = task.time_spent + currentElapsedTimeInSegment;
    timerDisplay.textContent = formatTime(totalDisplayTime);
  }

  // --- Data Handling & Rendering ---
  function getTaskById(id) {
    return dailyTasks.find(task => task.id === id);
  }
  
  function selectTaskForTimer(taskId) {
    if (timerInterval) { // If a timer is actively running (not just paused)
      showNotification("Please stop or pause the current task before switching.", 'warning');
      return;
    }
    
    const task = getTaskById(taskId);
    if (!task || task.status === 'completed') {
        showNotification('This task is completed or not found.', 'warning');
        if (currentSelectedTaskId === taskId) resetTimerUI(); // Clear timer if selected task became completed elsewhere
        return;
    }

    currentSelectedTaskId = taskId;
    currentTaskLabel.textContent = task.title;
    timerDisplay.textContent = formatTime(task.time_spent); // Display existing time_spent
    timerIsPaused = false; // Reset pause state for new selection
    accumulatedPausedTime = 0; // Reset accumulated pause time
    // timerStartTime will be set when Start is clicked

    // Update UI for selection
    taskOptionsContainer.querySelectorAll('.task-option').forEach(el => el.classList.remove('selected'));
    const taskOptionEl = document.getElementById(`taskOption-${taskId}`);
    if (taskOptionEl) taskOptionEl.classList.add('selected');
    
    scheduleTableBody.querySelectorAll('.schedule-row').forEach(row => row.classList.remove('current-task'));
    const scheduleRowEl = document.getElementById(`scheduleRow-${taskId}`);
    if (scheduleRowEl) scheduleRowEl.classList.add('current-task');
    
    startBtn.disabled = false;
    pauseBtn.disabled = true; // Pause only enabled after start
    stopBtn.disabled = true; // Stop only enabled after start/pause
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
        scheduleTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No tasks scheduled for today. Add one!</td></tr>';
    }

    sortedTasks.forEach(task => {
      const row = document.createElement('tr');
      row.id = `scheduleRow-${task.id}`;
      row.className = 'schedule-row';
      if (task.status === 'in-progress') row.classList.add('current-task');
      if (task.status === 'completed') row.classList.add('completed-task');
      if (currentSelectedTaskId === task.id && task.status !== 'completed') row.classList.add('current-task'); // Persist selection highlight
      
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

      row.innerHTML = `
        <td class="task-time">${timeDisplay}</td>
        <td class="task-focus">${isCriticalTask ? `<span class="task-focus-highlight">${task.title}</span>` : task.title}
            ${task.description ? `<div style="font-size:0.8em; color:var(--secondary-text);">${task.description}</div>` : ''}
        </td>
        <td class="task-status"><div id="statusIndicator-${task.id}" class="status-indicator ${task.status}"></div></td>
        <td class="task-actions">
            <button class="btn-tiny select-btn" data-task-id="${task.id}" ${task.status === 'completed' ? 'disabled' : ''}>${currentSelectedTaskId === task.id && !timerIsPaused && timerInterval ? 'Selected' : 'Select'}</button>
            <button class="btn-tiny edit-btn" data-task-id="${task.id}" ${task.status === 'completed' ? 'disabled' : ''} style="margin-left:5px;">Edit</button>
            <button class="btn-tiny delete-btn" data-task-id="${task.id}" style="margin-left:5px;">Del</button>
        </td>`;
      
      row.querySelector('.select-btn').addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent row click if button is distinct
          selectTaskForTimer(task.id);
      });
      row.querySelector('.edit-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openEditTaskModal(task.id);
      });
      row.querySelector('.delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          handleDeleteTask(task.id);
      });

      // Optional: Clicking row also selects task IF not completed
      row.addEventListener('click', () => {
        if (task.status !== 'completed') {
            selectTaskForTimer(task.id);
        }
      });
      scheduleTableBody.appendChild(row);
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
      option.textContent = task.title;
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
    const title = document.getElementById('newTaskTitle').value;
    const description = document.getElementById('newTaskDescription').value;
    const startTime = document.getElementById('newTaskStartTime').value;
    const duration = document.getElementById('newTaskDuration').value;

    if (!title) {
        showNotification('Task title is required.', 'warning');
        return;
    }

    const newTaskData = {
        entry_date: getTodayDateString(),
        title,
        description,
        start_time: startTime || null, // Ensure empty string becomes null for DB
        duration_minutes: duration ? parseInt(duration) : null,
    };

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
  
  // --- Start the Application ---
  initApp();
});
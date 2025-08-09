import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';

// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = {
  apiKey: "AIzaSyBG8YGntW5mY85Tx3FvQcKqa3Gk3TZPJP8",
  authDomain: "task-manager-7c6f4.firebaseapp.com",
  projectId: "task-manager-7c6f4",
  storageBucket: "task-manager-7c6f4.firebasestorage.app",
  messagingSenderId: "512795463333",
  appId: "1:512795463333:web:347a95504d47dd7601c74c",
  measurementId: "G-BXVD0DX8M5"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper function to format date as YYYY-MM-DD string
const formatDateToYYYYMMDD = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to get a date without time for comparisons
const getStartOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper to get ISO week number (adapted for simplicity, consider full ISO 8601 for strictness)
const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

// Custom Modal component for delete confirmation
const ConfirmationModal = ({ show, message, onConfirm, onCancel, theme }) => {
  if (!show) return null;

  const modalBgClass = theme === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-800';
  const buttonCancelBgClass = theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500 text-gray-200' : 'bg-gray-300 hover:bg-gray-400 text-gray-800';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`rounded-xl shadow-lg p-6 w-full max-w-sm ${modalBgClass}`}>
        <p className="text-lg font-semibold mb-6 text-center">{message}</p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition-colors"
          >
            Yes, Delete
          </button>
          <button
            onClick={onCancel}
            className={`px-6 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors ${buttonCancelBgClass}`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState('');
  const [newTask, setNewTask] = useState('');
  const [tasks, setTasks] = useState([]); // All tasks for the current user
  const [goals, setGoals] = useState([]); // All goals for the current user
  const [newGoal, setNewGoal] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentViewedDate, setCurrentViewedDate] = useState(getStartOfDay(new Date()));
  const [viewMode, setViewMode] = useState('daily'); // 'daily', 'progress', or 'goals'
  const [editingTaskId, setEditingTaskId] = useState(null); // State for inline editing task text
  const [editingTaskText, setEditingTaskText] = useState(''); // State for inline editing task text
  const [editingTaskNotes, setEditingTaskNotes] = useState(''); // State for inline editing task notes
  const [editingTaskDueDate, setEditingTaskDueDate] = useState(''); // New state for editing due date
  const [editingTaskDueTime, setEditingTaskDueTime] = useState(''); // New state for editing due time
  const [confirmDeleteModal, setConfirmDeleteModal] = useState({ show: false, taskId: null, type: null }); // type: 'task' or 'goal'
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light'); // Theme state

  const newTaskInputRef = useRef(null);
  const editingInputRef = useRef(null); // Ref for the inline editing task text input

  // Effect to apply theme to HTML element and persist in localStorage
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Initialize Firebase and set up authentication
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDb(firestore);
        setAuth(firebaseAuth);

        if (initialAuthToken) {
          await signInWithCustomToken(firebaseAuth, initialAuthToken);
        } else {
          await signInAnonymously(firebaseAuth);
        }

        onAuthStateChanged(firebaseAuth, (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID());
          }
          setIsAuthReady(true);
        });

      } catch (e) {
        console.error("Error initializing Firebase:", e);
        setError("Failed to initialize the app. Please try again later.");
        setLoading(false);
      }
    };

    initFirebase();
  }, []);

  // Fetch all tasks for the current user
  useEffect(() => {
    if (db && auth && isAuthReady && userId) {
      const tasksCollectionRef = collection(db, `artifacts/${appId}/public/data/tasks`);
      const q = query(
        tasksCollectionRef,
        where('createdBy', '==', userId)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedTasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        fetchedTasks.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return dateA - dateB;
        });
        setTasks(fetchedTasks);
        setLoading(false);
      }, (e) => {
        console.error("Error fetching tasks:", e);
        setError("Failed to load tasks. Please try again.");
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [db, auth, isAuthReady, userId]);

  // Fetch all goals for the current user
  useEffect(() => {
    if (db && auth && isAuthReady && userId) {
      const goalsCollectionRef = collection(db, `artifacts/${appId}/public/data/goals`);
      const q = query(
        goalsCollectionRef,
        where('createdBy', '==', userId)
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedGoals = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        fetchedGoals.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
          return dateA - dateB;
        });
        setGoals(fetchedGoals);
      }, (e) => {
        console.error("Error fetching goals:", e);
        setError("Failed to load goals. Please try again.");
      });

      return () => unsubscribe();
    }
  }, [db, auth, isAuthReady, userId]);


  const handleAddTask = async () => {
    if (newTask.trim() === '') return;

    if (!db || !userId) {
      console.error("Database or User ID not available. Cannot add task.");
      setError("App not ready to add tasks. Please wait.");
      return;
    }

    try {
      const taskDateString = formatDateToYYYYMMDD(currentViewedDate);
      await addDoc(collection(db, `artifacts/${appId}/public/data/tasks`), {
        text: newTask,
        completed: false,
        notes: '',
        createdAt: serverTimestamp(),
        createdBy: userId,
        taskDate: taskDateString,
        dueDate: '', // New field
        dueTime: '', // New field
        time: 'Anytime',
        assignee: 'You',
      });
      setNewTask('');
      if (newTaskInputRef.current) {
        newTaskInputRef.current.focus();
      }
    } catch (e) {
      console.error("Error adding document: ", e);
      setError("Failed to add task. Please try again.");
    }
  };

  const handleToggleComplete = async (id, completed) => {
    if (!db) return;
    try {
      const taskRef = doc(db, `artifacts/${appId}/public/data/tasks`, id);
      await updateDoc(taskRef, {
        completed: !completed
      });
    } catch (e) {
      console.error("Error updating document: ", e);
      setError("Failed to update task. Please try again.");
    }
  };

  const handleDeleteItemClick = (id, type) => {
    setConfirmDeleteModal({ show: true, taskId: id, type: type });
  };

  const confirmDelete = async () => {
    if (!db || !confirmDeleteModal.taskId) return;
    try {
      if (confirmDeleteModal.type === 'task') {
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/tasks`, confirmDeleteModal.taskId));
      } else if (confirmDeleteModal.type === 'goal') {
        await deleteDoc(doc(db, `artifacts/${appId}/public/data/goals`, confirmDeleteModal.taskId));
      }
      setConfirmDeleteModal({ show: false, taskId: null, type: null });
    } catch (e) {
      console.error("Error deleting document: ", e);
      setError("Failed to delete. Please try again.");
      setConfirmDeleteModal({ show: false, taskId: null, type: null });
    }
  };

  const cancelDelete = () => {
    setConfirmDeleteModal({ show: false, taskId: null, type: null });
  };

  // Inline Editing Functions for Tasks
  const handleEditClick = (task) => {
    setEditingTaskId(task.id);
    setEditingTaskText(task.text);
    setEditingTaskNotes(task.notes || '');
    setEditingTaskDueDate(task.dueDate || ''); // Load existing due date
    setEditingTaskDueTime(task.dueTime || ''); // Load existing due time
    setTimeout(() => {
      if (editingInputRef.current) {
        editingInputRef.current.focus();
      }
    }, 0);
  };

  const handleSaveEdit = async (taskId) => {
    if (!db || editingTaskText.trim() === '') {
      setEditingTaskId(null);
      setEditingTaskText('');
      setEditingTaskNotes('');
      setEditingTaskDueDate('');
      setEditingTaskDueTime('');
      return;
    }
    try {
      const taskRef = doc(db, `artifacts/${appId}/public/data/tasks`, taskId);
      await updateDoc(taskRef, {
        text: editingTaskText.trim(),
        notes: editingTaskNotes.trim(),
        dueDate: editingTaskDueDate, // Save due date
        dueTime: editingTaskDueTime, // Save due time
      });
      setEditingTaskId(null);
      setEditingTaskText('');
      setEditingTaskNotes('');
      setEditingTaskDueDate('');
      setEditingTaskDueTime('');
    } catch (e) {
      console.error("Error updating task: ", e);
      setError("Failed to update task. Please try again.");
    }
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingTaskText('');
    setEditingTaskNotes('');
    setEditingTaskDueDate('');
    setEditingTaskDueTime('');
  };


  // Goal Functions
  const handleAddGoal = async () => {
    if (newGoal.trim() === '') return;

    if (!db || !userId) {
      console.error("Database or User ID not available. Cannot add goal.");
      setError("App not ready to add goals. Please wait.");
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/goals`), {
        title: newGoal,
        completed: false,
        createdAt: serverTimestamp(),
        createdBy: userId,
      });
      setNewGoal('');
    } catch (e) {
      console.error("Error adding goal: ", e);
      setError("Failed to add goal. Please try again.");
    }
  };

  const handleToggleGoalComplete = async (id, completed) => {
    if (!db) return;
    try {
      const goalRef = doc(db, `artifacts/${appId}/public/data/goals`, id);
      await updateDoc(goalRef, {
        completed: !completed
      });
    } catch (e) {
      console.error("Error updating goal: ", e);
      setError("Failed to update goal. Please try again.");
    }
  };


  // Filtered tasks for the current daily view
  const dailyTasks = useMemo(() => {
    const dateString = formatDateToYYYYMMDD(currentViewedDate);
    return tasks.filter(task => task.taskDate === dateString);
  }, [tasks, currentViewedDate]);

  const completedDailyTasksCount = dailyTasks.filter(task => task.completed).length;
  const totalDailyTasksCount = dailyTasks.length;
  const dailyProgressPercentage = totalDailyTasksCount > 0 ? (completedDailyTasksCount / totalDailyTasksCount) * 100 : 0;

  // Determine the display string for the current viewed date (Today, Yesterday, Tomorrow, or date)
  const today = useMemo(() => getStartOfDay(new Date()), []);
  const tomorrow = useMemo(() => getStartOfDay(new Date(today.getTime() + 24 * 60 * 60 * 1000)), [today]);
  const yesterday = useMemo(() => getStartOfDay(new Date(today.getTime() - 24 * 60 * 60 * 1000)), [today]);

  const displayDate = useMemo(() => {
    if (currentViewedDate.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (currentViewedDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else if (currentViewedDate.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return currentViewedDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  }, [currentViewedDate, today, tomorrow, yesterday]);

  // Date navigation handlers
  const goToPreviousDay = useCallback(() => {
    const newDate = new Date(currentViewedDate.getTime() - 24 * 60 * 60 * 1000);
    setCurrentViewedDate(getStartOfDay(newDate));
  }, [currentViewedDate]);

  const goToNextDay = useCallback(() => {
    const newDate = new Date(currentViewedDate.getTime() + 24 * 60 * 60 * 1000);
    setCurrentViewedDate(getStartOfDay(newDate));
  }, [currentViewedDate]);

  const goToToday = useCallback(() => {
    setCurrentViewedDate(getStartOfDay(new Date()));
  }, []);

  // Calculate weekly and monthly progress for all tasks
  const { weeklyProgress, monthlyProgress } = useMemo(() => {
    const weekly = {};
    const monthly = {};

    tasks.forEach(task => {
      if (task.taskDate) {
        const taskDateObj = new Date(task.taskDate + 'T00:00:00');
        if (isNaN(taskDateObj.getTime())) return;

        const weekKey = getWeekNumber(taskDateObj);
        if (!weekly[weekKey]) {
          weekly[weekKey] = { completed: 0, total: 0 };
        }
        weekly[weekKey].total++;
        if (task.completed) {
          weekly[weekKey].completed++;
        }

        const monthKey = `${taskDateObj.getFullYear()}-${String(taskDateObj.getMonth() + 1).padStart(2, '0')}`;
        if (!monthly[monthKey]) {
          monthly[monthKey] = { completed: 0, total: 0 };
        }
        monthly[monthKey].total++;
        if (task.completed) {
          monthly[monthKey].completed++;
        }
      }
    });

    const sortedWeekly = Object.keys(weekly).sort().map(key => ({
      period: key,
      ...weekly[key],
      percentage: weekly[key].total > 0 ? (weekly[key].completed / weekly[key].total) * 100 : 0
    }));

    const sortedMonthly = Object.keys(monthly).sort().map(key => ({
      period: key,
      ...monthly[key],
      percentage: monthly[key].total > 0 ? (monthly[key].completed / monthly[key].total) * 100 : 0
    }));

    return { weeklyProgress: sortedWeekly, monthlyProgress: sortedMonthly };
  }, [tasks]);

  // Function to determine task status (Overdue, Due Today, Due Later)
  const getTaskStatus = useCallback((task) => {
    if (task.completed) return ''; // Completed tasks don't need status

    const todayDateStr = formatDateToYYYYMMDD(getStartOfDay(new Date()));
    const taskDueDateStr = task.dueDate;

    if (!taskDueDateStr) return ''; // No due date, no specific status

    // Compare dates
    if (taskDueDateStr < todayDateStr) {
      return 'Overdue';
    } else if (taskDueDateStr === todayDateStr) {
      return 'Due Today';
    }
    // If future date, don't show specific "Due Later" text in this version, just the date itself
    return '';
  }, []);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4 transition-colors duration-300">
        <div className="text-xl text-gray-700 dark:text-gray-300">Loading Task Manager...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 dark:bg-red-900 p-4 transition-colors duration-300">
        <div className="text-xl text-red-700 dark:text-red-300">{error}</div>
      </div>
    );
  }

  const containerBgClass = theme === 'dark' ? 'bg-gray-900' : 'bg-gray-100';
  const mainCardBgClass = theme === 'dark' ? 'bg-gray-800' : 'bg-white';
  const headerTextClass = theme === 'dark' ? 'text-gray-100' : 'text-gray-800';
  const userIconBgClass = theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600';
  const subTextColorClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-500';
  const sectionTitleClass = theme === 'dark' ? 'text-gray-100' : 'text-gray-800';
  const navButtonActiveBg = theme === 'dark' ? 'bg-blue-600 text-white shadow' : 'bg-blue-500 text-white shadow';
  const navButtonInactiveBg = theme === 'dark' ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-200';
  const taskCardBgClass = theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50';
  const taskCardCompletedBgClass = theme === 'dark' ? 'bg-blue-800' : 'bg-blue-50';
  const taskCardOverdueBgClass = theme === 'dark' ? 'bg-red-800' : 'bg-red-50';
  const taskTextColorClass = theme === 'dark' ? 'text-gray-100' : 'text-gray-800';
  const taskNotesColorClass = theme === 'dark' ? 'text-gray-300' : 'text-gray-500';
  const taskMetaColorClass = theme === 'dark' ? 'text-gray-400' : 'text-gray-400';
  const inputBorderClass = theme === 'dark' ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-800';
  const buttonBlueBg = theme === 'dark' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-700';
  const buttonPurpleBg = theme === 'dark' ? 'bg-purple-700 hover:bg-purple-800' : 'bg-purple-600 hover:bg-purple-700';
  const progressBgClass = theme === 'dark' ? 'bg-gray-700' : 'bg-gray-50';


  return (
    <div className={`relative min-h-screen flex justify-center py-8 transition-colors duration-300 ${containerBgClass}`}>
      <div className={`w-full max-w-sm rounded-3xl shadow-xl overflow-hidden flex flex-col items-center p-6 relative ${mainCardBgClass}`}>
        {/* Header Section */}
        <div className="flex items-center justify-between w-full mb-4">
          <div className="flex items-center space-x-2">
            <div className={`rounded-full h-10 w-10 flex items-center justify-center ${userIconBgClass}`}>
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"></path>
              </svg>
            </div>
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'text-yellow-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200'}`}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 4a1 1 0 10-2 0v1a1 1 0 102 0V6zm7 7h-1a1 1 0 110-2h1a1 1 0 110 2zm-4 0a1 1 0 11-2 0v1a1 1 0 112 0v-1zm-9 0a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm6-4a1 1 0 10-2 0v1a1 1 0 102 0V9z" clipRule="evenodd"></path>
                </svg>
              )}
            </button>
          </div>
          <h1 className={`text-2xl font-bold ${headerTextClass}`}>
            {viewMode === 'daily' ? 'My Day' : viewMode === 'progress' ? 'My Progress' : 'My Goals'}
          </h1>
          {/* Placeholder for future right-side header elements if needed */}
          <div className="h-10 w-10"></div> {/* To balance the header layout */}
        </div>

        {/* User ID display - kept for debugging/identification, moved to a less prominent spot */}
        <div className={`mb-4 text-xs self-start ${subTextColorClass}`}>
          User ID: <span className="font-mono break-all">{userId}</span>
        </div>

        {/* Navigation Buttons */}
        <div className={`w-full flex justify-around p-2 rounded-xl mb-6 shadow-inner ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <button
            onClick={() => setViewMode('daily')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
              viewMode === 'daily' ? navButtonActiveBg : navButtonInactiveBg
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('progress')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
              viewMode === 'progress' ? navButtonActiveBg : navButtonInactiveBg
            }`}
          >
            Progress
          </button>
          <button
            onClick={() => setViewMode('goals')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-all duration-200 ${
              viewMode === 'goals' ? navButtonActiveBg : navButtonInactiveBg
            }`}
          >
            Goals
          </button>
        </div>


        {viewMode === 'daily' && (
          <>
            {/* Date Navigation for Daily View */}
            <div className={`w-full flex justify-between items-center mb-4 ${subTextColorClass}`}>
              <button onClick={goToPreviousDay} className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                <svg className={`w-5 h-5 ${subTextColorClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                </svg>
              </button>
              <span className={`font-semibold text-lg ${headerTextClass}`}>{displayDate}</span>
              <button onClick={goToNextDay} className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}>
                <svg className={`w-5 h-5 ${subTextColorClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </button>
            </div>
            <button
              onClick={goToToday}
              className={`text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-6 transition-colors`}
            >
              Go to Today
            </button>

            {/* Daily Progress Bar */}
            <div className="w-full mb-6">
              <p className={`text-sm mb-2 ${subTextColorClass}`}>
                **{completedDailyTasksCount}/{totalDailyTasksCount} tasks completed** ({dailyProgressPercentage.toFixed(0)}%)
              </p>
              <div className={`w-full rounded-full h-2.5 ${theme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'}`}>
                <div
                  className="bg-blue-500 h-2.5 rounded-full"
                  style={{ width: `${dailyProgressPercentage}%` }}
                ></div>
              </div>
            </div>

            {/* Daily Task List */}
            {dailyTasks.length === 0 ? (
              <p className={`text-center text-md mt-4 ${subTextColorClass}`}>No tasks for {displayDate}! Use the input field below to add one.</p>
            ) : (
              <ul className="w-full space-y-3 mt-4 overflow-y-auto max-h-80">
                {dailyTasks.map((task) => {
                  const status = getTaskStatus(task);
                  const isOverdue = status === 'Overdue' && !task.completed;
                  let itemCardBgClass = taskCardBgClass;
                  if (task.completed) {
                    itemCardBgClass = taskCardCompletedBgClass;
                  } else if (isOverdue) {
                    itemCardBgClass = taskCardOverdueBgClass;
                  }

                  return (
                    <li
                      key={task.id}
                      className={`flex items-center p-4 rounded-xl shadow-sm cursor-pointer transition duration-200 ease-in-out ${itemCardBgClass}`}
                    >
                      <input
                        type="checkbox"
                        className="form-checkbox h-5 w-5 text-blue-600 rounded-full focus:ring-blue-500 mr-3 cursor-pointer"
                        checked={task.completed}
                        onChange={() => handleToggleComplete(task.id, task.completed)}
                      />
                      <div className="flex-grow">
                        {editingTaskId === task.id ? (
                          <div className="space-y-2">
                            <input
                              ref={editingInputRef}
                              type="text"
                              value={editingTaskText}
                              onChange={(e) => setEditingTaskText(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveEdit(task.id);
                                }
                              }}
                              className={`w-full p-1 border rounded-md text-lg focus:ring-blue-400 focus:border-transparent ${inputBorderClass}`}
                              placeholder="Task Title"
                            />
                            <textarea
                              value={editingTaskNotes}
                              onChange={(e) => setEditingTaskNotes(e.target.value)}
                              placeholder="Add notes..."
                              className={`w-full p-1 border rounded-md text-sm focus:ring-blue-400 focus:border-transparent resize-y min-h-[50px] ${inputBorderClass}`}
                              rows="2"
                            ></textarea>
                            <div className="flex space-x-2">
                              <input
                                type="date"
                                value={editingTaskDueDate}
                                onChange={(e) => setEditingTaskDueDate(e.target.value)}
                                className={`w-1/2 p-1 border rounded-md text-sm focus:ring-blue-400 focus:border-transparent ${inputBorderClass}`}
                                title="Due Date"
                              />
                              <input
                                type="time"
                                value={editingTaskDueTime}
                                onChange={(e) => setEditingTaskDueTime(e.target.value)}
                                className={`w-1/2 p-1 border rounded-md text-sm focus:ring-blue-400 focus:border-transparent ${inputBorderClass}`}
                                title="Due Time"
                              />
                            </div>
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => handleSaveEdit(task.id)}
                                className="p-1 text-green-500 hover:text-green-700 rounded-full hover:bg-green-100 transition-colors"
                                title="Save Changes"
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className={`p-1 rounded-full transition-colors ${theme === 'dark' ? 'text-gray-300 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-100'}`}
                                title="Cancel Edit"
                              >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="cursor-text" onClick={() => handleEditClick(task)}>
                            <span className={`text-lg font-medium ${task.completed ? 'line-through text-gray-500 dark:text-gray-400' : taskTextColorClass}`}>
                              {task.text}
                            </span>
                            {task.notes && (
                              <p className={`text-xs mt-1 break-words whitespace-pre-wrap ${taskNotesColorClass}`}>
                                {task.notes}
                              </p>
                            )}
                            <p className={`text-xs mt-0.5 ${taskMetaColorClass}`}>
                              {task.dueDate && (
                                <span className={`${isOverdue ? 'text-red-600 dark:text-red-300 font-bold' : ''}`}>
                                  {task.dueDate} {task.dueTime}
                                </span>
                              )}
                              {status && !task.completed && (
                                <span className={`ml-2 text-xs font-semibold ${isOverdue ? 'text-red-700 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}`}>
                                  ({status})
                                </span>
                              )}
                              {task.time && !task.dueDate && `Time: ${task.time}`} {/* Fallback if no specific due time */}
                              {task.assignee && ` - ${task.assignee}`}
                            </p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteItemClick(task.id, 'task');
                        }}
                        className={`ml-4 p-2 text-red-400 hover:text-red-600 rounded-full transition duration-200 ease-in-out ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-red-100'}`}
                        title="Delete Task"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd"></path>
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {viewMode === 'progress' && (
          /* Progress View */
          <div className={`w-full ${sectionTitleClass}`}>
            <h2 className="text-xl font-bold mb-4 border-b pb-2">Weekly Progress</h2>
            {weeklyProgress.length === 0 ? (
              <p className={`text-center text-md mt-4 mb-8 ${subTextColorClass}`}>No weekly data available yet. Complete some tasks!</p>
            ) : (
              <ul className="space-y-3 mb-8">
                {weeklyProgress.map((data) => (
                  <li key={data.period} className={`p-4 rounded-xl shadow-sm ${progressBgClass}`}>
                    <p className="font-semibold">{data.period}: {data.completed}/{data.total} tasks completed</p>
                    <div className={`w-full rounded-full h-2.5 mt-2 ${theme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'}`}>
                      <div
                        className="bg-blue-500 h-2.5 rounded-full"
                        style={{ width: `${data.percentage}%` }}
                      ></div>
                    </div>
                    <p className={`text-sm mt-1 ${subTextColorClass}`}>{data.percentage.toFixed(0)}% complete</p>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="text-xl font-bold mb-4 border-b pb-2">Monthly Progress</h2>
            {monthlyProgress.length === 0 ? (
              <p className={`text-center text-md mt-4 ${subTextColorClass}`}>No monthly data available yet. Keep going!</p>
            ) : (
              <ul className="space-y-3">
                {monthlyProgress.map((data) => (
                  <li key={data.period} className={`p-4 rounded-xl shadow-sm ${progressBgClass}`}>
                    <p className="font-semibold">{data.period}: {data.completed}/{data.total} tasks completed</p>
                    <div className={`w-full rounded-full h-2.5 mt-2 ${theme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'}`}>
                      <div
                        className="bg-blue-500 h-2.5 rounded-full"
                        style={{ width: `${data.percentage}%` }}
                      ></div>
                    </div>
                    <p className={`text-sm mt-1 ${subTextColorClass}`}>{data.percentage.toFixed(0)}% complete</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {viewMode === 'goals' && (
          /* Goals View */
          <div className={`w-full ${sectionTitleClass}`}>
            <h2 className="text-xl font-bold mb-4 border-b pb-2">My Goals</h2>
            <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <input
                type="text"
                className={`flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent text-lg ${inputBorderClass}`}
                placeholder="Add a new long-term goal..."
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddGoal();
                  }
                }}
              />
              <button
                onClick={handleAddGoal}
                className={`text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 text-lg ${buttonPurpleBg}`}
                title="Add Goal"
              >
                Add Goal
              </button>
            </div>

            {goals.length === 0 ? (
              <p className={`text-center text-md mt-4 ${subTextColorClass}`}>No goals yet! Set some long-term objectives.</p>
            ) : (
              <ul className="space-y-3 overflow-y-auto max-h-80">
                {goals.map((goal) => (
                  <li
                    key={goal.id}
                    className={`flex items-center p-4 rounded-xl shadow-sm transition duration-200 ease-in-out ${
                      goal.completed ? 'bg-purple-50 dark:bg-purple-800' : taskCardBgClass
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="form-checkbox h-5 w-5 text-purple-600 rounded-full focus:ring-purple-500 mr-3 cursor-pointer"
                      checked={goal.completed}
                      onChange={() => handleToggleGoalComplete(goal.id, goal.completed)}
                    />
                    <span className={`flex-grow text-lg font-medium ${goal.completed ? 'line-through text-gray-500 dark:text-gray-400' : taskTextColorClass}`}>
                      {goal.title}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteItemClick(goal.id, 'goal');
                      }}
                      className={`ml-4 p-2 text-red-400 hover:text-red-600 rounded-full transition duration-200 ease-in-out ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-red-100'}`}
                      title="Delete Goal"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 11-2 0v6a1 1 0 112 0V8z" clipRule="evenodd"></path>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Input field for adding new tasks (only visible for daily view) */}
        {viewMode === 'daily' && (
          <div className="w-full flex mt-6 gap-2">
            <input
              ref={newTaskInputRef}
              type="text"
              className={`flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-transparent text-lg ${inputBorderClass}`}
              placeholder={`Add task for ${displayDate}...`}
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddTask();
                }
              }}
            />
            <button
              onClick={handleAddTask}
              className={`text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 active:scale-95 text-lg ${buttonBlueBg}`}
              title="Add Task"
            >
              Add
            </button>
          </div>
        )}

        {/* The floating action button (FAB) remains, but its primary function is now to focus the input (only for daily view) */}
        {viewMode === 'daily' && (
          <div className="absolute bottom-6 right-6">
            <button
              onClick={() => {
                if (newTaskInputRef.current) {
                  newTaskInputRef.current.focus();
                }
              }}
              className={`text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg transition duration-300 ease-in-out transform hover:scale-110 active:scale-90 ${buttonBlueBg}`}
              title="Focus Add Task Input"
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd"></path>
              </svg>
            </button>
          </div>
        )}

        {/* Confirmation Modal */}
        <ConfirmationModal
          show={confirmDeleteModal.show}
          message={`Are you sure you want to delete this ${confirmDeleteModal.type}?`}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
          theme={theme} // Pass theme to modal for consistent styling
        />
      </div>
    </div>
  );
}

export default App;

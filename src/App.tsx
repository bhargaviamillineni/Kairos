import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, 
  Sparkles, 
  Calendar, 
  LogOut, 
  Zap, 
  Sliders, 
  Award, 
  CheckCircle, 
  CheckSquare,
  Mic, 
  Brain, 
  Flame, 
  FileText,
  Clock,
  AlertTriangle,
  ChevronRight,
  User as UserIcon,
  HelpCircle,
  Loader2
} from "lucide-react";
import { User } from "firebase/auth";
import { useTasks, Task, Goal } from "./hooks/useTasks";
import { useCalendar } from "./hooks/useCalendar";
import { useGemini } from "./hooks/useGemini";
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  db,
  getAccessToken 
} from "./services/firebaseService";
import TaskCard from "./components/TaskCard";
import ScheduleView, { ScheduleSlot } from "./components/ScheduleView";
import VoiceInput from "./components/VoiceInput";
import AIInsightBanner from "./components/AIInsightBanner";

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [apiHealthStatus, setApiHealthStatus] = useState<"checking" | "healthy" | "unreachable">("checking");

  // Sandbox fallback states if user bypasses Google Sign-In to demo
  const [sandboxTasks, setSandboxTasks] = useState<Task[]>([]);
  const [sandboxGoals, setSandboxGoals] = useState<Goal[]>([]);
  const [sandboxSchedule, setSandboxSchedule] = useState<ScheduleSlot[]>([]);

  // Core business intelligence hooks
  const { 
    tasks, 
    goals, 
    loadingTasks, 
    loadingGoals, 
    addTask, 
    updateTask, 
    deleteTask,
    addGoal,
    updateGoalProgress,
    deleteGoal
  } = useTasks(user?.uid || null);

  const { 
    events, 
    freeSlots, 
    calendarError,
    loadCalendar, 
    createEvent 
  } = useCalendar();

  const { 
    analyzing, 
    planning, 
    parsingVoice, 
    generatingSummary,
    parseVoiceNote, 
    analyzeTask, 
    optimizeSchedule, 
    getProactiveReminder,
    getEndOfDaySummary 
  } = useGemini();

  // Schedule representation
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [insightSummary, setInsightSummary] = useState<any>(null);
  
  // UI inputs
  const [titleInput, setTitleInput] = useState("");
  const [priorityInput, setPriorityInput] = useState<"low" | "medium" | "high">("medium");
  const [deadlineInput, setDeadlineInput] = useState("");
  const [effortInput, setEffortInput] = useState(30);

  // Goal setters
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState(5);

  // Sentinel Alerts
  const [activeAlert, setActiveAlert] = useState<string | null>(null);

  // Current list of active tasks based on current mode (Google Auth vs Sandbox)
  const activeTasks = sandboxMode ? sandboxTasks : tasks;
  const activeGoals = sandboxMode ? sandboxGoals : goals;
  const activeSchedule = sandboxMode ? sandboxSchedule : schedule;

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
        setSandboxMode(false);
        loadCalendar(token);
      },
      () => {
        // Only force auth if sandbox is not toggled
        if (!sandboxMode) {
          setNeedsAuth(true);
        }
      }
    );
    return () => unsubscribe();
  }, [loadCalendar, sandboxMode]);

  // Check backend API connection health
  useEffect(() => {
    const checkApiHealth = async () => {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || "";
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.ok) {
          setApiHealthStatus("healthy");
        } else {
          setApiHealthStatus("unreachable");
        }
      } catch (e) {
        setApiHealthStatus("unreachable");
      }
    };
    checkApiHealth();
  }, []);

  // Proactive Auto-Replan Trigger:
  // Whenever any task is added or changed, silently re-optimize Today's Battle Plan schedule with AI!
  useEffect(() => {
    if (activeTasks.length > 0) {
      const pendingTasks = activeTasks.filter(t => !t.completed);
      // Run quick scheduling
      handleAIReplanSilently(pendingTasks);
    }
  }, [activeTasks.length]);

  // Proactive Deadline Sentinel: Runs background checks every 30 minutes to alert user if deadlines are near and progress is low
  useEffect(() => {
    const runSentinelCheck = async () => {
      const pending = activeTasks.filter(t => !t.completed);
      for (const t of pending) {
        const hrsRemaining = (new Date(t.deadline).getTime() - new Date().getTime()) / 3600000;
        
        // Calculate subtask completion percentage
        const completedSubs = t.subtasks.filter(s => s.completed).length;
        const progress = t.subtasks.length > 0 ? (completedSubs / t.subtasks.length) * 100 : 0;

        if (hrsRemaining > 0 && hrsRemaining <= 12 && progress < 50) {
          // Trigger proactive motivator reminder via Gemini
          const reminderMsg = await getProactiveReminder(t.title, `${Math.round(hrsRemaining)} hours`, Math.round(progress));
          setActiveAlert(reminderMsg);
          break; // Show one critical alert at a time
        }
      }
    };

    runSentinelCheck();
    const interval = setInterval(runSentinelCheck, 30 * 60 * 1000); // 30 mins
    return () => clearInterval(interval);
  }, [activeTasks, getProactiveReminder]);

  // Offline Sandbox setup for testing immediately within 10 seconds
  const handleLaunchSandbox = () => {
    setNeedsAuth(false);
    setSandboxMode(true);
    
    // Create 5 sample tasks (Pre-Demo Checklist standard)
    const sampleTasks: Task[] = [
      {
        id: "sb_1",
        title: "Submit Q2 Financial Reporting & Spreadsheet Audit",
        deadline: new Date(Date.now() + 6 * 3600000).toISOString(), // due in 6 hrs
        priority: "high",
        estimatedMinutes: 90,
        effort: 90,
        completionPercent: 33,
        aiUrgencyScore: 9,
        urgencyScore: 9,
        subtasks: [
          { title: "Review balance sheet ratios", completed: true },
          { title: "Verify transaction categories", completed: false },
          { title: "Write executive overview paragraph", completed: false }
        ],
        completed: false,
        userId: "sandbox_user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        suggestedTime: "11:00 - 12:30",
        aiReason: "Urgent core compliance item. Recommended for early afternoon peak concentration slot.",
        reasoning: "Urgent core compliance item. Recommended for early afternoon peak concentration slot.",
        scheduledBlock: null
      },
      {
        id: "sb_2",
        title: "Draft Marketing Pitch Deck & Asset Selection",
        deadline: new Date(Date.now() + 28 * 3600000).toISOString(), // due tomorrow
        priority: "medium",
        estimatedMinutes: 60,
        effort: 60,
        completionPercent: 0,
        aiUrgencyScore: 6,
        urgencyScore: 6,
        subtasks: [
          { title: "Select landing page screenshots", completed: false },
          { title: "Draft target demographic slide", completed: false }
        ],
        completed: false,
        userId: "sandbox_user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        suggestedTime: "14:00 - 15:00",
        aiReason: "Due tomorrow morning. Better to block early draft slot to prevent midnight rush.",
        reasoning: "Due tomorrow morning. Better to block early draft slot to prevent midnight rush.",
        scheduledBlock: null
      },
      {
        id: "sb_3",
        title: "Schedule Performance Review Meeting",
        deadline: new Date(Date.now() + 48 * 3600000).toISOString(),
        priority: "low",
        estimatedMinutes: 15,
        effort: 15,
        completionPercent: 0,
        aiUrgencyScore: 3,
        urgencyScore: 3,
        subtasks: [],
        completed: false,
        userId: "sandbox_user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        suggestedTime: "16:00 - 16:15",
        aiReason: "Low effort, light communication task. Fits nicely during lower afternoon energy levels.",
        reasoning: "Low effort, light communication task. Fits nicely during lower afternoon energy levels.",
        scheduledBlock: null
      },
      {
        id: "sb_4",
        title: "Record Pitch Video & Render Demo Clip",
        deadline: new Date(Date.now() + 12 * 3600000).toISOString(),
        priority: "high",
        estimatedMinutes: 45,
        effort: 45,
        completionPercent: 0,
        aiUrgencyScore: 8,
        urgencyScore: 8,
        subtasks: [
          { title: "Record screen captures of battle planner", completed: false },
          { title: "Voiceover script generation and editing", completed: false }
        ],
        completed: false,
        userId: "sandbox_user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        suggestedTime: "15:00 - 15:45",
        aiReason: "High priority pitch asset needed for hackathon submission.",
        reasoning: "High priority pitch asset needed for hackathon submission.",
        scheduledBlock: null
      },
      {
        id: "sb_5",
        title: "Review Applet Security Rules & Firebase Config",
        deadline: new Date(Date.now() + 72 * 3600000).toISOString(),
        priority: "low",
        estimatedMinutes: 30,
        effort: 30,
        completionPercent: 50,
        aiUrgencyScore: 2,
        urgencyScore: 2,
        subtasks: [
          { title: "Validate Firestore collection rules", completed: true },
          { title: "Double-check auth domain configuration", completed: false }
        ],
        completed: false,
        userId: "sandbox_user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        suggestedTime: "16:15 - 16:45",
        aiReason: "Deployment audit. Best scheduled during casual late-week slots.",
        reasoning: "Deployment audit. Best scheduled during casual late-week slots.",
        scheduledBlock: null
      }
    ];

    const sampleGoals: Goal[] = [
      { id: "sg_1", title: "Complete 5 high impact coding blocks", progress: 2, target: 5, userId: "sandbox_user", createdAt: new Date().toISOString() },
      { id: "sg_2", title: "Clear 10 critical inbox threads", progress: 7, target: 10, userId: "sandbox_user", createdAt: new Date().toISOString() }
    ];

    setSandboxTasks(sampleTasks);
    setSandboxGoals(sampleGoals);

    // Run AI scheduling block on sandbox load
    const mockFreeSlots = [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }];
    const runSandboxAIPlan = async () => {
      const planResult = await optimizeSchedule(sampleTasks, mockFreeSlots);
      if (planResult?.plan) {
        setSandboxSchedule(planResult.plan);
      }
    };
    runSandboxAIPlan();
  };

  const handleAIReplanSilently = async (pendingTasks: Task[]) => {
    // Collect free slots from Google Calendar or mock slots
    const slots = accessToken ? freeSlots : [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }];
    const res = await optimizeSchedule(pendingTasks, slots);
    if (res?.plan) {
      if (sandboxMode) {
        setSandboxSchedule(res.plan);
      } else {
        setSchedule(res.plan);
      }
    }
  };

  // Google Sign-In action handler
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setSandboxMode(false);
        // Load initial calendar integration
        await loadCalendar(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login authorization flow failed:", err);
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes("popup-closed-by-user") || errorMsg.includes("auth/popup-closed-by-user")) {
        setLoginError("popup-closed-by-user");
      } else {
        setLoginError(errorMsg);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Log out handler
  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setSandboxMode(false);
    setSchedule([]);
    setInsightSummary(null);
  };

  // Voice Transcript Captured Event
  const handleVoiceTranscriptCaptured = async (transcript: string) => {
    const data = await parseVoiceNote(transcript);
    if (data) {
      setTitleInput(data.title || "");
      setPriorityInput(data.priority || "medium");
      setEffortInput(data.estimatedMinutes || 30);
      
      // Auto-compute reasonable tomorrow afternoon deadline if not parsed
      if (data.deadline) {
        setDeadlineInput(new Date(data.deadline).toISOString().substring(0, 16));
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(17, 0, 0, 0);
        setDeadlineInput(tomorrow.toISOString().substring(0, 16));
      }
    }
  };

  // Manual Task Submission Form
  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !deadlineInput) return;

    const deadlineIso = new Date(deadlineInput).toISOString();

    const tempTask = {
      title: titleInput.trim(),
      deadline: deadlineIso,
      priority: priorityInput,
      effort: Number(effortInput),
      subtasks: [],
      completed: false
    };

    // Analyze task first using Gemini to fill subtasks, urgency, suggest times, and conflicts
    const analysis = await analyzeTask(tempTask, activeTasks);
    
    const taskPayload = {
      ...tempTask,
      urgencyScore: analysis?.urgencyScore || 5,
      subtasks: (analysis?.subtasks || []).map((t: string) => ({ title: t, completed: false })),
      suggestedTime: analysis?.suggestedTime || "15:00 - 15:30",
      reasoning: analysis?.reasoning || "Optimally mapped.",
    };

    if (sandboxMode) {
      const newTaskObj: Task = {
        id: `sb_${Date.now()}`,
        ...taskPayload,
        userId: "sandbox_user",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setSandboxTasks(prev => [newTaskObj, ...prev]);
    } else {
      await addTask(taskPayload);
    }

    // Reset fields
    setTitleInput("");
    setDeadlineInput("");
    setEffortInput(30);
    setPriorityInput("medium");
  };

  // Update Task attributes (such as subtask status or complete state)
  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    if (sandboxMode) {
      setSandboxTasks(prev => 
        prev.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)
      );
    } else {
      await updateTask(taskId, updates);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (sandboxMode) {
      setSandboxTasks(prev => prev.filter(t => t.id !== taskId));
    } else {
      await deleteTask(taskId);
    }
  };

  // Manual Add goal
  const handleGoalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;

    if (sandboxMode) {
      const newGoalObj: Goal = {
        id: `sg_${Date.now()}`,
        title: goalTitle.trim(),
        progress: 0,
        target: Number(goalTarget),
        userId: "sandbox_user",
        createdAt: new Date().toISOString()
      };
      setSandboxGoals(prev => [...prev, newGoalObj]);
    } else {
      await addGoal(goalTitle.trim(), Number(goalTarget));
    }

    setGoalTitle("");
    setGoalTarget(5);
  };

  // Increment goal habit progress
  const handleIncrementGoal = async (goalId: string, current: number, max: number) => {
    if (current >= max) return;
    if (sandboxMode) {
      setSandboxGoals(prev => 
        prev.map(g => g.id === goalId ? { ...g, progress: current + 1 } : g)
      );
    } else {
      await updateGoalProgress(goalId, current + 1);
    }
  };

  // Delete goal
  const handleDeleteGoal = async (goalId: string) => {
    if (sandboxMode) {
      setSandboxGoals(prev => prev.filter(g => g.id !== goalId));
    } else {
      await deleteGoal(goalId);
    }
  };

  // Call calendar add event on behalf of user
  const handleCalendarExport = async (task: Task) => {
    if (!accessToken) return;
    const desc = `Urgency rating: ${task.urgencyScore}/10.\nReasoning: ${task.reasoning || ""}`;
    
    // Choose start hour representing today or tomorrow
    const startTime = new Date();
    startTime.setHours(14, 0, 0, 0); // Default to 2 PM block
    const eventId = await createEvent(accessToken, task.title, desc, startTime.toISOString(), task.effort);
    if (eventId) {
      await handleUpdateTask(task.id, { calendarEventId: eventId });
    }
  };

  // End of day summaries
  const handleGenerateSummary = async () => {
    const completed = activeTasks.filter(t => t.completed);
    const summaryData = await getEndOfDaySummary(completed);
    if (summaryData) {
      setInsightSummary(summaryData);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      
      {/* Landing / Welcome Screen if needs auth and not in sandbox mode */}
      {needsAuth && !sandboxMode ? (
        <div id="welcome-screen" className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto gap-8 relative">
          
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl -z-10 animate-pulse" />

          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-3xl shadow-2xl">
              <Sparkles className="w-12 h-12 text-teal-400 animate-pulse" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent text-center">
              Kairos
            </h1>
            <p className="text-sm text-slate-400 font-semibold tracking-wider uppercase text-center">
              Act at the right moment, every time
            </p>
          </div>

          <p className="text-slate-300 leading-relaxed text-sm">
            Tired of missing deadlines or getting overwhelmed? Kairos proactively schedules your tasks, scans calendars for free spots, detects conflicts, and nudges you before it's too late.
          </p>

          <div className="flex flex-col gap-3 w-full">
            {/* Standard "Sign in with Google" Button using official branding syntax */}
            <button 
              id="google-signin-btn"
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-white text-slate-950 font-bold py-3.5 px-6 rounded-2xl hover:bg-slate-100 active:scale-[0.98] transition-all cursor-pointer shadow-lg disabled:opacity-50"
            >
              {isLoggingIn ? (
                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
              ) : (
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5 shrink-0">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
              )}
              <span>Sign in with Google</span>
            </button>

            <button
              id="sandbox-demo-btn"
              onClick={handleLaunchSandbox}
              className="w-full bg-slate-900 border border-slate-800 text-slate-300 font-semibold py-3 px-6 rounded-2xl hover:bg-slate-800 hover:text-white transition-all active:scale-[0.98] cursor-pointer text-sm"
            >
              Explore AI Sandbox Mode (Instant Onboarding)
            </button>

            {apiHealthStatus === "unreachable" && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/20 rounded-2xl text-left text-xs text-amber-200 flex flex-col gap-2 shadow-inner">
                <div className="flex items-center gap-2 text-amber-400">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-bold">Backend API Connection Alert</span>
                </div>
                <div className="leading-relaxed space-y-1 text-slate-300 text-[11px]">
                  <p>The client application cannot connect to the backend server. If you have deployed this project to Vercel/Render, please check that:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
                    <li>Your Vercel deployment has the Environment Variable <strong className="text-white">VITE_API_BASE_URL</strong> set to your exact Render service URL (e.g., <code className="text-teal-300 text-[10px]">https://your-backend.onrender.com</code>).</li>
                    <li>Your Render backend has <strong className="text-white">FRONTEND_URL</strong> set to your Vercel URL.</li>
                    <li>If Render is spun down (due to inactive free tier sleep), it may take 50 seconds to boot on the first visit.</li>
                  </ul>
                </div>
              </div>
            )}

            {loginError && (
              <div className="mt-2 p-4 bg-red-950/40 border border-red-500/20 rounded-2xl text-left text-xs text-red-200 flex flex-col gap-2 shadow-inner">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <span className="font-bold">Google Sign-In Issue</span>
                </div>
                {loginError === "popup-closed-by-user" ? (
                  <div className="leading-relaxed space-y-2">
                    <p>The sign-in popup was closed before authentication finished.</p>
                    <div>
                      <strong className="block text-teal-300">How to fix this:</strong>
                      <span className="block mt-1">1. If running inside the AI Studio coding workspace, click the <strong className="text-white">Open in New Tab</strong> icon in the top right corner of the preview panel to run the app directly, then sign in.</span>
                      <span className="block mt-1">2. Ensure you have added this domain to the <strong className="text-white">Authorized Domains</strong> list in your Firebase Console (Authentication &rarr; Settings &rarr; Authorized Domains).</span>
                      <span className="block mt-1">3. Make sure popups are allowed in your browser, and third-party cookies are not blocked.</span>
                    </div>
                  </div>
                ) : (
                  <p className="leading-relaxed font-mono text-[10px] bg-black/30 p-2 rounded-lg break-all">
                    {loginError}
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            Secure enterprise databases and calendar integrations powered with Google Cloud OAuth authentication permissions.
          </p>

        </div>
      ) : (
        
        // Main authenticated dashboard workspace
        <div id="main-dashboard-view" className="flex-1 flex flex-col w-full max-w-7xl mx-auto px-4 py-6 gap-6">
          
          {/* Header Navigation Bar */}
          <header className="flex justify-between items-center bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-xl">
                <Flame className="w-5 h-5 text-teal-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
                  Kairos
                </h1>
                <p className="text-[10px] text-slate-500 font-medium tracking-wide">
                  {sandboxMode ? "⚠️ sandbox coaching mode" : `👤 sync: ${user?.email}`}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 bg-slate-950 px-3 py-1.5 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Leave Board</span>
            </button>
          </header>

          {/* Google Calendar scopes / permissions notice */}
          {calendarError && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row items-start gap-4 text-sm text-amber-200">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <span className="font-extrabold text-amber-400 block text-base">Google Calendar Sync Paused</span>
                  <p className="text-xs text-slate-400 mt-1">
                    Your Google account was linked, but the necessary permissions to read/write calendar events were not granted.
                  </p>
                </div>
                <div className="bg-black/30 p-3 rounded-xl space-y-2 text-xs border border-slate-800/50">
                  <span className="font-bold text-teal-300 block">How to resolve this:</span>
                  <ul className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                    <li>Click <strong className="text-white">Leave Board</strong> (top right) to sign out of your current session.</li>
                    <li>Click <strong className="text-white">Link Google Calendar</strong> to open the Google Sign-In popup again.</li>
                    <li>
                      <strong className="text-amber-300">CRITICAL CHECKBOXES:</strong> When Google displays the permissions screen, you <strong className="text-amber-300">MUST manually check the checkboxes</strong> to grant permission for:
                      <div className="pl-4 mt-1 text-slate-400 italic">
                        &bull; "See, edit, share, and permanently delete all the calendars you can access using Google Calendar"<br/>
                        &bull; "See and download all your Google Calendars"
                      </div>
                    </li>
                    <li>If you do not check those boxes, Google Calendar sync, Today's Battle Plan, and proactive Coach nudges will remain inactive.</li>
                  </ul>
                </div>
                <div className="text-[10px] text-slate-500 font-mono break-all leading-normal bg-black/10 p-2 rounded-lg">
                  System Error: {calendarError}
                </div>
              </div>
            </div>
          )}

          {/* Critical sentinel alarm notices */}
          {activeAlert && (
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex items-start gap-3 text-sm text-red-200 animate-pulse relative">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block text-red-400 mb-0.5">Sentinel Alert Nudge</span>
                {activeAlert}
              </div>
              <button 
                onClick={() => setActiveAlert(null)}
                className="text-xs text-slate-400 hover:text-slate-100 underline self-start shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Top level AI Coach and recommendation banner */}
          <AIInsightBanner 
            tasks={activeTasks} 
            summary={insightSummary}
            onGenerateSummary={handleGenerateSummary}
            isLoadingSummary={generatingSummary}
          />

          <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Sidebar: Intake Panels, Voice Parser, Weekly Habit Goals */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Task creation / Intake panel */}
              <section className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-4">
                  <Sliders className="w-5 h-5 text-teal-400" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">Add Task Block</h2>
                </div>

                <form onSubmit={handleTaskSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Task Title / Brief</label>
                    <input
                      type="text"
                      placeholder="e.g. Code auth backend endpoints"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-semibold block mb-1.5">Priority Nudge</label>
                      <select
                        value={priorityInput}
                        onChange={(e: any) => setPriorityInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 font-semibold block mb-1.5">Effort (Minutes)</label>
                      <input
                        type="number"
                        min="5"
                        max="480"
                        value={effortInput}
                        onChange={(e) => setEffortInput(Number(e.target.value))}
                        required
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 font-semibold block mb-1.5">Deadline target</label>
                    <input
                      type="datetime-local"
                      value={deadlineInput}
                      onChange={(e) => setDeadlineInput(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={analyzing}
                    className="w-full mt-2 bg-gradient-to-r from-teal-500 to-teal-400 text-slate-950 font-bold py-3 rounded-xl text-sm hover:from-teal-400 hover:to-teal-300 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-teal-500/10 disabled:opacity-50"
                  >
                    {analyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                        AI is planning subtasks...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Save & Auto-Optimize
                      </>
                    )}
                  </button>
                </form>
              </section>

              {/* Voice-Enabled input card */}
              <VoiceInput 
                onTranscriptCaptured={handleVoiceTranscriptCaptured}
                isLoading={parsingVoice}
              />

              {/* Weekly Habit Goals setter */}
              <section className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl backdrop-blur-md">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-5 h-5 text-teal-400" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-100">Weekly Habit Goals</h2>
                </div>

                <form onSubmit={handleGoalSubmit} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="e.g. Finish 5 coding tasks"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    required
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                  />
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(Number(e.target.value))}
                    className="w-12 bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-center text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                  <button 
                    type="submit" 
                    className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-3 rounded-xl text-xs font-bold"
                  >
                    Set
                  </button>
                </form>

                {activeGoals.length > 0 ? (
                  <div className="flex flex-col gap-3.5">
                    {activeGoals.map((g) => {
                      const pct = Math.min(100, (g.progress / g.target) * 100);
                      return (
                        <div key={g.id} className="text-xs">
                          <div className="flex justify-between text-[11px] text-slate-300 font-medium mb-1.5">
                            <span className="truncate pr-2">🏆 {g.title}</span>
                            <span className="font-mono">{g.progress}/{g.target}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800/80">
                              <div 
                                className="bg-teal-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            
                            <button
                              onClick={() => handleIncrementGoal(g.id, g.progress, g.target)}
                              disabled={g.progress >= g.target}
                              className="text-[10px] bg-slate-800 hover:bg-slate-700 hover:text-white px-2 py-0.5 rounded border border-slate-700 disabled:opacity-30"
                            >
                              +1
                            </button>
                            
                            <button
                              onClick={() => {
                                if (confirm(`Remove habit: "${g.title}"?`)) {
                                  handleDeleteGoal(g.id);
                                }
                              }}
                              className="text-[10px] text-slate-600 hover:text-red-400"
                            >
                              remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">No weekly goals set yet. Let's aim high!</p>
                )}
              </section>

            </div>

            {/* Middle and Right: Task Board & Timetable Battle plan */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Task list Column */}
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center bg-slate-900/40 border border-slate-800/80 px-4 py-3 rounded-2xl">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-teal-400" />
                    Board Tasks ({activeTasks.length})
                  </h3>
                </div>

                {activeTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 bg-slate-900/10 border border-slate-900/20 rounded-2xl gap-2">
                    <Sliders className="w-8 h-8 text-slate-700" />
                    <p className="text-sm font-semibold">Your board is clear</p>
                    <p className="text-xs text-slate-600 max-w-xs px-4">
                      Add items to get AI scheduling suggestions, subtask breakdowns, and deadline tracking.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {activeTasks.map((t) => {
                      // Detect calendar conflicts inline on task cards
                      // Check if tasks overlaps with any schedule slots that are critical
                      const hasConflict = activeSchedule.some(s => s.taskId === t.id && s.isCritical);
                      return (
                        <TaskCard
                          key={t.id}
                          task={t}
                          onUpdate={handleUpdateTask}
                          onDelete={handleDeleteTask}
                          calendarToken={accessToken}
                          onAddToCalendar={handleCalendarExport}
                          calendarConflicts={hasConflict ? ["Conflict detected"] : []}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Schedule view Column */}
              <ScheduleView
                schedule={activeSchedule}
                onReoptimize={() => handleAIReplanSilently(activeTasks.filter(t => !t.completed))}
                isPlanning={planning}
                tasks={activeTasks}
              />

            </div>

          </main>

        </div>
      )}

      {/* Footer Branding credits */}
      <footer className="py-6 text-center text-[10px] text-slate-600 border-t border-slate-900 mt-auto">
        <p>Kairos — Act at the right moment, every time © 2026. Proactive coaching engine powered by Google Gemini 3.5 & Google Calendar.</p>
      </footer>

    </div>
  );
}

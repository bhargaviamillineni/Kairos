import { useState, useCallback } from "react";

const rawApiUrl = (import.meta as any).env?.VITE_API_BASE_URL || "";
const API_BASE_URL = rawApiUrl.trim().replace(/\/$/, "");

export function useGemini() {
  const [analyzing, setAnalyzing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [parsingVoice, setParsingVoice] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Calls the server-side API to parse voice notes
  const parseVoiceNote = useCallback(async (transcript: string) => {
    setParsingVoice(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gemini/parse-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, currentTime: new Date().toISOString() })
      });
      if (!res.ok) throw new Error("Failed to parse voice note with Gemini API");
      const data = await res.json();
      return data;
    } catch (error) {
      console.warn("Falling back to local heuristic for parseVoiceNote:", error);
      
      const lowerTranscript = transcript.toLowerCase();
      
      let priority: "low" | "medium" | "high" = "medium";
      if (lowerTranscript.includes("high") || lowerTranscript.includes("urgent") || lowerTranscript.includes("critical") || lowerTranscript.includes("asap")) {
        priority = "high";
      } else if (lowerTranscript.includes("low") || lowerTranscript.includes("minor") || lowerTranscript.includes("casual")) {
        priority = "low";
      }

      let estimatedMinutes = 30;
      const minutesMatch = lowerTranscript.match(/(\d+)\s*(minute|min)/);
      const hoursMatch = lowerTranscript.match(/(\d+)\s*(hour|hr)/);
      if (minutesMatch) {
        estimatedMinutes = parseInt(minutesMatch[1], 10);
      } else if (hoursMatch) {
        estimatedMinutes = parseInt(hoursMatch[1], 10) * 60;
      } else if (lowerTranscript.includes("half an hour") || lowerTranscript.includes("half hour")) {
        estimatedMinutes = 30;
      } else if (lowerTranscript.includes("one hour") || lowerTranscript.includes("an hour")) {
        estimatedMinutes = 60;
      }

      const now = new Date();
      let deadlineDate = new Date(now.getTime() + 24 * 3600000); // default to tomorrow
      if (lowerTranscript.includes("today") || lowerTranscript.includes("tonight")) {
        deadlineDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0); // 6 PM today
      } else if (lowerTranscript.includes("tomorrow")) {
        deadlineDate = new Date(now.getTime() + 24 * 3600000);
        deadlineDate.setHours(17, 0, 0); // 5 PM tomorrow
      } else if (lowerTranscript.includes("next week")) {
        deadlineDate = new Date(now.getTime() + 7 * 24 * 3600000);
      }

      let title = transcript.replace(/high priority|medium priority|low priority|urgent|critical/gi, "").trim();
      if (title.length > 1) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      } else {
        title = "Voice Input Task";
      }

      return {
        title,
        deadline: deadlineDate.toISOString(),
        priority,
        estimatedMinutes
      };
    } finally {
      setParsingVoice(false);
    }
  }, []);

  // Calls the server-side API to analyze a newly entered task
  const analyzeTask = useCallback(async (newTask: any, existingTasks: any[]) => {
    setAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gemini/analyze-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          newTask, 
          existingTasks, 
          currentTime: new Date().toISOString() 
        })
      });
      if (!res.ok) throw new Error("Failed to analyze task with Gemini API");
      const data = await res.json();
      return data;
    } catch (error) {
      console.warn("Falling back to local heuristic for analyzeTask:", error);

      const title = (newTask.title || "").toLowerCase();
      const priority = newTask.priority || "medium";
      
      let urgencyScore = 5;
      if (priority === "high") urgencyScore = 8;
      else if (priority === "low") urgencyScore = 3;

      const deadlineTime = new Date(newTask.deadline).getTime();
      const nowTime = Date.now();
      const hoursRemaining = (deadlineTime - nowTime) / 3600000;
      if (hoursRemaining > 0 && hoursRemaining < 12) {
        urgencyScore = Math.min(10, urgencyScore + 2);
      }

      let subtasks = [
        "Prepare initial project references and dependencies",
        "Execute the core implementation blocks and features",
        "Run final validation testing and review performance metrics"
      ];

      if (title.includes("code") || title.includes("dev") || title.includes("build") || title.includes("program") || title.includes("endpoint") || title.includes("api")) {
        subtasks = [
          "Setup the mock module test environments and code files",
          "Implement core algorithmic calculations and endpoints",
          "Refactor variable structures and verify through unit tests"
        ];
      } else if (title.includes("design") || title.includes("figma") || title.includes("ui") || title.includes("ux") || title.includes("wireframe") || title.includes("css")) {
        subtasks = [
          "Research visual patterns and assemble color scheme references",
          "Draft structural wireframe components in visual grid layout",
          "Refine typographic sizing hierarchies and export assets"
        ];
      } else if (title.includes("write") || title.includes("draft") || title.includes("document") || title.includes("report") || title.includes("essay") || title.includes("email") || title.includes("proposal")) {
        subtasks = [
          "Collect core facts, summaries, and structural references",
          "Draft initial outlines and fill essential sections",
          "Proofread tone, clarify arguments, and verify formatting"
        ];
      }

      const conflicts: string[] = [];
      if (Array.isArray(existingTasks)) {
        for (const t of existingTasks) {
          if (!t.completed && t.deadline) {
            const tDeadline = new Date(t.deadline).getTime();
            const diffHrs = Math.abs(deadlineTime - tDeadline) / 3600000;
            if (diffHrs < 2) {
              conflicts.push(`Overlapping deadline warning: '${t.title}' is due extremely close to this task.`);
            }
          }
        }
      }

      let suggestedTime = "14:00 - 15:30";
      if (priority === "high") {
        suggestedTime = "09:30 - 11:00";
      } else if (priority === "low") {
        suggestedTime = "16:15 - 17:00";
      }

      const reasoning = `This high-impact ${priority} priority task requires around ${newTask.estimatedMinutes || 30}m. Positioned in optimal peak-energy block. (Using Client-side Adaptive Fallback)`;

      return {
        urgencyScore,
        subtasks,
        conflicts,
        suggestedTime,
        reasoning
      };
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // Calls the server-side API to generate an optimized schedule / Today's Battle Plan
  const optimizeSchedule = useCallback(async (tasks: any[], freeSlots: any[]) => {
    setPlanning(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gemini/battle-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          tasks, 
          freeSlots, 
          currentTime: new Date().toISOString() 
        })
      });
      if (!res.ok) throw new Error("Failed to generate Battle Plan with Gemini API");
      const data = await res.json();
      return data;
    } catch (error) {
      console.warn("Falling back to local heuristic for optimizeSchedule:", error);
      
      const plan: any[] = [];
      
      const pendingTasks = [...tasks]
        .filter(t => !t.completed)
        .sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          const aVal = priorityOrder[a.priority as keyof typeof priorityOrder] || 2;
          const bVal = priorityOrder[b.priority as keyof typeof priorityOrder] || 2;
          return bVal - aVal;
        });

      let slots = [{ start: "09:00", end: "10:30" }, { start: "11:00", end: "12:30" }, { start: "14:00", end: "15:30" }, { start: "16:00", end: "17:00" }];
      if (Array.isArray(freeSlots) && freeSlots.length > 0) {
        slots = freeSlots.map((s) => ({
          start: s.start || "09:00",
          end: s.end || "12:00"
        }));
      }

      const now = new Date();

      pendingTasks.forEach((task, index) => {
        const slot = slots[index % slots.length] || { start: "09:00", end: "10:00" };
        
        const deadlineTime = new Date(task.deadline).getTime();
        const hrsRemaining = (deadlineTime - now.getTime()) / 3600000;
        const isCritical = hrsRemaining > 0 && hrsRemaining <= 24;

        let action = `Focus on completing the core aspects of: ${task.title}.`;
        if (Array.isArray(task.subtasks) && task.subtasks.length > 0) {
          const unfinished = task.subtasks.find((s: any) => !s.completed);
          if (unfinished) {
            action = `Start subtask: "${unfinished.title}" inside "${task.title}".`;
          }
        }

        plan.push({
          time: `${slot.start} - ${slot.end}`,
          taskId: task.id,
          action,
          duration: task.estimatedMinutes || 45,
          reason: isCritical 
            ? `Deadline is approaching rapidly (due in ${Math.round(hrsRemaining)}h). Crucial focus now. (Local Plan)` 
            : `Perfect match for your current mental energy parameters. (Local Plan)`,
          isCritical
        });

        if (index % 2 === 0) {
          plan.push({
            time: "15:30 - 15:45",
            taskId: "rest",
            action: "Step away from screen, grab glass of water, breathe deeply for 5 minutes.",
            duration: 15,
            reason: "Scientific energy recovery break to prevent focus fatigue. (Local Plan)",
            isCritical: false
          });
        }
      });

      if (plan.length === 0) {
        plan.push({
          time: "09:00 - 09:30",
          taskId: "buffer",
          action: "Create a list of high-value priority items and draft tomorrow morning focuses.",
          duration: 30,
          reason: "Excellent habit to initialize productivity loops. (Local Plan)",
          isCritical: false
        });
      }

      plan.sort((a, b) => a.time.localeCompare(b.time));

      return { plan };
    } finally {
      setPlanning(false);
    }
  }, []);

  // Calls the server-side API to generate context-aware proactive reminders
  const getProactiveReminder = useCallback(async (taskName: string, timeRemaining: string, completionPercent: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/gemini/reminder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskName, timeRemaining, completionPercent })
      });
      if (!res.ok) throw new Error("Failed to generate proactive reminder");
      const data = await res.json();
      return data?.message || "";
    } catch (error) {
      console.warn("Falling back to local heuristic for getProactiveReminder:", error);
      
      let message = `Let's make some momentum on "${taskName}". You're currently ${completionPercent}% done!`;
      if (completionPercent < 30) {
        message = `Proactive coach here! Your deadline for "${taskName}" is approaching in ${timeRemaining}. Let's take 10 minutes to draft an initial plan of action!`;
      } else if (completionPercent < 80) {
        message = `Great momentum! You are ${completionPercent}% complete with "${taskName}". Only a few steps remaining before the deadline in ${timeRemaining}. Keep going!`;
      } else {
        message = `Almost there! "${taskName}" is ${completionPercent}% complete. Let's push through the final deliverables before the deadline in ${timeRemaining}!`;
      }

      return message;
    }
  }, []);

  // Calls the server-side API to get the end-of-day summary
  const getEndOfDaySummary = useCallback(async (completedTasks: any[]) => {
    setGeneratingSummary(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gemini/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedTasks })
      });
      if (!res.ok) throw new Error("Failed to generate productivity summary");
      const data = await res.json();
      return data;
    } catch (error) {
      console.warn("Falling back to local heuristic for getEndOfDaySummary:", error);

      const count = Array.isArray(completedTasks) ? completedTasks.length : 0;
      
      let summary = "A quiet day on the task board. Setting up small, achievable goals is a great way to start building daily streaks!";
      let wins = [
        "Secured healthy downtime blocks",
        "Organized core future targets and deadlines"
      ];
      let tip = "Try using voice-note intake tomorrow morning to outline tasks under 15 seconds without administrative friction.";
      let priority = "Determine tomorrow morning's single most critical high-value milestone.";

      if (count > 0) {
        summary = `Fantastic job today! You powered through and checked off ${count} key task blocks. You kept your deadlines well managed and avoided midnight rushes.`;
        wins = [
          `Successfully completed ${count} high-focus deliverables`,
          "Maintained disciplined focus structures with clear hourly segments"
        ];
        tip = "Consider scheduling high-energy creative tasks early in the morning, and saving lower-energy admin tasks for the afternoon slump.";
        
        const firstTask = completedTasks[0]?.title || "next objective";
        priority = `Establish structural blueprints for the next phase of: ${firstTask}.`;
      }

      return {
        summary,
        wins,
        tip,
        priority
      };
    } finally {
      setGeneratingSummary(false);
    }
  }, []);

  return {
    analyzing,
    planning,
    parsingVoice,
    generatingSummary,
    parseVoiceNote,
    analyzeTask,
    optimizeSchedule,
    getProactiveReminder,
    getEndOfDaySummary
  };
}

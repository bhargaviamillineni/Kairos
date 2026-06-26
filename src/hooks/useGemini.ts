import { useState, useCallback } from "react";

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || "";

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
      console.error("Error in parseVoiceNote:", error);
      return null;
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
      console.error("Error in analyzeTask:", error);
      return null;
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
      console.error("Error in optimizeSchedule:", error);
      return null;
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
      console.error("Error in getProactiveReminder:", error);
      return `Heads up! "${taskName}" is approaching. You've completed ${completionPercent}% of it. Let's make some progress!`;
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
      console.error("Error in getEndOfDaySummary:", error);
      return null;
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

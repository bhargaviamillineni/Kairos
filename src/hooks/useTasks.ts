import { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc,
  orderBy
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../services/firebaseService";

export interface SubTask {
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;                 // uuid
  title: string;
  deadline: string;           // ISO8601 UTC ISO string
  priority: "high" | "medium" | "low";
  estimatedMinutes?: number;  // estimated time (optional for partials)
  completionPercent?: number; // 0-100 (optional for partials)
  subtasks: SubTask[];
  aiUrgencyScore?: number;    // 1-10, set by Gemini
  aiReason?: string;          // one-line Gemini explanation
  scheduledBlock?: {
    start: string;            // ISO8601
    end: string;              // ISO8601
  } | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  calendarEventId?: string | null;

  // Legacy compatibility fields to prevent any crashes or typescript errors on existing code
  completed?: boolean;
  effort?: number;
  urgencyScore?: number;
  reasoning?: string | null;
  suggestedTime?: string | null;
}

export interface Goal {
  id: string;
  title: string;
  progress: number;
  target: number;
  userId: string;
  createdAt: string;
}

export const mapFirestoreDocToTask = (id: string, data: any): Task => {
  const title = data.title || "";
  const deadline = data.deadline || new Date().toISOString();
  const priority = data.priority || "medium";
  
  const estimatedMinutes = data.estimatedMinutes ?? data.effort ?? 30;
  const subtasks = data.subtasks || [];
  
  // Calculate completionPercent if missing
  let completionPercent = data.completionPercent;
  if (completionPercent === undefined) {
    if (data.completed !== undefined) {
      completionPercent = data.completed ? 100 : 0;
    } else {
      const totalSubs = subtasks.length;
      const completedSubs = subtasks.filter((s: any) => s.completed).length;
      completionPercent = totalSubs > 0 ? Math.round((completedSubs / totalSubs) * 100) : 0;
    }
  }

  const aiUrgencyScore = data.aiUrgencyScore ?? data.urgencyScore ?? 5;
  const aiReason = data.aiReason ?? data.reasoning ?? "";
  
  let scheduledBlock = data.scheduledBlock || null;
  if (!scheduledBlock && data.suggestedTime) {
    const times = data.suggestedTime.split("-");
    if (times.length === 2) {
      const now = new Date();
      const startStr = times[0].trim();
      const endStr = times[1].trim();
      const startParts = startStr.split(":");
      const endParts = endStr.split(":");
      if (startParts.length === 2 && endParts.length === 2) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(startParts[0]), parseInt(startParts[1])).toISOString();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(endParts[0]), parseInt(endParts[1])).toISOString();
        scheduledBlock = { start, end };
      }
    }
  }

  const createdAt = data.createdAt || new Date().toISOString();
  const updatedAt = data.updatedAt || new Date().toISOString();

  // Return full object containing both current and legacy fields for perfect compatibility
  return {
    id,
    title,
    deadline,
    priority,
    estimatedMinutes,
    completionPercent,
    subtasks,
    aiUrgencyScore,
    aiReason,
    scheduledBlock,
    createdAt,
    updatedAt,
    userId: data.userId || "",
    calendarEventId: data.calendarEventId || null,

    // Legacy fields for existing view compatibilities
    completed: completionPercent >= 100,
    effort: estimatedMinutes,
    urgencyScore: aiUrgencyScore,
    reasoning: aiReason,
    suggestedTime: data.suggestedTime || (scheduledBlock ? `${new Date(scheduledBlock.start).getHours().toString().padStart(2, '0')}:${new Date(scheduledBlock.start).getMinutes().toString().padStart(2, '0')} - ${new Date(scheduledBlock.end).getHours().toString().padStart(2, '0')}:${new Date(scheduledBlock.end).getMinutes().toString().padStart(2, '0')}` : null)
  };
};

export function useTasks(userId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingGoals, setLoadingGoals] = useState(true);

  // Sync tasks
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoadingTasks(false);
      return;
    }

    setLoadingTasks(true);
    const path = "tasks";
    const q = query(
      collection(db, path),
      where("userId", "==", userId),
      orderBy("deadline", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Task[] = [];
        snapshot.forEach((docSnap) => {
          list.push(mapFirestoreDocToTask(docSnap.id, docSnap.data()));
        });
        setTasks(list);
        setLoadingTasks(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
        setLoadingTasks(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Sync weekly goals (habits)
  useEffect(() => {
    if (!userId) {
      setGoals([]);
      setLoadingGoals(false);
      return;
    }

    setLoadingGoals(true);
    const path = "goals";
    const q = query(
      collection(db, path),
      where("userId", "==", userId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Goal[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Goal);
        });
        setGoals(list);
        setLoadingGoals(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
        setLoadingGoals(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Add Task
  const addTask = async (taskData: Omit<Task, "id" | "userId" | "createdAt" | "updatedAt">) => {
    if (!userId) return null;
    const path = "tasks";
    try {
      const payload: any = {
        ...taskData,
        userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Map Rule 6 fields to ensure consistency
      if (payload.estimatedMinutes === undefined && payload.effort !== undefined) {
        payload.estimatedMinutes = payload.effort;
      }
      if (payload.completionPercent === undefined) {
        payload.completionPercent = payload.completed ? 100 : 0;
      }
      if (payload.aiUrgencyScore === undefined && payload.urgencyScore !== undefined) {
        payload.aiUrgencyScore = payload.urgencyScore;
      }
      if (payload.aiReason === undefined && payload.reasoning !== undefined) {
        payload.aiReason = payload.reasoning;
      }
      if (payload.scheduledBlock === undefined && payload.suggestedTime !== undefined) {
        const times = payload.suggestedTime?.split("-") || [];
        if (times.length === 2) {
          const now = new Date();
          const startParts = times[0].trim().split(":");
          const endParts = times[1].trim().split(":");
          if (startParts.length === 2 && endParts.length === 2) {
            payload.scheduledBlock = {
              start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(startParts[0]), parseInt(startParts[1])).toISOString(),
              end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(endParts[0]), parseInt(endParts[1])).toISOString()
            };
          }
        }
      }

      const docRef = await addDoc(collection(db, path), payload);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return null;
    }
  };

  // Update Task
  const updateTask = async (taskId: string, updates: Partial<Omit<Task, "id" | "userId">>) => {
    const path = `tasks/${taskId}`;
    try {
      const payload: any = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Map Rule 6 fields to ensure consistency
      if (updates.estimatedMinutes !== undefined) {
        payload.effort = updates.estimatedMinutes;
      } else if (updates.effort !== undefined) {
        payload.estimatedMinutes = updates.effort;
      }

      if (updates.completionPercent !== undefined) {
        payload.completed = updates.completionPercent >= 100;
      } else if (updates.completed !== undefined) {
        payload.completionPercent = updates.completed ? 100 : 0;
      }

      if (updates.aiUrgencyScore !== undefined) {
        payload.urgencyScore = updates.aiUrgencyScore;
      } else if (updates.urgencyScore !== undefined) {
        payload.aiUrgencyScore = updates.urgencyScore;
      }

      if (updates.aiReason !== undefined) {
        payload.reasoning = updates.aiReason;
      } else if (updates.reasoning !== undefined) {
        payload.aiReason = updates.reasoning;
      }

      if (updates.scheduledBlock !== undefined) {
        if (updates.scheduledBlock) {
          const start = new Date(updates.scheduledBlock.start);
          const end = new Date(updates.scheduledBlock.end);
          payload.suggestedTime = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')} - ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
        } else {
          payload.suggestedTime = null;
          payload.scheduledBlock = null;
        }
      }

      await updateDoc(doc(db, "tasks", taskId), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  // Delete Task
  const deleteTask = async (taskId: string) => {
    const path = `tasks/${taskId}`;
    try {
      await deleteDoc(doc(db, "tasks", taskId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  // Add Goal
  const addGoal = async (title: string, target: number) => {
    if (!userId) return null;
    const path = "goals";
    try {
      const payload = {
        title,
        progress: 0,
        target,
        userId,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, path), payload);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      return null;
    }
  };

  // Update Goal Progress
  const updateGoalProgress = async (goalId: string, progress: number) => {
    const path = `goals/${goalId}`;
    try {
      await updateDoc(doc(db, "goals", goalId), { progress });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  // Delete Goal
  const deleteGoal = async (goalId: string) => {
    const path = `goals/${goalId}`;
    try {
      await deleteDoc(doc(db, "goals", goalId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return {
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
  };
}

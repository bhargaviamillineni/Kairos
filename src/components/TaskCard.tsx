import React, { useState } from "react";
import { 
  Calendar, 
  Clock, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  Loader2 
} from "lucide-react";
import { Task } from "../hooks/useTasks";
import { SubtaskChecklist } from "./SubtaskChecklist";

interface TaskCardProps {
  key?: React.Key;
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  calendarToken: string | null;
  onAddToCalendar: (task: Task) => Promise<void>;
  calendarConflicts: string[];
}

// Named Constants to avoid magic numbers (Rule 5)
const CRITICAL_HOURS_THRESHOLD = 24;
const IMMINENT_HOURS_THRESHOLD = 48;
const PROGRESS_CRITICAL_THRESHOLD = 50;
const PROGRESS_IMMINENT_THRESHOLD = 80;

export const TaskCard = React.memo(function TaskCard({ 
  task, 
  onUpdate, 
  onDelete, 
  calendarToken, 
  onAddToCalendar,
  calendarConflicts
}: TaskCardProps) {
  const [exportingCalendar, setExportingCalendar] = useState(false);

  // Traffic Light Logic with Named Constants
  const getTrafficLight = () => {
    if (task.completed) {
      return { color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", label: "Completed" };
    }

    const deadlineTime = new Date(task.deadline).getTime();
    const now = new Date().getTime();
    const hoursRemaining = (deadlineTime - now) / 3600000;

    const totalSubs = task.subtasks.length;
    const completedSubs = task.subtasks.filter(s => s.completed).length;
    const progress = totalSubs > 0 ? (completedSubs / totalSubs) * 100 : 0;

    if (hoursRemaining <= 0) {
      return { color: "bg-slate-800 text-rose-500 border-rose-500/30 shadow-none", label: "Overdue" };
    }
    if (hoursRemaining <= CRITICAL_HOURS_THRESHOLD && progress < PROGRESS_CRITICAL_THRESHOLD) {
      return { color: "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse", label: "Critical" };
    }
    if (hoursRemaining <= IMMINENT_HOURS_THRESHOLD && progress < PROGRESS_IMMINENT_THRESHOLD) {
      return { color: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "Imminent" };
    }
    return { color: "bg-teal-500/10 text-teal-400 border-teal-500/20", label: "On Track" };
  };

  const traffic = getTrafficLight();

  const handleToggleCompleted = async () => {
    const completed = !task.completed;
    await onUpdate(task.id, { 
      completed, 
      completionPercent: completed ? 100 : 0
    });
  };

  const handleExport = async () => {
    if (!calendarToken) return;
    setExportingCalendar(true);
    try {
      await onAddToCalendar(task);
    } finally {
      setExportingCalendar(false);
    }
  };

  const formatDeadline = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div id={`task-card-${task.id}`} className={`group relative bg-slate-900/40 border ${task.completed ? "border-slate-800/40 opacity-70" : "border-slate-800/80 hover:border-slate-700/80"} p-5 rounded-2xl backdrop-blur-sm transition-all duration-300 flex flex-col justify-between`}>
      
      <div>
        {/* Visual Traffic Light Tag */}
        <div className="flex justify-between items-start mb-3">
          <span className={`text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full border ${traffic.color}`}>
            {traffic.label}
          </span>
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            <span>{task.estimatedMinutes}m effort</span>
          </div>
        </div>

        {/* Main Title & Action checkbox */}
        <div className="flex items-start gap-3 mb-3">
          <button 
            onClick={handleToggleCompleted} 
            className={`mt-1 rounded-md p-0.5 border flex items-center justify-center transition-colors ${
              task.completed 
                ? "bg-teal-500 border-teal-600 text-slate-950" 
                : "border-slate-700 hover:border-teal-500 text-transparent"
            }`}
          >
            <CheckCircle className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h3 className={`text-sm font-semibold leading-snug text-slate-100 ${task.completed ? "line-through text-slate-500" : ""}`}>
              {task.title}
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-500" />
              Due: {formatDeadline(task.deadline)}
            </p>
          </div>
        </div>

        {/* Urgency Rank Tag & Coach Insight Why */}
        {task.aiReason && (
          <div className="my-2 p-2 rounded-xl bg-slate-950/40 border border-slate-800/40 text-[11px] text-slate-300 leading-relaxed">
            <span className="font-semibold text-teal-400">AI Urgency Score: {task.aiUrgencyScore}/10</span> — {task.aiReason}
          </div>
        )}

        {/* Calendar Conflicts Warning banner */}
        {calendarConflicts && calendarConflicts.length > 0 && !task.completed && (
          <div className="my-2 p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 flex items-start gap-1.5 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Calendar Conflict Detect:</span> Overlaps with existing scheduled slot today.
            </div>
          </div>
        )}

        {/* Subtasks checklists */}
        <SubtaskChecklist task={task} onUpdate={onUpdate} />
      </div>

      {/* Quick Action buttons */}
      <div className="mt-4 border-t border-slate-800/60 pt-3 flex justify-between items-center gap-2">
        {calendarToken ? (
          task.calendarEventId ? (
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-500/5 px-2 py-1 rounded-lg border border-emerald-500/10">
              <CheckCircle className="w-3 h-3" /> synced with calendar
            </span>
          ) : (
            <button
              onClick={handleExport}
              disabled={exportingCalendar || task.completed}
              className="text-[10px] bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 hover:text-teal-300 font-semibold py-1 px-2.5 rounded-lg border border-teal-500/30 transition-all flex items-center gap-1 disabled:opacity-50"
            >
              {exportingCalendar ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Calendar className="w-3 h-3" />
              )}
              Export to Calendar
            </button>
          )
        ) : (
          <span className="text-[10px] text-slate-500 italic">Sign-In for GCalendar integration</span>
        )}

        <button
          onClick={() => {
            if (confirm("Delete this task from your battle board?")) {
              onDelete(task.id);
            }
          }}
          className="p-1 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-950/40"
          title="Delete task"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

    </div>
  );
});

export default TaskCard;

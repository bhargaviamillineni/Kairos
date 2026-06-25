import { Calendar, RefreshCw, Zap, Sparkles, AlertTriangle } from "lucide-react";
import { Task } from "../hooks/useTasks";

export interface ScheduleSlot {
  time: string;
  taskId: string;
  action: string;
  duration: number;
  reason: string;
  isCritical: boolean;
}

interface ScheduleViewProps {
  schedule: ScheduleSlot[];
  onReoptimize: () => void;
  isPlanning: boolean;
  tasks: Task[];
}

export default function ScheduleView({ 
  schedule, 
  onReoptimize, 
  isPlanning,
  tasks 
}: ScheduleViewProps) {
  
  const getTaskTitle = (taskId: string) => {
    if (taskId === "rest" || taskId === "buffer") return "💆 Buffer Block / Recovery Break";
    const t = tasks.find(x => x.id === taskId);
    return t ? `🎯 ${t.title}` : "⚡ Task Action Slot";
  };

  return (
    <div id="schedule-view-section" className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-400" />
          <h2 className="text-base font-bold text-slate-100">Today's Battle Plan</h2>
        </div>

        <button
          onClick={onReoptimize}
          disabled={isPlanning}
          className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1 shadow-lg shadow-teal-500/10"
        >
          {isPlanning ? (
            <span className="flex items-center gap-1 font-normal">
              <span className="w-1 h-1 bg-slate-950 rounded-full animate-bounce" />
              <span className="w-1 h-1 bg-slate-950 rounded-full animate-bounce delay-100" />
              <span className="w-1 h-1 bg-slate-950 rounded-full animate-bounce delay-200" />
              Re-planning...
            </span>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              Reschedule with AI
            </>
          )}
        </button>
      </div>

      {isPlanning && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-teal-500/10 border-t-teal-500 rounded-full animate-spin" />
            <Sparkles className="w-5 h-5 text-teal-400 absolute inset-0 m-auto animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-teal-400 animate-pulse">AI coach is thinking...</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Reviewing deadlines, calendars, and tasks to map out an optimal hourly day block.
            </p>
          </div>
        </div>
      )}

      {!isPlanning && schedule.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400 gap-2">
          <Zap className="w-8 h-8 text-slate-600 mb-1" />
          <p className="text-sm">No schedule generated yet today.</p>
          <p className="text-xs text-slate-500 max-w-xs">
            Add some tasks and click "Reschedule with AI" to generate your first hourly productivity map.
          </p>
        </div>
      )}

      {!isPlanning && schedule.length > 0 && (
        <div className="flex flex-col gap-3.5 max-h-[460px] overflow-y-auto pr-1">
          {schedule.map((slot, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border transition-colors ${
                slot.isCritical
                  ? "bg-red-500/5 border-red-500/20 text-red-200"
                  : "bg-slate-950/40 border-slate-800/60 text-slate-300"
              }`}
            >
              <div className="flex justify-between items-start gap-2 mb-1.5">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-widest flex items-center gap-1">
                  ⏰ {slot.time}
                  <span className="text-[10px] text-slate-500 lowercase">({slot.duration}m)</span>
                </span>
                {slot.isCritical && (
                  <span className="bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-2.5 h-2.5" /> CRITICAL
                  </span>
                )}
              </div>

              <h4 className="text-xs font-bold text-slate-200 truncate mb-1">
                {getTaskTitle(slot.taskId)}
              </h4>

              <p className="text-xs text-slate-300 leading-snug">
                {slot.action}
              </p>

              {slot.reason && (
                <p className="text-[10px] text-slate-500 italic mt-1.5 border-t border-slate-800/40 pt-1.5 flex items-center gap-1">
                  <span className="font-semibold text-amber-500/80">Coach:</span> "{slot.reason}"
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

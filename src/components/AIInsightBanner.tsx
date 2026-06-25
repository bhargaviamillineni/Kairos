import { useState } from "react";
import { Sparkles, Brain, Award, AlertTriangle, Play, HelpCircle } from "lucide-react";
import { Task } from "../hooks/useTasks";

interface AIInsightBannerProps {
  tasks: Task[];
  summary: {
    summary: string;
    wins: string[];
    tip: string;
    priority: string;
  } | null;
  onGenerateSummary: () => void;
  isLoadingSummary: boolean;
}

export default function AIInsightBanner({ 
  tasks, 
  summary, 
  onGenerateSummary, 
  isLoadingSummary 
}: AIInsightBannerProps) {
  const [recommendation, setRecommendation] = useState<{
    task: Task;
    reason: string;
  } | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);

  // Proactive "What should I do RIGHT NOW?" recommendation algorithm with rich explanations
  const handleRecommendTask = () => {
    setLoadingRec(true);
    setTimeout(() => {
      const activeTasks = tasks.filter(t => !t.completed);
      if (activeTasks.length === 0) {
        setRecommendation(null);
        setLoadingRec(false);
        return;
      }

      // Sort tasks based on high weight algorithm:
      // Weight = Priority (high=3, med=2, low=1) * 3 + UrgencyScore * 1.5 + (Time factor: closer deadline is higher)
      const scoredTasks = activeTasks.map(task => {
        let priorityWeight = task.priority === "high" ? 3 : task.priority === "medium" ? 2 : 1;
        
        // Calculate hours remaining to deadline
        const deadlineTime = new Date(task.deadline).getTime();
        const now = new Date().getTime();
        const hoursRemaining = Math.max(0.1, (deadlineTime - now) / 3600000);
        
        // Closer deadlines have much higher scores
        const urgencyTimeFactor = hoursRemaining < 24 ? 20 / hoursRemaining : 2;

        const totalScore = (priorityWeight * 5) + (task.urgencyScore * 4) + urgencyTimeFactor;
        
        // Determine a custom reasoning line for maximum visual polish
        let reason = "";
        if (hoursRemaining < 24) {
          reason = `Critical time alert! This is due in ${Math.round(hoursRemaining)}h. Prioritize this before the clock runs out.`;
        } else if (task.priority === "high") {
          reason = `High impact item with an urgency rating of ${task.urgencyScore}/10. Excellent high-energy block choice.`;
        } else if (task.subtasks.length > 0) {
          reason = `Great structure! You've already broken this down into subtasks, perfect for making fast momentum.`;
        } else {
          reason = `Optimal match for your current energy window based on deadline and effort estimation.`;
        }

        return { task, score: totalScore, reason };
      });

      // Pick top score
      scoredTasks.sort((a, b) => b.score - a.score);
      setRecommendation(scoredTasks[0]);
      setLoadingRec(false);
    }, 700);
  };

  const activeCount = tasks.filter(t => !t.completed).length;
  const criticalCount = tasks.filter(t => {
    if (t.completed) return false;
    const hrs = (new Date(t.deadline).getTime() - new Date().getTime()) / 3600000;
    return hrs > 0 && hrs <= 24;
  }).length;

  return (
    <div id="ai-insight-banner" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      
      {/* Sentinel / Current Status Dashboard Block */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-5 h-5 text-teal-400" />
          <h3 className="text-sm font-semibold text-slate-100">Deadline Sentinel</h3>
        </div>
        
        <div className="my-2">
          <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
            <span>Pending Tasks:</span>
            <span className="font-semibold text-slate-200">{activeCount}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Critical (Due &lt; 24h):</span>
            <span className={`font-semibold px-2 py-0.5 rounded ${criticalCount > 0 ? "bg-red-500/20 text-red-400 animate-pulse" : "text-slate-200"}`}>
              {criticalCount}
            </span>
          </div>
        </div>

        <button
          onClick={handleRecommendTask}
          disabled={loadingRec || activeCount === 0}
          className="w-full mt-3 bg-gradient-to-r from-teal-500 to-teal-400 hover:from-teal-400 hover:to-teal-300 text-slate-950 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
        >
          {loadingRec ? (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-bounce delay-100" />
              <span className="w-1.5 h-1.5 bg-slate-950 rounded-full animate-bounce delay-200" />
            </span>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              What should I do RIGHT NOW?
            </>
          )}
        </button>
      </div>

      {/* Recommended Task Widget */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between min-h-[140px]">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-100">AI Priority Pick</h3>
        </div>

        {recommendation ? (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-bold text-amber-300 line-clamp-1 flex items-center gap-1">
              🎯 {recommendation.task.title}
              <span className="text-[10px] uppercase tracking-wider bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                Urgency {recommendation.task.urgencyScore}/10
              </span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              "{recommendation.reason}"
            </p>
          </div>
        ) : (
          <div className="text-xs text-slate-400 flex flex-col items-center justify-center py-4 gap-1 text-center">
            <HelpCircle className="w-6 h-6 text-slate-600 mb-1" />
            <span>Click the coach button to scan deadlines and recommend the next best action!</span>
          </div>
        )}

        {recommendation && (
          <button
            onClick={() => setRecommendation(null)}
            className="text-[10px] text-slate-500 hover:text-slate-300 self-end mt-2 underline"
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Goal Summary and Wins Coach Widget */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col justify-between">
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">Coach Summary</h3>
        </div>

        {summary ? (
          <div className="flex flex-col gap-1.5 text-xs">
            <p className="text-slate-300 font-medium line-clamp-2">
              "{summary.summary}"
            </p>
            <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <span>🏆 Win:</span>
              <span className="text-slate-300 font-normal line-clamp-1">{summary.wins[0]}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] text-slate-400">
              Get an instant end-of-day summary of your achievements and upcoming focuses.
            </p>
            <button
              onClick={onGenerateSummary}
              disabled={isLoadingSummary}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 font-medium py-1.5 px-3 rounded-xl text-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {isLoadingSummary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  Generating Wins...
                </>
              ) : (
                "Compute Today's Summary"
              )}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

// Simple loader helper for summaries
function Loader2({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

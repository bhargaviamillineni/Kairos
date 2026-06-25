import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Task } from "../hooks/useTasks";

interface SubtaskChecklistProps {
  task: Task;
  onUpdate: (taskId: string, updates: Partial<Task>) => Promise<void>;
}

export const SubtaskChecklist = React.memo(function SubtaskChecklist({
  task,
  onUpdate
}: SubtaskChecklistProps) {
  const [addingSub, setAddingSub] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");

  const handleSubtaskToggle = async (index: number) => {
    const updatedSubtasks = [...task.subtasks];
    updatedSubtasks[index].completed = !updatedSubtasks[index].completed;
    
    // Calculate new completionPercent based on subtasks
    const totalSubs = updatedSubtasks.length;
    const completedSubs = updatedSubtasks.filter(s => s.completed).length;
    const completionPercent = totalSubs > 0 ? Math.round((completedSubs / totalSubs) * 100) : 0;

    await onUpdate(task.id, { 
      subtasks: updatedSubtasks,
      completionPercent
    });
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTitle.trim()) return;

    const updatedSubtasks = [...task.subtasks, { title: newSubTitle.trim(), completed: false }];
    setNewSubTitle("");
    setAddingSub(false);

    // Calculate new completionPercent
    const totalSubs = updatedSubtasks.length;
    const completedSubs = updatedSubtasks.filter(s => s.completed).length;
    const completionPercent = totalSubs > 0 ? Math.round((completedSubs / totalSubs) * 100) : 0;

    await onUpdate(task.id, { 
      subtasks: updatedSubtasks,
      completionPercent
    });
  };

  return (
    <div id={`subtask-checklist-${task.id}`} className="mt-3 border-t border-slate-800/60 pt-3">
      <h4 className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mb-2 flex justify-between items-center">
        <span>Subtasks Checklist</span>
        {!task.completed && (
          <button 
            onClick={() => setAddingSub(!addingSub)} 
            className="text-teal-400 hover:text-teal-300 transition-colors text-xs flex items-center gap-0.5"
          >
            <Plus className="w-3.5 h-3.5" /> add
          </button>
        )}
      </h4>

      {addingSub && (
        <form onSubmit={handleAddSubtask} className="flex gap-1.5 mb-2.5">
          <input
            type="text"
            placeholder="e.g. Gather references"
            value={newSubTitle}
            onChange={(e) => setNewSubTitle(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
            autoFocus
          />
          <button 
            type="submit" 
            className="bg-teal-500 hover:bg-teal-400 text-slate-950 px-2 rounded-lg text-xs font-bold"
          >
            Save
          </button>
        </form>
      )}

      {task.subtasks.length > 0 ? (
        <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto pr-1">
          {task.subtasks.map((sub, sIdx) => (
            <label 
              key={sIdx} 
              className={`flex items-center gap-2 text-xs select-none cursor-pointer p-1.5 hover:bg-slate-950/20 rounded-lg transition-colors ${
                sub.completed ? "text-slate-500" : "text-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={sub.completed}
                disabled={task.completed}
                onChange={() => handleSubtaskToggle(sIdx)}
                className="rounded bg-slate-950 border-slate-800 text-teal-500 focus:ring-teal-500 focus:ring-offset-slate-900 focus:ring-0"
              />
              <span className={sub.completed ? "line-through text-slate-500" : ""}>{sub.title}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-slate-600 italic">No subtasks generated yet.</p>
      )}
    </div>
  );
});

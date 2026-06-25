import { GoogleGenAI, Type } from "@google/genai";
import { 
  getTaskParserSystemInstruction, 
  getTaskParserUserPrompt 
} from "../prompts/taskParserPrompt";
import { 
  getDailySchedulerSystemInstruction, 
  getDailySchedulerUserPrompt, 
  getTaskIntakeSystemInstruction, 
  getTaskIntakeUserPrompt 
} from "../prompts/schedulerPrompt";
import { 
  getReminderSystemInstruction, 
  getReminderUserPrompt, 
  getSummarySystemInstruction, 
  getSummaryUserPrompt 
} from "../prompts/reminderPrompt";

// Lazy-initialize Gemini client per-call with support for AbortSignal to comply with timeout rules
function getAiClient(signal?: AbortSignal): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required server-side.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      },
      signal
    } as any
  });
}

/**
 * Robust retry wrapper that retries on 503 UNAVAILABLE or 429 RATE_LIMIT with exponential backoff.
 * Also falls back from 'gemini-3.5-flash' to 'gemini-flash-latest' to bypass model-specific spikes.
 */
async function callGeminiWithRetry<T>(
  apiCallFn: (modelName: string) => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let attempt = 0;
  let currentModel = "gemini-3.5-flash";
  
  while (true) {
    try {
      return await apiCallFn(currentModel);
    } catch (error: any) {
      attempt++;
      const errorStr = String(error).toLowerCase();
      const isTransient = 
        error?.status === 503 || 
        error?.code === 503 || 
        error?.status === 429 || 
        error?.code === 429 ||
        errorStr.includes("503") || 
        errorStr.includes("429") || 
        errorStr.includes("unavailable") ||
        errorStr.includes("rate limit") ||
        errorStr.includes("high demand");
      
      if (isTransient && attempt < maxRetries) {
        if (attempt === 1) {
          currentModel = "gemini-flash-latest";
        }
        console.log(`[Gemini Retry] Attempt ${attempt}/${maxRetries} temporary failure. Retrying with ${currentModel} in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}

/**
 * Parses a voice transcript or text block into a structured task.
 * Enforces standard 10s AbortController timeout and schemas.
 */
export async function parseVoiceTranscript(transcript: string, currentTime: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const parsed = await callGeminiWithRetry(async (modelName) => {
      const ai = getAiClient(controller.signal);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: getTaskParserUserPrompt(transcript, currentTime),
        config: {
          systemInstruction: getTaskParserSystemInstruction(currentTime),
          responseMimeType: "application/json",
          temperature: 0.3,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              deadline: { type: Type.STRING },
              priority: { type: Type.STRING },
              estimatedMinutes: { type: Type.INTEGER }
            },
            required: ["title", "deadline", "priority", "estimatedMinutes"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini API");
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    });

    // Validate fields before use (Standard Rule 3)
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.deadline !== "string" ||
      typeof parsed.priority !== "string" ||
      typeof parsed.estimatedMinutes !== "number"
    ) {
      throw new Error("Missing or invalid required fields in parsed Gemini response");
    }

    return parsed;
  } catch (error) {
    console.log(`[Gemini Fallback] parseVoiceTranscript heuristic activated.`);
    
    // Heuristic voice transcript parsing fallback
    const lowerTranscript = transcript.toLowerCase();
    
    // Priority check
    let priority: "low" | "medium" | "high" = "medium";
    if (lowerTranscript.includes("high") || lowerTranscript.includes("urgent") || lowerTranscript.includes("critical") || lowerTranscript.includes("asap")) {
      priority = "high";
    } else if (lowerTranscript.includes("low") || lowerTranscript.includes("minor") || lowerTranscript.includes("casual")) {
      priority = "low";
    }

    // Estimated duration check
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

    // Deadline parser
    const now = new Date(currentTime || Date.now());
    let deadlineDate = new Date(now.getTime() + 24 * 3600000); // default to tomorrow
    if (lowerTranscript.includes("today") || lowerTranscript.includes("tonight")) {
      deadlineDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0); // 6 PM today
    } else if (lowerTranscript.includes("tomorrow")) {
      deadlineDate = new Date(now.getTime() + 24 * 3600000);
      deadlineDate.setHours(17, 0, 0); // 5 PM tomorrow
    } else if (lowerTranscript.includes("next week")) {
      deadlineDate = new Date(now.getTime() + 7 * 24 * 3600000);
    }

    // Capitalize first letter of title
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
    clearTimeout(timeout);
  }
}

/**
 * Analyzes a new task against existing tasks to compute urgency, subtasks, conflicts, and suggested time.
 * Enforces standard 10s AbortController timeout and schemas.
 */
export async function analyzeTaskIntake(newTask: any, existingTasks: any[], currentTime: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const parsed = await callGeminiWithRetry(async (modelName) => {
      const ai = getAiClient(controller.signal);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: getTaskIntakeUserPrompt(JSON.stringify(newTask), JSON.stringify(existingTasks), currentTime),
        config: {
          systemInstruction: getTaskIntakeSystemInstruction(currentTime),
          responseMimeType: "application/json",
          temperature: 0.3,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              urgencyScore: { type: Type.INTEGER },
              subtasks: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              conflicts: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              suggestedTime: { type: Type.STRING },
              reasoning: { type: Type.STRING }
            },
            required: ["urgencyScore", "subtasks", "conflicts", "suggestedTime", "reasoning"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini API");
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    });

    // Validate fields before use (Standard Rule 3)
    if (
      typeof parsed.urgencyScore !== "number" ||
      !Array.isArray(parsed.subtasks) ||
      !Array.isArray(parsed.conflicts) ||
      typeof parsed.suggestedTime !== "string" ||
      typeof parsed.reasoning !== "string"
    ) {
      throw new Error("Missing or invalid required fields in parsed Gemini response");
    }

    return parsed;
  } catch (error) {
    console.log(`[Gemini Fallback] analyzeTaskIntake heuristic activated.`);

    // Heuristic task analyzer fallback
    const title = (newTask.title || "").toLowerCase();
    const priority = newTask.priority || "medium";
    
    // 1. Urgency score (1-10)
    let urgencyScore = 5;
    if (priority === "high") urgencyScore = 8;
    else if (priority === "low") urgencyScore = 3;

    const deadlineTime = new Date(newTask.deadline).getTime();
    const nowTime = new Date(currentTime || Date.now()).getTime();
    const hoursRemaining = (deadlineTime - nowTime) / 3600000;
    if (hoursRemaining > 0 && hoursRemaining < 12) {
      urgencyScore = Math.min(10, urgencyScore + 2);
    }

    // 2. Subtasks Heuristic based on title keywords
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

    // 3. Conflicts detection Heuristics
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

    // 4. Suggested time
    let suggestedTime = "14:00 - 15:30";
    if (priority === "high") {
      suggestedTime = "09:30 - 11:00"; // prioritize high impact morning slots
    } else if (priority === "low") {
      suggestedTime = "16:15 - 17:00"; // place casual items in late afternoon
    }

    // 5. Reasoning
    const reasoning = `This high-impact ${priority} priority task requires around ${newTask.estimatedMinutes || 30}m. Positioned in optimal peak-energy block.`;

    return {
      urgencyScore,
      subtasks,
      conflicts,
      suggestedTime,
      reasoning
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generates an optimized hourly schedule today's battle plan.
 * Enforces standard 10s AbortController timeout and schemas.
 */
export async function generateBattlePlan(tasks: any[], freeSlots: any[], currentTime: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const parsed = await callGeminiWithRetry(async (modelName) => {
      const ai = getAiClient(controller.signal);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: getDailySchedulerUserPrompt(JSON.stringify(tasks), JSON.stringify(freeSlots), currentTime),
        config: {
          systemInstruction: getDailySchedulerSystemInstruction(currentTime),
          responseMimeType: "application/json",
          temperature: 0.3,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plan: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    taskId: { type: Type.STRING },
                    action: { type: Type.STRING },
                    duration: { type: Type.INTEGER },
                    reason: { type: Type.STRING },
                    isCritical: { type: Type.BOOLEAN }
                  },
                  required: ["time", "taskId", "action", "duration", "reason", "isCritical"]
                }
              }
            },
            required: ["plan"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini API");
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    });

    // Validate fields before use (Standard Rule 3)
    if (!parsed || !Array.isArray(parsed.plan)) {
      throw new Error("Missing plan array in parsed Gemini response");
    }

    return parsed;
  } catch (error) {
    console.log(`[Gemini Fallback] generateBattlePlan heuristic activated.`);

    // Heuristic daily scheduler fallback
    const plan: any[] = [];
    
    // Sort active tasks: high priority first, then medium, then low
    const pendingTasks = [...tasks]
      .filter(t => !t.completed)
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aVal = priorityOrder[a.priority as keyof typeof priorityOrder] || 2;
        const bVal = priorityOrder[b.priority as keyof typeof priorityOrder] || 2;
        return bVal - aVal;
      });

    // Pick slots to use
    let slots = [{ start: "09:00", end: "10:30" }, { start: "11:00", end: "12:30" }, { start: "14:00", end: "15:30" }, { start: "16:00", end: "17:00" }];
    if (Array.isArray(freeSlots) && freeSlots.length > 0) {
      slots = freeSlots.map((s) => {
        return { start: s.start || "09:00", end: s.end || "12:00" };
      });
    }

    const now = new Date(currentTime || Date.now());

    // Distribute tasks
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
          ? `Deadline is approaching rapidly (due in ${Math.round(hrsRemaining)}h). Crucial focus now.` 
          : `Perfect match for your current mental energy parameters.`,
        isCritical
      });

      // Add small rest block if we have space
      if (index % 2 === 0) {
        plan.push({
          time: "15:30 - 15:45",
          taskId: "rest",
          action: "Step away from screen, grab glass of water, breathe deeply for 5 minutes.",
          duration: 15,
          reason: "Scientific energy recovery break to prevent focus fatigue.",
          isCritical: false
        });
      }
    });

    // Make sure we always return a valid plan array
    if (plan.length === 0) {
      plan.push({
        time: "09:00 - 09:30",
        taskId: "buffer",
        action: "Create a list of high-value priority items and draft tomorrow morning focuses.",
        duration: 30,
        reason: "Excellent habit to initialize productivity loops.",
        isCritical: false
      });
    }

    // Sort plan by start times for nice timeline display
    plan.sort((a, b) => a.time.localeCompare(b.time));

    return { plan };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Writes a personalized, motivating reminder for approaching deadlines.
 * Enforces standard 10s AbortController timeout and schemas.
 */
export async function generateReminderMessage(taskName: string, timeRemaining: string, completionPercent: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const parsed = await callGeminiWithRetry(async (modelName) => {
      const ai = getAiClient(controller.signal);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: getReminderUserPrompt(taskName, timeRemaining, completionPercent),
        config: {
          systemInstruction: getReminderSystemInstruction(new Date().toISOString()),
          responseMimeType: "application/json",
          temperature: 0.7,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              message: { type: Type.STRING }
            },
            required: ["message"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini API");
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    });

    // Validate fields before use (Standard Rule 3)
    if (typeof parsed.message !== "string") {
      throw new Error("Missing or invalid 'message' field in parsed Gemini response");
    }

    return parsed;
  } catch (error) {
    console.log(`[Gemini Fallback] generateReminderMessage heuristic activated.`);
    
    // Heuristic reminder fallback
    let message = `Let's make some momentum on "${taskName}". You're currently ${completionPercent}% done!`;
    if (completionPercent < 30) {
      message = `Proactive coach here! Your deadline for "${taskName}" is approaching in ${timeRemaining}. Let's take 10 minutes to draft an initial plan of action!`;
    } else if (completionPercent < 80) {
      message = `Great momentum! You are ${completionPercent}% complete with "${taskName}". Only a few steps remaining before the deadline in ${timeRemaining}. Keep going!`;
    } else {
      message = `Almost there! "${taskName}" is ${completionPercent}% complete. Let's push through the final deliverables before the deadline in ${timeRemaining}!`;
    }

    return { message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Summarizes the productivity of completed tasks.
 * Enforces standard 10s AbortController timeout and schemas.
 */
export async function generateProductivitySummary(completedTasks: any[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const parsed = await callGeminiWithRetry(async (modelName) => {
      const ai = getAiClient(controller.signal);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: getSummaryUserPrompt(JSON.stringify(completedTasks)),
        config: {
          systemInstruction: getSummarySystemInstruction(new Date().toISOString()),
          responseMimeType: "application/json",
          temperature: 0.7,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              wins: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              tip: { type: Type.STRING },
              priority: { type: Type.STRING }
            },
            required: ["summary", "wins", "tip", "priority"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from Gemini API");
      const clean = text.replace(/```json|```/g, "").trim();
      return JSON.parse(clean);
    });

    // Validate fields before use (Standard Rule 3)
    if (
      typeof parsed.summary !== "string" ||
      !Array.isArray(parsed.wins) ||
      typeof parsed.tip !== "string" ||
      typeof parsed.priority !== "string"
    ) {
      throw new Error("Missing or invalid required fields in parsed Gemini response");
    }

    return parsed;
  } catch (error) {
    console.log(`[Gemini Fallback] generateProductivitySummary heuristic activated.`);

    // Heuristic summary fallback
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
    clearTimeout(timeout);
  }
}

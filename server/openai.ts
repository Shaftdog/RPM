import OpenAI from "openai";
import { TIME_BLOCKS } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface ExtractedTask {
  name: string;
  type: "Milestone" | "Sub-Milestone" | "Task" | "Subtask";
  category: "Personal" | "Business";
  subcategory: "Physical" | "Mental" | "Relationship" | "Environmental" | "Financial" | "Adventure" | "Marketing" | "Sales" | "Operations" | "Products" | "Production";
  timeHorizon: "10 Year" | "5 Year" | "1 Year" | "Quarter" | "Week" | "Today";
  priority: "High" | "Medium" | "Low";
  estimatedTime: number;
  why: string;
  description?: string;
  dueDate?: string;
  dependencies: string[];
}

export async function extractTasksFromContent(content: string): Promise<ExtractedTask[]> {
  try {
    const prompt = `
    Analyze this content and extract actionable tasks. For each task, return a JSON object with these exact field names:
    
    1. name: Clear, actionable statement (string)
    2. type: One of: "Milestone", "Sub-Milestone", "Task", "Subtask"
       - Milestone: Long-term outcome (months/years)
       - Sub-Milestone: Major phase within milestone
       - Task: Concrete action (days/weeks)
       - Subtask: Smallest unit (hours)
    3. category: "Personal" or "Business"
    4. subcategory: 
       - For Personal: "Physical", "Mental", "Relationship", "Environmental", "Financial", "Adventure"
       - For Business: "Marketing", "Sales", "Operations", "Products", "Production"
    5. timeHorizon: One of: "10 Year", "5 Year", "1 Year", "Quarter", "Week", "Today"
    6. priority: "High", "Medium", or "Low"
    7. estimatedTime: Number of hours as decimal (e.g., 2.5)
    8. dependencies: Array of task names (empty array if none)
    9. why: Explanation of why this task matters
    10. dueDate: ISO date string if mentioned (optional)
    11. description: Additional details (optional)

    Return as a JSON object with an array of tasks under the key "tasks".
    Use exactly these field names: name, type, category, subcategory, timeHorizon, priority, estimatedTime, dependencies, why, dueDate, description
    
    Content to analyze:
    ${content}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert task extraction AI. Extract actionable tasks from content and structure them properly."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.tasks || [];
  } catch (error) {
    console.error("Error extracting tasks:", error);
    throw new Error("Failed to extract tasks from content");
  }
}

// Local fallback scheduler when OpenAI is unavailable
function generateLocalSchedule(tasks: any[], recurringTasks: any[], userPreferences: any): any {
  // Use same format as OpenAI output
  const schedule: Record<string, Record<string, Array<{taskName: string, durationMinutes: number}>>> = {};
  
  // Get current day of week for recurring task filtering
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDayFull = dayNames[dayOfWeek];
  
  // Filter recurring tasks for today
  const todaysRecurringTasks = recurringTasks.filter(rt => 
    rt.daysOfWeek && rt.daysOfWeek.includes(currentDayFull)
  );
  
  // Distribute tasks by priority across time blocks
  const availableTasks = [...tasks];
  
  TIME_BLOCKS.forEach((block) => {
    // Initialize quartiles for this time block in OpenAI format
    schedule[block.name] = {
      "Q1": [],
      "Q2": [],
      "Q3": [],
      "Q4": []
    };
    
    // Calculate quarter time slots within the block
    const blockStartMinutes = timeToMinutes(block.start);
    const blockEndMinutes = timeToMinutes(block.end);
    const blockDuration = blockEndMinutes - blockStartMinutes;
    const quarterDuration = blockDuration / 4;
    
    // First, place recurring tasks in their preferred quarters
    todaysRecurringTasks.forEach(recurringTask => {
      const blockMatches = recurringTask.timeBlock === block.name || 
                          recurringTask.timeBlock.startsWith(block.name + " (");
      if (blockMatches && recurringTask.quarter) {
        const quarterKey = `Q${recurringTask.quarter}`;
        if (quarterKey in schedule[block.name]) {
          schedule[block.name][quarterKey].push({
            taskName: recurringTask.taskName,
            durationMinutes: recurringTask.durationMinutes || quarterDuration
          });
        }
      }
    });
    
    // Then fill remaining quarters with available tasks or placeholders
    for (let i = 1; i <= 4; i++) {
      const quarterKey = `Q${i}`;
      
      if (schedule[block.name][quarterKey].length === 0) {
        let targetTask = null;
        
        // Assign based on block type and priority
        if (block.name === "CHIEF PROJECT" && availableTasks.some(t => t.priority === "High")) {
          targetTask = availableTasks.find(t => t.priority === "High");
        } else if (block.name === "PRODUCTION WORK" && availableTasks.some(t => t.priority === "Medium")) {
          targetTask = availableTasks.find(t => t.priority === "Medium");
        } else if (block.name === "FLEXIBLE BLOCK" && availableTasks.some(t => t.priority === "Low")) {
          targetTask = availableTasks.find(t => t.priority === "Low");
        } else if (availableTasks.length > 0) {
          // Prioritize High priority tasks for early quarters, Medium for middle, Low for later
          if (i <= 2 && availableTasks.some(t => t.priority === "High")) {
            targetTask = availableTasks.find(t => t.priority === "High");
          } else if (i === 3 && availableTasks.some(t => t.priority === "Medium")) {
            targetTask = availableTasks.find(t => t.priority === "Medium");
          } else {
            targetTask = availableTasks[0]; // Any remaining task
          }
        }
        
        if (targetTask) {
          schedule[block.name][quarterKey].push({
            taskName: targetTask.name,
            durationMinutes: quarterDuration
          });
          
          // Remove assigned task from available tasks
          const taskIndex = availableTasks.findIndex(t => t.id === targetTask.id);
          if (taskIndex > -1) {
            availableTasks.splice(taskIndex, 1);
          }
        } else {
          // Add meaningful placeholder content
          let placeholderName = "Planning & Review";
          if (block.name === "PHYSICAL MENTAL") placeholderName = "Mindfulness Break";
          else if (block.name === "WIND DOWN") placeholderName = "Relaxation";
          else if (block.name === "Recover") placeholderName = "Recovery Time";
          
          schedule[block.name][quarterKey].push({
            taskName: placeholderName,
            durationMinutes: quarterDuration
          });
        }
      }
    }
    
  });
  
  return {
    ...schedule,
    source: "local_fallback"
  };
}

// Helper functions for time calculations
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export async function generateDailySchedule(
  tasks: any[],
  recurringTasks: any[],
  userPreferences: {
    workHours: { start: string; end: string };
    energyPatterns?: Record<string, number>;
  }
): Promise<any> {
  // Defensive filtering: exclude Milestones and Sub-Milestones from scheduling
  // These are deliverables, not actionable tasks that should be time-blocked
  const filteredTasks = tasks.filter(task => 
    task.type !== 'Milestone' && task.type !== 'Sub-Milestone'
  );
  
  const OPENAI_TIMEOUT_MS = 18000; // 18 second timeout
  
  // Check if we have a valid OpenAI API key
  const hasValidKey = process.env.OPENAI_API_KEY && 
                     process.env.OPENAI_API_KEY !== "default_key" && 
                     process.env.OPENAI_API_KEY.startsWith("sk-");
  
  if (!hasValidKey) {
    console.log("OpenAI API key not configured, using local fallback scheduler");
    return generateLocalSchedule(filteredTasks, recurringTasks, userPreferences);
  }

  try {
    // Trim inputs to essentials for smaller payload
    const trimmedTasks = filteredTasks.slice(0, 20).map(t => ({
      id: t.id,
      name: t.name,
      priority: t.priority,
      estimatedTime: t.estimatedTime,
      category: t.category,
      subcategory: t.subcategory
    }));

    const trimmedRecurring = recurringTasks.slice(0, 10).map(rt => ({
      taskName: rt.taskName,
      timeBlock: rt.timeBlock,
      quarter: rt.quarter,
      daysOfWeek: rt.daysOfWeek,
      durationMinutes: rt.durationMinutes
    }));

    const prompt = `
    Generate a COMPREHENSIVE daily schedule that fills ALL 10 time blocks with ALL 4 quartiles each (40 total quartiles).
    
    Available Tasks: ${JSON.stringify(trimmedTasks)}
    Recurring Tasks: ${JSON.stringify(trimmedRecurring)}
    User Preferences: ${JSON.stringify(userPreferences)}
    
    Time Blocks (ALL 10 MUST have content): 
    1. Recover - 2. PHYSICAL MENTAL - 3. CHIEF PROJECT - 4. HOUR OF POWER - 5. PRODUCTION WORK 
    6. COMPANY BLOCK - 7. BUSINESS AUTOMATION - 8. ENVIRONMENTAL - 9. FLEXIBLE BLOCK - 10. WIND DOWN
    
    MANDATORY REQUIREMENTS:
    1. ALL 10 time blocks MUST appear in your response
    2. EACH time block MUST have exactly 4 quartiles (Q1, Q2, Q3, Q4)
    3. EVERY recurring task MUST be placed in its designated time block/quarter
    4. Fill ALL remaining empty quartiles with available tasks
    5. If you run out of unique tasks, repeat high-priority tasks or break large tasks into smaller parts
    6. NO quartile should be left empty - use "planning", "review", or "break" activities if needed
    
    Task Distribution Rules:
    - Recurring tasks: exact time block and quarter as specified
    - High priority tasks: early quartiles (Q1, Q2)  
    - Medium priority: middle quartiles (Q2, Q3)
    - Low priority: later quartiles (Q3, Q4)
    - Fill gaps with: planning time, email review, breaks, or task continuation
    
    EXACT JSON format required:
    {
      "Recover": {
        "Q1": [{"taskName": "Task Name", "durationMinutes": 15}],
        "Q2": [{"taskName": "Another Task", "durationMinutes": 15}],
        "Q3": [{"taskName": "More Tasks", "durationMinutes": 15}],
        "Q4": [{"taskName": "Final Task", "durationMinutes": 15}]
      },
      ... continue for ALL 10 time blocks
    }
    `;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an AI scheduling assistant. Create optimal daily schedules that maximize productivity."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    }, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return { ...result, source: "openai" };
    
  } catch (error) {
    console.error("Error generating daily schedule:", error);
    console.log("Falling back to local scheduler");
    return generateLocalSchedule(filteredTasks, recurringTasks, userPreferences);
  }
}

export async function processAICommand(
  command: string,
  context: {
    tasks: any[];
    schedule?: any;
    userStats?: any;
  }
): Promise<{ response: string; actions?: any[] }> {
  try {
    const prompt = `
    Process this AI command in the context of a personal productivity system:
    
    Command: "${command}"
    
    Context:
    - Current tasks: ${context.tasks.length} tasks
    - Task categories and priorities available
    - Strategic planning matrix with time horizons
    - Daily schedule with time blocks
    
    Available Actions:
    - Move tasks between time horizons or categories
    - Reschedule tasks based on energy/priority
    - Generate reports or insights
    - Reorganize task priorities
    - Balance personal vs business tasks
    
    Respond with a JSON object containing:
    - response: A helpful explanation of what you're doing
    - actions: Array of specific actions to take (optional)
    
    Make the response conversational and helpful.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an AI productivity assistant. Help users manage their tasks and schedules through natural language commands."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      response: result.response || "I understand, but I need more specific information to help.",
      actions: result.actions || []
    };
  } catch (error) {
    console.error("Error processing AI command:", error);
    throw new Error("Failed to process AI command");
  }
}

export async function analyzeImage(base64Image: string, mimeType: string = 'image/jpeg'): Promise<ExtractedTask[]> {
  try {
    // Extract the image format from the MIME type (e.g., 'image/png' -> 'png')
    const imageFormat = mimeType.replace('image/', '');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
              Analyze this image and extract any actionable tasks, to-do items, or project requirements you can identify.
              
              Return the tasks in the same JSON format as text extraction:
              {
                "tasks": [
                  {
                    "name": "Task name",
                    "type": "Task|Subtask|Milestone|Sub-Milestone",
                    "category": "Personal|Business",
                    "subcategory": "Physical|Mental|...|Marketing|Sales|...",
                    "timeHorizon": "Today|Week|Quarter|1 Year|5 Year|10 Year",
                    "priority": "High|Medium|Low",
                    "estimatedTime": hours_as_number,
                    "why": "rationale",
                    "description": "optional details",
                    "dependencies": []
                  }
                ]
              }
              `
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    
    // Fix subcategories that don't match our enum values
    const validPersonalSubcategories = ['Physical', 'Mental', 'Relationship', 'Environmental', 'Financial', 'Adventure'];
    const validBusinessSubcategories = ['Marketing', 'Sales', 'Operations', 'Products', 'Production'];
    
    const fixedTasks = (result.tasks || []).map((task: any) => {
      let subcategory = task.subcategory;
      
      if (task.category === 'Personal') {
        if (!validPersonalSubcategories.includes(subcategory)) {
          // Map common mismatches
          if (subcategory === 'Recovery' || subcategory === 'Health') {
            subcategory = 'Physical';
          } else {
            subcategory = 'Physical'; // Default to Physical for Personal tasks
          }
        }
      } else if (task.category === 'Business') {
        if (!validBusinessSubcategories.includes(subcategory)) {
          // Map common mismatches
          if (subcategory === 'Operational') {
            subcategory = 'Operations';
          } else {
            subcategory = 'Operations'; // Default to Operations for Business tasks
          }
        }
      }
      
      return {
        ...task,
        subcategory
      };
    });
    
    return fixedTasks;
  } catch (error) {
    console.error("Error analyzing image - Full details:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : error);
    throw new Error("Failed to analyze image for tasks");
  }
}

export interface ExtractedRecurringTask {
  taskName: string;
  taskType: "Milestone" | "Sub-Milestone" | "Task" | "Subtask";
  timeBlock: string;
  daysOfWeek: string[];
  category: "Personal" | "Business";
  subcategory: string;
  durationMinutes: number;
  energyImpact: number;
  priority: "High" | "Medium" | "Low";
  quarter?: number;
  description?: string;
  tags?: string[];
}

export async function extractRecurringTasksFromContent(content: string): Promise<ExtractedRecurringTask[]> {
  try {
    const prompt = `
    Analyze this content and extract recurring tasks, habits, routines, and regular activities. For each recurring task, return a JSON object with these exact field names:
    
    1. taskName: Clear, actionable name for the recurring task (string)
    2. taskType: One of: "Milestone", "Sub-Milestone", "Task", "Subtask"
       - Milestone: Long-term recurring outcome (quarterly/yearly reviews)
       - Sub-Milestone: Regular significant activities (weekly planning, monthly reviews)
       - Task: Regular concrete actions (daily workout, weekly meetings)
       - Subtask: Small recurring actions (daily standup, morning routine)
    3. category: "Personal" or "Business"
    4. subcategory: 
       - For Personal: "Physical", "Mental", "Relationship", "Environmental", "Financial", "Adventure"
       - For Business: "Marketing", "Sales", "Operations", "Products", "Production"
    5. timeBlock: Suggested time block from: "PHYSICAL MENTAL (7-9AM)", "CHIEF PROJECT (9-11AM)", "HOUR OF POWER (11-12PM)", "PRODUCTION WORK (12-2PM)", "COMPANY BLOCK (2-4PM)", "BUSINESS AUTOMATION (4-6PM)", "ENVIRONMENTAL (6-8PM)", "FLEXIBLE BLOCK (8-10PM)"
    6. daysOfWeek: Array of days like ["monday", "tuesday", "wednesday", "thursday", "friday"] (lowercase)
    7. priority: "High", "Medium", or "Low"
    8. durationMinutes: Number of minutes the task typically takes
    9. energyImpact: Number from -500 to +500 (negative = draining, positive = energizing)
    10. quarter: Number from 1-4 for preferred quarter within the time block (1=Q1/First 25%, 2=Q2/Second 25%, 3=Q3/Third 25%, 4=Q4/Fourth 25%) - OPTIONAL, default to null if not specified
    11. description: Brief description of what the task involves (optional)
    12. tags: Array of relevant tags/keywords (optional)

    Return as a JSON object with an array of tasks under the key "tasks".
    Focus on identifying patterns, routines, and recurring activities rather than one-time tasks.
    
    Content to analyze:
    ${content}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert at identifying recurring patterns and habits from content. Extract recurring tasks, routines, and regular activities that someone would want to schedule repeatedly."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.tasks || [];
  } catch (error) {
    console.error("Error extracting recurring tasks:", error);
    throw new Error("Failed to extract recurring tasks from content");
  }
}

export async function processRecurringTaskChatCommand(
  message: string,
  context: {
    extractedTasks: any[];
    uploadedFiles: Array<{ name: string; type: string; size: number }>;
    recurringTasks: any[];
  }
): Promise<{ response: string; modifiedTasks?: any[] }> {
  try {
    const prompt = `
    Process this chat command for managing recurring tasks. The user wants to modify, organize, or get information about their recurring tasks.
    
    Command: "${message}"
    
    Context:
    - Currently extracted tasks: ${context.extractedTasks.length} tasks
    - Uploaded files: ${context.uploadedFiles.map(f => f.name).join(', ')}
    - Existing recurring tasks: ${context.recurringTasks.length} tasks
    
    Available time blocks: "PHYSICAL MENTAL (7-9AM)", "CHIEF PROJECT (9-11AM)", "HOUR OF POWER (11-12PM)", "PRODUCTION WORK (12-2PM)", "COMPANY BLOCK (2-4PM)", "BUSINESS AUTOMATION (4-6PM)", "ENVIRONMENTAL (6-8PM)", "FLEXIBLE BLOCK (8-10PM)"
    
    Available categories: "Personal", "Business"
    Available subcategories: "Physical", "Mental", "Relationship", "Environmental", "Financial", "Adventure", "Marketing", "Sales", "Operations", "Products", "Production"
    Available priorities: "High", "Medium", "Low"
    Available task types: "Milestone", "Sub-Milestone", "Task", "Subtask"
    
    Current extracted tasks:
    ${JSON.stringify(context.extractedTasks.slice(0, 5), null, 2)}
    
    Examples of commands you can process:
    - "Change all business tasks to morning blocks" - Update timeBlock for business category
    - "Set energy for all meetings to -150" - Update energyImpact for tasks with "meeting" in name
    - "Make everything weekdays only" - Update daysOfWeek to ["monday", "tuesday", "wednesday", "thursday", "friday"]
    - "Add 15 minutes to all task durations" - Increase durationMinutes by 15
    - "Change fitness tasks to Physical category" - Update category/subcategory
    - "Set all personal tasks to high priority" - Update priority field
    - "Move morning routines to PHYSICAL MENTAL block" - Update timeBlock
    
    Respond with a JSON object containing:
    - response: A helpful explanation of what you're doing (string)
    - modifiedTasks: Array of updated extracted tasks with the changes applied (optional)
    
    If modifying tasks, return ALL extracted tasks in modifiedTasks array (even unmodified ones) with the changes applied to the relevant tasks.
    Make the response conversational and helpful, explaining what changes were made.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant specialized in managing recurring tasks and schedules. Help users organize and modify their recurring tasks through natural language commands."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      response: result.response || "I understand your request, but I need more specific information to help you modify the tasks.",
      modifiedTasks: result.modifiedTasks
    };
  } catch (error) {
    console.error("Error processing recurring task chat command:", error);
    throw new Error("Failed to process chat command");
  }
}

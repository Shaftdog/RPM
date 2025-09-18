import OpenAI from "openai";

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
  const schedule: Array<{
    timeBlock: string;
    start: string;
    end: string;
    quartiles: Array<{
      task: {
        id: string;
        name: string;
        priority: string;
        estimatedTime: string;
      };
      start: string;
      end: string;
      allocatedTime: string;
    }>;
  }> = [];
  
  // Match the exact schema structure that OpenAI returns
  const timeBlocks = [
    { name: "HOUR OF POWER", start: "9:00", end: "10:00" },
    { name: "CHIEF PROJECT", start: "10:00", end: "12:00" },
    { name: "PRODUCTION WORK", start: "12:00", end: "13:00" },
    { name: "COMPANY BLOCK", start: "13:00", end: "14:00" },
    { name: "BUSINESS AUTOMATION", start: "14:00", end: "15:00" },
    { name: "PHYSICAL MENTAL", start: "15:00", end: "16:00" },
    { name: "FLEXIBLE BLOCK", start: "16:00", end: "17:00" }
  ];
  
  // Distribute tasks by priority across time blocks
  const availableTasks = [...tasks];
  
  timeBlocks.forEach((block) => {
    let quartiles: Array<{
      task: {
        id: string;
        name: string;
        priority: string;
        estimatedTime: string;
      };
      start: string;
      end: string;
      allocatedTime: string;
    }> = [];
    
    // Assign tasks based on block type and priority
    let targetTask = null;
    if (block.name === "CHIEF PROJECT" && availableTasks.some(t => t.priority === "High")) {
      targetTask = availableTasks.find(t => t.priority === "High");
    } else if (block.name === "PRODUCTION WORK" && availableTasks.some(t => t.priority === "Medium")) {
      targetTask = availableTasks.find(t => t.priority === "Medium");
    } else if (block.name === "FLEXIBLE BLOCK" && availableTasks.some(t => t.priority === "Low")) {
      targetTask = availableTasks.find(t => t.priority === "Low");
    } else if (availableTasks.length > 0) {
      targetTask = availableTasks[0]; // Any remaining task
    }
    
    if (targetTask) {
      quartiles.push({
        task: {
          id: targetTask.id,
          name: targetTask.name,
          priority: targetTask.priority,
          estimatedTime: targetTask.estimatedTime || "1.00"
        },
        start: block.start,
        end: block.end,
        allocatedTime: "1.00"
      });
      
      // Remove assigned task from available tasks
      const taskIndex = availableTasks.findIndex(t => t.id === targetTask.id);
      if (taskIndex > -1) {
        availableTasks.splice(taskIndex, 1);
      }
    }
    
    schedule.push({
      timeBlock: block.name,
      start: block.start,
      end: block.end,
      quartiles
    });
  });
  
  return {
    schedule,
    source: "local_fallback",
    totalTasks: tasks.length
  };
}

export async function generateDailySchedule(
  tasks: any[],
  recurringTasks: any[],
  userPreferences: {
    workHours: { start: string; end: string };
    energyPatterns?: Record<string, number>;
  }
): Promise<any> {
  const OPENAI_TIMEOUT_MS = 12000; // 12 second timeout
  
  // Check if we have a valid OpenAI API key
  const hasValidKey = process.env.OPENAI_API_KEY && 
                     process.env.OPENAI_API_KEY !== "default_key" && 
                     process.env.OPENAI_API_KEY.startsWith("sk-");
  
  if (!hasValidKey) {
    console.log("OpenAI API key not configured, using local fallback scheduler");
    return generateLocalSchedule(tasks, recurringTasks, userPreferences);
  }

  try {
    // Trim inputs to essentials for smaller payload
    const trimmedTasks = tasks.slice(0, 20).map(t => ({
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
      daysOfWeek: rt.daysOfWeek,
      durationMinutes: rt.durationMinutes
    }));

    const prompt = `
    Generate an optimized daily schedule based on:
    
    Available Tasks: ${JSON.stringify(trimmedTasks)}
    Recurring Tasks: ${JSON.stringify(trimmedRecurring)}
    User Preferences: ${JSON.stringify(userPreferences)}
    
    Time Blocks: Recover, PHYSICAL MENTAL, CHIEF PROJECT, HOUR OF POWER, PRODUCTION WORK, COMPANY BLOCK, BUSINESS AUTOMATION, ENVIRONMENTAL, FLEXIBLE BLOCK, WIND DOWN
    
    Return JSON with schedule structure mapping time blocks to quartiles with assigned tasks.
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
    return generateLocalSchedule(tasks, recurringTasks, userPreferences);
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

    console.log('OpenAI raw response:', response.choices[0].message.content);
    const result = JSON.parse(response.choices[0].message.content || "{}");
    console.log('Parsed result:', result);
    return result.tasks || [];
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
    10. description: Brief description of what the task involves
    11. tags: Array of relevant tags/keywords

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

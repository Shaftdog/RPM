import OpenAI from "openai";
import { TIME_BLOCKS } from "@shared/schema";

// Using GPT-5, the newest OpenAI model released August 7, 2025
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key",
  timeout: 15000, // 15 second timeout
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

// Helper function to check if valid OpenAI API key is available
function hasValidOpenAIKey(): boolean {
  const key = process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR;
  return !!(key && key !== "default_key" && key.startsWith("sk-"));
}

export async function extractTasksFromContent(content: string): Promise<ExtractedTask[]> {
  // Check if OpenAI API key is available
  if (!hasValidOpenAIKey()) {
    console.warn("OpenAI API key not configured, using local extraction fallback");
    return extractTasksLocally(content);
  }

  try {
    console.log("Extracting tasks with GPT-5...");
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

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI request timeout')), 10000); // 10 second timeout
    });

    // Race the OpenAI call against the timeout
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "gpt-4o",  // GPT-4o is the correct model for vision/image analysis
        messages: [
          {
            role: "system",
            content: "You are an expert task extraction AI. Extract actionable tasks from content and structure them properly as JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      }),
      timeoutPromise
    ]);

    const result = JSON.parse(response.choices[0].message.content || "{}");
    const tasks = result.tasks || [];
    console.log(`GPT-5 extracted ${tasks.length} tasks successfully`);
    return tasks;
  } catch (error) {
    console.error("OpenAI extraction failed:", error);
    console.log("Falling back to local extraction");
    return extractTasksLocally(content);
  }
}

// Local fallback for task extraction when OpenAI is unavailable
function extractTasksLocally(content: string): ExtractedTask[] {
  console.log("Using local task extraction fallback");
  
  // Simple keyword-based extraction
  const lines = content.split('\n').filter(line => line.trim());
  const tasks: ExtractedTask[] = [];
  
  // Look for action words and patterns
  const actionWords = ['complete', 'finish', 'create', 'build', 'write', 'send', 'call', 'schedule', 'review', 'update', 'plan', 'organize', 'prepare', 'implement', 'develop', 'design', 'test', 'deploy', 'fix', 'analyze'];
  
  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();
    
    // Check if line contains action words or task indicators
    const hasActionWord = actionWords.some(word => lowerLine.includes(word));
    const hasTaskIndicator = lowerLine.includes('task') || lowerLine.includes('todo') || lowerLine.includes('action') || line.match(/^\d+[.)]/) || line.startsWith('-') || line.startsWith('*');
    
    if (hasActionWord || hasTaskIndicator) {
      // Clean up the line to make it a proper task name
      let taskName = line.replace(/^[\d\-\*\.\)\s]+/, '').trim();
      
      if (taskName && taskName.length > 3) {
        tasks.push({
          name: taskName,
          type: "Task",
          category: "Personal",
          subcategory: "Mental",
          timeHorizon: "Week",
          priority: "Medium",
          estimatedTime: 1,
          dependencies: [],
          why: "Extracted from content"
        });
      }
    }
  });
  
  console.log(`Local extraction found ${tasks.length} tasks`);
  return tasks;
}

// Local fallback scheduler when OpenAI is unavailable
function generateLocalSchedule(tasks: any[], recurringTasks: any[], userPreferences: any): any {
  // Use same format as OpenAI output
  const schedule: Record<string, Record<string, Array<{taskName: string, durationMinutes: number}>>> = {};
  
  // Get current day of week for recurring task filtering
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const currentDayFull = dayNames[dayOfWeek];
  
  // Filter recurring tasks for today (may be empty if called from AI Schedule Generator)
  const todaysRecurringTasks = recurringTasks.filter(rt => 
    rt.daysOfWeek && rt.daysOfWeek.includes(currentDayFull)
  );
  
  console.log(`Local scheduler: Processing ${todaysRecurringTasks.length} recurring tasks and ${tasks.length} regular tasks for ${currentDayFull}`);
  if (todaysRecurringTasks.length > 0) {
    console.log('Recurring tasks:', todaysRecurringTasks.map(t => ({ name: t.taskName, block: t.timeBlock, quarter: t.quarter })));
  } else {
    console.log('No recurring tasks (handled separately by Sync to Daily)');
  }
  
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
    
    // First, place recurring tasks in their preferred quarters (if any)
    todaysRecurringTasks.forEach(recurringTask => {
      // More flexible time block matching
      const blockNameUpper = block.name.toUpperCase();
      const taskTimeBlockUpper = (recurringTask.timeBlock || '').toUpperCase();
      
      // Check if the recurring task's timeBlock contains or matches the block name
      const blockMatches = taskTimeBlockUpper.includes(blockNameUpper) ||
                          blockNameUpper.includes("PHYSICAL MENTAL") && taskTimeBlockUpper.includes("PHYSICAL MENTAL") ||
                          blockNameUpper.includes("CHIEF PROJECT") && taskTimeBlockUpper.includes("CHIEF PROJECT") ||
                          blockNameUpper.includes("HOUR OF POWER") && taskTimeBlockUpper.includes("HOUR OF POWER") ||
                          blockNameUpper.includes("PRODUCTION WORK") && taskTimeBlockUpper.includes("PRODUCTION WORK") ||
                          blockNameUpper.includes("COMPANY BLOCK") && taskTimeBlockUpper.includes("COMPANY BLOCK") ||
                          blockNameUpper.includes("BUSINESS AUTOMATION") && taskTimeBlockUpper.includes("BUSINESS AUTOMATION") ||
                          blockNameUpper.includes("ENVIRONMENTAL") && taskTimeBlockUpper.includes("ENVIRONMENTAL") ||
                          blockNameUpper.includes("FLEXIBLE BLOCK") && taskTimeBlockUpper.includes("FLEXIBLE BLOCK") ||
                          blockNameUpper.includes("WIND DOWN") && taskTimeBlockUpper.includes("WIND DOWN") ||
                          blockNameUpper.includes("RECOVER") && taskTimeBlockUpper.includes("RECOVER");
      
      if (blockMatches) {
        const quarterNum = recurringTask.quarter || 1; // Default to Q1 if no quarter specified
        const quarterKey = `Q${quarterNum}`;
        if (quarterKey in schedule[block.name]) {
          console.log(`Placing ${recurringTask.taskName} in ${block.name} ${quarterKey}`);
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
        }
        // Don't create placeholder tasks - leave empty slots empty
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
  const hasValidKey = hasValidOpenAIKey();
  
  if (!hasValidKey) {
    console.log("OpenAI API key not configured, using local fallback scheduler");
    return generateLocalSchedule(filteredTasks, recurringTasks, userPreferences);
  }

  try {
    // Include ALL tasks and recurring tasks - no arbitrary limits
    const trimmedTasks = filteredTasks.map(t => ({
      id: t.id,
      name: t.name,
      priority: t.priority,
      estimatedTime: t.estimatedTime,
      category: t.category,
      subcategory: t.subcategory
    }));

    // Include ALL recurring tasks - no limit
    const trimmedRecurring = recurringTasks.map(rt => ({
      taskName: rt.taskName,
      timeBlock: rt.timeBlock,
      quarter: rt.quarter,
      daysOfWeek: rt.daysOfWeek,
      durationMinutes: rt.durationMinutes
    }));

    // Debug logging to verify all recurring tasks are included
    console.log(`DEBUG: Total recurring tasks from DB: ${recurringTasks.length}`);
    console.log(`DEBUG: Sending ${trimmedRecurring.length} recurring tasks to AI:`, 
      trimmedRecurring.map(rt => rt.taskName));

    const prompt = `
    Generate a daily schedule that includes ALL recurring tasks plus available regular tasks.
    
    Available Tasks: ${JSON.stringify(trimmedTasks)}
    Recurring Tasks (ALL MUST BE SCHEDULED): ${JSON.stringify(trimmedRecurring)}
    User Preferences: ${JSON.stringify(userPreferences)}
    
    Time Blocks: Recover, PHYSICAL MENTAL, CHIEF PROJECT, HOUR OF POWER, PRODUCTION WORK, COMPANY BLOCK, BUSINESS AUTOMATION, ENVIRONMENTAL, FLEXIBLE BLOCK, WIND DOWN
    
    CRITICAL REQUIREMENTS:
    1. YOU MUST SCHEDULE EVERY SINGLE RECURRING TASK from the "Recurring Tasks" list above
    2. Each recurring task must be placed in its designated timeBlock and quarter if specified
    3. ONLY use exact task names from the provided lists - DO NOT create or invent new tasks
    4. After placing ALL recurring tasks, fill remaining slots with available tasks by priority
    5. If no tasks are available for a quartile, simply omit that quartile from the JSON
    
    Task Placement Priority:
    1. FIRST: All recurring tasks in their designated time blocks/quarters
    2. THEN: High priority tasks in early quartiles (Q1, Q2)
    3. THEN: Medium priority tasks in middle quartiles (Q2, Q3)
    4. THEN: Low priority tasks in later quartiles (Q3, Q4)
    
    Return JSON format (only include quartiles that have actual tasks):
    {
      "TIME_BLOCK_NAME": {
        "Q1": [{"taskName": "Exact Task Name from Lists", "durationMinutes": 30}],
        "Q2": [{"taskName": "Another Exact Task Name", "durationMinutes": 30}]
      }
    }
    `;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    const response = await openai.chat.completions.create({
      model: "gpt-5",
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
      max_tokens: 2000,
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
      model: "gpt-5",
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

// Local fallback for image analysis when OpenAI is unavailable
function analyzeImageLocally(base64Image: string): ExtractedTask[] {
  console.log("Image analysis unavailable - OpenAI timeout or error");
  
  // Return empty array when image analysis fails
  // Better to show no tasks than misleading placeholder tasks
  return [];
}

export async function analyzeImage(base64Image: string, mimeType: string = 'image/jpeg'): Promise<ExtractedTask[]> {
  // Check if OpenAI API key is available
  if (!hasValidOpenAIKey()) {
    console.warn("OpenAI API key not configured, using local image analysis fallback");
    return analyzeImageLocally(base64Image);
  }

  try {
    console.log(`Analyzing image with GPT-4o (format: ${mimeType})...`);
    // Extract the image format from the MIME type (e.g., 'image/png' -> 'png')
    const imageFormat = mimeType.replace('image/', '');
    
    // Create a timeout promise (30 seconds for image analysis - images need more time)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI image analysis timeout')), 30000);
    });
    
    // Race the OpenAI call against the timeout
    const response = await Promise.race([
      openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract ALL text visible in this image, then identify actionable tasks from that text.

RETURN AS JSON with this structure:
{
  "tasks": [
    {
      "name": "task name exactly as shown in image",
      "type": "Task",
      "category": "Personal" or "Business",
      "subcategory": "Physical" or "Mental" or "Operations",
      "timeHorizon": "Week",
      "priority": "Medium",
      "estimatedTime": 1,
      "why": "reason",
      "dependencies": []
    }
  ]
}

If you cannot read any text or find no tasks, return: {"tasks": []}
ALWAYS return valid JSON with a "tasks" array, even if empty.`
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
      max_tokens: 1000,  // GPT-4o uses max_tokens, not max_completion_tokens
    }),
      timeoutPromise
    ]);

    const rawContent = response.choices[0].message.content || "{}";
    console.log('Raw AI image analysis response:', rawContent);
    
    // If AI returns empty response or just empty tasks array, that's ok
    if (rawContent.trim() === '{}' || rawContent.trim() === '{"tasks":[]}' || rawContent.trim() === '') {
      console.log('No tasks found in image - returning empty array');
      return [];
    }
    
    let result;
    try {
      result = JSON.parse(rawContent);
      console.log('Parsed AI result:', JSON.stringify(result, null, 2));
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('Raw content was:', rawContent);
      return [];
    }
    
    // Validate that result has the expected structure
    if (!result || !Array.isArray(result.tasks)) {
      console.log('AI response does not contain valid tasks array');
      return [];
    }
    
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
    console.error('OpenAI image analysis failed:', error);
    console.log('Falling back to local image analysis');
    return analyzeImageLocally(base64Image);
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
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert at identifying recurring patterns and habits from content. Extract recurring tasks, routines, and regular activities that someone would want to schedule repeatedly. Return results as JSON."
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
      model: "gpt-5",
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

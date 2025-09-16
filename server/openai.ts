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
    Analyze this content and extract actionable tasks. For each task, determine:
    1. Task Name: Clear, actionable statement
    2. Task Type: 
       - Milestone: Long-term outcome (months/years)
       - Sub-Milestone: Major phase within milestone
       - Task: Concrete action (days/weeks)
       - Subtask: Smallest unit (hours)
    3. Category: Personal or Business
    4. Subcategory: 
       - Personal: Physical, Mental, Relationship, Environmental, Financial, Adventure
       - Business: Marketing, Sales, Operations, Products, Production
    5. Time Horizon based on complexity and urgency: 10 Year, 5 Year, 1 Year, Quarter, Week, Today
    6. Priority (High/Medium/Low)
    7. Estimated time in hours (decimal number)
    8. Dependencies on other tasks (array of task names)
    9. Why this matters (extract from context)
    10. Due date if mentioned (ISO date string)

    Return as a JSON object with an array of tasks under the key "tasks".
    
    Content to analyze:
    ${content}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
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
      temperature: 0.3,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.tasks || [];
  } catch (error) {
    console.error("Error extracting tasks:", error);
    throw new Error("Failed to extract tasks from content");
  }
}

export async function generateDailySchedule(
  tasks: any[],
  recurringTasks: any[],
  userPreferences: {
    workHours: { start: string; end: string };
    energyPatterns?: Record<string, number>;
  }
): Promise<any> {
  try {
    const prompt = `
    Generate an optimized daily schedule based on:
    
    Available Tasks:
    ${JSON.stringify(tasks, null, 2)}
    
    Recurring Tasks:
    ${JSON.stringify(recurringTasks, null, 2)}
    
    User Preferences:
    ${JSON.stringify(userPreferences, null, 2)}
    
    Time Blocks Available:
    - Recover: 12am-7am (4 quartiles)
    - PHYSICAL MENTAL: 7-9AM (4 quartiles)
    - CHIEF PROJECT: 9-11AM (4 quartiles)
    - HOUR OF POWER: 11-12PM (4 quartiles)
    - PRODUCTION WORK: 12-2PM (4 quartiles)
    - COMPANY BLOCK: 2-4PM (4 quartiles)
    - BUSINESS AUTOMATION: 4-6PM (4 quartiles)
    - ENVIRONMENTAL: 6-8PM (4 quartiles)
    - FLEXIBLE BLOCK: 8-10PM (4 quartiles)
    - WIND DOWN: 10PM-12AM (4 quartiles)
    
    Rules:
    1. Fill recurring tasks first in their designated blocks
    2. Prioritize high-priority tasks in optimal energy slots
    3. Match task categories to appropriate time blocks
    4. Respect estimated time requirements
    5. Consider dependencies
    
    Return a JSON object with the schedule structure mapping time blocks to quartiles with assigned tasks.
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an AI scheduling assistant. Create optimal daily schedules that maximize productivity while respecting user preferences and energy patterns."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result;
  } catch (error) {
    console.error("Error generating daily schedule:", error);
    throw new Error("Failed to generate daily schedule");
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
      temperature: 0.4,
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

export async function analyzeImage(base64Image: string): Promise<ExtractedTask[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
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
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.tasks || [];
  } catch (error) {
    console.error("Error analyzing image:", error);
    throw new Error("Failed to analyze image for tasks");
  }
}

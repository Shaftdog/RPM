import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, Plus, Minus, Camera, Calendar, ChevronDown, ChevronUp, Target, Info, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { TIME_BLOCKS as CANONICAL_TIME_BLOCKS } from "@shared/schema";

// Convert canonical TIME_BLOCKS to frontend format with time display and quartiles
const TIME_BLOCKS = CANONICAL_TIME_BLOCKS.map(block => ({
  name: block.name,
  time: `${block.start}-${block.end}`,
  quartiles: 4
}));

interface DailyScheduleEntry {
  id?: string;
  timeBlock: string;
  quartile: number;
  plannedTaskId?: string;
  actualTaskId?: string;
  status: "not_started" | "in_progress" | "completed";
  reflection?: string;
}

export default function DailyWorksheet() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState("2:30:00");
  const [totalTime] = useState("6:45:00");
  const [breakTimer] = useState("4:30:00");
  const baseExpenditure = -2300; // Base Metabolic Rate (constant)
  const [quickTask, setQuickTask] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [isOutcomesCollapsed, setIsOutcomesCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('daily-outcomes-collapsed') || 'false');
    } catch {
      return false;
    }
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  
  // Manual multi-add state
  const [showAddTaskFor, setShowAddTaskFor] = useState<{timeBlock: string, quartile: number} | null>(null);
  
  // Remove task confirmation dialog state
  const [removeTaskDialog, setRemoveTaskDialog] = useState<{
    open: boolean;
    task: any;
    entry: DailyScheduleEntry;
    timeBlock: string;
    quartile: number;
    isPlanned: boolean;
  } | null>(null);
  const [skipRecurringToday, setSkipRecurringToday] = useState(true);
  
  // Client-side skip registry for recurring tasks (per-date)
  const [skippedRecurring, setSkippedRecurring] = useState<Map<string, Set<string>>>(() => {
    const map = new Map();
    try {
      const saved = localStorage.getItem('skippedRecurring');
      if (saved) {
        const skipArray = JSON.parse(saved);
        map.set('global', new Set(skipArray));
      }
    } catch (e) {
      console.warn('Failed to load skipped recurring tasks from localStorage:', e);
    }
    return map;
  });
  
  const { toast } = useToast();

  // Handle task removal from schedule
  const handleRemoveTask = async (dialogData: {
    task: any;
    entry: DailyScheduleEntry;
    timeBlock: string;
    quartile: number;
    isPlanned: boolean;
    skipRecurring?: boolean;
  }) => {
    const { task, entry, timeBlock, quartile, isPlanned, skipRecurring } = dialogData;
    
    try {
      // Optimistically update the cache to remove the task immediately
      const queryKey = ['/api/daily', selectedDate];
      const previousData = queryClient.getQueryData<DailyScheduleEntry[]>(queryKey);
      
      let updateData: any = { id: entry.id! };
      
      // Handle different task types
      if (task.type === 'recurring') {
        // For recurring tasks, clear the reflection field or modify MULTIPLE_TASKS
        if (entry.reflection?.startsWith('RECURRING_TASK:')) {
          updateData.reflection = null;
        } else if (entry.reflection?.startsWith('MULTIPLE_TASKS:')) {
          // Remove this specific task from MULTIPLE_TASKS list by index (pipe-delimited format)
          const taskNamesStr = entry.reflection.replace('MULTIPLE_TASKS:', '');
          const taskNames = taskNamesStr.split('|').map(name => name.trim());
          
          // Extract index from task ID for multiple tasks (format: "multiple-TimeBlock-Quartile-index")
          if (task.source === 'multiple_tasks' && task.id.includes('-')) {
            const index = parseInt(task.id.split('-').pop() || '0');
            if (index >= 0 && index < taskNames.length) {
              taskNames.splice(index, 1); // Remove by index
            }
          }
          
          updateData.reflection = taskNames.length > 0 
            ? `MULTIPLE_TASKS:${taskNames.join('|')}`
            : null;
        }
      } else {
        // For regular tasks, clear the appropriate ID field
        updateData[isPlanned ? 'plannedTaskId' : 'actualTaskId'] = null;
      }
      
      // Update cache optimistically
      if (previousData) {
        const updatedData = previousData.map(item => 
          item.id === entry.id 
            ? { ...item, ...updateData }
            : item
        );
        queryClient.setQueryData(queryKey, updatedData);
      }

      // If skipping recurring task, add to skip registry
      if (skipRecurring && task.type === 'recurring') {
        // Find the actual recurring task to get its ID
        let recurringTaskId = null;
        
        if (task.source === 'multiple_tasks') {
          // For multiple tasks, find the matching recurring task by timeBlock, quartile, and name
          const matchingRecurring = recurringTasks.find(rt => 
            rt.timeBlock === timeBlock && 
            rt.quartiles?.includes(quartile) &&
            (rt.taskName || rt.name) === task.name
          );
          recurringTaskId = matchingRecurring?.id || `name:${task.name}`;
        } else if (task.source === 'recurring_active' || task.source === 'recurring_candidate') {
          // For single recurring tasks, find by timeBlock, quartile, and name
          const matchingRecurring = recurringTasks.find(rt => 
            rt.timeBlock === timeBlock && 
            rt.quartiles?.includes(quartile) &&
            (rt.taskName || rt.name) === task.name
          );
          recurringTaskId = matchingRecurring?.id || `name:${task.name}`;
        }
        
        if (recurringTaskId) {
          const skipKey = `${selectedDate}:${timeBlock}:${quartile}:${recurringTaskId}`;
          setSkippedRecurring(prev => {
            const newMap = new Map(prev);
            if (!newMap.has('global')) {
              newMap.set('global', new Set());
            }
            newMap.get('global')!.add(skipKey);
            // Persist to localStorage
            localStorage.setItem('skippedRecurring', JSON.stringify(Array.from(newMap.get('global')!)));
            return newMap;
          });
        }
      }

      // Make the API call to remove the task
      updateScheduleMutation.mutate(updateData, {
        onError: () => {
          // Rollback on error
          if (previousData) {
            queryClient.setQueryData(queryKey, previousData);
          }
          // Also rollback skip registry on error
          if (skipRecurring && task.type === 'recurring') {
            // Find the same recurring task ID used in the forward path
            let recurringTaskId = null;
            const matchingRecurring = recurringTasks.find(rt => 
              rt.timeBlock === timeBlock && 
              rt.quartiles?.includes(quartile) &&
              (rt.taskName || rt.name) === task.name
            );
            recurringTaskId = matchingRecurring?.id || `name:${task.name}`;
            
            if (recurringTaskId) {
              const skipKey = `${selectedDate}:${timeBlock}:${quartile}:${recurringTaskId}`;
              setSkippedRecurring(prev => {
                const newMap = new Map(prev);
                const globalSet = newMap.get('global');
                if (globalSet) {
                  globalSet.delete(skipKey);
                  localStorage.setItem('skippedRecurring', JSON.stringify(Array.from(globalSet)));
                }
                return newMap;
              });
            }
          }
        }
      });

      toast({
        title: "Task removed",
        description: `Removed "${task.name}" from ${timeBlock} Q${quartile}${skipRecurring ? ' and skipped today' : ''}`,
      });

    } catch (error) {
      console.error('Failed to remove task:', error);
      toast({
        title: "Failed to remove task",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const { data: schedule = [], isLoading: scheduleLoading } = useQuery<DailyScheduleEntry[]>({
    queryKey: ['/api/daily', selectedDate],
    enabled: !!selectedDate,
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ['/api/tasks'],
  });

  // Fetch recurring tasks for display
  const { data: recurringTasks = [] } = useQuery<any[]>({
    queryKey: ['/api/recurring-tasks'],
  });

  // Get completed tasks for the selected date to calculate calories
  const completedTasks = tasks.filter(task => 
    task.status === 'completed' && 
    task.xDate && 
    new Date(task.xDate).toDateString() === new Date(selectedDate).toDateString()
  );

  // Get Today's Outcomes (Milestones and Sub-Milestones due today)
  const outcomesToday = tasks.filter(task => {
    if (!(task.type === 'Milestone' || task.type === 'Sub-Milestone') || !task.xDate) {
      return false;
    }
    
    // Convert both dates to YYYY-MM-DD format for comparison to avoid timezone issues
    const taskDate = new Date(task.xDate).toISOString().split('T')[0];
    const selectedDateFormatted = selectedDate; // selectedDate is already in YYYY-MM-DD format
    
    return taskDate === selectedDateFormatted;
  });


  // Persist outcomes panel collapse state
  useEffect(() => {
    localStorage.setItem('daily-outcomes-collapsed', JSON.stringify(isOutcomesCollapsed));
  }, [isOutcomesCollapsed]);

  // Calculate total calories from completed tasks
  const calculatedCaloricIntake = completedTasks.reduce((total, task) => {
    const intake = parseFloat(task.caloriesIntake) || 0;
    return total + intake;
  }, 0);

  const calculatedCaloricExpenditure = completedTasks.reduce((total, task) => {
    const expenditure = parseFloat(task.caloriesExpenditure) || 0;
    return total - expenditure; // Keep expenditure negative
  }, 0);

  const generateScheduleMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiRequest("POST", "/api/daily/generate", { date });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
      toast({
        title: "Schedule generated",
        description: "AI has created your optimized daily schedule",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to generate schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (updates: Partial<DailyScheduleEntry> & { id: string }) => {
      const response = await apiRequest("PUT", "/api/daily/update", updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
    },
    onError: (error) => {
      toast({
        title: "Failed to update schedule",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create update task status mutation for regular tasks
  const updateTaskStatusMutation = useMutation({
    mutationFn: async (data: { taskId: string; status: string; xDate?: string; scheduleUpdateData?: any }) => {
      const response = await apiRequest("PUT", `/api/tasks/${data.taskId}`, {
        status: data.status,
        ...(data.xDate && { xDate: data.xDate })
      });
      return { taskResponse: response.json(), scheduleUpdateData: data.scheduleUpdateData };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      // If there's schedule update data, chain the schedule update
      if (data.scheduleUpdateData) {
        updateScheduleMutation.mutate(data.scheduleUpdateData);
      }
    },
    onError: (error) => {
      toast({
        title: "Failed to update task",
        description: error.message,
        variant: "destructive"
      });
    },
  });

  // Helper function to execute AI actions
  const executeAIActions = async (actions: any[]) => {
    if (!actions || actions.length === 0) return { success: true, failures: [] };

    const results = [];
    const failures = [];

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'move_task':
            if (action.taskId && action.updates) {
              // Map action updates to the format expected by /api/planning/move
              const moveData: any = { taskId: action.taskId };
              
              if (action.updates.timeHorizon || action.updates.newTimeHorizon) {
                moveData.newTimeHorizon = action.updates.newTimeHorizon || action.updates.timeHorizon;
              }
              if (action.updates.category || action.updates.newCategory) {
                moveData.newCategory = action.updates.newCategory || action.updates.category;
              }
              if (action.updates.subcategory || action.updates.newSubcategory) {
                moveData.newSubcategory = action.updates.newSubcategory || action.updates.subcategory;
              }
              if (action.updates.xDate) {
                moveData.xDate = action.updates.xDate;
              }
              
              await apiRequest("POST", "/api/planning/move", moveData);
              results.push({ action, success: true });
            } else {
              failures.push({ action, error: 'Missing taskId or updates' });
            }
            break;
          case 'update_task':
            if (action.taskId && action.updates) {
              await apiRequest("PUT", `/api/tasks/${action.taskId}`, action.updates);
              results.push({ action, success: true });
            } else {
              failures.push({ action, error: 'Missing taskId or updates' });
            }
            break;
          case 'clear_schedule':
            if (action.date) {
              await apiRequest("POST", `/api/daily/clear/${action.date}`);
              results.push({ action, success: true });
            } else {
              failures.push({ action, error: 'Missing date' });
            }
            break;
          case 'remove_from_schedule':
            // For now, skip this action type as endpoint doesn't exist yet
            failures.push({ action, error: 'Remove from schedule not implemented yet' });
            break;
          default:
            failures.push({ action, error: 'Unknown action type' });
        }
      } catch (error) {
        console.error('Error executing action:', action, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push({ action, error: errorMessage });
      }
    }

    return { 
      success: failures.length === 0, 
      failures,
      successCount: results.length 
    };
  };

  const aiChatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", { message });
      return response.json();
    },
    onSuccess: async (data) => {
      // Execute any actions returned by the AI
      if (data.actions && data.actions.length > 0) {
        const result = await executeAIActions(data.actions);
        
        // Invalidate relevant queries after actions are executed
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
        queryClient.invalidateQueries({ queryKey: ['/api/daily'] });
        
        if (result.success) {
          toast({
            title: "AI Assistant",
            description: `${data.response} ✅ All ${result.successCount} actions completed successfully!`,
          });
        } else {
          toast({
            title: "AI Assistant", 
            description: `${data.response} ⚠️ ${result.failures.length} actions failed. ${result.successCount} succeeded.`,
            variant: "destructive",
          });
          console.error('Action failures:', result.failures);
        }
      } else {
        // No actions to execute, just show response
        toast({
          title: "AI Assistant",
          description: data.response,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "AI request failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (taskName: string) => {
      const response = await apiRequest("POST", "/api/tasks", {
        name: taskName,
        type: "Task",
        category: "Personal",
        subcategory: "Mental",
        timeHorizon: "Today",
        priority: "Medium",
        estimatedTime: "1",
        why: "Quick captured task",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task created",
        description: "New task added to your list",
      });
      setQuickTask("");
    },
    onError: (error) => {
      toast({
        title: "Failed to create task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTimerToggle = () => {
    setTimerRunning(!timerRunning);
    toast({
      title: timerRunning ? "Timer stopped" : "Timer started",
      description: timerRunning ? "Work session paused" : "Work session started",
    });
  };

  // Removed handleCalorieUpdate - calories now calculated from completed tasks

  const handleQuickTaskSubmit = () => {
    if (!quickTask.trim()) return;
    createTaskMutation.mutate(quickTask);
  };

  const handleAiMessage = () => {
    if (!aiMessage.trim()) return;
    aiChatMutation.mutate(aiMessage);
    setAiMessage("");
  };

  const getScheduleEntry = (timeBlock: string, quartile: number): DailyScheduleEntry | undefined => {
    return schedule.find((entry) => 
      entry.timeBlock === timeBlock && entry.quartile === quartile
    );
  };

  // Helper to find a recurring task that matches the schedule entry
  const getRecurringTaskForEntry = (entry: DailyScheduleEntry | undefined): any | undefined => {
    if (!entry || entry.plannedTaskId) return undefined;
    
    // Find recurring task that matches this time block and quartile
    return recurringTasks.find((rt) => 
      rt.timeBlock === entry.timeBlock && 
      (!rt.quarter || rt.quarter === entry.quartile)
    );
  };

  // Helper to get task name for display
  const getTaskNameForEntry = (entry: DailyScheduleEntry | undefined): string => {
    if (!entry) return "";
    
    // Skip placeholder entries - these are system-generated fillers, not real tasks
    if (entry.reflection && entry.reflection.startsWith('PLACEHOLDER:')) {
      return "";
    }
    
    // First try to find a regular task
    if (entry.actualTaskId) {
      const task = tasks.find(t => t.id === entry.actualTaskId);
      if (task) return task.name;
    }
    
    if (entry.plannedTaskId) {
      const task = tasks.find(t => t.id === entry.plannedTaskId);
      if (task) return task.name;
    }
    
    // Check for recurring task name stored in reflection field
    if (entry.reflection && entry.reflection.startsWith('RECURRING_TASK:')) {
      return entry.reflection.replace('RECURRING_TASK:', '');
    }
    
    return "";
  };

  // Helper to get all candidate tasks for a quarter (active task + matching recurring tasks)
  const getCandidateTasksForQuarter = (timeBlock: string, quartile: number) => {
    const entry = getScheduleEntry(timeBlock, quartile);
    const selectedDateObj = new Date(selectedDate);
    const dayOfWeek = selectedDateObj.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    const candidates: Array<{
      id: string;
      name: string;
      type: 'regular' | 'recurring';
      isActive: boolean;
      source: string;
      durationMinutes?: number;
    }> = [];
    
    // 1. Add currently active/selected task if it exists and isn't a placeholder or completed
    if (entry && !entry.reflection?.startsWith('PLACEHOLDER:') && entry.status !== 'completed') {
      if (entry.actualTaskId) {
        const task = tasks.find(t => t.id === entry.actualTaskId);
        if (task) {
          candidates.push({
            id: entry.actualTaskId,
            name: task.name,
            type: 'regular',
            isActive: true,
            source: 'active'
          });
        }
      } else if (entry.plannedTaskId) {
        const task = tasks.find(t => t.id === entry.plannedTaskId);
        if (task) {
          candidates.push({
            id: entry.plannedTaskId,
            name: task.name,
            type: 'regular',
            isActive: true,
            source: 'planned'
          });
        }
      } else if (entry.reflection?.startsWith('RECURRING_TASK:')) {
        const taskName = entry.reflection.replace('RECURRING_TASK:', '');
        candidates.push({
          id: `recurring-${timeBlock}-${quartile}`,
          name: taskName,
          type: 'recurring',
          isActive: true,
          source: 'recurring_active'
        });
      } else if (entry.reflection?.startsWith('MULTIPLE_TASKS:')) {
        // Handle multiple tasks from AI scheduler
        const taskNamesStr = entry.reflection.replace('MULTIPLE_TASKS:', '');
        const taskNames = taskNamesStr.split('|');
        taskNames.forEach((taskName, index) => {
          candidates.push({
            id: `multiple-${timeBlock}-${quartile}-${index}`,
            name: taskName.trim(),
            type: 'recurring',
            isActive: true,
            source: 'multiple_tasks'
          });
        });
      }
    }
    
    // 2. Add matching recurring tasks that aren't already active
    const matchingRecurring = recurringTasks.filter(rt => {
      // Don't show recurring tasks if this entry is already completed
      if (entry?.status === 'completed') return false;
      
      // Check if this recurring task is skipped for today
      const skipKey = `${selectedDate}:${timeBlock}:${quartile}:${rt.id}`;
      const skipKeyFallback = `${selectedDate}:${timeBlock}:${quartile}:name:${rt.taskName || rt.name}`;
      const globalSkipped = skippedRecurring.get('global');
      if (globalSkipped?.has(skipKey) || globalSkipped?.has(skipKeyFallback)) return false;
      
      // Must match time block
      if (rt.timeBlock !== timeBlock) return false;
      
      // Must match quarter (or recurring task has no specific quarter)
      if (rt.quarter && rt.quarter !== quartile) return false;
      
      // Must include today's day of week
      if (!rt.daysOfWeek || !rt.daysOfWeek.includes(dayOfWeek)) return false;
      
      // Don't duplicate already active tasks
      const isAlreadyActive = candidates.some(c => 
        c.name === rt.taskName && c.type === 'recurring'
      );
      
      return !isAlreadyActive;
    });
    
    // Add recurring tasks as candidates
    matchingRecurring.forEach(rt => {
      candidates.push({
        id: rt.id,
        name: rt.taskName,
        type: 'recurring',
        isActive: false,
        source: 'recurring_candidate',
        durationMinutes: rt.durationMinutes
      });
    });
    
    return candidates;
  };

  const getCompletedTasks = () => {
    return schedule.filter((entry) => entry.status === 'completed').length;
  };

  const getTotalQuartiles = () => {
    return TIME_BLOCKS.reduce((total, block) => total + block.quartiles, 0);
  };

  const completionRate = getTotalQuartiles() > 0 ? (getCompletedTasks() / getTotalQuartiles()) * 100 : 0;

  // Helper to get selected task details
  const selectedTask = selectedTaskId ? tasks.find(task => task.id === selectedTaskId) : null;

  // Close modal handler
  const handleCloseDetails = () => {
    setIsDetailsOpen(false);
    setSelectedTaskId(null);
  };

  return (
    <div className="space-y-6">
      {/* Today's Outcomes */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              <CardTitle className="text-lg">Today's Outcomes</CardTitle>
              {outcomesToday.length > 0 && (
                <Badge variant="secondary" className="text-xs" data-testid="badge-outcomes-count">
                  {outcomesToday.length}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOutcomesCollapsed(!isOutcomesCollapsed)}
              aria-expanded={!isOutcomesCollapsed}
              data-testid="button-toggle-outcomes"
            >
              {isOutcomesCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {!isOutcomesCollapsed && (
          <CardContent className="pt-0">
            {outcomesToday.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="status-no-outcomes">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No outcomes due today</p>
                <p className="text-xs">Milestones and deliverables will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {outcomesToday.map((outcome) => (
                  <div
                    key={outcome.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card/50"
                    data-testid={`row-outcome-${outcome.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm truncate" data-testid={`text-outcome-name-${outcome.id}`}>{outcome.name}</h4>
                        <Badge variant="outline" className="text-xs" data-testid={`badge-outcome-type-${outcome.id}`}>
                          {outcome.type}
                        </Badge>
                        {outcome.category && (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-outcome-category-${outcome.id}`}>
                            {outcome.category}
                          </Badge>
                        )}
                        {outcome.subcategory && (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-outcome-subcategory-${outcome.id}`}>
                            {outcome.subcategory}
                          </Badge>
                        )}
                      </div>
                      {outcome.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {outcome.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Top Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-auto"
                  data-testid="input-date-selector"
                />
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Total Time:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-total-time">{totalTime}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Current:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-current-time">{currentTime}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Break Timer:</span>
                <span className="font-mono font-medium ml-1" data-testid="text-break-timer">{breakTimer}</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Net Cal:</span>
                <span className={`font-medium min-w-[3rem] text-center ${
                  (calculatedCaloricIntake + calculatedCaloricExpenditure + baseExpenditure) >= 0 ? 'text-green-600' : 'text-red-600'
                }`} data-testid="text-net-calories">
                  {calculatedCaloricIntake + calculatedCaloricExpenditure + baseExpenditure}
                </span>
              </div>
              <Button onClick={handleTimerToggle} data-testid="button-timer-toggle">
                {timerRunning ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" />
                    Pause Timer
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Start Timer
                  </>
                )}
              </Button>
              <Button 
                variant="outline"
                onClick={() => generateScheduleMutation.mutate(selectedDate)}
                disabled={generateScheduleMutation.isPending}
                data-testid="button-generate-schedule"
              >
                Generate AI Schedule
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Time Blocks */}
        <div className="xl:col-span-3 space-y-4">
          {TIME_BLOCKS.map((block) => (
            <Card key={block.name} className="overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base">{block.name}</CardTitle>
                  <span className="text-sm text-muted-foreground">{block.time}</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-4 gap-px bg-border">
                  {Array.from({ length: block.quartiles }, (_, index) => {
                    const quartile = index + 1;
                    const entry = getScheduleEntry(block.name, quartile);
                    const candidates = getCandidateTasksForQuarter(block.name, quartile);
                    const visibleTasks = candidates.slice(0, 4); // Show max 4 tasks
                    const hiddenCount = Math.max(0, candidates.length - 4);
                    
                    // Debug logging for MULTIPLE_TASKS (dev only)
                    if (import.meta.env.DEV && entry?.reflection?.startsWith('MULTIPLE_TASKS:')) {
                      console.log(`[DEBUG] ${block.name} Q${quartile} - MULTIPLE_TASKS entry:`, {
                        reflection: entry.reflection,
                        candidates: candidates.length,
                        visibleTasks: visibleTasks.length,
                        candidateDetails: candidates.map(c => ({ id: c.id, name: c.name, type: c.type, isActive: c.isActive }))
                      });
                    }
                    
                    return (
                      <div key={quartile} className={`bg-card p-2 ${entry?.status === 'in_progress' ? 'border-2 border-primary' : ''}`}>
                        {/* Compact header */}
                        <div className={`text-xs mb-2 font-medium ${entry?.status === 'in_progress' ? 'text-primary' : 'text-muted-foreground'}`}>
                          Q{quartile} {entry?.status === 'in_progress' && '• ACTIVE'}
                        </div>
                        
                        {/* Task stack */}
                        <div className="space-y-1">
                          {visibleTasks.length === 0 ? (
                            // Empty quarter - show compact task selector
                            <Select 
                              value={entry?.actualTaskId || entry?.plannedTaskId || ""} 
                              onValueChange={async (taskId) => {
                                console.log('Combobox selection:', { entryId: entry?.id, taskId, blockName: block.name, quartile });
                                if (taskId) {
                                  if (entry?.id) {
                                    // Update existing entry
                                    console.log('Updating existing entry:', { id: entry.id, actualTaskId: taskId });
                                    updateScheduleMutation.mutate({
                                      id: entry.id,
                                      actualTaskId: taskId,
                                      status: 'not_started',
                                    });
                                  } else {
                                    // Create new entry first, then update it
                                    console.log('Creating new schedule entry for:', { blockName: block.name, quartile, taskId });
                                    try {
                                      const response = await apiRequest("POST", "/api/daily", {
                                        timeBlock: block.name,
                                        quartile: quartile,
                                        plannedTaskId: taskId,
                                        actualTaskId: taskId,
                                        status: 'not_started',
                                        date: new Date(selectedDate + 'T00:00:00.000Z')
                                      });
                                      if (response.ok) {
                                        console.log('Successfully created new schedule entry');
                                        // Invalidate cache to refresh the schedule data
                                        queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
                                      }
                                    } catch (error) {
                                      console.error('Failed to create schedule entry:', error);
                                      toast({
                                        title: "Failed to assign task",
                                        description: "Could not create schedule entry",
                                        variant: "destructive",
                                      });
                                    }
                                  }
                                } else {
                                  console.log('No taskId provided');
                                }
                              }}
                            >
                              <SelectTrigger className="w-full text-xs h-6" data-testid={`select-task-${block.name}-${quartile}`}>
                                <SelectValue placeholder="Select task..." />
                              </SelectTrigger>
                              <SelectContent>
                                {tasks
                                  .filter(task => task.type === 'Task' || task.type === 'Subtask')
                                  .map((task) => (
                                    <SelectItem key={task.id} value={task.id}>
                                      {task.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            // Show task rows
                            <>
                              {visibleTasks.map((task, taskIndex) => (
                                <div
                                  key={task.id}
                                  className={`flex items-center gap-1 p-1 rounded text-xs cursor-pointer hover:bg-secondary/50 ${
                                    task.isActive ? 'bg-primary/10 border border-primary/20' : ''
                                  }`}
                                  onClick={() => {
                                    if (entry?.id) {
                                      if (task.type === 'regular') {
                                        updateScheduleMutation.mutate({
                                          id: entry.id,
                                          actualTaskId: task.id,
                                          status: 'not_started', // Reset status when selecting new task
                                        });
                                      } else if (task.type === 'recurring') {
                                        // Set recurring task as active by storing it in reflection field
                                        updateScheduleMutation.mutate({
                                          id: entry.id,
                                          actualTaskId: undefined,
                                          plannedTaskId: undefined,
                                          reflection: `RECURRING_TASK:${task.name}`,
                                          status: 'not_started', // Reset status when selecting new task
                                        });
                                      }
                                    }
                                  }}
                                  data-testid={`row-task-${block.name}-${quartile}-${taskIndex}`}
                                >
                                  {/* Icon */}
                                  <span className="text-muted-foreground text-xs w-3 flex-shrink-0">
                                    {task.type === 'recurring' ? '⟲' : '•'}
                                  </span>
                                  
                                  {/* Task name */}
                                  <span className="flex-1 truncate line-clamp-1" title={task.name}>
                                    {task.name}
                                  </span>
                                  
                                  {/* Remove button - show for any active task */}
                                  {task.isActive && entry?.id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRemoveTaskDialog({
                                          open: true,
                                          task,
                                          entry,
                                          timeBlock: block.name,
                                          quartile,
                                          isPlanned: !!entry.plannedTaskId && entry.plannedTaskId === task.id
                                        });
                                      }}
                                      data-testid={`button-remove-${block.name}-${quartile}-${task.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                  
                                  {/* Info button for regular tasks */}
                                  {task.type === 'regular' && task.isActive && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-4 w-4 p-0 hover:bg-secondary/50 flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTaskId(task.id);
                                        setIsDetailsOpen(true);
                                      }}
                                      data-testid={`button-task-info-${block.name}-${quartile}-${taskIndex}`}
                                    >
                                      <Info className="h-3 w-3" />
                                    </Button>
                                  )}
                                  
                                  {/* Duration for recurring tasks */}
                                  {task.durationMinutes && (
                                    <span className="text-xs text-muted-foreground flex-shrink-0">
                                      {task.durationMinutes}m
                                    </span>
                                  )}
                                  
                                  {/* Completion checkbox - only show for active tasks */}
                                  {task.isActive ? (
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <Checkbox 
                                      checked={false}
                                      disabled={updateScheduleMutation.isPending || updateTaskStatusMutation.isPending}
                                      onCheckedChange={(checked) => {
                                        if (checked && entry?.id) {
                                          // Mark task as completed and remove from quarter
                                          if (task.type === 'regular') {
                                            // For regular tasks, update task status first, then chain schedule update
                                            updateTaskStatusMutation.mutate({
                                              taskId: task.id,
                                              status: 'completed',
                                              xDate: new Date(selectedDate + 'T00:00:00.000Z').toISOString(),
                                              scheduleUpdateData: {
                                                id: entry.id,
                                                actualTaskId: undefined,
                                                plannedTaskId: undefined,
                                                status: 'completed',
                                              }
                                            });
                                          } else if (task.type === 'recurring') {
                                            // Handle recurring tasks - check if it's part of MULTIPLE_TASKS
                                            if (entry.reflection?.startsWith('MULTIPLE_TASKS:')) {
                                              // Remove only this task from the multiple tasks list
                                              const taskNamesStr = entry.reflection.replace('MULTIPLE_TASKS:', '');
                                              const taskNames = taskNamesStr.split('|');
                                              const remainingTasks = taskNames.filter(name => name.trim() !== task.name);
                                              
                                              if (remainingTasks.length === 0) {
                                                // No tasks left, mark entry as completed
                                                updateScheduleMutation.mutate({
                                                  id: entry.id,
                                                  actualTaskId: undefined,
                                                  plannedTaskId: undefined,
                                                  reflection: undefined,
                                                  status: 'completed',
                                                });
                                              } else if (remainingTasks.length === 1) {
                                                // One task left, convert to single recurring task
                                                updateScheduleMutation.mutate({
                                                  id: entry.id,
                                                  reflection: `RECURRING_TASK:${remainingTasks[0]}`,
                                                });
                                              } else {
                                                // Multiple tasks still remain
                                                updateScheduleMutation.mutate({
                                                  id: entry.id,
                                                  reflection: `MULTIPLE_TASKS:${remainingTasks.join('|')}`,
                                                  status: 'not_started', // Keep status as not_started when tasks remain
                                                });
                                              }
                                            } else {
                                              // Single recurring task, mark schedule entry as completed
                                              updateScheduleMutation.mutate({
                                                id: entry.id,
                                                actualTaskId: undefined,
                                                plannedTaskId: undefined,
                                                reflection: undefined,
                                                status: 'completed',
                                              });
                                            }
                                          }
                                        }
                                      }}
                                      className="w-3 h-3 flex-shrink-0"
                                      data-testid={`checkbox-complete-${block.name}-${quartile}-${taskIndex}`}
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                              
                              {/* Overflow indicator with tooltip */}
                              {hiddenCount > 0 && (
                                <div 
                                  className="flex items-center gap-1 p-1 rounded text-xs cursor-pointer hover:bg-secondary/50 text-muted-foreground"
                                  title={`${hiddenCount} more tasks: ${candidates.slice(4).map(t => t.name).join(', ')}`}
                                  data-testid={`button-more-tasks-${block.name}-${quartile}`}
                                >
                                  <span className="text-xs">📋 +{hiddenCount} more</span>
                                </div>
                              )}
                              
                              {/* Manual Add Task Button */}
                              {showAddTaskFor?.timeBlock === block.name && showAddTaskFor?.quartile === quartile ? (
                                // Show task selector when adding
                                <div className="mt-2 pt-1 border-t border-border/50">
                                  <Select 
                                    value=""
                                    onValueChange={async (taskId) => {
                                      if (taskId) {
                                        try {
                                          // Add task to existing quarter (will convert to MULTIPLE_TASKS if needed)
                                          const response = await apiRequest("POST", "/api/daily/add-to-quarter", {
                                            timeBlock: block.name,
                                            quartile: quartile,
                                            taskId: taskId,
                                            date: new Date(selectedDate + 'T00:00:00.000Z')
                                          });
                                          
                                          if (response.ok) {
                                            console.log('Successfully added task to quarter');
                                            // Invalidate cache to refresh the schedule data
                                            queryClient.invalidateQueries({ queryKey: ['/api/daily', selectedDate] });
                                            toast({
                                              title: "Task added successfully",
                                              description: `Added task to ${block.name} Q${quartile}`,
                                            });
                                            // Hide selector on success
                                            setShowAddTaskFor(null);
                                          } else {
                                            // Get the error message from the response
                                            const errorData = await response.json().catch(() => ({}));
                                            const errorMessage = errorData.message || "Could not add task to quarter";
                                            toast({
                                              title: "Failed to add task",
                                              description: errorMessage,
                                              variant: "destructive",
                                            });
                                            // Hide selector on error as well
                                            setShowAddTaskFor(null);
                                          }
                                        } catch (error) {
                                          console.error('Failed to add task to quarter:', error);
                                          toast({
                                            title: "Failed to add task", 
                                            description: error instanceof Error ? error.message : "Could not add task to quarter",
                                            variant: "destructive",
                                          });
                                          // Hide selector on exception
                                          setShowAddTaskFor(null);
                                        }
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-full text-xs h-6" data-testid={`select-add-task-${block.name.replace(/\s+/g, '-')}-${quartile}`}>
                                      <SelectValue placeholder="Add another task..." />
                                    </SelectTrigger>
                                    <SelectContent data-testid={`select-content-add-task-${block.name.replace(/\s+/g, '-')}-${quartile}`}>
                                      {tasks
                                        .filter(task => task.type === 'Task' || task.type === 'Subtask')
                                        .filter(task => {
                                          // Don't show tasks already in this quarter
                                          // For MULTIPLE_TASKS, check by name since candidates have generated IDs
                                          return !visibleTasks.some(vt => vt.id === task.id || vt.name?.toLowerCase().trim() === task.name?.toLowerCase().trim());
                                        })
                                        .map((task) => (
                                          <SelectItem key={task.id} value={task.id} data-testid={`select-item-add-task-${task.id}`}>
                                            {task.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="w-full mt-1 h-5 text-xs"
                                    onClick={() => setShowAddTaskFor(null)}
                                    data-testid={`button-cancel-add-${block.name.replace(/\s+/g, '-')}-${quartile}`}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                // Show "+" button when not adding
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full mt-1 h-5 text-xs opacity-60 hover:opacity-100"
                                  onClick={() => setShowAddTaskFor({ timeBlock: block.name, quartile: quartile })}
                                  data-testid={`button-add-task-${block.name.replace(/\s+/g, '-')}-${quartile}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add Task
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* AI Assistant */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI Assistant</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={aiMessage}
                onChange={(e) => setAiMessage(e.target.value)}
                placeholder="How can I help with your schedule?"
                className="h-20 resize-none text-sm mb-3"
                data-testid="textarea-ai-message"
              />
              <Button 
                className="w-full" 
                size="sm"
                onClick={handleAiMessage}
                disabled={aiChatMutation.isPending}
                data-testid="button-ai-send"
              >
                Ask AI
              </Button>
            </CardContent>
          </Card>

          {/* Calorie Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calorie Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Caloric Intake (from completed tasks):</span>
                <span className="text-sm font-medium text-green-600 min-w-[3rem] text-right" data-testid="text-caloric-intake">
                  {calculatedCaloricIntake}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Caloric Expenditure (from completed tasks):</span>
                <span className="text-sm font-medium text-orange-600 min-w-[3rem] text-right" data-testid="text-caloric-expenditure">
                  {calculatedCaloricExpenditure}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Base Expenditure:</span>
                <span className="text-sm font-medium text-red-600" data-testid="text-base-expenditure">{baseExpenditure}</span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between font-medium">
                <span className="text-sm text-foreground">Net Calories:</span>
                <span className={`text-sm ${
                  (calculatedCaloricIntake + calculatedCaloricExpenditure + baseExpenditure) >= 0 ? 'text-green-600' : 'text-red-600'
                }`} data-testid="text-net-calories-summary">{calculatedCaloricIntake + calculatedCaloricExpenditure + baseExpenditure}</span>
              </div>
            </CardContent>
          </Card>

          {/* Daily Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Tasks Completed</span>
                  <span className="font-medium" data-testid="text-tasks-completed">
                    {getCompletedTasks()} / {getTotalQuartiles()}
                  </span>
                </div>
                <Progress value={completionRate} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Time Tracked</span>
                  <span className="font-medium" data-testid="text-time-tracked">2.5h / 8h</span>
                </div>
                <Progress value={31.25} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Quick Capture */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Capture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full" data-testid="button-upload-image">
                <Camera className="mr-2 h-4 w-4" />
                Upload Image
              </Button>
              <Input
                value={quickTask}
                onChange={(e) => setQuickTask(e.target.value)}
                placeholder="Quick task..."
                onKeyDown={(e) => e.key === 'Enter' && handleQuickTaskSubmit()}
                data-testid="input-quick-task"
              />
              <Button 
                className="w-full" 
                size="sm"
                onClick={handleQuickTaskSubmit}
                disabled={createTaskMutation.isPending}
                data-testid="button-add-task"
              >
                Add Task
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Task Details Modal */}
      <Dialog open={isDetailsOpen} onOpenChange={handleCloseDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle data-testid="title-task-details">
              Task Details
            </DialogTitle>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2" data-testid="text-task-name">
                  {selectedTask.name}
                </h3>
                {selectedTask.description && (
                  <p className="text-muted-foreground" data-testid="text-task-description">
                    {selectedTask.description}
                  </p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Badge variant="outline" className="ml-2" data-testid="badge-task-priority">
                    {selectedTask.priority || 'Not set'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Badge variant="outline" className="ml-2" data-testid="badge-task-status">
                    {selectedTask.status || 'Not started'}
                  </Badge>
                </div>
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-category">
                    {selectedTask.category || 'Uncategorized'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Subcategory</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-subcategory">
                    {selectedTask.subcategory || 'None'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Time Horizon</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-horizon">
                    {selectedTask.timeHorizon || 'Not set'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Assignee</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-assignee">
                    {selectedTask.assignee || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Estimated Time</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-estimated">
                    {selectedTask.estimatedTime ? `${selectedTask.estimatedTime} min` : 'Not set'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Actual Time</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-actual">
                    {selectedTask.actualTime ? `${selectedTask.actualTime} min` : 'Not recorded'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Due Date</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-due">
                    {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No due date'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Completion Date</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-completion">
                    {selectedTask.xDate ? new Date(selectedTask.xDate).toLocaleDateString() : 'Not completed'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Progress</label>
                  <p className="text-sm text-muted-foreground" data-testid="text-task-progress">
                    {selectedTask.progress || 0}%
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Calorie Impact</label>
                  <div className="text-sm" data-testid="text-task-calories">
                    <span className="text-green-600">+{selectedTask.caloriesIntake || 0}</span>
                    <span className="mx-1">/</span>
                    <span className="text-orange-600">-{selectedTask.caloriesExpenditure || 0}</span>
                  </div>
                </div>
              </div>
              
              {selectedTask.why && (
                <div>
                  <label className="text-sm font-medium block mb-2">Why this task matters</label>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded" data-testid="text-task-why">
                    {selectedTask.why}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Remove Task Confirmation Dialog */}
      <AlertDialog 
        open={removeTaskDialog?.open || false} 
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTaskDialog(null);
            setSkipRecurringToday(true); // Reset to default
          }
        }}
        data-testid="dialog-remove-task"
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{removeTaskDialog?.task?.name}" from {removeTaskDialog?.timeBlock} Quartile {removeTaskDialog?.quartile}.
              {removeTaskDialog?.task?.type === 'recurring' && (
                <div className="mt-3">
                  <label className="flex items-center space-x-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={skipRecurringToday}
                      onCheckedChange={(checked) => setSkipRecurringToday(!!checked)}
                      data-testid="checkbox-skip-recurring"
                    />
                    <span>Also skip this recurring occurrence for today</span>
                  </label>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={updateScheduleMutation.isPending}
              onClick={() => {
                if (removeTaskDialog) {
                  handleRemoveTask({
                    ...removeTaskDialog,
                    skipRecurring: removeTaskDialog.task.type === 'recurring' ? skipRecurringToday : false
                  });
                  setRemoveTaskDialog(null);
                  setSkipRecurringToday(true);
                }
              }}
              data-testid="button-confirm-remove"
            >
              {updateScheduleMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
import { Play, Pause, Plus, Minus, Camera, Calendar, ChevronDown, ChevronUp, Target } from "lucide-react";

const TIME_BLOCKS = [
  { name: "Recover", time: "12am-7am", quartiles: 4 },
  { name: "PHYSICAL MENTAL", time: "7-9AM", quartiles: 4 },
  { name: "CHIEF PROJECT", time: "9-11AM", quartiles: 4 },
  { name: "HOUR OF POWER", time: "11-12PM", quartiles: 4 },
  { name: "PRODUCTION WORK", time: "12-2PM", quartiles: 4 },
  { name: "COMPANY BLOCK", time: "2-4PM", quartiles: 4 },
  { name: "BUSINESS AUTOMATION", time: "4-6PM", quartiles: 4 },
  { name: "ENVIRONMENTAL", time: "6-8PM", quartiles: 4 },
  { name: "FLEXIBLE BLOCK", time: "8-10PM", quartiles: 4 },
  { name: "WIND DOWN", time: "10PM-12AM", quartiles: 4 },
];

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
  const { toast } = useToast();

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

  const aiChatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", { message });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AI Assistant",
        description: data.response,
      });
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
    
    const candidates = [];
    
    // 1. Add currently active/selected task if it exists and isn't a placeholder
    if (entry && !entry.reflection?.startsWith('PLACEHOLDER:')) {
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
      }
    }
    
    // 2. Add matching recurring tasks that aren't already active
    const matchingRecurring = recurringTasks.filter(rt => {
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
                              onValueChange={(taskId) => {
                                if (entry?.id) {
                                  updateScheduleMutation.mutate({
                                    id: entry.id,
                                    actualTaskId: taskId,
                                  });
                                }
                              }}
                            >
                              <SelectTrigger className="w-full text-xs h-6" data-testid={`select-task-${block.name}-${quartile}`}>
                                <SelectValue placeholder="Select task..." />
                              </SelectTrigger>
                              <SelectContent>
                                {tasks.map((task) => (
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
                                        });
                                      } else if (task.type === 'recurring') {
                                        // Set recurring task as active by storing it in reflection field
                                        updateScheduleMutation.mutate({
                                          id: entry.id,
                                          actualTaskId: null,
                                          plannedTaskId: null,
                                          reflection: `RECURRING_TASK:${task.name}`,
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
                                  
                                  {/* Duration for recurring tasks */}
                                  {task.durationMinutes && (
                                    <span className="text-xs text-muted-foreground flex-shrink-0">
                                      {task.durationMinutes}m
                                    </span>
                                  )}
                                  
                                  {/* Active indicator */}
                                  {task.isActive && (
                                    <span className="text-xs text-primary flex-shrink-0">✓</span>
                                  )}
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
    </div>
  );
}

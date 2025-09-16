import { useState } from "react";
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
import { Play, Pause, Plus, Minus, Camera, Calendar } from "lucide-react";

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
  const [energyLevel, setEnergyLevel] = useState(200);
  const [quickTask, setQuickTask] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const { toast } = useToast();

  const { data: schedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ['/api/daily', selectedDate],
    enabled: !!selectedDate,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['/api/tasks'],
  });

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

  const handleEnergyChange = (delta: number) => {
    setEnergyLevel(prev => Math.max(0, prev + delta));
  };

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
    return schedule.find((entry: any) => 
      entry.timeBlock === timeBlock && entry.quartile === quartile
    );
  };

  const getCompletedTasks = () => {
    return schedule.filter((entry: any) => entry.status === 'completed').length;
  };

  const getTotalQuartiles = () => {
    return TIME_BLOCKS.reduce((total, block) => total + block.quartiles, 0);
  };

  const completionRate = getTotalQuartiles() > 0 ? (getCompletedTasks() / getTotalQuartiles()) * 100 : 0;

  return (
    <div className="space-y-6">
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
                <span className="text-sm text-muted-foreground">Energy:</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleEnergyChange(-50)}
                  data-testid="button-energy-decrease"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="font-medium min-w-[3rem] text-center" data-testid="text-energy-level">
                  +{energyLevel}
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleEnergyChange(50)}
                  data-testid="button-energy-increase"
                >
                  <Plus className="h-4 w-4" />
                </Button>
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
                    const timeRange = block.time.includes('AM') || block.time.includes('PM') 
                      ? `Q${quartile}` 
                      : `Q${quartile}`;
                    
                    return (
                      <div key={quartile} className={`bg-card p-3 ${entry?.status === 'in_progress' ? 'border-2 border-primary' : ''}`}>
                        <div className={`text-xs mb-2 ${entry?.status === 'in_progress' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                          {timeRange} {entry?.status === 'in_progress' && '• ACTIVE'}
                        </div>
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
                          <SelectTrigger className="w-full text-xs mb-2" data-testid={`select-task-${block.name}-${quartile}`}>
                            <SelectValue placeholder="Select task..." />
                          </SelectTrigger>
                          <SelectContent>
                            {tasks.map((task: any) => (
                              <SelectItem key={task.id} value={task.id}>
                                {task.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs">
                          <div className="text-muted-foreground mb-1">Status:</div>
                          <Badge 
                            variant={
                              entry?.status === 'completed' ? 'default' :
                              entry?.status === 'in_progress' ? 'secondary' : 'outline'
                            }
                            className={
                              entry?.status === 'completed' ? 'bg-business text-business-foreground' :
                              entry?.status === 'in_progress' ? 'bg-primary text-primary-foreground' :
                              'bg-secondary text-secondary-foreground'
                            }
                            data-testid={`status-${block.name}-${quartile}`}
                          >
                            {entry?.status === 'completed' ? 'Completed' :
                             entry?.status === 'in_progress' ? 'In Progress' : 'Planned'}
                          </Badge>
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

          {/* Energy Tracking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Energy Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Exercise:</span>
                <span className="text-sm font-medium text-destructive" data-testid="text-exercise-impact">-500</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Break:</span>
                <span className="text-sm font-medium text-business" data-testid="text-break-impact">+200</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Deep Work:</span>
                <span className="text-sm font-medium text-destructive" data-testid="text-work-impact">-300</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Meal:</span>
                <span className="text-sm font-medium text-business" data-testid="text-meal-impact">+100</span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between font-medium">
                <span className="text-sm text-foreground">Net Energy:</span>
                <span className="text-sm text-business" data-testid="text-net-energy">+{energyLevel}</span>
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

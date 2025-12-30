import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Target,
  CheckCircle,
  Clock,
  Zap,
  Trophy,
  TrendingUp,
  Calendar,
  Play,
  Pause,
  Bot,
  Send,
  X,
  ChevronRight,
  Flame,
  Star,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TIME_BLOCKS, BACKLOG_TIME_BLOCK } from "@shared/schema";

interface Task {
  id: string;
  name: string;
  type: string;
  category: "Personal" | "Business";
  subcategory: string;
  timeHorizon: string;
  priority: "High" | "Medium" | "Low";
  estimatedTime: string;
  actualTime: string;
  progress: number;
  status: string;
  why?: string;
  dueDate?: string | null;
  xDate?: string | null;
}

interface DailyScheduleEntry {
  id: string;
  date: string;
  timeBlock: string;
  quartile: number;
  plannedTaskId: string | null;
  actualTaskId: string | null;
  status: string;
  energyImpact: number;
  reflection?: string;
  startTime?: string;
  endTime?: string;
}

interface RecurringTask {
  id: string;
  taskName: string;
  taskType: string;
  timeBlock: string;
  daysOfWeek: string[];
  category: "Personal" | "Business";
  subcategory: string;
  durationMinutes: number;
  energyImpact: number;
  priority: "High" | "Medium" | "Low";
  quarter?: number;
  isActive: boolean;
}

// Get the current time block based on the current time
function getCurrentTimeBlock(): { name: string; start: string; end: string } | null {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  for (const block of TIME_BLOCKS) {
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);

    const startTimeInMinutes = startHour * 60 + startMin;
    let endTimeInMinutes = endHour * 60 + endMin;

    // Handle midnight crossover (24:00 = 1440 minutes)
    if (endTimeInMinutes === 0) endTimeInMinutes = 1440;

    if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes) {
      return block;
    }
  }

  return TIME_BLOCKS[0]; // Default to first block
}

// Get the next time block
function getNextTimeBlock(): { name: string; start: string; end: string } | null {
  const current = getCurrentTimeBlock();
  if (!current) return null;

  const currentIndex = TIME_BLOCKS.findIndex(b => b.name === current.name);
  const nextIndex = (currentIndex + 1) % TIME_BLOCKS.length;
  return TIME_BLOCKS[nextIndex];
}

export default function Dashboard() {
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    { role: 'assistant', content: "Hello! I'm your AI productivity assistant. How can I help you today? I can help you plan your day, prioritize tasks, or answer questions about your schedule." }
  ]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = format(new Date(), 'yyyy-MM-dd');
  const currentTimeBlock = getCurrentTimeBlock();
  const nextTimeBlock = getNextTimeBlock();

  // Fetch all tasks
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  // Fetch daily schedule for today
  const { data: dailySchedule = [], isLoading: isLoadingSchedule } = useQuery<DailyScheduleEntry[]>({
    queryKey: ['/api/daily', { date: today }],
  });

  // Fetch recurring tasks
  const { data: recurringTasks = [], isLoading: isLoadingRecurring } = useQuery<RecurringTask[]>({
    queryKey: ['/api/recurring-tasks'],
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const completedToday = allTasks.filter(t => {
      if (t.status !== 'completed') return false;
      const updatedDate = t.xDate ? new Date(t.xDate) : null;
      if (!updatedDate) return false;
      return format(updatedDate, 'yyyy-MM-dd') === today;
    });

    const tasksForToday = allTasks.filter(t => {
      if (t.status === 'completed' || t.status === 'cancelled') return false;
      const xDate = t.xDate ? new Date(t.xDate) : null;
      if (!xDate) return false;
      return format(xDate, 'yyyy-MM-dd') === today;
    });

    const highPriorityTasks = tasksForToday.filter(t => t.priority === 'High');
    const inProgressTasks = allTasks.filter(t => t.status === 'in_progress');

    // Goal calculations (based on time horizons)
    const yearlyGoals = allTasks.filter(t => t.timeHorizon === '1 Year' && t.status !== 'cancelled');
    const quarterlyGoals = allTasks.filter(t => t.timeHorizon === 'Quarter' && t.status !== 'cancelled');
    const monthlyGoals = allTasks.filter(t => t.timeHorizon === 'Month' && t.status !== 'cancelled');

    const yearlyCompleted = yearlyGoals.filter(t => t.status === 'completed').length;
    const quarterlyCompleted = quarterlyGoals.filter(t => t.status === 'completed').length;
    const monthlyCompleted = monthlyGoals.filter(t => t.status === 'completed').length;

    // Calculate today's progress
    const totalTodayTasks = tasksForToday.length + completedToday.length;
    const todayProgress = totalTodayTasks > 0 ? (completedToday.length / totalTodayTasks) * 100 : 0;

    return {
      completedToday: completedToday.length,
      tasksForToday: tasksForToday.length,
      totalTodayTasks,
      todayProgress,
      highPriorityTasks: highPriorityTasks.length,
      inProgressTasks: inProgressTasks.length,
      yearlyGoals: yearlyGoals.length,
      yearlyCompleted,
      yearlyProgress: yearlyGoals.length > 0 ? (yearlyCompleted / yearlyGoals.length) * 100 : 0,
      quarterlyGoals: quarterlyGoals.length,
      quarterlyCompleted,
      quarterlyProgress: quarterlyGoals.length > 0 ? (quarterlyCompleted / quarterlyGoals.length) * 100 : 0,
      monthlyGoals: monthlyGoals.length,
      monthlyCompleted,
      monthlyProgress: monthlyGoals.length > 0 ? (monthlyCompleted / monthlyGoals.length) * 100 : 0,
    };
  }, [allTasks, today]);

  // Get current workblock tasks
  const currentBlockTasks = useMemo(() => {
    if (!currentTimeBlock) return [];

    // Get tasks from daily schedule for current time block
    const scheduledEntries = dailySchedule.filter(
      entry => entry.timeBlock === currentTimeBlock.name && entry.quartile !== 0
    );

    // Map to full task details
    const tasksWithDetails = scheduledEntries.map(entry => {
      const task = allTasks.find(t => t.id === entry.plannedTaskId || t.id === entry.actualTaskId);
      return {
        entry,
        task,
      };
    }).filter(item => item.task);

    // Also get recurring tasks for current block and today's day
    const dayOfWeek = format(new Date(), 'EEEE').toLowerCase();
    const recurringForBlock = recurringTasks.filter(
      rt => rt.isActive &&
           rt.timeBlock === currentTimeBlock.name &&
           rt.daysOfWeek.map(d => d.toLowerCase()).includes(dayOfWeek)
    );

    return { scheduledTasks: tasksWithDetails, recurringForBlock };
  }, [currentTimeBlock, dailySchedule, allTasks, recurringTasks]);

  // Update task status mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/daily'] });
      toast({
        title: "Task updated",
        description: "Task status has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task status.",
        variant: "destructive",
      });
    },
  });

  // AI Chat mutation
  const chatMutation = useMutation({
    mutationFn: async ({ message, fullHistory }: { message: string; fullHistory: Array<{ role: "user" | "assistant"; content: string }> }) => {
      const response = await apiRequest("POST", "/api/daily/chat", {
        message,
        conversationHistory: fullHistory,
        selectedDate: today
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatHistory(prev => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: () => {
      setChatHistory(prev => prev.slice(0, -1));
      toast({
        title: "Chat error",
        description: "I'm having trouble connecting right now. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!chatMessage.trim() || chatMutation.isPending) return;

    const userMessage = chatMessage.trim();
    const newUserEntry = { role: "user" as const, content: userMessage };
    const fullHistory = [...chatHistory, newUserEntry];

    setChatHistory(fullHistory);
    chatMutation.mutate({ message: userMessage, fullHistory });
    setChatMessage("");
  };

  const handleToggleTaskComplete = (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'not_started' : 'completed';
    updateTaskMutation.mutate({ taskId, status: newStatus });
  };

  const isLoading = isLoadingTasks || isLoadingSchedule || isLoadingRecurring;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      {/* Main Content Area */}
      <div className="flex-1 space-y-6 overflow-auto pr-2">
        {/* Top Metrics Section - Goal Highlights */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Good {getTimeOfDay()}</h1>
              <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
            </div>
            <Badge variant="outline" className="text-lg px-4 py-2">
              <Clock className="h-4 w-4 mr-2" />
              {format(new Date(), 'h:mm a')}
            </Badge>
          </div>

          {/* Today's Progress Bar */}
          <Card className="bg-gradient-to-r from-primary/10 to-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <span className="font-medium">Today's Progress</span>
                </div>
                <span className="text-sm font-medium">
                  {metrics.completedToday} / {metrics.totalTodayTasks} tasks
                </span>
              </div>
              <Progress value={metrics.todayProgress} className="h-3" />
              <p className="text-xs text-muted-foreground mt-2">
                {metrics.todayProgress.toFixed(0)}% complete • {metrics.tasksForToday} remaining
              </p>
            </CardContent>
          </Card>

          {/* Goal Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Yearly Goals */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Yearly Goals</CardTitle>
                <Trophy className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.yearlyCompleted}/{metrics.yearlyGoals}</div>
                <Progress value={metrics.yearlyProgress} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.yearlyProgress.toFixed(0)}% achieved
                </p>
              </CardContent>
            </Card>

            {/* Quarterly Goals */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Quarterly Goals</CardTitle>
                <Target className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.quarterlyCompleted}/{metrics.quarterlyGoals}</div>
                <Progress value={metrics.quarterlyProgress} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.quarterlyProgress.toFixed(0)}% achieved
                </p>
              </CardContent>
            </Card>

            {/* Monthly Goals */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monthly Goals</CardTitle>
                <Calendar className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.monthlyCompleted}/{metrics.monthlyGoals}</div>
                <Progress value={metrics.monthlyProgress} className="h-2 mt-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.monthlyProgress.toFixed(0)}% achieved
                </p>
              </CardContent>
            </Card>

            {/* High Priority Focus */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <Flame className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.highPriorityTasks}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  tasks need attention today
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  <span className="text-xs">{metrics.inProgressTasks} in progress</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Current Workblock Section */}
        <Card className="border-2 border-primary/20">
          <CardHeader className="bg-primary/5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5 text-primary" />
                  Current Block: {currentTimeBlock?.name || 'Unknown'}
                </CardTitle>
                <CardDescription>
                  {currentTimeBlock?.start} - {currentTimeBlock?.end}
                  {nextTimeBlock && (
                    <span className="ml-2 text-muted-foreground">
                      <ChevronRight className="h-3 w-3 inline" /> Next: {nextTimeBlock.name}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Badge variant="default" className="text-sm">
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {/* Scheduled Tasks */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Scheduled Tasks
              </h4>

              {currentBlockTasks.scheduledTasks.length === 0 && currentBlockTasks.recurringForBlock.length === 0 ? (
                <div className="text-center py-8 bg-muted/30 rounded-lg">
                  <CheckCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">No tasks scheduled for this block</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add tasks via the Daily tab
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Scheduled Tasks */}
                  {currentBlockTasks.scheduledTasks.map(({ entry, task }) => (
                    <div
                      key={entry.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        task?.status === 'completed'
                          ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900'
                          : 'bg-background hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={task?.status === 'completed'}
                        onCheckedChange={() => task && handleToggleTaskComplete(task.id, task.status)}
                        className="h-5 w-5"
                      />
                      <div className="flex-1">
                        <p className={`font-medium ${task?.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                          {task?.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              task?.category === 'Personal'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }`}
                          >
                            {task?.category}
                          </Badge>
                          <Badge
                            variant={task?.priority === 'High' ? 'destructive' : task?.priority === 'Medium' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {task?.priority}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Q{entry.quartile} • {task?.estimatedTime || '?'}h
                          </span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}

                  {/* Recurring Tasks */}
                  {currentBlockTasks.recurringForBlock.map((rt) => (
                    <div
                      key={rt.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900"
                    >
                      <div className="h-5 w-5 rounded-full bg-purple-500/20 flex items-center justify-center">
                        <Star className="h-3 w-3 text-purple-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{rt.taskName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                            Recurring
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              rt.category === 'Personal'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-green-50 text-green-700 border-green-200'
                            }`}
                          >
                            {rt.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {rt.durationMinutes}min
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Stats for Block */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t text-sm text-muted-foreground">
              <span>
                {currentBlockTasks.scheduledTasks.length + currentBlockTasks.recurringForBlock.length} tasks in this block
              </span>
              <span>
                {currentBlockTasks.scheduledTasks.filter(t => t.task?.status === 'completed').length} completed
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Copilot Sidebar */}
      <div className="w-96 flex-shrink-0">
        <Card className="h-full flex flex-col border-2">
          <CardHeader className="bg-primary text-primary-foreground rounded-t-lg flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle className="text-lg">AI Copilot</CardTitle>
            </div>
            <CardDescription className="text-primary-foreground/80">
              Your productivity assistant
            </CardDescription>
          </CardHeader>

          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {chatHistory.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted text-foreground rounded-lg px-4 py-2 text-sm">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Suggested Actions */}
          <div className="p-3 border-t bg-muted/30 flex-shrink-0">
            <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setChatMessage("What should I focus on next?");
                }}
              >
                What's next?
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setChatMessage("Summarize my day so far");
                }}
              >
                Day summary
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setChatMessage("Help me prioritize my tasks");
                }}
              >
                Prioritize
              </Button>
            </div>
          </div>

          {/* Chat Input */}
          <div className="p-3 border-t flex-shrink-0">
            <div className="flex gap-2">
              <Input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Ask me anything..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={chatMutation.isPending}
              />
              <Button
                size="icon"
                onClick={handleSendMessage}
                disabled={!chatMessage.trim() || chatMutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Helper function to get time of day greeting
function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

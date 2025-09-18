import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Filter, BarChart3, Clock, Target, Calendar, User, Tag, Edit3, Save, X, HelpCircle, CalendarIcon, Trash2 } from "lucide-react";
import { format, isPast, isToday, isTomorrow, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  name: string;
  type: string;
  category: "Personal" | "Business";
  subcategory: string;
  timeHorizon: string;
  priority: "High" | "Medium" | "Low";
  estimatedTime: string;
  caloriesIntake?: string;
  caloriesExpenditure?: string;
  progress: number;
  status: string;
  why?: string;
  dueDate?: string | null;
  xDate?: string | null;
}

export default function StrategicPlanningMatrix() {
  const [aiCommand, setAiCommand] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDetailsOpen, setIsTaskDetailsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const { toast } = useToast();

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['/api/tasks'],
  });

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, newTimeHorizon, newSubcategory }: {
      taskId: string;
      newTimeHorizon?: string;
      newSubcategory?: string;
    }) => {
      const updateData: any = {
        taskId,
        newTimeHorizon,
        newSubcategory,
      };
      
      // If moving to "Today", automatically set X Date to today
      if (newTimeHorizon === "Today") {
        updateData.xDate = new Date().toISOString();
      }
      
      const response = await apiRequest("POST", "/api/planning/move", updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task moved successfully",
        description: "The task has been repositioned in your planning matrix",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to move task",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const aiCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", {
        message: command,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AI Command Processed",
        description: data.response,
      });
    },
    onError: (error) => {
      toast({
        title: "AI Command Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (taskData: Task) => {
      const response = await fetch(`/api/tasks/${taskData.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(taskData),
      });
      if (!response.ok) throw new Error('Failed to update task');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task updated successfully!",
        description: "Your changes have been saved.",
      });
      setIsEditing(false);
      setEditFormData(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating task",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("DELETE", `/api/tasks/${taskId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      toast({
        title: "Task deleted successfully!",
        description: "The task has been removed.",
      });
      setTaskToDelete(null);
      setIsTaskDetailsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting task",
        description: error.message || "Failed to delete task",
        variant: "destructive",
      });
    },
  });

  // Organize tasks by matrix structure
  const timeHorizons = ['VISION', '10 Year', '5 Year', '1 Year', 'Quarter', 'Week', 'Today', 'BACKLOG'];
  const categories = ['Physical', 'Mental', 'Relationship', 'Environmental', 'Financial', 'Adventure', 'Marketing', 'Sales', 'Operations', 'Products', 'Production'];

  const matrix: Record<string, Record<string, Task[]>> = {};
  timeHorizons.forEach(horizon => {
    matrix[horizon] = {};
    categories.forEach(category => {
      matrix[horizon][category] = [];
    });
  });

  // Populate matrix with tasks (exclude completed tasks)
  tasks.filter(task => task.status !== 'completed').forEach(task => {
    let horizon = task.timeHorizon === '1 Year' ? '1 Year' : 
                  task.timeHorizon === '5 Year' ? '5 Year' : 
                  task.timeHorizon === '10 Year' ? '10 Year' : 
                  task.timeHorizon || 'BACKLOG';
    const category = task.subcategory || 'Mental';
    
    // For "Today" row, only show tasks where xDate (work date) is today
    // If not today, move to BACKLOG instead of hiding completely
    if (horizon === 'Today') {
      if (!task.xDate || !isToday(new Date(task.xDate))) {
        horizon = 'BACKLOG'; // Move to backlog instead of hiding
      }
    }
    
    if (matrix[horizon] && matrix[horizon][category]) {
      matrix[horizon][category].push(task);
    }
  });

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('application/json', JSON.stringify(task));
  };

  const handleDrop = (e: React.DragEvent, timeHorizon: string, subcategory: string) => {
    e.preventDefault();
    const taskData = JSON.parse(e.dataTransfer.getData('application/json'));
    
    if (taskData.timeHorizon !== timeHorizon || taskData.subcategory !== subcategory) {
      moveTaskMutation.mutate({
        taskId: taskData.id,
        newTimeHorizon: timeHorizon,
        newSubcategory: subcategory,
      });
    }
  };

  const handleTaskClick = (e: React.MouseEvent, task: Task) => {
    // Don't open details if user is dragging
    if (e.detail === 1) { // Single click only
      setSelectedTask(task);
      setIsTaskDetailsOpen(true);
      setIsEditing(false);
      setEditFormData(null);
    }
  };

  const handleEditStart = () => {
    if (selectedTask) {
      setEditFormData({ ...selectedTask });
      setIsEditing(true);
    }
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditFormData(null);
  };

  const handleEditSave = () => {
    if (editFormData) {
      updateTaskMutation.mutate(editFormData);
    }
  };

  const updateEditField = (field: keyof Task, value: string | number | null) => {
    if (editFormData) {
      setEditFormData({ ...editFormData, [field]: value });
    }
  };

  const handleDeleteTask = (task: Task) => {
    setTaskToDelete(task);
  };

  const confirmDeleteTask = () => {
    if (taskToDelete) {
      deleteTaskMutation.mutate(taskToDelete.id);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleAiCommand = () => {
    if (!aiCommand.trim()) return;
    aiCommandMutation.mutate(aiCommand);
    setAiCommand("");
  };

  const getTaskStats = () => {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const personal = tasks.filter(t => t.category === 'Personal').length;
    const business = tasks.filter(t => t.category === 'Business').length;
    
    return {
      total,
      completed,
      personalPercent: total > 0 ? Math.round((personal / total) * 100) : 0,
      businessPercent: total > 0 ? Math.round((business / total) * 100) : 0,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  const stats = getTaskStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground mt-2">Loading planning matrix...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      {/* Planning Grid */}
      <div className="flex-1">
        <Card>
          <CardHeader>
            <CardTitle>Strategic Planning Matrix</CardTitle>
            <p className="text-sm text-muted-foreground">
              Drag tasks between time horizons and categories
            </p>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-4 text-left text-sm font-medium text-muted-foreground w-32">
                      Time Horizon
                    </th>
                    {categories.slice(0, 6).map(cat => (
                      <th key={cat} className="px-3 py-4 text-center text-xs font-medium text-personal uppercase tracking-wider bg-personal/5">
                        {cat}
                      </th>
                    ))}
                    {categories.slice(6).map(cat => (
                      <th key={cat} className="px-3 py-4 text-center text-xs font-medium text-business uppercase tracking-wider bg-business/5">
                        {cat}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeHorizons.map(horizon => (
                    <tr key={horizon} className={`border-b border-border hover:bg-muted/50 ${horizon === 'Today' ? 'bg-yellow-50' : ''}`}>
                      <td className={`px-3 py-4 font-medium text-sm text-foreground ${horizon === 'Today' ? 'bg-yellow-100' : 'bg-accent/30'}`}>
                        {horizon}
                      </td>
                      {categories.map(category => {
                        const cellTasks = matrix[horizon][category];
                        const isPersonal = categories.indexOf(category) < 6;
                        
                        return (
                          <td
                            key={category}
                            className={`px-3 py-4 min-h-[120px] align-top ${
                              horizon === 'Today' 
                                ? isPersonal ? 'bg-personal/10' : 'bg-business/10'
                                : horizon === 'BACKLOG' 
                                ? 'bg-muted/20' 
                                : isPersonal ? 'bg-personal/5' : 'bg-business/5'
                            }`}
                            onDrop={(e) => handleDrop(e, horizon, category)}
                            onDragOver={handleDragOver}
                            data-testid={`cell-${horizon}-${category}`}
                          >
                            <div className="space-y-2">
                              {cellTasks.map(task => (
                                <div
                                  key={task.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, task)}
                                  onClick={(e) => handleTaskClick(e, task)}
                                  className={`p-2 rounded text-xs cursor-pointer border-l-4 ${
                                    horizon === 'BACKLOG'
                                      ? 'bg-muted border-muted-foreground'
                                      : isPersonal
                                      ? `bg-personal/20 border-personal ${horizon === 'Today' ? 'bg-personal/30' : ''}`
                                      : `bg-business/20 border-business ${horizon === 'Today' ? 'bg-business/30' : ''}`
                                  } hover:opacity-80 transition-opacity`}
                                  data-testid={`task-card-${task.id}`}
                                >
                                  <div className="font-medium">{task.name}</div>
                                  <div className={`text-xs mt-1 ${
                                    horizon === 'BACKLOG' 
                                      ? 'text-muted-foreground'
                                      : isPersonal ? 'text-personal' : 'text-business'
                                  }`}>
                                    {task.type} • {task.estimatedTime}h • {task.priority}
                                    {task.progress > 0 && ` • ${task.progress}%`}
                                  </div>
                                  {task.xDate && (
                                    <div className="text-xs mt-1 text-blue-600 font-medium">
                                      Work: {format(new Date(task.xDate), "MMM dd")}
                                    </div>
                                  )}
                                  {task.dueDate && (
                                    <div className={cn(
                                      "text-xs mt-1",
                                      isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && "text-red-500 font-semibold",
                                      isToday(new Date(task.dueDate)) && "text-orange-500 font-semibold",
                                      isTomorrow(new Date(task.dueDate)) && "text-blue-500"
                                    )}>
                                      {isToday(new Date(task.dueDate))
                                        ? "Due Today"
                                        : isTomorrow(new Date(task.dueDate))
                                        ? "Due Tomorrow"
                                        : isPast(new Date(task.dueDate))
                                        ? `Overdue`
                                        : `Due ${format(new Date(task.dueDate), "MMM dd")}`}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Right Sidebar */}
      <div className="w-80 space-y-6">
        {/* AI Assistant */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Planning Assistant</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Try these commands:</p>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setAiCommand("Move all Marketing tasks to next week")}
                  data-testid="button-ai-suggestion-1"
                >
                  "Move all Marketing tasks to next week"
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setAiCommand("Balance my Personal and Business tasks")}
                  data-testid="button-ai-suggestion-2"
                >
                  "Balance my Personal and Business tasks"
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => setAiCommand("Show what's blocking my milestones")}
                  data-testid="button-ai-suggestion-3"
                >
                  "Show what's blocking my milestones"
                </Button>
              </div>
            </div>
            <div className="flex mt-4 space-x-2">
              <Input 
                value={aiCommand}
                onChange={(e) => setAiCommand(e.target.value)}
                placeholder="Ask AI to reorganize..." 
                className="text-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleAiCommand()}
                data-testid="input-ai-command"
              />
              <Button 
                size="sm" 
                onClick={handleAiCommand}
                disabled={aiCommandMutation.isPending}
                data-testid="button-ai-send"
              >
                Send
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Statistics */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <CardTitle className="text-base">Planning Stats</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Active Tasks</span>
              <span className="text-sm font-medium" data-testid="text-active-tasks">{stats.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Completed Tasks</span>
              <span className="text-sm font-medium text-business" data-testid="text-completed-tasks">{stats.completed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Personal vs Business</span>
              <span className="text-sm font-medium" data-testid="text-category-balance">
                {stats.personalPercent}% / {stats.businessPercent}%
              </span>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Weekly Progress</span>
                <span data-testid="text-completion-rate">{stats.completionRate}%</span>
              </div>
              <Progress value={stats.completionRate} className="h-2" />
            </div>
          </CardContent>
        </Card>

        {/* Filter Options */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Filter className="h-5 w-5" />
              <CardTitle className="text-base">Filters</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-incomplete">
              Show Only Incomplete
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-high-priority">
              High Priority Only
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-personal">
              Personal Tasks Only
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" data-testid="button-filter-business">
              Business Tasks Only
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Task Details Modal */}
      <Dialog open={isTaskDetailsOpen} onOpenChange={setIsTaskDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-semibold">
                {isEditing ? "Edit Task" : "Task Details"}
              </DialogTitle>
              {!isEditing && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditStart}
                    data-testid="button-edit-task"
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => selectedTask && handleDeleteTask(selectedTask)}
                    data-testid="button-delete-task"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>
          
          {selectedTask && !isEditing && (
            <div className="space-y-6">
              {/* Task Name */}
              <div>
                <Label className="text-base font-medium">{selectedTask.name}</Label>
              </div>

              {/* Task Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Type</Label>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {selectedTask.type}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Category</Label>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      selectedTask.category === 'Personal' 
                        ? 'bg-personal/10 text-personal border-personal' 
                        : 'bg-business/10 text-business border-business'
                    }`}
                  >
                    {selectedTask.category}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Priority</Label>
                  </div>
                  <Badge 
                    variant="outline"
                    className={`text-xs ${
                      selectedTask.priority === 'High' 
                        ? 'bg-red-100 text-red-800 border-red-200' 
                        : selectedTask.priority === 'Medium'
                        ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                        : 'bg-green-100 text-green-800 border-green-200'
                    }`}
                  >
                    {selectedTask.priority}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Estimated Time</Label>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedTask.estimatedTime} hours
                  </div>
                </div>
              </div>

              {/* Time Horizon */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Time Horizon</Label>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {selectedTask.timeHorizon}
                </Badge>
              </div>

              {/* Subcategory */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Focus Area</Label>
                <div className="text-sm text-muted-foreground">
                  {selectedTask.subcategory}
                </div>
              </div>

              {/* X Date (Work Date) */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="h-4 w-4 text-blue-600" />
                  <Label className="text-sm font-medium">Work Date (X Date)</Label>
                </div>
                <div className="text-sm">
                  {selectedTask.xDate ? (
                    <div className="flex items-center gap-2 text-blue-600">
                      <span>
                        {format(new Date(selectedTask.xDate), "MMMM dd, yyyy")}
                      </span>
                      <span className="text-muted-foreground">
                        ({isToday(new Date(selectedTask.xDate))
                          ? "Work on Today"
                          : isTomorrow(new Date(selectedTask.xDate))
                          ? "Work on Tomorrow" 
                          : `in ${formatDistanceToNowStrict(new Date(selectedTask.xDate))}`})
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No work date set</span>
                  )}
                </div>
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Due Date</Label>
                </div>
                <div className="text-sm">
                  {selectedTask.dueDate ? (
                    <div className={cn(
                      "flex items-center gap-2",
                      isPast(new Date(selectedTask.dueDate)) && !isToday(new Date(selectedTask.dueDate)) && "text-red-500 font-semibold"
                    )}>
                      <span>
                        {format(new Date(selectedTask.dueDate), "MMMM dd, yyyy")}
                      </span>
                      <span className="text-muted-foreground">
                        ({isToday(new Date(selectedTask.dueDate))
                          ? "Due Today"
                          : isTomorrow(new Date(selectedTask.dueDate))
                          ? "Due Tomorrow" 
                          : isPast(new Date(selectedTask.dueDate))
                          ? "Overdue"
                          : `in ${formatDistanceToNowStrict(new Date(selectedTask.dueDate))}`})
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">No due date set</span>
                  )}
                </div>
              </div>

              {/* Why */}
              {selectedTask.why && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Why</Label>
                  </div>
                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                    {selectedTask.why}
                  </div>
                </div>
              )}

              {/* Progress */}
              {selectedTask.progress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-medium">Progress</Label>
                    <span className="text-xs text-muted-foreground">
                      {selectedTask.progress}%
                    </span>
                  </div>
                  <Progress value={selectedTask.progress} className="h-2" />
                </div>
              )}

              {/* Status */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <Badge 
                  variant={selectedTask.status === 'completed' ? 'default' : 'outline'}
                  className="text-xs"
                >
                  {selectedTask.status}
                </Badge>
              </div>

              {/* Task ID for reference */}
              <div className="pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                  Task ID: {selectedTask.id}
                </div>
              </div>
            </div>
          )}

          {/* Edit Mode */}
          {editFormData && isEditing && (
            <div className="space-y-6">
              {/* Task Name */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Task Name</Label>
                <Input
                  value={editFormData.name}
                  onChange={(e) => updateEditField('name', e.target.value)}
                  data-testid="input-edit-task-name"
                />
              </div>

              {/* Task Type and Category */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Type</Label>
                  <Select 
                    value={editFormData.type} 
                    onValueChange={(value) => updateEditField('type', value)}
                  >
                    <SelectTrigger data-testid="select-edit-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Milestone">Milestone</SelectItem>
                      <SelectItem value="Sub-Milestone">Sub-Milestone</SelectItem>
                      <SelectItem value="Task">Task</SelectItem>
                      <SelectItem value="Subtask">Subtask</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Category</Label>
                  <Select 
                    value={editFormData.category} 
                    onValueChange={(value) => updateEditField('category', value as "Personal" | "Business")}
                  >
                    <SelectTrigger data-testid="select-edit-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Personal">Personal</SelectItem>
                      <SelectItem value="Business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Priority and Estimated Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Priority</Label>
                  <Select 
                    value={editFormData.priority} 
                    onValueChange={(value) => updateEditField('priority', value as "High" | "Medium" | "Low")}
                  >
                    <SelectTrigger data-testid="select-edit-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Estimated Time (hours)</Label>
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={editFormData.estimatedTime}
                    onChange={(e) => updateEditField('estimatedTime', e.target.value)}
                    data-testid="input-edit-estimated-time"
                  />
                </div>
              </div>

              {/* Calorie Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Calorie Intake</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editFormData.caloriesIntake || ""}
                    onChange={(e) => updateEditField('caloriesIntake', e.target.value || null)}
                    placeholder="e.g., 300"
                    data-testid="input-edit-calorie-intake"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Calorie Expenditure</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editFormData.caloriesExpenditure || ""}
                    onChange={(e) => updateEditField('caloriesExpenditure', e.target.value || null)}
                    placeholder="e.g., 150"
                    data-testid="input-edit-calorie-expenditure"
                  />
                </div>
              </div>

              {/* Time Horizon */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Time Horizon</Label>
                <Select 
                  value={editFormData.timeHorizon} 
                  onValueChange={(value) => updateEditField('timeHorizon', value)}
                >
                  <SelectTrigger data-testid="select-edit-time-horizon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Today">Today</SelectItem>
                    <SelectItem value="Week">This Week</SelectItem>
                    <SelectItem value="Quarter">This Quarter</SelectItem>
                    <SelectItem value="1 Year">1 Year</SelectItem>
                    <SelectItem value="5 Year">5 Year</SelectItem>
                    <SelectItem value="10 Year">10 Year</SelectItem>
                    <SelectItem value="VISION">Vision</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Focus Area (Subcategory) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Focus Area</Label>
                <Select 
                  value={editFormData.subcategory} 
                  onValueChange={(value) => updateEditField('subcategory', value)}
                >
                  <SelectTrigger data-testid="select-edit-subcategory">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Physical">Physical</SelectItem>
                    <SelectItem value="Mental">Mental</SelectItem>
                    <SelectItem value="Relationship">Relationship</SelectItem>
                    <SelectItem value="Environmental">Environmental</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Adventure">Adventure</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Products">Products</SelectItem>
                    <SelectItem value="Production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* X Date (Work Date) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Work Date (X Date)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editFormData.xDate && "text-muted-foreground",
                        editFormData.xDate && "text-blue-600"
                      )}
                      data-testid="button-edit-x-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editFormData.xDate ? (
                        format(new Date(editFormData.xDate), "PPP")
                      ) : (
                        <span>Pick a work date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={editFormData.xDate ? new Date(editFormData.xDate) : undefined}
                      onSelect={(date) => updateEditField('xDate', date?.toISOString() || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {editFormData.xDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full"
                    onClick={() => updateEditField('xDate', null)}
                    data-testid="button-clear-edit-x-date"
                  >
                    Clear work date
                  </Button>
                )}
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !editFormData.dueDate && "text-muted-foreground",
                        editFormData.dueDate && isPast(new Date(editFormData.dueDate)) && !isToday(new Date(editFormData.dueDate)) && "text-red-600"
                      )}
                      data-testid="button-edit-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editFormData.dueDate ? (
                        format(new Date(editFormData.dueDate), "PPP")
                      ) : (
                        <span>Pick a due date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={editFormData.dueDate ? new Date(editFormData.dueDate) : undefined}
                      onSelect={(date) => updateEditField('dueDate', date?.toISOString() || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {editFormData.dueDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full"
                    onClick={() => updateEditField('dueDate', null)}
                    data-testid="button-clear-edit-due-date"
                  >
                    Clear due date
                  </Button>
                )}
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Progress (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={editFormData.progress}
                  onChange={(e) => updateEditField('progress', parseInt(e.target.value) || 0)}
                  data-testid="input-edit-progress"
                />
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <Select 
                  value={editFormData.status} 
                  onValueChange={(value) => updateEditField('status', value)}
                >
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">Not Started</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Why */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Why (Rationale)</Label>
                <Textarea
                  value={editFormData.why || ''}
                  onChange={(e) => updateEditField('why', e.target.value)}
                  placeholder="Explain the purpose or reason behind this task..."
                  rows={3}
                  data-testid="textarea-edit-why"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 mt-6">
            {isEditing ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleEditCancel}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  onClick={handleEditSave}
                  disabled={updateTaskMutation.isPending}
                  data-testid="button-save-task"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateTaskMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setIsTaskDetailsOpen(false)}
                data-testid="button-close-task-details"
              >
                Close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{taskToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTask}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import HeaderNavigation from "@/components/header-navigation";
import TaskCaptureInterface from "@/components/task-capture-interface";
import StrategicPlanningMatrix from "@/components/strategic-planning-matrix";
import DailyWorksheet from "@/components/daily-worksheet";
import RecurringTasksPage from "@/pages/recurring-tasks-page";
import AnalyticsDashboard from "@/pages/analytics-dashboard";
import NotesPage from "@/pages/notes-page";
import Dashboard from "@/pages/dashboard";

type TabType = "dashboard" | "capture" | "planning" | "daily" | "recurring" | "analytics" | "notes";

export default function HomePage() {
  const [location] = useLocation();
  
  // Determine initial tab from URL path
  const getInitialTab = (): TabType => {
    const path = location.replace("/", "");
    if (path === "dashboard" || path === "capture" || path === "planning" || path === "daily" || path === "recurring" || path === "analytics" || path === "notes") {
      return path as TabType;
    }
    return "dashboard"; // default to dashboard
  };
  
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab());
  
  // Update tab when URL changes
  useEffect(() => {
    const newTab = getInitialTab();
    setActiveTab(newTab);
  }, [location]);

  return (
    <div className="min-h-screen bg-background">
      <HeaderNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className={`mx-auto px-4 sm:px-6 lg:px-8 py-8 ${activeTab === "dashboard" ? "max-w-full" : "max-w-7xl"}`}>
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "capture" && <TaskCaptureInterface />}
        {activeTab === "planning" && <StrategicPlanningMatrix />}
        {activeTab === "daily" && <DailyWorksheet />}
        {activeTab === "recurring" && <RecurringTasksPage />}
        {activeTab === "analytics" && <AnalyticsDashboard />}
        {activeTab === "notes" && <NotesPage />}
      </main>
    </div>
  );
}

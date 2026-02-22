import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Calendar,
  BookOpen,
  Briefcase,
  Coffee,
  Layout,
  X,
  Sun,
  Dumbbell,
  Moon,
  Download,
  Upload,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Category = "Task" | "Regime" | "Fitness" | "Coron" | "Others";
type TaskScope = "simple" | "weekly";
type TimePeriod = "AM" | "PM";

interface TimeParts {
  hour: string;
  minute: string;
  period: TimePeriod;
}

// --- Time Utility ---
function timeToMinutes(time?: string) {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function timeToParts(time?: string): TimeParts {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) {
    return { hour: "09", minute: "00", period: "AM" };
  }

  const [hour24, minute] = time.split(":").map(Number);
  const period: TimePeriod = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    hour: String(hour12).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
    period,
  };
}

function partsToTime(parts: TimeParts): string {
  let hour24 = Number(parts.hour) % 12;
  if (parts.period === "PM") {
    hour24 += 12;
  }
  if (parts.period === "AM" && Number(parts.hour) === 12) {
    hour24 = 0;
  }

  return `${String(hour24).padStart(2, "0")}:${parts.minute}`;
}

interface Task {
  id: string;
  text: string;
  category: Category;
  completed: boolean;
  createdAt: number;
  day: number | null; // 0=Sunday, ..., 6=Saturday, null for general tasks
  startTime?: string; // "HH:MM"
  endTime?: string; // "HH:MM"
}

// --- Constants ---
// Updated categories and colors as per requirements
// Ensure box-sizing is border-box for all elements
document.documentElement.style.boxSizing = "border-box";

const CATEGORIES: {
  label: Category;
  color: string;
  borderColor: string;
  icon: React.ReactNode;
}[] = [
  {
    label: "Task",
    color: "text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-400/10",
    borderColor: "border-blue-500",
    icon: <Briefcase size={18} />,
  },
  {
    label: "Regime",
    color:
      "text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-400/10",
    borderColor: "border-orange-500",
    icon: <Coffee size={18} />,
  },
  {
    label: "Fitness",
    color: "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-400/10",
    borderColor: "border-red-500",
    icon: <Dumbbell size={18} />,
  },
  {
    label: "Coron",
    color:
      "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-400/10",
    borderColor: "border-green-500",
    icon: <BookOpen size={18} />,
  },
  {
    label: "Others",
    color: "text-gray-700 dark:text-gray-400 bg-gray-200 dark:bg-gray-400/10",
    borderColor: "border-gray-500",
    icon: <Layout size={18} />,
  },
];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) =>
  String(index + 1).padStart(2, "0"),
);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const PERIOD_OPTIONS: TimePeriod[] = ["AM", "PM"];
const TASKS_STORAGE_KEY = "life-sync-tasks-v1";
const MAX_IMPORT_FILE_SIZE_BYTES = 1024 * 1024;

function App() {
  // --- State ---
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category>("Task");
  const [activeFilter, setActiveFilter] = useState<Category | "All">("All");
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme) return savedTheme === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  });

  // Tab state: 0 = Simple Tasks, 1 = Weekly Schedule
  const [activeTab, setActiveTab] = useState<number>(0);
  // For daily view: which day is selected (0=Sunday, 1=Monday, ..., 6=Saturday)
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Daily view form state
  const [dailyTaskText, setDailyTaskText] = useState("");
  const [dailyCategory, setDailyCategory] = useState<Category>("Task");
  const [dailyStartParts, setDailyStartParts] = useState<TimeParts>(() =>
    timeToParts("09:00"),
  );
  const [dailyEndParts, setDailyEndParts] = useState<TimeParts>(() =>
    timeToParts("10:00"),
  );
  // Editing state for daily view
  const [editingDailyTaskId, setEditingDailyTaskId] = useState<string | null>(
    null,
  );

  // General task edit state
  const [editingGeneralTaskId, setEditingGeneralTaskId] = useState<
    string | null
  >(null);
  const [generalEditText, setGeneralEditText] = useState("");
  const [generalEditCategory, setGeneralEditCategory] =
    useState<Category>("Task");
  const [pendingImportTasks, setPendingImportTasks] = useState<Task[] | null>(
    null,
  );
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [deleteScope, setDeleteScope] = useState<TaskScope>("simple");
  const [isDailyCategoryOpen, setIsDailyCategoryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dailyCategoryMenuRef = useRef<HTMLDivElement | null>(null);

  // --- Effects ---
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  useEffect(() => {
    try {
      const rawTasks = localStorage.getItem(TASKS_STORAGE_KEY);
      if (rawTasks) {
        const parsed = JSON.parse(rawTasks);
        if (Array.isArray(parsed)) setTasks(parsed);
      }
    } catch (err) {
      console.error("Failed to load tasks from local storage", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      } catch (err) {
        console.error("Failed to save tasks to local storage", err);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [tasks, loading]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (
        dailyCategoryMenuRef.current &&
        !dailyCategoryMenuRef.current.contains(targetNode)
      ) {
        setIsDailyCategoryOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const dailyStartTime = partsToTime(dailyStartParts);
  const dailyEndTime = partsToTime(dailyEndParts);

  const isTaskInScope = (task: Task, scope: TaskScope) => {
    return scope === "simple" ? task.day === null : task.day !== null;
  };

  const updateTimePart = (
    setter: React.Dispatch<React.SetStateAction<TimeParts>>,
    key: keyof TimeParts,
    value: string,
  ) => {
    setter((prev) => ({
      ...prev,
      [key]: value as TimeParts[typeof key],
    }));
  };

  const normalizeImportedTask = (rawTask: unknown): Task | null => {
    if (!rawTask || typeof rawTask !== "object") return null;

    const source = rawTask as Partial<Task> & Record<string, unknown>;
    const text = typeof source.text === "string" ? source.text.trim() : "";
    if (!text) return null;

    const validCategories = new Set(CATEGORIES.map((c) => c.label));
    const category = validCategories.has(source.category as Category)
      ? (source.category as Category)
      : "Task";

    const day =
      typeof source.day === "number" && source.day >= 0 && source.day <= 6
        ? Math.floor(source.day)
        : null;

    const startTime =
      typeof source.startTime === "string" ? source.startTime : undefined;
    const endTime =
      typeof source.endTime === "string" ? source.endTime : undefined;

    return {
      id:
        typeof source.id === "string" && source.id.trim()
          ? source.id
          : crypto.randomUUID(),
      text,
      category,
      completed: Boolean(source.completed),
      createdAt:
        typeof source.createdAt === "number" &&
        Number.isFinite(source.createdAt)
          ? source.createdAt
          : Date.now(),
      day,
      startTime,
      endTime,
    };
  };

  const parseImportedTasks = (rawData: unknown): Task[] => {
    const taskPayload = Array.isArray(rawData)
      ? rawData
      : rawData &&
          typeof rawData === "object" &&
          Array.isArray((rawData as { tasks?: unknown }).tasks)
        ? (rawData as { tasks: unknown[] }).tasks
        : null;

    if (!taskPayload) {
      throw new Error("Invalid backup format.");
    }

    const normalized = taskPayload
      .map((entry) => normalizeImportedTask(entry))
      .filter((task): task is Task => task !== null);

    if (normalized.length === 0) {
      throw new Error("No valid tasks were found in that file.");
    }

    return normalized;
  };

  // --- Handlers ---
  const addTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      text: inputText,
      category: selectedCategory,
      completed: false,
      createdAt: Date.now(),
      day: null, // General task, not assigned to a specific day
    };

    setTasks((prev) => [newTask, ...prev]);
    setInputText("");
  };

  // Add or edit a task for the selected day with time range
  const addDailyTask = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dailyTaskText.trim() || selectedDay === null) return;

    if (editingDailyTaskId) {
      // Edit existing task
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingDailyTaskId
            ? {
                ...t,
                text: dailyTaskText,
                category: dailyCategory,
                startTime: dailyStartTime,
                endTime: dailyEndTime,
              }
            : t,
        ),
      );
      setEditingDailyTaskId(null);
    } else {
      // Add new task
      const newTask: Task = {
        id: crypto.randomUUID(),
        text: dailyTaskText,
        category: dailyCategory,
        completed: false,
        createdAt: Date.now(),
        day: selectedDay,
        startTime: dailyStartTime,
        endTime: dailyEndTime,
      };
      setTasks((prev) => [newTask, ...prev]);
    }
    setDailyTaskText("");
    setDailyCategory("Task");
    setDailyStartParts(timeToParts("09:00"));
    setDailyEndParts(timeToParts("10:00"));
  };

  // Edit daily task handler
  const startEditDailyTask = (task: Task) => {
    setEditingDailyTaskId(task.id);
    setDailyTaskText(task.text);
    setDailyCategory(task.category);
    setDailyStartParts(timeToParts(task.startTime || "09:00"));
    setDailyEndParts(timeToParts(task.endTime || "10:00"));
  };

  const cancelEditDailyTask = () => {
    setEditingDailyTaskId(null);
    setDailyTaskText("");
    setDailyCategory("Task");
    setDailyStartParts(timeToParts("09:00"));
    setDailyEndParts(timeToParts("10:00"));
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const clearCompletedInScope = (scope: TaskScope) => {
    setTasks((prev) =>
      prev.filter((task) => !(isTaskInScope(task, scope) && task.completed)),
    );
  };

  const deleteAllTasksInScope = (scope: TaskScope) => {
    setTasks((prev) => prev.filter((task) => !isTaskInScope(task, scope)));
  };

  const resetProgress = (scope: TaskScope) => {
    setTasks((prev) =>
      prev.map((task) =>
        isTaskInScope(task, scope) && task.completed
          ? { ...task, completed: false }
          : task,
      ),
    );
  };

  const openDeleteOptions = (scope: TaskScope) => {
    setDeleteScope(scope);
    setShowDeleteOptions(true);
  };

  const closeDeleteOptions = () => {
    setShowDeleteOptions(false);
  };

  const deleteCompletedFromModal = () => {
    clearCompletedInScope(deleteScope);
    setShowDeleteOptions(false);
  };

  const deleteAllFromModal = () => {
    deleteAllTasksInScope(deleteScope);
    setShowDeleteOptions(false);
  };

  const exportTasks = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `lifesync-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      window.alert("File is too large. Maximum supported import size is 1 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ""));
        const imported = parseImportedTasks(parsed);
        setPendingImportTasks(imported);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to import file.";
        window.alert(message);
      }
    };
    reader.onerror = () => {
      window.alert("Could not read that file.");
    };
    reader.readAsText(file);
  };

  const applyImportedTasks = (mode: "replace" | "merge") => {
    if (!pendingImportTasks) return;

    if (mode === "replace") {
      setTasks(
        [...pendingImportTasks].sort((a, b) => b.createdAt - a.createdAt),
      );
      setPendingImportTasks(null);
      return;
    }

    setTasks((prev) => {
      const merged = new Map<string, Task>();
      for (const task of prev) merged.set(task.id, task);
      for (const task of pendingImportTasks) merged.set(task.id, task);
      return Array.from(merged.values()).sort(
        (a, b) => b.createdAt - a.createdAt,
      );
    });
    setPendingImportTasks(null);
  };

  // --- Derived State ---
  const simpleTasks = tasks.filter((task) => task.day === null);
  const weeklyTasks = tasks.filter((task) => task.day !== null);

  const filteredTasks = simpleTasks.filter((t) => {
    if (activeFilter === "All") return true;
    return t.category === activeFilter;
  });

  const simpleStats = {
    total: simpleTasks.length,
    completed: simpleTasks.filter((task) => task.completed).length,
    pending: simpleTasks.filter((task) => !task.completed).length,
  };

  const weeklyStats = {
    total: weeklyTasks.length,
    completed: weeklyTasks.filter((task) => task.completed).length,
    pending: weeklyTasks.filter((task) => !task.completed).length,
  };

  const deleteScopeStats = deleteScope === "simple" ? simpleStats : weeklyStats;

  const progress =
    simpleStats.total === 0
      ? 0
      : Math.round((simpleStats.completed / simpleStats.total) * 100);

  const dayTasks = weeklyTasks.filter((task) => task.day === selectedDay);
  const dayStats = {
    total: dayTasks.length,
    completed: dayTasks.filter((task) => task.completed).length,
    pending: dayTasks.filter((task) => !task.completed).length,
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-[#e2e8f0] dark:bg-[#020617] text-slate-900 dark:text-slate-200 selection:bg-purple-500/30 font-sans flex flex-col overflow-x-hidden">
      <div className="mx-auto py-8 md:py-12 flex-1 w-full max-w-none px-4 md:px-8 lg:px-10">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-800 dark:text-transparent dark:bg-gradient-to-r dark:from-purple-400 dark:via-pink-400 dark:to-blue-400 dark:bg-clip-text">
              LifeSync
            </h1>
            <p className="text-slate-600 dark:text-slate-500 font-bold">
              Master your day.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-md border-2 border-slate-300 dark:border-slate-700 hover:scale-105 active:scale-95 transition-all text-orange-600 dark:text-purple-400"
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDark ? (
                <Sun size={24} fill="currentColor" />
              ) : (
                <Moon size={24} fill="currentColor" />
              )}
            </button>
            <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wide">
              <Calendar size={12} />
              {format(new Date(), "MMM do")}
            </div>
          </div>
        </header>

        {/* Navigation Menu for Tabs */}
        <nav className="mb-8 flex justify-center gap-4">
          <button
            className={cn(
              "px-4 py-2 rounded-lg font-bold transition-all",
              activeTab === 0
                ? "bg-blue-600 text-white shadow"
                : "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700",
            )}
            onClick={() => {
              setActiveTab(0);
              setSelectedDay(null);
            }}
          >
            Simple Tasks
          </button>
          <button
            className={cn(
              "px-4 py-2 rounded-lg font-bold transition-all",
              activeTab === 1
                ? "bg-green-600 text-white shadow"
                : "bg-white dark:bg-slate-800 text-green-600 dark:text-green-300 border border-green-200 dark:border-green-700",
            )}
            onClick={() => {
              setActiveTab(1);
              setSelectedDay(null);
            }}
          >
            Weekly Schedule
          </button>
        </nav>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />

        {/* Tab Content */}
        {activeTab === 0 && (
          <div className="mx-auto w-full max-w-3xl">
            {/* Progress Card */}
            <div className="mb-8 bg-white dark:bg-slate-900/50 rounded-2xl p-6 border-2 border-white dark:border-slate-800/50 shadow-xl shadow-slate-300 dark:shadow-none backdrop-blur-sm transition-all">
              <div className="flex justify-between items-end mb-3">
                <div>
                  <span className="text-4xl font-black text-slate-800 dark:text-white">
                    {progress}%
                  </span>
                  <span className="text-slate-600 ml-2 text-sm font-bold uppercase tracking-wider">
                    completed
                  </span>
                </div>
                <div className="text-xs font-bold text-slate-600 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full">
                  {simpleStats.completed} / {simpleStats.total}
                </div>
              </div>
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-transparent">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-blue-600 shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Input Area */}
            <form onSubmit={addTask} className="mb-8 relative group z-10">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl opacity-0 dark:opacity-20 group-hover:opacity-40 transition duration-500 blur-sm"></div>
              <div className="relative flex flex-col md:flex-row gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border-2 border-white dark:border-slate-800 shadow-xl dark:shadow-none transition-colors">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Add a new task..."
                  className="flex-1 bg-transparent border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 px-3 font-bold text-lg"
                />

                <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 pt-3 md:pt-0 md:pl-3">
                  <div className="flex gap-1">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => setSelectedCategory(cat.label)}
                        className={cn(
                          "p-2 rounded-lg transition-all border-2",
                          selectedCategory === cat.label
                            ? `${cat.color} ${cat.borderColor} ring-2 ring-offset-1 dark:ring-offset-slate-900`
                            : "text-slate-400 dark:text-slate-500 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800",
                        )}
                        title={cat.label}
                      >
                        {cat.icon}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="ml-auto md:ml-2 bg-slate-900 dark:bg-white text-white dark:text-slate-950 p-2.5 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md font-bold"
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </form>

            {/* Filters + Actions */}
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveFilter("All")}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-bold transition-all whitespace-nowrap shadow-sm border-2",
                    activeFilter === "All"
                      ? "bg-white dark:bg-slate-100 text-slate-900 dark:text-slate-900 border-slate-300 dark:border-transparent ring-2 ring-slate-200 dark:ring-0"
                      : "bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-800",
                  )}
                >
                  All
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => setActiveFilter(cat.label)}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap border-2 shadow-sm",
                      activeFilter === cat.label
                        ? `${cat.color} ${cat.borderColor} bg-white dark:bg-transparent`
                        : "bg-transparent text-slate-500 dark:text-slate-400 border-transparent hover:bg-slate-200 dark:hover:bg-slate-800",
                    )}
                  >
                    {cat.icon}
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={exportTasks}
                  className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download size={14} />
                  Export
                </button>
                <button
                  onClick={triggerImport}
                  className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Upload size={14} />
                  Import
                </button>
                <button
                  onClick={() => resetProgress("simple")}
                  disabled={simpleStats.completed === 0}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset Progress
                </button>
                <button
                  onClick={() => openDeleteOptions("simple")}
                  className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <Trash2 size={14} />
                  Delete all tasks
                </button>
              </div>
            </div>

            {/* Task List */}
            <div className="space-y-3 pb-8">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-20">
                  <div className="inline-flex items-center justify-center p-6 rounded-full bg-white dark:bg-slate-900 mb-4 shadow-md border-2 border-white dark:border-transparent">
                    <Layout
                      size={40}
                      className="text-slate-300 dark:text-slate-700"
                    />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-bold">
                    No tasks found. Time to add one!
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const categoryConfig = CATEGORIES.find(
                    (c) => c.label === task.category,
                  )!;

                  if (editingGeneralTaskId === task.id) {
                    // Edit mode for general task
                    return (
                      <form
                        key={task.id}
                        className={cn(
                          "group flex items-center gap-4 p-4 rounded-xl transition-all duration-300 bg-white border-l-[6px] shadow-md border-y border-r border-slate-200 dark:bg-slate-900 dark:border-l-0 dark:border dark:border-slate-800 dark:shadow-none",
                        )}
                        onSubmit={(e) => {
                          e.preventDefault();
                          setTasks((prev) =>
                            prev.map((t) =>
                              t.id === task.id
                                ? {
                                    ...t,
                                    text: generalEditText,
                                    category: generalEditCategory,
                                  }
                                : t,
                            ),
                          );
                          setEditingGeneralTaskId(null);
                        }}
                      >
                        <div className="flex-1 min-w-0 flex flex-col md:flex-row gap-2">
                          <input
                            type="text"
                            value={generalEditText}
                            onChange={(e) => setGeneralEditText(e.target.value)}
                            className="flex-1 bg-slate-100 dark:bg-slate-800 border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 px-3 font-bold text-lg rounded"
                          />
                          <select
                            value={generalEditCategory}
                            onChange={(e) =>
                              setGeneralEditCategory(e.target.value as Category)
                            }
                            className="bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white px-2 py-2 rounded-lg font-bold"
                          >
                            {CATEGORIES.map((cat) => (
                              <option key={cat.label} value={cat.label}>
                                {cat.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="text-green-600 hover:text-green-800 font-bold px-2"
                          title="Save"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGeneralTaskId(null)}
                          className="text-slate-400 hover:text-red-600 font-bold px-2"
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "group flex items-center gap-4 p-4 rounded-xl transition-all duration-300",
                        // Light Mode Styles (Distinct Card)
                        "bg-white border-l-[6px] shadow-md border-y border-r border-slate-200",
                        // Dark Mode Styles
                        "dark:bg-slate-900 dark:border-l-0 dark:border dark:border-slate-800 dark:shadow-none",
                        task.completed
                          ? "opacity-60 grayscale bg-slate-50 dark:bg-slate-900/30"
                          : "hover:-translate-y-0.5 hover:shadow-lg dark:hover:border-slate-700",
                        // Dynamic Border Color for Light Mode
                        categoryConfig.borderColor.replace("text", "border"),
                      )}
                    >
                      <button
                        onClick={() => toggleTask(task.id)}
                        className={cn(
                          "flex-shrink-0 transition-colors transform active:scale-90",
                          task.completed
                            ? "text-emerald-500"
                            : "text-slate-400 dark:text-slate-600 hover:text-purple-600 dark:hover:text-purple-400",
                        )}
                      >
                        {task.completed ? (
                          <CheckCircle2 size={26} className="fill-current" />
                        ) : (
                          <Circle size={26} strokeWidth={2.5} />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-lg font-bold transition-all truncate",
                            task.completed
                              ? "text-slate-400 line-through decoration-slate-300 dark:decoration-slate-700"
                              : "text-slate-800 dark:text-slate-200",
                          )}
                        >
                          {task.text}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold flex items-center gap-1 w-fit",
                              categoryConfig.color,
                              // Stronger border for category tag in light mode
                              "border-current opacity-80",
                            )}
                          >
                            {categoryConfig.icon} {task.category}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setEditingGeneralTaskId(task.id);
                          setGeneralEditText(task.text);
                          setGeneralEditCategory(task.category);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                        title="Edit task"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                        title="Delete task"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="w-full">
            <div className="mb-8 w-full rounded-2xl border-2 border-white bg-white p-4 shadow-xl transition-all dark:border-slate-800/50 dark:bg-slate-900 dark:shadow-none md:p-6 lg:p-8">
              <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-2xl font-bold text-center md:text-left">
                  Weekly Schedule
                </h2>
                <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
                  <button
                    onClick={exportTasks}
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Download size={14} />
                    Export
                  </button>
                  <button
                    onClick={triggerImport}
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Upload size={14} />
                    Import
                  </button>
                  <button
                    onClick={() => resetProgress("weekly")}
                    disabled={weeklyStats.completed === 0}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset Progress
                  </button>
                  <button
                    onClick={() => openDeleteOptions("weekly")}
                    className="text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Trash2 size={14} />
                    Delete all tasks
                  </button>
                </div>
              </div>

              <div className="mx-auto">
                <div className="my-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 xl:gap-4">
                  {[
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ].map((day, idx) => {
                    const dayTasks = weeklyTasks
                      .filter((t) => t.day === idx)
                      .sort((a, b) => {
                        if (!a.startTime || !b.startTime) return 0;
                        return (
                          timeToMinutes(a.startTime) -
                          timeToMinutes(b.startTime)
                        );
                      });

                    return (
                      <div
                        key={day}
                        className="min-w-0 bg-transparent flex flex-col h-full items-stretch"
                      >
                        {/* Day header button - ONLY this gets highlighted */}
                        <button
                          className={cn(
                            "py-3 px-4 mb-3 transition-all text-base font-bold text-center rounded-lg w-full",
                            selectedDay === idx
                              ? "bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100"
                              : "hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent",
                          )}
                          onClick={() => setSelectedDay(idx)}
                        >
                          {day}
                        </button>

                        {/* Divider */}
                        <div className="border-t border-slate-200 dark:border-slate-700 mb-3" />

                        <div className="px-3 pb-2 min-w-0 flex-1 bg-transparent transition-none">
                          {dayTasks.length === 0 ? (
                            <div className="text-xs text-slate-500 italic text-center">
                              No tasks yet.
                            </div>
                          ) : (
                            <ul className="space-y-3">
                              {dayTasks.map((task) => {
                                const cat = CATEGORIES.find(
                                  (c) => c.label === task.category,
                                );
                                return (
                                  <li
                                    key={task.id}
                                    className={cn(
                                      "w-full min-w-0 box-border rounded-lg p-3 text-sm font-semibold flex flex-col border-l-4 cursor-pointer transition-all",
                                      cat?.color,
                                      cat?.borderColor.replace(
                                        "text",
                                        "border",
                                      ),
                                      task.completed
                                        ? "opacity-60 line-through"
                                        : "hover:bg-slate-100 dark:hover:bg-slate-800",
                                    )}
                                    onClick={() =>
                                      setTasks((prev) =>
                                        prev.map((t) =>
                                          t.id === task.id
                                            ? { ...t, completed: !t.completed }
                                            : t,
                                        ),
                                      )
                                    }
                                    title="Click to mark as done/undone"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="flex-shrink-0">
                                        {task.completed ? (
                                          <CheckCircle2
                                            size={16}
                                            className="text-emerald-500"
                                          />
                                        ) : (
                                          <Circle
                                            size={16}
                                            className="text-slate-400"
                                          />
                                        )}
                                      </div>
                                      <div className="min-w-0 flex-1 w-full">
                                        {/* Task title with matching category icon */}
                                        <div className="mb-2 flex min-w-0 items-start gap-2">
                                          <span className="mt-0.5 shrink-0 text-slate-700 dark:text-slate-300">
                                            {cat?.icon ?? <Layout size={16} />}
                                          </span>
                                          <div
                                            className="text-sm min-w-0"
                                            style={{
                                              wordWrap: "break-word",
                                              overflowWrap: "break-word",
                                            }}
                                          >
                                            {task.text}
                                          </div>
                                        </div>
                                        {/* Task time with no wrapping */}
                                        <div className="mt-1 block w-full text-xs font-semibold font-mono tabular-nums text-slate-700 dark:text-slate-200 break-words">
                                          {task.startTime} - {task.endTime}
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 text-center text-sm text-slate-500">
                Click a day to view or add tasks for that day.
              </div>
            </div>
          </div>
        )}

        {/* Daily View: Only show if a day is selected */}
        {selectedDay !== null && (
          <div className="flex justify-center w-full">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 px-8 border-2 border-white dark:border-slate-800/50 shadow-xl shadow-slate-300 dark:shadow-none transition-all w-full max-w-4xl mt-8">
              <h2 className="text-2xl font-bold mb-4 text-center">
                Daily View -{" "}
                {
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][selectedDay]
                }
              </h2>
              {/* Progress Bar for Daily View */}
              {(() => {
                const completed = dayStats.completed;
                const total = dayStats.total;
                const progress =
                  total === 0 ? 0 : Math.round((completed / total) * 100);
                return (
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-lg font-bold text-slate-700 dark:text-slate-200">
                        {progress}% completed
                      </span>
                      <span className="text-xs font-bold text-slate-600 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full">
                        {completed} / {total}
                      </span>
                    </div>
                    <div className="h-3 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-transparent">
                      <div
                        className="h-full bg-gradient-to-r from-green-400 to-blue-600 transition-all duration-700 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
              {/* Add Task Form for Daily View */}
              <form onSubmit={addDailyTask} className="mb-6 w-full">
                <div className="flex flex-col gap-3 w-full">
                  <div className="flex flex-col gap-3 w-full lg:flex-row lg:items-center">
                    <input
                      type="text"
                      value={dailyTaskText}
                      onChange={(e) => setDailyTaskText(e.target.value)}
                      placeholder="Task description..."
                      className="h-12 flex-1 min-w-[220px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 px-3 rounded-lg font-bold"
                    />
                    <div
                      ref={dailyCategoryMenuRef}
                      className="relative h-12 min-w-[140px] lg:flex-none"
                    >
                      <button
                        type="button"
                        onClick={() => setIsDailyCategoryOpen((prev) => !prev)}
                        className="h-12 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-left font-bold text-slate-900 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
                      >
                        <span>{dailyCategory}</span>
                        <ChevronDown size={16} className="text-slate-500" />
                      </button>
                      {isDailyCategoryOpen && (
                        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                          {CATEGORIES.map((cat) => (
                            <button
                              key={cat.label}
                              type="button"
                              onClick={() => {
                                setDailyCategory(cat.label);
                                setIsDailyCategoryOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold transition-colors",
                                dailyCategory === cat.label
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
                              )}
                            >
                              {cat.icon}
                              <span>{cat.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-700 lg:w-auto lg:min-w-[390px] lg:flex-none">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                        <div className="flex items-center gap-1 min-w-0">
                          <select
                            value={dailyStartParts.hour}
                            onChange={(e) =>
                              updateTimePart(
                                setDailyStartParts,
                                "hour",
                                e.target.value,
                              )
                            }
                            className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {HOUR_OPTIONS.map((hour) => (
                              <option key={`start-hour-${hour}`} value={hour}>
                                {hour}
                              </option>
                            ))}
                          </select>
                          <span className="font-bold text-slate-500">:</span>
                          <select
                            value={dailyStartParts.minute}
                            onChange={(e) =>
                              updateTimePart(
                                setDailyStartParts,
                                "minute",
                                e.target.value,
                              )
                            }
                            className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {MINUTE_OPTIONS.map((minute) => (
                              <option
                                key={`start-minute-${minute}`}
                                value={minute}
                              >
                                {minute}
                              </option>
                            ))}
                          </select>
                          <select
                            value={dailyStartParts.period}
                            onChange={(e) =>
                              updateTimePart(
                                setDailyStartParts,
                                "period",
                                e.target.value,
                              )
                            }
                            className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {PERIOD_OPTIONS.map((period) => (
                              <option
                                key={`start-period-${period}`}
                                value={period}
                              >
                                {period}
                              </option>
                            ))}
                          </select>
                        </div>
                        <span className="font-bold text-slate-500 text-center sm:px-1">
                          to
                        </span>
                        <div className="flex items-center gap-1 min-w-0">
                          <select
                            value={dailyEndParts.hour}
                            onChange={(e) =>
                              updateTimePart(
                                setDailyEndParts,
                                "hour",
                                e.target.value,
                              )
                            }
                            className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {HOUR_OPTIONS.map((hour) => (
                              <option key={`end-hour-${hour}`} value={hour}>
                                {hour}
                              </option>
                            ))}
                          </select>
                          <span className="font-bold text-slate-500">:</span>
                          <select
                            value={dailyEndParts.minute}
                            onChange={(e) =>
                              updateTimePart(
                                setDailyEndParts,
                                "minute",
                                e.target.value,
                              )
                            }
                            className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {MINUTE_OPTIONS.map((minute) => (
                              <option
                                key={`end-minute-${minute}`}
                                value={minute}
                              >
                                {minute}
                              </option>
                            ))}
                          </select>
                          <select
                            value={dailyEndParts.period}
                            onChange={(e) =>
                              updateTimePart(
                                setDailyEndParts,
                                "period",
                                e.target.value,
                              )
                            }
                            className="h-10 w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-2 text-sm font-bold text-slate-900 dark:text-slate-100"
                          >
                            {PERIOD_OPTIONS.map((period) => (
                              <option
                                key={`end-period-${period}`}
                                value={period}
                              >
                                {period}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="submit"
                      disabled={!dailyTaskText.trim()}
                      className={
                        editingDailyTaskId
                          ? "bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
                          : "bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
                      }
                    >
                      {editingDailyTaskId ? "Save" : "Add"}
                    </button>
                    {editingDailyTaskId && (
                      <button
                        type="button"
                        onClick={cancelEditDailyTask}
                        className="bg-slate-400 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-500 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </form>
              {/* List of tasks for the selected day, sorted by time */}
              <div>
                {dayTasks.length === 0 ? (
                  <div className="text-center text-slate-500 italic">
                    No tasks for this day yet.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {dayTasks
                      .sort((a, b) => {
                        if (!a.startTime || !b.startTime) return 0;
                        return (
                          timeToMinutes(a.startTime) -
                          timeToMinutes(b.startTime)
                        );
                      })
                      .map((task) => {
                        const cat = CATEGORIES.find(
                          (c) => c.label === task.category,
                        );
                        if (editingDailyTaskId === task.id) {
                          // Edit mode handled by the form above
                          return null;
                        }
                        return (
                          <li
                            key={task.id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-xl border-l-4 shadow-sm cursor-pointer transition-all min-w-0 max-w-full",
                              cat?.color,
                              cat?.borderColor.replace("text", "border"),
                              task.completed
                                ? "opacity-60"
                                : "hover:bg-slate-100 dark:hover:bg-slate-800",
                            )}
                            style={{
                              wordBreak: "normal",
                              overflowWrap: "anywhere",
                            }}
                            onClick={() => {
                              setTasks((prev) =>
                                prev.map((t) =>
                                  t.id === task.id
                                    ? { ...t, completed: !t.completed }
                                    : t,
                                ),
                              );
                            }}
                            title="Click to mark as done/undone"
                          >
                            <span className="mt-0.5 shrink-0">
                              {task.completed ? (
                                <CheckCircle2
                                  size={18}
                                  className="text-emerald-500"
                                />
                              ) : (
                                <Circle size={18} className="text-slate-400" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 font-bold min-w-0">
                                    {cat?.icon}
                                    <span
                                      className={cn(
                                        "break-words whitespace-normal min-w-0",
                                        task.completed && "line-through",
                                      )}
                                    >
                                      {task.text}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <span
                                      className={cn(
                                        "font-mono text-xs text-slate-500",
                                        task.completed && "line-through",
                                      )}
                                    >
                                      {task.startTime} - {task.endTime}
                                    </span>
                                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      {task.category}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditDailyTask(task);
                                    }}
                                    className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg px-2 py-1.5 text-sm font-bold transition-all"
                                    title="Edit task"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTasks((prev) =>
                                        prev.filter((t) => t.id !== task.id),
                                      );
                                    }}
                                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg p-2 transition-all"
                                    title="Delete task"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {pendingImportTasks && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Import Tasks
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Found {pendingImportTasks.length} task
              {pendingImportTasks.length === 1 ? "" : "s"} in this backup.
              Choose how you want to import them.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setPendingImportTasks(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => applyImportedTasks("merge")}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
              >
                Merge with existing
              </button>
              <button
                onClick={() => applyImportedTasks("replace")}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700"
              >
                Replace all current tasks
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-300 bg-white p-5 text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Delete Tasks
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Choose what to delete from{" "}
              {deleteScope === "simple" ? "Simple Tasks" : "Weekly Schedule"}.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                onClick={closeDeleteOptions}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={deleteCompletedFromModal}
                disabled={deleteScopeStats.completed === 0}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete selected done ({deleteScopeStats.completed})
              </button>
              <button
                onClick={deleteAllFromModal}
                disabled={deleteScopeStats.total === 0}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete all tasks ({deleteScopeStats.total})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version Footer */}
      <footer className="py-4 text-center text-xs font-bold text-slate-400 dark:text-slate-600">
        {isDark ? "Dark Mode" : "Light Mode"}
      </footer>
    </div>
  );
}
export default App;
